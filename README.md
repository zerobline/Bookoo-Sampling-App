# BOOKOO Scale – Sample Measurement App

A small operator tool that automates the repetitive "place cup, prepare
beverage, remove cup" measurement cycle described in
[`BOOKOO Scale – Sample Measurement App Brief.md`](BOOKOO%20Scale%20%E2%80%93%20Sample%20Measurement%20App%20Brief.md),
using a BOOKOO Mini/Ultra scale over Bluetooth Low Energy (BLE).

The operator does three things per sample — place an empty cup, start the
beverage, remove the filled cup — and the app handles taring, detecting
pour start/stop, waiting for a stable final weight, recording the result,
and moving on to the next sample automatically.

## Supported hardware

This app talks BOOKOO's own BLE packet protocol directly (see below), so it
only works with BOOKOO scales, specifically:

* **BOOKOO Mini Scale** — advertises as `BOOKOO_SC...`
* **BOOKOO Scale Ultra** — advertises as `BOOKOO_SC_U...`

Both use the same service/characteristic UUIDs, checksum, and live-weight
packet layout, so one implementation (`protocol.py`) covers either; the app
scans for any device whose advertised name starts with `BOOKOO`. It does
**not** work with other brands of BLE scale (different protocol) or with
BOOKOO's separate Espresso Monitor product (also BLE, but a different,
unimplemented protocol).

A scale only accepts one BLE connection at a time, so make sure it isn't
already connected to the official BOOKOO app, Beanconqueror, or another
tool before connecting here — otherwise the connection (or scan) will
fail or time out. No real scale on hand? Tick **Simulate scale (no
hardware)** in the app to run the full flow against a built-in simulator
instead.

The protocol itself comes from BOOKOO's officially published documentation
(`bookoo_mini_scale/protocols.md` and `bookoo_ultra_scale/protocols.md`,
bundled here in `OpenSource-main.zip`), cross-checked against
`BOOKOO_PROTOCOL_AUDIT.md` (bundled in `BOOKOO_Protocol_Lab.zip`), which
also documents a bug this app's `protocol.py` fixes (see "BLE protocol"
below).

## Quick start

```bash
python3 -m venv .venv && source .venv/bin/activate   # optional but recommended
pip install -r requirements.txt
python -m bookoo_sampling_app.main
```

Tkinter ships with the standard Windows/macOS Python installer; on Linux
you may need your distro's `python3-tk` package.

In the app, tick **Simulate scale (no hardware)** and click **Connect** to
try the whole flow (cup placed → pour → stable weight → next sample)
without a real scale. Uncheck it to connect to a real scale over BLE (see
"Supported hardware" above for which ones, and what to check first).

## Running the tests

```bash
pip install -r requirements-dev.txt
pytest
```

The suite covers the protocol codec, every state-machine transition
(including the "don't record a bogus result" scenarios below), storage,
the simulator's scripted readings, and an end-to-end run against it — no
BLE hardware needed to run it.

## How it works

### BLE protocol (`protocol.py`)

Implements BOOKOO's published Mini/Ultra scale transmission protocol:
service `0x0FFE`, weight-notify characteristic `0xFF11`, command
characteristic `0xFF12`, XOR checksum, and the 20-byte live-weight packet
layout. It also carries a fix flagged by `BOOKOO_PROTOCOL_AUDIT.md` (in
`BOOKOO_Protocol_Lab.zip`): the beep-level command byte belongs in
`DATA2`, not `DATA1`, which a different diagnostic tool reviewed in that
audit (not included in this repo) had wrong. Only `tare` is used by the
app itself today; `beep`/`autooff` are implemented and available for
future use.

### Scale sources (`scale_source.py`)

`ScaleSource` is a tiny async interface (`connect`, `disconnect`, `tare`,
plus a reading callback) implemented two ways:

