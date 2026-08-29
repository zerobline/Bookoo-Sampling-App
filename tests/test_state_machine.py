from bookoo_sampling_app.state_machine import (
    Event,
    SamplingStateMachine,
    State,
    StateMachineConfig,
)


class Clock:
    """Small helper so tests can feed (time, weight) sequences readably."""

    def __init__(self, dt: float = 0.1):
        self.t = 0.0
        self.dt = dt

    def tick(self) -> float:
        self.t += self.dt
        return self.t


def feed(machine: SamplingStateMachine, clock: Clock, weight: float, ticks: int = 1):
    events: list[Event] = []
    for _ in range(ticks):
        events += machine.update(clock.tick(), weight)
    return events


def feed_until(machine, clock, weight, predicate, max_ticks=400):
    """Feed a constant weight one tick at a time until predicate() is true.

    Checking after every single tick (rather than a fixed batch count) means
    the assertion never overshoots the exact tick where a transition
    happens -- tests don't need to hand-tune tick counts against the
    machine's internal timing.
    """
    events: list[Event] = []
    for _ in range(max_ticks):
        events += machine.update(clock.tick(), weight)
        if predicate():
            return events
    raise AssertionError(f"condition not met within {max_ticks} ticks; state={machine.state}")


def states_seen(events):
    return [e.state for e in events if e.kind == "status_changed"]


def make_machine(planned=5, **overrides):
    config = StateMachineConfig(**overrides)
    machine = SamplingStateMachine(config, planned_samples=planned)
    return machine


def place_and_tare_cup(machine, clock, cup_weight=32.0):
    """Common setup: place a cup, let it be detected and tared, reach READY."""
    feed_until(machine, clock, cup_weight, lambda: machine.state == State.CUP_DETECTED)
    feed_until(machine, clock, 0.05, lambda: machine.state == State.READY)


def pour_to(machine, clock, target, step=6.0):
    """Ramp weight up to `target` one tick at a time, returning all events."""
    events = []
    weight = 0.0
    while weight < target:
        weight = min(target, weight + step)
        events += machine.update(clock.tick(), weight)
    return events, weight


def test_idle_ignores_weight_until_started():
    machine = make_machine()
    clock = Clock()
    events = feed(machine, clock, 55.0, ticks=5)
    assert events == []
    assert machine.state == State.IDLE


def test_full_happy_path_records_one_sample_and_returns_to_waiting_for_cup():
    machine = make_machine(planned=5)
    clock = Clock()
    machine.start(clock.tick())
    assert machine.state == State.WAITING_FOR_CUP

    # Empty scale, nothing happening yet.
    feed(machine, clock, 0.0, ticks=5)
    assert machine.state == State.WAITING_FOR_CUP

    # Cup placed and holds steady -> detected, then tared (weight already
    # settles back to ~0, as a real scale would report after a hardware tare).
    place_and_tare_cup(machine, clock)

    # Beverage pours in, then holds -- eventually it gets recorded.
    _, final_weight = pour_to(machine, clock, 123.4)
    events = feed_until(machine, clock, final_weight, lambda: machine.sample_count == 1)
    recorded = [e for e in events if e.kind == "sample_recorded"]
    assert len(recorded) == 1
    assert recorded[0].sample_number == 1
    assert abs(recorded[0].weight_g - final_weight) < 0.5

    # "Result recorded" is held briefly, then the app waits for cup removal.
    feed_until(machine, clock, final_weight, lambda: machine.state == State.WAITING_FOR_REMOVAL)

    # Cup removed -> back to waiting for the next one.
    feed_until(machine, clock, 0.05, lambda: machine.state == State.WAITING_FOR_CUP)


def test_touch_on_cup_does_not_trigger_dispensing():
    machine = make_machine()
    clock = Clock()
    machine.start(clock.tick())
    place_and_tare_cup(machine, clock)
    assert machine.state == State.READY

    # A momentary touch: weight blips up then immediately back down.
    events = feed(machine, clock, 3.0, ticks=1)
    events += feed(machine, clock, 0.0, ticks=10)
    assert machine.state == State.READY
    assert states_seen(events) == []


def test_brief_pause_during_dispensing_does_not_cause_premature_record():
    machine = make_machine(dispensing_min_rate_g_s=1.0, dispensing_confirm_s=0.2)
    clock = Clock()
    machine.start(clock.tick())
    place_and_tare_cup(machine, clock)

    _, weight = pour_to(machine, clock, 48.0, step=8.0)
    assert machine.state == State.DISPENSING

    # Machine pauses mid-pour. Keep feeding the flat weight but bail out the
    # instant either STABILIZING is reached or (if it happened first) a
    # sample gets recorded -- the pause alone must never cause the latter.
    events = []
    for _ in range(30):
        events += machine.update(clock.tick(), weight)
        if machine.sample_count > 0:
            break
        if machine.state == State.STABILIZING:
            break
    assert not any(e.kind == "sample_recorded" for e in events)

    # Pouring resumes before it ever gets recorded.
    events2, weight = pour_to(machine, clock, weight + 32.0, step=8.0)
    assert machine.state == State.DISPENSING
    assert not any(e.kind == "sample_recorded" for e in events + events2)

    # Now it really stops and stays flat -- only then is it recorded.
    events3 = feed_until(machine, clock, weight, lambda: machine.sample_count == 1)
    recorded = [e for e in events3 if e.kind == "sample_recorded"]
    assert len(recorded) == 1
    assert abs(recorded[0].weight_g - weight) < 0.5


