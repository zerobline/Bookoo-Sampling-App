"""Sources of scale readings: a real BOOKOO scale over BLE, or a simulator.

Both implementations expose the same small async interface so the rest of
the app (state machine, GUI) never needs to know whether it's talking to
real hardware. This also makes the whole measurement pipeline testable and
demonstrable without a physical scale.
"""

from __future__ import annotations

import asyncio
import random
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional, Tuple

from . import protocol

ReadingCallback = Callable[["ScaleReading"], None]


@dataclass
class ScaleReading:
    monotonic_s: float
    weight_g: float
    decoded: Dict[str, Any]


class ScaleError(RuntimeError):
    pass


class ScaleSource:
    """Common interface implemented by BLEScaleSource and SimulatedScaleSource."""

    def __init__(self) -> None:
        self._callback: Optional[ReadingCallback] = None
        self.is_connected: bool = False

    def set_reading_callback(self, callback: Optional[ReadingCallback]) -> None:
        self._callback = callback

    def _emit(self, reading: ScaleReading) -> None:
        if self._callback is not None:
            self._callback(reading)

    async def connect(self) -> str:
        raise NotImplementedError

    async def disconnect(self) -> None:
        raise NotImplementedError

    async def tare(self) -> None:
        raise NotImplementedError


class BLEScaleSource(ScaleSource):
    """Connects to a real BOOKOO Mini/Ultra scale via bleak."""

    def __init__(self, address: Optional[str] = None, scan_timeout_s: float = 8.0):
        super().__init__()
        self.address = address
        self.scan_timeout_s = scan_timeout_s
        self._client = None  # bleak.BleakClient
        self.device_name: Optional[str] = None

    async def connect(self) -> str:
        try:
            from bleak import BleakClient, BleakScanner
        except ImportError as exc:  # pragma: no cover - environment dependent
            raise ScaleError(
                "bleak is not installed. Run: pip install -r requirements.txt"
            ) from exc

        address = self.address
        if address is None:
            device = await BleakScanner.find_device_by_filter(
                lambda d, adv: bool(d.name) and d.name.upper().startswith(protocol.DEVICE_NAME_PREFIX),
                timeout=self.scan_timeout_s,
            )
            if device is None:
                raise ScaleError(
                    "No BOOKOO scale found. Make sure it is powered on, in range, "
                    "and not already connected to another app (e.g. the phone app)."
                )
            address = device.address
            self.device_name = device.name

        client = BleakClient(address)
        await client.connect()
        if not client.is_connected:
            raise ScaleError(f"Failed to connect to {address}")

        def _on_notify(_sender, data: bytearray) -> None:
            decoded = protocol.decode_packet(bytes(data))
            if decoded.get("kind") == "live":
                self._emit(
                    ScaleReading(
                        monotonic_s=time.monotonic(),
                        weight_g=decoded["weight_g"],
                        decoded=decoded,
                    )
                )

        await client.start_notify(protocol.WEIGHT_CHAR_UUID, _on_notify)

        self._client = client
        self.is_connected = True
        self.address = address
        return address

    async def disconnect(self) -> None:
        if self._client is not None:
            try:
                await self._client.stop_notify(protocol.WEIGHT_CHAR_UUID)
            except Exception:
                pass
            await self._client.disconnect()
        self._client = None
        self.is_connected = False

    async def tare(self) -> None:
        if self._client is None or not self.is_connected:
            raise ScaleError("Not connected")
        packet = protocol.build_command("tare")
        await self._client.write_gatt_char(protocol.COMMAND_CHAR_UUID, packet, response=False)


@dataclass
class SimulatorTiming:
    """Phase durations (seconds), all real wall-clock time.

    These feed real ``time.monotonic()`` timestamps into the same state
    machine a real scale drives, so they can be shortened for a quick demo
    or test run, but not compressed via a sleep-rate multiplier: the state
    machine's stability/rate windows are themselves specified in real
    seconds, so what matters is that each phase here stays comfortably
    longer than the corresponding ``StateMachineConfig`` window it needs to
    satisfy (see the defaults below vs. ``StateMachineConfig``'s docstring
    ranges) -- not how many samples are emitted along the way.
    """

    cup_place_s: float = 0.6
    cup_hold_s: float = 1.0
    machine_wait_range_s: Tuple[float, float] = (1.0, 3.0)
    pour_range_s: Tuple[float, float] = (2.0, 4.0)
    pause_probability: float = 0.2
    pause_hold_s: float = 0.4
    pause_resume_range_s: Tuple[float, float] = (0.5, 1.5)
    final_hold_s: float = 2.0
    cup_remove_s: float = 0.5
    post_remove_hold_s: float = 0.6

    @classmethod
    def fast(cls) -> "SimulatorTiming":
        """A shortened timeline for demos/tests: still safely above the
        default StateMachineConfig windows, just without the multi-second
        "waiting for the machine" pause."""
        return cls(
            cup_place_s=0.3,
            cup_hold_s=1.2,
            machine_wait_range_s=(0.2, 0.5),
            pour_range_s=(0.8, 1.5),
            pause_probability=0.0,
            final_hold_s=2.5,
            cup_remove_s=0.3,
            post_remove_hold_s=0.8,
        )


