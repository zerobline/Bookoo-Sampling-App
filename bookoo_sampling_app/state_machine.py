"""The measurement-cycle state machine described in the project brief.

Each sample goes through:

    WAITING_FOR_CUP -> CUP_DETECTED -> TARING -> READY -> DISPENSING
    -> STABILIZING -> RECORDED -> WAITING_FOR_REMOVAL -> (back to top)

Decisions are made from **weight level + trend + stability + current
state** together, never from a single instantaneous threshold, so a
touched cup, a vibration, a brief pause in pouring or a final drip does
not falsely advance or record a sample (see "Safety Against False
Measurements" in the brief).

The state machine itself does not know about Bluetooth: it is fed
``(monotonic_seconds, weight_grams)`` pairs and emits a small set of
side-effect requests (``tare``) and events (status changes, recorded
samples, warnings) for the caller to act on. This keeps it trivially
testable without any real or simulated scale connection.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from enum import Enum
from typing import Deque, List, Optional


class State(str, Enum):
    IDLE = "idle"  # session not started yet
    WAITING_FOR_CUP = "waiting_for_cup"
    CUP_DETECTED = "cup_detected"
    TARING = "taring"
    READY = "ready"
    DISPENSING = "dispensing"
    STABILIZING = "stabilizing"
    RECORDED = "recorded"
    WAITING_FOR_REMOVAL = "waiting_for_removal"
    PAUSED = "paused"
    COMPLETE = "complete"
    STOPPED = "stopped"


# Human-readable labels matching the brief's "what the system currently
# expects" list, for direct use in the UI.
STATUS_LABELS = {
    State.IDLE: "Idle",
    State.WAITING_FOR_CUP: "Waiting for cup",
    State.CUP_DETECTED: "Cup detected",
    State.TARING: "Taring",
    State.READY: "Ready for beverage",
    State.DISPENSING: "Beverage dispensing",
    State.STABILIZING: "Waiting for stable weight",
    State.RECORDED: "Result recorded",
    State.WAITING_FOR_REMOVAL: "Remove cup",
    State.PAUSED: "Paused",
    State.COMPLETE: "Session complete",
    State.STOPPED: "Stopped",
}


@dataclass
class StateMachineConfig:
    """Tunable thresholds. Defaults follow the brief's example ranges."""

    # A weight this far above the current tare baseline counts as "something
    # placed on the scale" (a cup, or a hand/object -- see max_object_weight_g).
    min_object_weight_g: float = 5.0
    max_object_weight_g: float = 2000.0

    # "Cup stable": weight changes by < tolerance for this long.
    cup_stable_window_s: float = 0.75
    cup_stable_tolerance_g: float = 0.2

    # How long to wait for the post-tare reading to settle near zero before
    # moving on anyway (with a warning) rather than blocking forever.
    tare_settle_timeout_s: float = 3.0
    tare_zero_tolerance_g: float = 1.0

    # Dispensing is confirmed by a sustained rate of increase, not just a
    # one-off jump, so a touch/nudge on the cup does not trigger it.
    dispensing_start_delta_g: float = 1.0
    dispensing_min_rate_g_s: float = 0.3
    dispensing_confirm_s: float = 0.3

    # "Final beverage stable": weight changes by < tolerance for this long,
    # re-armed if pouring resumes (a brief pause) or a late drip lands.
    stabilizing_tolerance_g: float = 0.35
    stabilizing_window_s: float = 1.5

    # Sanity bounds applied before a result is auto-recorded.
    min_final_weight_g: float = 5.0
    max_final_weight_g: float = 2000.0

    # Cup removal: weight back near the post-tare baseline, sustained.
    removal_threshold_g: float = 5.0
    removal_confirm_s: float = 0.5

    # How long to hold the "Result recorded" status before moving on, purely
    # so the operator can see it happen.
    recorded_hold_s: float = 0.8

    # History kept for windowed stability/trend checks.
    history_window_s: float = 12.0

    # Minimum time between repeated warnings for the same ongoing condition
    # (e.g. an out-of-range weight the operator hasn't acted on yet), so the
    # UI log isn't flooded with one warning per reading.
    warning_cooldown_s: float = 1.0