def test_cup_removed_mid_pour_discards_sample_without_recording():
    machine = make_machine()
    clock = Clock()
    machine.start(clock.tick())
    place_and_tare_cup(machine, clock)

    _, weight = pour_to(machine, clock, 60.0)
    assert machine.state in (State.DISPENSING, State.STABILIZING)

    events = feed(machine, clock, 0.1, ticks=1)  # cup yanked off
    assert machine.state == State.WAITING_FOR_CUP
    assert machine.sample_count == 0
    assert any(e.kind == "warning" for e in events)
    assert not any(e.kind == "sample_recorded" for e in events)


def test_final_drip_extends_stability_before_recording():
    machine = make_machine()
    clock = Clock()
    machine.start(clock.tick())
    place_and_tare_cup(machine, clock)

    _, weight = pour_to(machine, clock, 120.0, step=8.0)

    # Reach STABILIZING, but stop just short of a full clean window so the
    # drip lands before anything would have been recorded anyway.
    feed(machine, clock, weight, ticks=10)
    assert machine.sample_count == 0

    # A late drip lands, pushing weight up a touch more.
    weight += 0.9
    events = feed(machine, clock, weight, ticks=1)
    assert not any(e.kind == "sample_recorded" for e in events)

    # It settles again and is recorded off the new, post-drip weight.
    events += feed_until(machine, clock, weight, lambda: machine.sample_count == 1)
    recorded = [e for e in events if e.kind == "sample_recorded"]
    assert len(recorded) == 1
    assert abs(recorded[0].weight_g - weight) < 0.5


def test_out_of_range_weight_is_not_auto_recorded():
    machine = make_machine(min_final_weight_g=20.0)
    clock = Clock()
    machine.start(clock.tick())
    place_and_tare_cup(machine, clock)

    _, weight = pour_to(machine, clock, 9.0, step=3.0)
    events = feed(machine, clock, weight, ticks=40)
    assert not any(e.kind == "sample_recorded" for e in events)
    assert any(e.kind == "warning" for e in events)
    assert machine.sample_count == 0


def test_accept_measurement_forces_a_record_and_flags_it_manual():
    machine = make_machine()
    clock = Clock()
    machine.start(clock.tick())
    place_and_tare_cup(machine, clock)

    _, weight = pour_to(machine, clock, 60.0)
    assert machine.state in (State.DISPENSING, State.STABILIZING)

    events = machine.accept_measurement(clock.tick())
    recorded = [e for e in events if e.kind == "sample_recorded"]
    assert len(recorded) == 1
    assert recorded[0].accepted_manually is True
    assert machine.sample_count == 1


def test_redo_sample_discards_last_result_and_decrements_counter():
    machine = make_machine(planned=5)
    clock = Clock()
    machine.start(clock.tick())
    place_and_tare_cup(machine, clock)
    _, weight = pour_to(machine, clock, 60.0)
    feed_until(machine, clock, weight, lambda: machine.sample_count == 1)

    events = machine.redo_sample(clock.tick())
    assert machine.sample_count == 0
    assert any(e.kind == "sample_discarded" for e in events)
    assert machine.state == State.STABILIZING


def test_pause_freezes_state_and_resume_continues():
    machine = make_machine()
    clock = Clock()
    machine.start(clock.tick())
    feed(machine, clock, 0.0, ticks=3)
    assert machine.state == State.WAITING_FOR_CUP

    machine.pause(clock.tick())
    assert machine.state == State.PAUSED
    feed(machine, clock, 32.0, ticks=20)  # would normally trigger cup detection
    assert machine.state == State.PAUSED

    machine.resume(clock.tick())
    assert machine.state == State.WAITING_FOR_CUP
    feed_until(machine, clock, 32.0, lambda: machine.state == State.CUP_DETECTED)


def test_manual_stop_ends_session():
    machine = make_machine()
    clock = Clock()
    machine.start(clock.tick())
    machine.stop(clock.tick())
    assert machine.state == State.STOPPED
    feed(machine, clock, 999.0, ticks=5)
    assert machine.state == State.STOPPED


def test_session_completes_after_planned_sample_count():
    machine = make_machine(planned=1)
    clock = Clock()
    machine.start(clock.tick())
    place_and_tare_cup(machine, clock)
    _, weight = pour_to(machine, clock, 60.0)
    events = feed_until(machine, clock, weight, lambda: machine.state == State.COMPLETE)
    assert machine.sample_count == 1
    assert State.COMPLETE in states_seen(events)
