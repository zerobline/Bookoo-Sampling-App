# Einmaleins

A multiplication trainer for a child that replaces paper flash cards
(1–10 × 1–10). The app runs in the browser with no ads, no account and no
backend, and works offline. All UI text is German.

## Running it

- **Just open it:** double-click `index.html`. Everything works from `file://`.
  Progress is saved in `localStorage`.
- **Install on a phone or tablet (offline):** serve the folder over http(s),
  for example with `npm start` (runs `python3 -m http.server 8080`), open it once
  and choose "Zum Startbildschirm hinzufügen". A service worker (`sw.js`)
  caches the app, so it keeps working without a network.
- **Tests:** `npm test` (Node ≥ 18, no dependencies).

The Baloo 2 font loads from Google Fonts. Without a network the app falls back
to a system font. After one online visit the service worker caches the font.

## Files

| File | Contents |
| --- | --- |
| `js/tips.js` | `tip(a, b)`, the pure strategy-tip function, plus `maskTip` and `speakable` |
| `js/logic.js` | Facts, Leitner boxes, session building, answer options, level-up rule (pure) |
| `js/app.js` | Screens, speech (Web Speech, de-DE), sounds (Web Audio), storage |
| `css/style.css` | Layout and theme. Light theme is squared exercise-book paper, dark theme is a chalkboard |
| `tests/` | `node:test` unit tests, including `tip()` for all 100 facts |

## Convention

`a × b` means **a rows of b** (3 × 4 is 3 rows of 4 dots, counted 4, 8, 12).
The fact belongs to the b-Reihe. Choosing a Reihe includes the swapped facts,
so the 3er-Reihe has 19 facts: 1 × 3 … 10 × 3 and 3 × 1 … 3 × 10.

## Help levels

1. **Viel Hilfe:** a dot array where the child taps rows to count up, a
   skip-counting number line that stays in sync with the dots, the strategy
   tip, and 4 answer choices. The choices are near-misses: one row
   more or less, one column more or less, and the digits swapped.
2. **Wenig Hilfe:** a number pad. The "Tipp" button shows the tip (text and
   audio) on the first tap and the dot array on the second.
3. **Keine Hilfe:** a number pad with no hints. Parents can turn on an
   optional relaxed timer (off, 30, 20 or 10 s).

Before the child answers, a tip shows the method with the final result hidden,
for example `9 × 7 = 70 − 7 = ?`. After the answer the full tip is shown.

## Strategy tips

Priority order: ×1, ×10, ×2, ×5, ×9, ×4, square, neighbour of a square, swap
to the easier fact (judged by the learning order 1, 10, 2, 5, 4, 9, 3, 6, 8, 7),
and finally a split into easier parts (5 × b + rest). The tests check every
tip for all 100 facts: that the priority is right, that every calculation in
the text is correct, and that the brief's examples come out word for word.

## Practice logic

- Each fact has a Leitner box from 1 to 5, stored locally.
  - Correct without a hint: the fact moves up one box.
  - Correct with a hint: it stays in its box.
  - Wrong: it goes back to box 1.
- **Design decision:** at "Viel Hilfe", where the child picks from 4 choices
  with all help visible, a fact can rise at most to box 2. Green boxes (4 and 5)
  need an answer typed from memory. Change `MAX_BOX_BY_LEVEL` in `logic.js`
  to adjust this.
- A session has 15 cards, drawn by weight toward low boxes
  (box 1 → 8, 2 → 5, 3 → 3, 4 → 2, 5 → 1). A fact never follows directly
  after its own swapped fact.
- After a wrong answer the app shows the dot array and the full tip, reads the
  correct result aloud, and asks the same fact again 3 cards later (at most
  twice per session). Only the first attempt changes the box.
- **Level-up suggestion:** when a Reihe practised in the session scored at
  least 90 % correct without hints over the last two sessions at the current
  level (with at least 3 facts of that Reihe per session), the reward screen
  suggests the next level. A parent confirms by holding a button.

## Screens

- **Start:** choose the help level and the Reihen. The Reihen are in learning
  order, and each shows a small progress bar. "Gemischt" selects all of them.
- **Übung:** progress dots, the card, the help and the answer area. In portrait
  these stack. In landscape the card and help sit on the left and the answer on
  the right.
- **Belohnung:** a star with the number correct, one star per card, the facts
  that moved up, the facts to practise again, and the level-up suggestion.
- **Fortschritt:** a 10 × 10 grid with each fact coloured by its box
  (light red means new, then red through green). Tap a fact to see its
  counts. There is a bar for each Reihe. This screen doubles as the parent view.
- **Für Eltern** (hold for 2 s to open): help level, timer, speech on/off with a
  test button, sounds on/off, and a progress reset (also hold-to-confirm).

Keyboard: `1`–`4` pick a choice, digits, `Backspace` and `Enter` work the
number pad, `Enter` moves to the next card, and `Esc` goes back.

## Out of scope (v1)

Division, numbers above 10, multiple profiles, accounts and online features.
