"""BOOKOO scale BLE protocol: UUIDs, checksum, command encoding, packet decoding.

Source of truth: BOOKOO's published Mini/Ultra scale transmission protocol
(``bookoo_mini_scale/protocols.md`` and ``bookoo_ultra_scale/protocols.md``,
last updated 2026-08-12) plus the corrections recorded in
``BOOKOO_PROTOCOL_AUDIT.md`` from the protocol lab tooling shipped with this
repository. Notably:

* the beep-level parameter goes in ``DATA2`` (packet byte 5), not ``DATA1``;
* live-packet weight is always grams, regardless of the display-unit byte.

Both the Mini and Ultra scales share the same service/characteristic UUIDs,
checksum method, and live-weight packet layout, so this module works for
either device.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, Optional, Sequence

PRODUCT = 0x03
COMMAND_TYPE = 0x0A
LIVE_TYPE = 0x0B
AUTO_EVENT_TYPE = 0x0D
POWDER_TYPE = 0x0F

SERVICE_UUID = "00000ffe-0000-1000-8000-00805f9b34fb"
WEIGHT_CHAR_UUID = "0000ff11-0000-1000-8000-00805f9b34fb"
COMMAND_CHAR_UUID = "0000ff12-0000-1000-8000-00805f9b34fb"

# Advertised device names seen for BOOKOO scales, e.g. "BOOKOO_SC_U 033120"
# (Ultra) or "BOOKOO_SC" (Mini). Used as a scan-name prefix.
DEVICE_NAME_PREFIX = "BOOKOO"

EVENT_STATES = {
    0x00: "stopped",
    0x01: "started",
    0x02: "ready",
    0x03: "exit_ready",
    0x04: "exit_done",
}


def xor_checksum(values: Iterable[int]) -> int:
    result = 0
    for value in values:
        result ^= int(value)
    return result


def valid_checksum(data: Sequence[int]) -> bool:
    return len(data) >= 2 and xor_checksum(data[:-1]) == data[-1]


def _signed(sign: int, magnitude: float) -> float:
    return -magnitude if sign == ord("-") else magnitude


def _u16(data: Sequence[int], index: int) -> int:
    return (data[index] << 8) | data[index + 1]


def _u24(data: Sequence[int], index: int) -> int:
    return (data[index] << 16) | (data[index + 1] << 8) | data[index + 2]


def hex_bytes(data: Iterable[int]) -> str:
    return " ".join(f"{value:02X}" for value in data)


@dataclass(frozen=True)
class CommandSpec:
    code: int
    title: str
    parameter: Optional[str] = None  # "data1" | "data2" | None
    minimum: Optional[float] = None
    maximum: Optional[float] = None


# Only the commands this app actually uses/exposes. See BOOKOO's published
# protocol for the full command table (calibration, shutdown, powder, ...).
COMMANDS: Dict[str, CommandSpec] = {
    "tare": CommandSpec(0x01, "Tare"),
    "beep": CommandSpec(0x02, "Beep level", "data2", 0, 5),
    "autooff": CommandSpec(0x03, "Auto-off minutes", "data2", 5, 30),
}


def build_command(name: str, value: Optional[float] = None) -> bytes:
    """Build one official six-byte command packet with a checked parameter."""
    if name not in COMMANDS:
        raise ValueError(f"Unknown command: {name}")
    spec = COMMANDS[name]
    data1 = 0
    data2 = 0

    if spec.parameter is not None:
        if value is None:
            raise ValueError(f"{name} requires a value")
        if spec.minimum is not None and value < spec.minimum:
            raise ValueError(f"{name} must be >= {spec.minimum}")
        if spec.maximum is not None and value > spec.maximum:
            raise ValueError(f"{name} must be <= {spec.maximum}")
        if float(value) != int(value):
            raise ValueError(f"{name} requires an integer")
        if spec.parameter == "data1":
            data1 = int(value)
        elif spec.parameter == "data2":
            data2 = int(value)

    packet = bytearray([PRODUCT, COMMAND_TYPE, spec.code, data1, data2])
    packet.append(xor_checksum(packet))
    return bytes(packet)


def decode_packet(raw: Sequence[int]) -> Dict[str, Any]:
    """Decode a notification packet from the weight/command characteristics.

    Returns a dict with at least ``kind`` and ``checksum_ok``. Unknown or
    malformed packets are returned with ``kind`` describing why, rather than
    raising, so a bad BLE frame never crashes the measurement session.
    """
    data = bytes(raw)
    base: Dict[str, Any] = {
        "raw_hex": hex_bytes(data),
        "length": len(data),
        "checksum_ok": valid_checksum(data),
    }
    if len(data) < 2:
        base["kind"] = "empty_or_short"
        return base
    base["product"] = data[0]
    base["packet_type"] = data[1]
    if data[0] != PRODUCT:
        base["kind"] = "non_bookoo"
        return base
    if len(data) != 20:
        base["kind"] = "unknown_bookoo_length"
        return base
    if not base["checksum_ok"]:
        base["kind"] = "checksum_failed"
        return base

    packet_type = data[1]
    if packet_type == LIVE_TYPE:
        base.update(
            {
                "kind": "live",
                "timer_ms": _u24(data, 2),
                "timer_s": _u24(data, 2) / 1000.0,
                "display_unit_code": data[5],
                "display_unit": {1: "g", 2: "oz"}.get(data[5], "unknown"),
                "weight_g": _signed(data[6], _u24(data, 7) / 100.0),
                "flow_g_s": _signed(data[10], _u16(data, 11) / 100.0),
                "battery_pct": data[13],
                "standby_minutes": _u16(data, 14) / 10.0,
                "beep_level": data[16],
                "flow_smoothing": bool(data[17]),
            }
        )
    elif packet_type == AUTO_EVENT_TYPE:
        base.update(
            {
                "kind": "automatic_event",
                "event_code": data[2],
                "event": EVENT_STATES.get(data[2], "unknown"),
                "timer_ms": _u24(data, 3),
                "weight_g": _signed(data[6], _u24(data, 7) / 100.0),
            }
        )
    elif packet_type == POWDER_TYPE:
        base.update(
            {
                "kind": "powder_weight",
                "powder_weight_g": _signed(data[2], _u24(data, 3) / 100.0),
            }
        )
    else:
        base["kind"] = "undocumented_bookoo_type"
    return base
