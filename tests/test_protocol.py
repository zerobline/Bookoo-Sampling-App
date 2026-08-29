from bookoo_sampling_app import protocol


def test_xor_checksum_matches_manual_calculation():
    values = [0x03, 0x0A, 0x01, 0x00, 0x00]
    assert protocol.xor_checksum(values) == 0x03 ^ 0x0A ^ 0x01 ^ 0x00 ^ 0x00


def test_build_command_tare():
    packet = protocol.build_command("tare")
    assert packet == bytes([0x03, 0x0A, 0x01, 0x00, 0x00, 0x03 ^ 0x0A ^ 0x01])
    assert protocol.valid_checksum(packet)


def test_build_command_beep_uses_data2_not_data1():
    """Regression test for the documented mapper bug: level must be in byte 5."""
    packet = protocol.build_command("beep", 3)
    assert packet[3] == 0x00  # DATA1 (byte 4) untouched
    assert packet[4] == 0x03  # DATA2 (byte 5) carries the level
    assert protocol.valid_checksum(packet)


def test_build_command_rejects_out_of_range_value():
    import pytest

    with pytest.raises(ValueError):
        protocol.build_command("autooff", 999)


def _live_packet(weight_g: float, timer_ms: int = 12_345, battery: int = 80) -> bytes:
    weight_x100 = round(abs(weight_g) * 100)
    sign = ord("+") if weight_g >= 0 else ord("-")
    data = [
        protocol.PRODUCT,
        protocol.LIVE_TYPE,
        (timer_ms >> 16) & 0xFF,
        (timer_ms >> 8) & 0xFF,
        timer_ms & 0xFF,
        1,  # unit: gram
        sign,
        (weight_x100 >> 16) & 0xFF,
        (weight_x100 >> 8) & 0xFF,
        weight_x100 & 0xFF,
        ord("+"),  # flow sign
        0,
        0,  # flow rate = 0
        battery,
        0,
        150,  # standby minutes * 10 = 15.0
        1,  # beep level
        0,  # flow smoothing off
        0,  # reserved
    ]
    data.append(protocol.xor_checksum(data))
    assert len(data) == 20
    return bytes(data)


def test_decode_live_packet_round_trip():
    raw = _live_packet(123.45)
    decoded = protocol.decode_packet(raw)
    assert decoded["kind"] == "live"
    assert decoded["checksum_ok"] is True
    assert decoded["weight_g"] == 123.45
    assert decoded["display_unit"] == "g"
    assert decoded["battery_pct"] == 80
    assert decoded["standby_minutes"] == 15.0


def test_decode_negative_weight():
    raw = _live_packet(-2.5)
    decoded = protocol.decode_packet(raw)
    assert decoded["weight_g"] == -2.5


def test_decode_bad_checksum_is_flagged_not_raised():
    raw = bytearray(_live_packet(10.0))
    raw[-1] ^= 0xFF  # corrupt the checksum byte
    decoded = protocol.decode_packet(bytes(raw))
    assert decoded["kind"] == "checksum_failed"


def test_decode_short_packet_does_not_raise():
    decoded = protocol.decode_packet(b"\x03")
    assert decoded["kind"] == "empty_or_short"


def test_decode_non_bookoo_packet():
    decoded = protocol.decode_packet(bytes([0xFF]) + bytes(19))
    assert decoded["kind"] == "non_bookoo"