class SimulatedScaleSource(ScaleSource):
    """Generates a synthetic reading stream that follows the brief's cycle.

    Useful for exercising the full app (state machine, GUI, storage) without
    real hardware: empty -> cup placed -> tare -> wait -> pour -> stabilize
    -> hold -> cup removed -> repeat, at roughly the scale's ~10 Hz rate.
    """

    def __init__(
        self,
        cycle_count: int = 100,
        hz: float = 10.0,
        target_weight_range: tuple[float, float] = (110.0, 130.0),
        seed: Optional[int] = None,
        timing: Optional[SimulatorTiming] = None,
        battery_start_pct: float = 100.0,
        battery_drain_per_reading: float = 0.01,
        battery_floor_pct: float = 10.0,
    ):
        super().__init__()
        self.cycle_count = cycle_count
        self.hz = hz
        self.target_weight_range = target_weight_range
        self.timing = timing or SimulatorTiming()
        self._rng = random.Random(seed)
        self._task: Optional[asyncio.Task] = None
        self._stop = False
        # A real scale reports battery/flow in every live packet; matched
        # here so simulate mode exercises the same GUI code paths as real
        # hardware (see gui.py's battery/flow display and low-battery
        # warning). Draining it slowly lets a long demo/test run actually
        # reach the low-battery warning threshold instead of staying flat.
        self._battery_pct = battery_start_pct
        self._battery_drain_per_reading = battery_drain_per_reading
        self._battery_floor_pct = battery_floor_pct
        self._prev_weight_for_flow = 0.0

    async def connect(self) -> str:
        self.is_connected = True
        self._stop = False
        self._task = asyncio.create_task(self._run())
        return "SIMULATED"

    async def disconnect(self) -> None:
        self._stop = True
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
        self._task = None
        self.is_connected = False

    async def tare(self) -> None:
        # Readings are already scripted as post-tare values (see _run), so
        # there is nothing to adjust here -- this exists to satisfy the
        # ScaleSource interface the app calls into during TARING.
        return

    async def _emit_weight(self, weight_g: float, flow_g_s: float = 0.0) -> None:
        if self._battery_pct > self._battery_floor_pct:
            self._battery_pct = max(self._battery_floor_pct, self._battery_pct - self._battery_drain_per_reading)
        decoded = {
            "kind": "live",
            "weight_g": weight_g,
            "flow_g_s": flow_g_s,
            "battery_pct": round(self._battery_pct),
        }
        self._emit(ScaleReading(monotonic_s=time.monotonic(), weight_g=weight_g, decoded=decoded))
        self._prev_weight_for_flow = weight_g

    def _noise(self, sigma: float = 0.05) -> float:
        return self._rng.gauss(0, sigma)

    async def _hold(self, weight_g: float, seconds: float) -> None:
        steps = max(1, int(seconds * self.hz))
        for _ in range(steps):
            await self._emit_weight(weight_g + self._noise(), flow_g_s=0.0)
            await asyncio.sleep(1.0 / self.hz)

    async def _ramp(self, start: float, end: float, seconds: float) -> None:
        steps = max(1, int(seconds * self.hz))
        dt = 1.0 / self.hz
        for i in range(steps):
            frac = (i + 1) / steps
            # ease-out so the pour visibly slows near the target, like a
            # real machine finishing a shot
            eased = 1 - (1 - frac) ** 2
            weight = start + (end - start) * eased + self._noise()
            flow = (weight - self._prev_weight_for_flow) / dt
            await self._emit_weight(weight, flow_g_s=flow)
            await asyncio.sleep(dt)

    async def _run(self) -> None:
        timing = self.timing
        try:
            await self._emit_weight(0.0)
            for _ in range(self.cycle_count):
                if self._stop:
                    return
                cup_weight = self._rng.uniform(28.0, 34.0)
                await self._ramp(0.0, cup_weight, timing.cup_place_s)  # cup placed
                await self._hold(cup_weight, timing.cup_hold_s)  # settles -> auto-tare happens externally

                await self._hold(0.0, self._rng.uniform(*timing.machine_wait_range_s))  # waiting for machine

                target = self._rng.uniform(*self.target_weight_range)
                await self._ramp(0.0, target, self._rng.uniform(*timing.pour_range_s))  # pouring
                if self._rng.random() < timing.pause_probability:
                    # occasionally simulate a brief pause mid-pour
                    await self._hold(target * 0.7, timing.pause_hold_s)
                    await self._ramp(target * 0.7, target, self._rng.uniform(*timing.pause_resume_range_s))
                await self._hold(target, timing.final_hold_s)  # stable final weight

                await self._ramp(target, 0.0, timing.cup_remove_s)  # cup removed
                await self._hold(0.0, timing.post_remove_hold_s)
        except asyncio.CancelledError:
            return
