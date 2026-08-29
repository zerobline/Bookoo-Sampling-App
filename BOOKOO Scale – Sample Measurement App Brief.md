# BOOKOO Scale – Sample Measurement App Brief

## Purpose

Create a simple testing application that allows an operator to measure and record the final beverage weight of up to **100 consecutive samples** with minimal manual interaction.

The application should automate the repetitive scale actions as much as possible so the operator can focus on preparing, emptying, and replacing cups.

## Basic Measurement Cycle

Each sample follows the same process:

1. **Scale ready**
   - Scale is connected.
   - Scale is at zero/tared.
   - App waits for an empty cup.

2. **Empty cup placed**
   - Operator places an empty cup on the scale.
   - App detects that a cup has been placed.
   - After the weight becomes stable, the app automatically tares the scale.
   - Display returns to approximately **0.0 g**.

3. **Waiting for beverage**
   - Machine beverage preparation is triggered externally.
   - There may be several seconds during which nothing happens.
   - App remains in a waiting state.

4. **Beverage starts pouring**
   - Weight begins increasing.
   - App recognizes that beverage dispensing has started.
   - Weight is continuously monitored.

5. **Beverage finishes**
   - Weight stops increasing.
   - App waits until the measured weight is stable.
   - Stable final beverage weight is automatically recorded.

6. **Sample completed**
   - Result is stored as, for example:

   `Sample 17 → 123.4 g`

   - Sample counter increases automatically.

7. **Filled cup removed**
   - Operator removes the cup.
   - App recognizes that the scale has returned close to zero / unloaded state.
   - App waits for the next empty cup.

8. **New empty cup placed**
   - App detects the new cup.
   - Automatically tares again.
   - The next measurement cycle starts.

This repeats until the required number of samples has been completed or the operator stops the test.

## Main App Requirements

The app should allow the operator to:

- Connect and disconnect the BOOKOO scale manually.
- Select or enter the planned number of samples, up to **100**.
- Start a measurement session.
- See the current live weight.
- See the current sample number, e.g. **23 / 100**.
- See what the system currently expects:
  - Waiting for cup
  - Cup detected
  - Taring
  - Ready for beverage
  - Beverage dispensing
  - Waiting for stable weight
  - Result recorded
  - Remove cup
- Automatically tare after a new empty cup is detected.
- Automatically detect beverage dispensing.
- Automatically detect when the final beverage weight is stable.
- Automatically record the stable final weight.
- Automatically move to the next sample.
- Stop or pause the test manually if necessary.
- Manually tare the scale if automatic detection fails.
- Manually accept or redo a measurement if necessary.
- View all recorded samples during the session.
- Export/save the results at the end.

## Data to Record

For the MVP, each sample only needs:

| Sample | Final Weight |
|---:|---:|
| 1 | 121.8 g |
| 2 | 123.1 g |
| 3 | 122.5 g |

It would also be useful to automatically store:

- sample number
- final weight
- timestamp
- session ID

These can be stored even if they are not prominently shown in the interface.

## Important Detection Logic

The application should behave like a small **state machine** rather than simply watching weight.

### State 1 — WAITING FOR CUP

Scale approximately empty.

Detect a meaningful positive weight appearing and becoming stable.

↓

### State 2 — CUP DETECTED

Stable empty-cup weight detected.

Automatically tare.

↓

### State 3 — READY

Scale now around 0 g.

Wait indefinitely for beverage preparation to begin.

↓

### State 4 — DISPENSING

Detect sustained increase in weight.

Continue monitoring.

↓

### State 5 — STABILIZING

Weight has stopped meaningfully increasing.

Wait for sufficiently stable readings.

↓

### State 6 — RECORD

Record final weight once.

Prevent duplicate recordings.

↓

### State 7 — WAITING FOR REMOVAL

Wait until filled cup is removed.

↓

Return to:

**WAITING FOR CUP**

## Stability Detection

A key function will be defining what "stable" means.

For example:

**Cup stable**

Weight changes by less than approximately ±0.2 g for 0.5–1 second.

**Final beverage stable**

Weight changes by less than approximately ±0.2–0.5 g for 1–2 seconds.

These thresholds should eventually be configurable because scale behaviour, vibration and beverage dripping may affect them.

## Safety Against False Measurements

The software should avoid recording a result when:

- the operator touches the cup
- the machine vibrates the scale
- beverage briefly pauses during dispensing
- a final drip occurs
- the cup is removed
- the cup is accidentally moved
- the operator puts something else on the scale

Therefore the logic should use both:

**weight level + weight trend + stability + current process state**

rather than a single weight threshold.

## Initial User Interface

The main screen can remain extremely simple.

### Large central area

**Current weight**

`123.4 g`

### Status

`WAITING FOR FINAL WEIGHT`

### Progress

`Sample 17 / 100`

### Last result

`Sample 16: 122.8 g`

### Main controls

- Connect
- Disconnect
- Start Test
- Pause
- Stop
- Manual Tare
- Accept Measurement
- Redo Sample

### Results table

A simple running list of completed measurements.

## Out of Scope for First Version

For now we do **not** need to finalize:

- beverage flow-rate analysis
- detailed weight-vs-time curves
- extraction profiling
- automatic beverage machine control
- recipe identification
- cloud storage
- user accounts
- advanced statistics

However, the app should ideally collect timestamped scale readings internally so that **flow recording can be added later without redesigning the whole measurement system**.

## Core Design Principle

The operator should ideally perform only three physical actions per sample:

**Place empty cup → prepare beverage → remove filled cup**

Everything else — tare, detection, final-weight capture, sample numbering and result storage — should happen automatically.