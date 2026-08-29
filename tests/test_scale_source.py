import asyncio

from bookoo_sampling_app.scale_source import SimulatedScaleSource, SimulatorTiming


def test_simulated_readings_carry_battery_and_flow(tmp_path):
    """The GUI reads battery_pct/flow_g_s straight out of ScaleReading.decoded
    -- for real hardware that's protocol.decode_packet's job, but the
    simulator has to fake it itself so simulate mode exercises the same
    display/warning code paths."""

    async def run():
        scale = SimulatedScaleSource(
            cycle_count=1,
            seed=7,
            timing=SimulatorTiming.fast(),
            battery_start_pct=100.0,
            battery_drain_per_reading=0.5,
            battery_floor_pct=10.0,
        )
        readings = []
        scale.set_reading_callback(readings.append)
        await scale.connect()
        # Let a full (fast) cycle run.
        await asyncio.sleep(7.0)
        await scale.disconnect()
        return readings

    readings = asyncio.run(run())

    assert len(readings) > 20
    for r in readings:
        assert "battery_pct" in r.decoded
        assert "flow_g_s" in r.decoded
        assert 10.0 <= r.decoded["battery_pct"] <= 100.0

    # Battery should be non-increasing across the run (never charges itself).
    battery_values = [r.decoded["battery_pct"] for r in readings]
    assert battery_values == sorted(battery_values, reverse=True)
    # With a fast drain over one cycle, it should visibly move off 100.
    assert battery_values[-1] < battery_values[0]

    # Somewhere during the pour, flow should register a clearly positive rate.
    assert any(r.decoded["flow_g_s"] > 1.0 for r in readings)


def test_battery_floor_is_respected():
    async def run():
        scale = SimulatedScaleSource(
            cycle_count=1,
            seed=1,
            timing=SimulatorTiming.fast(),
            battery_start_pct=11.0,
            battery_drain_per_reading=1.0,
            battery_floor_pct=10.0,
        )
        readings = []
        scale.set_reading_callback(readings.append)
        await scale.connect()
        await asyncio.sleep(7.0)
        await scale.disconnect()
        return readings

    readings = asyncio.run(run())
    assert all(r.decoded["battery_pct"] >= 10.0 for r in readings)
    assert readings[-1].decoded["battery_pct"] == 10.0