* `BLEScaleSource` — talks to a real scale via [bleak](https://github.com/hbldh/bleak).
* `SimulatedScaleSource` — scripts a realistic reading stream (including an
  occasional brief pause mid-pour) so the rest of the app, and the test
  suite, can run without hardware.

### State machine (`state_machine.py`)

The core of the app: a small state machine mirroring the brief's cycle —

```
WAITING_FOR_CUP → CUP_DETECTED → TARING → READY → DISPENSING
→ STABILIZING → RECORDED → WAITING_FOR_REMOVAL → (back to WAITING_FOR_CUP)
```

It only sees `(timestamp, weight)` pairs and emits status/result events —
it has no idea whether the weight came from real BLE or the simulator,
which is what makes it independently testable.

Detection combines **weight level + trend + stability + current state**,
never a single threshold, per the brief's "Safety Against False
Measurements" section:

* A cup is only "detected" once weight has been within tolerance for a
  configurable window (default ±0.2 g for 0.75 s) — a touch or vibration
  blip doesn't count.
* Dispensing is only confirmed once weight has *risen at a sustained rate*
  for a short window, not just jumped once — the same protection against
  a touch on the cup.
* Once the pour stops, the app waits for the weight to be flat for a
  configurable window (default ±0.35 g for 1.5 s) before recording. If
  pouring resumes (a brief machine pause) or a late drip lands, the wait
  restarts — nothing is recorded off a still-moving reading.
* If the cup is pulled off mid-pour, the sample is discarded (not
  recorded) and the app returns to waiting for the next cup.
* A stable weight outside a configurable sane range is *not*
  auto-recorded; the operator is prompted to use Accept Measurement or
  Redo Sample instead.

All thresholds live in `StateMachineConfig` and are editable from the
app's **Settings…** dialog.

### Session (`session.py`)

Glues a `ScaleSource`, the state machine, and storage together: forwards
readings, fires the tare command automatically when a cup is detected,
persists samples, and fans out events to the GUI.

### Storage (`storage.py`)

Per session, two files are written incrementally (crash-safe) under
`~/BookooSamplingApp/sessions/` by default:

* `results_<session_id>.csv` — the MVP table: sample number, final weight,
  timestamp, session id.
* `raw_<session_id>.jsonl` — every timestamped reading with the state it
  was taken in. Not shown in the UI, but kept so flow-rate/curve analysis
  can be added later without redesigning the measurement pipeline, per the
  brief's "Out of Scope for First Version" section.

The **Export CSV…** / **Export JSON…** buttons save a copy of the results
table wherever the operator chooses.

### GUI (`gui.py`, `async_bridge.py`)

One Tkinter screen: connect/disconnect, planned sample count, a big live
weight with battery % and live flow rate (g/s) underneath, status, progress
(`Sample 23 / 100`), last result, the main controls (Start Test, Pause,
Stop, Manual Tare, Accept Measurement, Redo Sample), a results table, and
export buttons. BLE/asyncio work runs on a background thread
(`async_bridge.AsyncLoopThread`); all cross-thread handoff to Tk goes
through a plain `queue.Queue` polled with `root.after`, since Tk itself is
not thread-safe to call into directly from another thread.

Styled with [sv-ttk](https://github.com/rdbende/Sun-Valley-ttk-theme) (a
Windows 11/Fluent-style ttk theme) where installed, falling back to stock
ttk's "clam" theme with a hand-rolled accent style if it isn't -- either
way the app opens, just less polished. Fonts are pinned explicitly
("Segoe UI" for everything, "Consolas" for the live weight) rather than
left to sv-ttk's own "Segoe UI Variable", and the window size is computed
from actual content on startup instead of a guessed pixel size, so it
never clips a section regardless of the real font metrics on the machine
it runs on. The window icon (`assets/icon.ico`/`.png`) is a placeholder
mark, easy to swap for a real one later.

Battery and flow rate are decoded from every live BLE packet (`protocol.py`)
and mirrored by the simulator so simulate mode exercises the same code
path; the battery label turns red and logs a warning once it drops to
15% (reset once it recovers past 25%). Clicking **Stop** while samples
remain asks for confirmation, and a session ending — by completion or by
Stop, as long as at least one sample was recorded — shows a summary
dialog (count, average, min/max, standard deviation, duration) with a
one-click **Export CSV…**.

## Repository layout

```
bookoo_sampling_app/     the application package
bookoo_sampling_app/assets/  window icon (icon.ico, icon.png)
tests/                   pytest suite (protocol, state machine, storage, end-to-end)
requirements.txt         runtime dependencies (bleak, sv-ttk)
requirements-dev.txt     + pytest
```

The `BOOKOO_Protocol_Lab.zip` and `OpenSource-main.zip` files in the repo
root are BOOKOO's own protocol documentation and a standalone hardware
protocol-validation tool used as reference while building this app; they
are not part of the application itself.
