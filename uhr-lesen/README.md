# Uhr lesen

A small offline web app that helps a child learn to read an analog clock in
everyday spoken German ("Viertel nach drei", "halb vier"). No ads, no
accounts, no timers, no backend. All UI text is German.

## Run it

* **Simplest:** open `dist/uhr-lesen.html` in any browser. It is one
  self-contained file, so you can copy it to a tablet or phone and open it
  there. It works offline; only the web fonts need a connection, and without
  one the app falls back to system fonts.
* **From source:** open `index.html`, or serve the folder
  (`npm run serve`, then http://localhost:8000). When served over http(s),
  a service worker caches the app for offline use and it can be added to
  the home screen.
* Rebuild the single file after changes: `npm run build`.
* Tests: `npm test` (Node 18+, no dependencies).

## What's in it

| File | Purpose |
| --- | --- |
| `time-phrase.js` | Pure time → German phrase logic (`timeToPhrases`, `isCorrect`, `phraseToTime`, categories, Stufe tables). Works in the browser and in Node. |
| `clock.js` | SVG clock: three help levels, highlight of a misread hand, tap hint, draggable hands with snapping. |
| `app.js` | Screens, session flow, answer modes, speech, sounds, local progress, parent view. |
| `tests/time-phrase.test.js` | Every minute 0–59 for hours 12, 1 and 3, alternatives, regional forms, round-trip and uniqueness checks. |

## How it works

**Clock help** (Viel / Wenig / Keine) and **difficulty** are chosen
separately on the start screen.

* *Viel Hilfe*: hours, minute ring 0–55, red hour hand and blue minute
  hand, "nach" half shaded green, "vor" half shaded orange, labels
  "Viertel nach", "halb", "Viertel vor". Tapping the clock highlights the
  hour the hour hand has just passed.
* *Wenig Hilfe*: hours and minute ticks only. *Keine Hilfe*: ticks only,
  and both hands are the same color.

**Stufe 1–5** adds full hours, half hours, quarters, 5-minute steps, and
then any minute. Half of each session practises the times that are new at
the chosen Stufe.

**Answer modes**
* *Leicht*: pick 1 of 3. The wrong options are near misses: wrong hour
  ("halb drei" vs "halb vier"), "nach"/"vor" swapped, or a neighbouring
  5 minutes.
* *Mittel*: build the phrase from word tiles, plus 2–3 distractor tiles.
* *Schwer*: the app says a time and the child drags the hands. The minute
  hand snaps to 30/30/15/5/1 minutes for Stufe 1–5. Moving the minute hand
  past 12 also moves the hour, like a real clock. Arrow keys work too.
* Every option, the prompt and the built phrase can be read aloud using the
  Web Speech API with a de-DE voice.

**Session:** 10 questions. A correct answer earns a star, plays a sound
and speaks the phrase. After a first miss, the clock goes up one help
level and the misread hand glows. After a second miss, the app shows and
speaks the answer with no penalty, and asks that time again later in the
session. Answering the re-ask correctly earns a silver star.

**Progression:** after two sessions in a row at the same Stufe with at
least 8 of 10 right on the first try, the app suggests the next Stufe. A
parent confirms by holding a button.

**Parent view** ("Für Eltern", opened by holding a button): first-try
error rate per time type (full, half, Viertel nach/vor, "nach"/"vor"
times, around "halb", single minutes), types of mistakes (wrong hour,
wrong minutes, "nach"/"vor" swapped), the last 10 sessions, and settings:
regional forms, reading aloud, speech rate, sounds, and resetting progress.
Everything is stored in `localStorage` on the device.

## German time rules

Uses 12-hour spoken style. `:20` and `:40` accept both forms ("zwanzig nach
drei" / "zehn vor halb vier"). 1:00 is "ein Uhr", 12:30 is "halb eins". A
single minute is said as "eine Minute nach/vor" ("eins nach" is also
accepted). At Stufe 5, the 5-minute times keep their usual names ("Viertel
nach drei", "fünf vor halb vier"), and forms like "fünfzehn nach drei" are
also accepted.

Regional forms are off by default. When turned on, they become the form
that is shown and spoken, and the standard forms are still accepted:
* *Viertel vier* (3:15), *drei viertel vier* (3:45, "dreiviertel" also
  accepted)
* Swiss *ab* instead of *nach* ("Viertel ab drei", "fünf ab halb vier")