@dataclass
class Event:
    kind: str  # "status_changed" | "sample_recorded" | "warning" | "sample_discarded"
    state: State
    message: str = ""
    weight_g: Optional[float] = None
    sample_number: Optional[int] = None
    accepted_manually: bool = False


@dataclass
class _Reading:
    t: float
    w: float


class SamplingStateMachine:
    def __init__(self, config: Optional[StateMachineConfig] = None, planned_samples: int = 100):
        self.config = config or StateMachineConfig()
        self.planned_samples = planned_samples
        self.state = State.IDLE
        self.sample_count = 0
        self._pre_pause_state: Optional[State] = None

        self._history: Deque[_Reading] = deque()
        self._baseline_g = 0.0
        self._state_entered_at = 0.0
        self._below_threshold_since: Optional[float] = None
        self._tare_requested_at: Optional[float] = None
        self._last_sample_weight: Optional[float] = None
        self._last_t = 0.0
        self._dispensing_peak_g = 0.0
        self._last_warning_at = float("-inf")

    # -- lifecycle -----------------------------------------------------

    def start(self, now: float) -> List[Event]:
        self.sample_count = 0
        self._history.clear()
        return self._enter(State.WAITING_FOR_CUP, now)

    def pause(self, now: float) -> List[Event]:
        if self.state in (State.PAUSED, State.IDLE, State.COMPLETE, State.STOPPED):
            return []
        self._pre_pause_state = self.state
        return self._enter(State.PAUSED, now, message="Paused by operator")

    def resume(self, now: float) -> List[Event]:
        if self.state != State.PAUSED or self._pre_pause_state is None:
            return []
        target = self._pre_pause_state
        self._pre_pause_state = None
        return self._enter(target, now, message="Resumed")

    def stop(self, now: float) -> List[Event]:
        return self._enter(State.STOPPED, now, message="Stopped by operator")

    # -- manual overrides ------------------------------------------------

    def manual_tare_requested(self, now: float) -> None:
        """Record that a manual tare was sent, so the baseline resets."""
        self._baseline_g = 0.0
        self._tare_requested_at = now

    def accept_measurement(self, now: float) -> List[Event]:
        """Force-record the current weight, bypassing stability detection."""
        if self.state not in (State.DISPENSING, State.STABILIZING):
            return []
        weight = self._history[-1].w if self._history else 0.0
        return self._record(now, weight, accepted_manually=True)

    def redo_sample(self, now: float) -> List[Event]:
        """Discard the last recorded sample and re-arm stabilization."""
        if self.state not in (State.WAITING_FOR_REMOVAL, State.RECORDED, State.COMPLETE) or self.sample_count == 0:
            return []
        self.sample_count -= 1
        events = [
            Event(
                kind="sample_discarded",
                state=self.state,
                message="Last sample discarded for redo",
                sample_number=self.sample_count + 1,
            )
        ]
        # The readings that produced the discarded sample were already
        # stable for a full window, so _is_flat will pick that back up on
        # the very next tick and re-record immediately (or track a new
        # pour/removal if the operator has changed something since).
        events += self._enter(State.STABILIZING, now, message="Redoing sample")
        return events

    # -- main entry point --------------------------------------------------

    def update(self, now: float, weight_g: float) -> List[Event]:
        if self.state in (State.PAUSED, State.IDLE, State.COMPLETE, State.STOPPED):
            # Deliberately skip recording into _history too: readings taken
            # while paused (or before/after the session) must not silently
            # satisfy a stability/rate window once processing resumes.
            return []

        self._last_t = now
        self._history.append(_Reading(now, weight_g))
        cutoff = now - self.config.history_window_s
        while self._history and self._history[0].t < cutoff:
            self._history.popleft()

        handler = {
            State.WAITING_FOR_CUP: self._on_waiting_for_cup,
            State.CUP_DETECTED: self._on_cup_detected,
            State.TARING: self._on_taring,
            State.READY: self._on_ready,
            State.DISPENSING: self._on_dispensing,
            State.STABILIZING: self._on_stabilizing,
            State.WAITING_FOR_REMOVAL: self._on_waiting_for_removal,
            State.RECORDED: self._on_recorded,
        }[self.state]
        return handler(now, weight_g)

    # -- helpers -------------------------------------------------------

    def _enter(self, state: State, now: float, message: str = "") -> List[Event]:
        self.state = state
        self._state_entered_at = now
        self._below_threshold_since = None
        return [Event(kind="status_changed", state=state, message=message or STATUS_LABELS[state])]

    def _throttled_warning(self, now: float, state: State, message: str, weight_g: Optional[float] = None) -> List[Event]:
        if now - self._last_warning_at < self.config.warning_cooldown_s:
            return []
        self._last_warning_at = now
        return [Event(kind="warning", state=state, message=message, weight_g=weight_g)]

    def _window(self, duration_s: float) -> List[_Reading]:
        start = self._last_t - duration_s
        return [r for r in self._history if r.t >= start]

    def _is_flat(self, duration_s: float, tolerance_g: float) -> bool:
        window = self._window(duration_s)
        if len(window) < 2 or (window[-1].t - window[0].t) < duration_s * 0.8:
            return False
        values = [r.w for r in window]
        return (max(values) - min(values)) <= tolerance_g

    def _rate(self, duration_s: float) -> Optional[float]:
        window = self._window(duration_s)
        if len(window) < 2:
            return None
        dt = window[-1].t - window[0].t
        if dt <= 0:
            return None
        return (window[-1].w - window[0].w) / dt

    # -- per-state logic -------------------------------------------------

    def _on_waiting_for_cup(self, now: float, weight_g: float) -> List[Event]:
        delta = weight_g - self._baseline_g
        if delta < self.config.min_object_weight_g:
            return []
        if not self._is_flat(self.config.cup_stable_window_s, self.config.cup_stable_tolerance_g):
            return []
        if delta > self.config.max_object_weight_g:
            return self._throttled_warning(
                now, self.state, f"Weight {weight_g:.1f} g exceeds expected cup range; check the scale", weight_g
            )
        return self._enter(State.CUP_DETECTED, now)

    def _on_cup_detected(self, now: float, weight_g: float) -> List[Event]:
        # Transient state: the session driver is expected to send the tare
        # command upon seeing this status change and call manual_tare_requested.
        return self._enter(State.TARING, now)

    def _on_taring(self, now: float, weight_g: float) -> List[Event]:
        if abs(weight_g - self._baseline_g) <= self.config.tare_zero_tolerance_g:
            self._baseline_g = weight_g
            return self._enter(State.READY, now)
        if now - self._state_entered_at >= self.config.tare_settle_timeout_s:
            self._baseline_g = weight_g
            events = self._enter(State.READY, now)
            events.append(
                Event(
                    kind="warning",
                    state=State.READY,
                    message="Tare did not settle to zero in time; continuing with current reading as baseline",
                    weight_g=weight_g,
                )
            )
            return events
        return []

    def _on_ready(self, now: float, weight_g: float) -> List[Event]:
        delta = weight_g - self._baseline_g
        if delta < self.config.dispensing_start_delta_g:
            return []
        rate = self._rate(self.config.dispensing_confirm_s)
        if rate is None or rate < self.config.dispensing_min_rate_g_s:
            return []
        self._dispensing_peak_g = weight_g
        return self._enter(State.DISPENSING, now)

    def _early_removal(self, weight_g: float) -> bool:
        """True once weight has meaningfully risen and then collapsed back.

        Compared against the accumulated peak (not just the current delta)
        so this can never fire the instant DISPENSING starts, before any
        real amount has been poured.
        """
        self._dispensing_peak_g = max(self._dispensing_peak_g, weight_g)
        rose_meaningfully = (self._dispensing_peak_g - self._baseline_g) > self.config.removal_threshold_g
        fell_back = (weight_g - self._baseline_g) <= self.config.removal_threshold_g
        return rose_meaningfully and fell_back

    def _on_dispensing(self, now: float, weight_g: float) -> List[Event]:
        # Early-removal safety: if the weight collapses back toward baseline
        # after a real pour was underway, the cup was pulled off mid-pour.
        # Abort without recording rather than capture a bogus low weight.
        if self._early_removal(weight_g):
            return self._abort_to_waiting_for_cup(
                now, weight_g, "Cup removed before beverage finished; sample discarded"
            )
        # Move on as soon as the weight has *stopped increasing* (matching
        # the brief's State 4->5 description) -- the actual stability wait
        # happens once in STABILIZING, not duplicated here.
        rate = self._rate(self.config.dispensing_confirm_s)
        if rate is not None and rate < self.config.dispensing_min_rate_g_s:
            return self._enter(State.STABILIZING, now)
        return []

    def _on_stabilizing(self, now: float, weight_g: float) -> List[Event]:
        if self._early_removal(weight_g):
            return self._abort_to_waiting_for_cup(
                now, weight_g, "Cup removed before beverage finished; sample discarded"
            )

        rate = self._rate(self.config.dispensing_confirm_s)
        if rate is not None and rate >= self.config.dispensing_min_rate_g_s:
            # Pouring resumed (a brief machine pause ended) -- go back to
            # DISPENSING rather than recording a mid-pour weight.
            return self._enter(State.DISPENSING, now, message="Pouring resumed")

        # _is_flat already looks back a full stabilizing_window_s: the
        # instant it is true, the weight has *by definition* been within
        # tolerance for that whole window, so there is nothing to wait for
        # beyond this check. A late drip or wobble simply keeps this false
        # until a fresh, clean window has elapsed -- no separate timer
        # needed to "re-arm" that.
        if not self._is_flat(self.config.stabilizing_window_s, self.config.stabilizing_tolerance_g):
            return []

        window = self._window(self.config.stabilizing_window_s)
        final_weight = sum(r.w for r in window) / len(window) if window else weight_g
        return self._record(now, final_weight, accepted_manually=False)

    def _record(self, now: float, weight_g: float, accepted_manually: bool) -> List[Event]:
        if not accepted_manually and not (
            self.config.min_final_weight_g <= weight_g <= self.config.max_final_weight_g
        ):
            return self._throttled_warning(
                now,
                self.state,
                f"Stable weight {weight_g:.1f} g is outside the expected range; "
                "use Accept Measurement or Redo Sample",
                weight_g,
            )
        self.sample_count += 1
        self._last_sample_weight = weight_g
        events = self._enter(State.RECORDED, now)
        events.append(
            Event(
                kind="sample_recorded",
                state=State.RECORDED,
                message=f"Sample {self.sample_count} -> {weight_g:.1f} g",
                weight_g=weight_g,
                sample_number=self.sample_count,
                accepted_manually=accepted_manually,
            )
        )
        return events

    def _on_recorded(self, now: float, weight_g: float) -> List[Event]:
        if now - self._state_entered_at < self.config.recorded_hold_s:
            return []
        if self.sample_count >= self.planned_samples:
            return self._enter(State.COMPLETE, now, message="Planned sample count reached")
        return self._enter(State.WAITING_FOR_REMOVAL, now)

    def _on_waiting_for_removal(self, now: float, weight_g: float) -> List[Event]:
        if weight_g - self._baseline_g > self.config.removal_threshold_g:
            self._below_threshold_since = None
            return []
        if self._below_threshold_since is None:
            self._below_threshold_since = now
            return []
        if now - self._below_threshold_since < self.config.removal_confirm_s:
            return []
        if self.sample_count >= self.planned_samples:
            return self._enter(State.COMPLETE, now, message="Planned sample count reached")
        # Re-anchor to whatever the scale reads right now (the cup carried its
        # own mass away, so this is not necessarily exactly the old tare
        # zero) so the next cup's arrival is judged against reality rather
        # than a stale baseline.
        self._baseline_g = weight_g
        return self._enter(State.WAITING_FOR_CUP, now)

    def _abort_to_waiting_for_cup(self, now: float, weight_g: float, message: str) -> List[Event]:
        events = [Event(kind="warning", state=self.state, message=message)]
        self._baseline_g = weight_g
        events += self._enter(State.WAITING_FOR_CUP, now)
        return events
