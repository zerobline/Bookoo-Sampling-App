"""Data records shared across the state machine, storage and GUI layers."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone


def new_session_id() -> str:
    return "session_" + datetime.now().strftime("%Y%m%d_%H%M%S")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


@dataclass
class SampleRecord:
    """One completed measurement -- the MVP data the brief asks for."""

    session_id: str
    sample_number: int
    final_weight_g: float
    timestamp: str = field(default_factory=utc_now_iso)
    accepted_manually: bool = False


@dataclass
class RawReading:
    """One timestamped scale reading, logged internally.

    Kept even though the MVP UI does not show it, so that flow-rate
    analysis can be added later without redesigning the measurement
    pipeline (see "Out of Scope for First Version" in the brief).
    """

    session_id: str
    monotonic_s: float
    timestamp: str
    weight_g: float
    state: str
    flow_g_s: float | None = None
