# BOOKOO Scale – Sample Measurement App

A small operator tool that automates the repetitive "place cup, prepare
beverage, remove cup" measurement cycle described in
[`BOOKOO Scale – Sample Measurement App Brief.md`](BOOKOO%20Scale%20%E2%80%93%20Sample%20Measurement%20App%20Brief.md),
using a BOOKOO Mini/Ultra scale over Bluetooth Low Energy (BLE).

The operator does three things per sample — place an empty cup, start the
beverage, remove the filled cup — and the app handles taring, detecting
pour start/stop, waiting for a stable final weight, recording the result,
and moving on to the next sample automatically.

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
without a real scale — useful for a first look or for demoing on a machine
that doesn't have one nearby. Uncheck it to connect to a real BOOKOO scale
over BLE (it is discovered by name; make sure it's powered on, in range,
and not already connected to another app, e.g. the phone app).

## Running the tests

```bash
pip install -r requirements-dev.txt
pytest
```

The suite covers the protocol codec, every state-machine transition
(including the "don't record a bogus result" scenarios below), storage,
and an end-to-end run against the built-in simulator — no BLE hardware
needed to run it.

## How it works

### BLE protocol (`protocol.py`)

Implements BOOKOO's published Mini/Ultra scale transmission protocol:
service `0x0FFE`, weight-notify characteristic `0xFF11`, command
characteristic `0xFF12`, XOR checksum, and the 20-byte live-weight packet
layout. It also carries a fix noted in this repo's own protocol audit
(`BOOKOO_PROTOCOL_AUDIT.md`): the beep-level command byte belongs in
`DATA2`, not `DATA1`, as an earlier tool in this repo had it wrong. Only
`tare` is used by the app itself today; `beep`/`autooff` are implemented
and available for future use.

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
tests/                   pytest suite (protocol, state machine, storage, end-to-end)
requirements.txt         runtime dependency (bleak)
requirements-dev.txt     + pytest
```

The `BOOKOO_Protocol_Lab.zip` and `OpenSource-main.zip` files in the repo
root are BOOKOO's own protocol documentation and a standalone hardware
protocol-validation tool used as reference while building this app; they
are not part of the application itself.
