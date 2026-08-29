"""End-to-end smoke test: simulated scale -> state machine -> storage.

This exercises the whole pipeline the GUI drives, without needing real
BLE hardware -- useful both as a regression test and as proof the app
works end to end.
"""

import asyncio

from bookoo_sampling_app.scale_source import SimulatedScaleSource, SimulatorTiming
from bookoo_sampling_app.session import SamplingSession
from bookoo_sampling_app.state_machine import Event, State


def test_simulated_session_records_samples(tmp_path):
    async def run():
        session = SamplingSession(tmp_path, planned_samples=2)
        scale = SimulatedScaleSource(cycle_count=2, seed=42, timing=SimulatorTiming.fast())
        session.bind_scale(scale)

        recorded = []
        completed = asyncio.Event()

        def on_event(event: Event) -> None:
            if event.kind == "sample_recorded":
                recorded.append(event)
            if event.kind == "status_changed" and event.state == State.COMPLETE:
                completed.set()

        session.on_event = on_event
        await session.connect_scale()
        session.start()

        await asyncio.wait_for(completed.wait(), timeout=45)
        await session.disconnect_scale()
        session.close()
        return session, recorded

    session, recorded = asyncio.run(run())

    assert len(recorded) == 2
    assert [e.sample_number for e in recorded] == [1, 2]
    for event in recorded:
        assert 50.0 <= event.weight_g <= 200.0  # simulator's default target range

    assert len(session.store.samples) == 2
    assert session.store.results_path.exists()
    assert session.store.raw_path.exists()
    assert session.store.raw_path.stat().st_size > 0
