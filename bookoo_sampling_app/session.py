"""Glues a ScaleSource, the sampling state machine and storage together.

This is the one object the GUI talks to. It owns:

* forwarding each scale reading into the state machine and logging it,
* firing the tare command automatically when the state machine says a cup
  was detected,
* writing recorded samples to disk,
* fanning out events to the GUI via plain callbacks (the GUI is expected to
  make these thread-safe, e.g. by pushing onto a ``queue.Queue``, since
  scale readings arrive on the asyncio event-loop thread).
"""

from __future__ import annotations

import asyncio
import logging
import time
from pathlib import Path
from typing import Callable, Optional

from .models import RawReading, SampleRecord, new_session_id, utc_now_iso
from .scale_source import ScaleReading, ScaleSource
from .state_machine import Event, SamplingStateMachine, State, StateMachineConfig
from .storage import SessionStore

logger = logging.getLogger(__name__)

EventCallback = Callable[[Event], None]
WeightCallback = Callable[[ScaleReading], None]


class SamplingSession:
    def __init__(
        self,
        data_dir: Path,
        config: Optional[StateMachineConfig] = None,
        planned_samples: int = 100,
    ):
        self.data_dir = Path(data_dir)
        self.config = config or StateMachineConfig()
        self.planned_samples = planned_samples
        self.machine = SamplingStateMachine(self.config, planned_samples)
        self.store: Optional[SessionStore] = None
        self.session_id: Optional[str] = None
        self.scale: Optional[ScaleSource] = None

        # Set by the GUI. Called from the asyncio-loop thread; must not
        # touch Tk widgets directly.
        self.on_event: Optional[EventCallback] = None
        self.on_weight: Optional[WeightCallback] = None

        self._loop: Optional[asyncio.AbstractEventLoop] = None

    # -- scale wiring ------------------------------------------------------

    def bind_scale(self, scale: ScaleSource) -> None:
        self.scale = scale
        scale.set_reading_callback(self._on_reading)

    async def connect_scale(self) -> str:
        assert self.scale is not None, "call bind_scale() first"
        self._loop = asyncio.get_running_loop()
        return await self.scale.connect()

    async def disconnect_scale(self) -> None:
        if self.scale is not None:
            await self.scale.disconnect()

    # -- session lifecycle ---------------------------------------------

    def start(self) -> None:
        self.session_id = new_session_id()
        self.store = SessionStore(self.session_id, self.data_dir)
        self.machine = SamplingStateMachine(self.config, self.planned_samples)
        for event in self.machine.start(time.monotonic()):
            self._dispatch(event)

    async def pause(self) -> None:
        for event in self.machine.pause(time.monotonic()):
            self._dispatch(event)

    async def resume(self) -> None:
        for event in self.machine.resume(time.monotonic()):
            self._dispatch(event)

    async def stop(self) -> None:
        for event in self.machine.stop(time.monotonic()):
            self._dispatch(event)

    async def manual_tare(self) -> None:
        if self.scale is not None and self.scale.is_connected:
            await self.scale.tare()
        self.machine.manual_tare_requested(time.monotonic())

    async def accept_measurement(self) -> None:
        for event in self.machine.accept_measurement(time.monotonic()):
            self._dispatch(event)

    async def redo_sample(self) -> None:
        for event in self.machine.redo_sample(time.monotonic()):
            self._dispatch(event)
        if self.store is not None:
            self.store.discard_last_sample()

    def close(self) -> None:
        if self.store is not None:
            self.store.close()

    # -- reading pipeline -------------------------------------------------

    def _on_reading(self, reading: ScaleReading) -> None:
        events = self.machine.update(reading.monotonic_s, reading.weight_g)

        if self.store is not None and self.session_id is not None:
            self.store.add_reading(
                RawReading(
                    session_id=self.session_id,
                    monotonic_s=reading.monotonic_s,
                    timestamp=utc_now_iso(),
                    weight_g=reading.weight_g,
                    state=self.machine.state.value,
                    flow_g_s=reading.decoded.get("flow_g_s"),
                )
            )

        if self.on_weight is not None:
            self.on_weight(reading)

        for event in events:
            self._dispatch(event)

    def _dispatch(self, event: Event) -> None:
        if event.kind == "status_changed" and event.state == State.CUP_DETECTED:
            self._trigger_auto_tare()

        if event.kind == "sample_recorded" and self.store is not None and self.session_id is not None:
            self.store.add_sample(
                SampleRecord(
                    session_id=self.session_id,
                    sample_number=event.sample_number or self.machine.sample_count,
                    final_weight_g=event.weight_g or 0.0,
                    accepted_manually=event.accepted_manually,
                )
            )

        if self.on_event is not None:
            self.on_event(event)

    def _trigger_auto_tare(self) -> None:
        if self.scale is None or not self.scale.is_connected:
            return
        loop = self._loop or asyncio.get_event_loop()
        loop.create_task(self._auto_tare())

    async def _auto_tare(self) -> None:
        try:
            await self.scale.tare()
        except Exception:
            logger.exception("Automatic tare failed")
        self.machine.manual_tare_requested(time.monotonic())
