# Lernwelt

A single home screen where a child picks a learning app. It currently has two apps,
**Uhr lesen** (reading a clock) and **Einmaleins** (multiplication).
No ads, no accounts, works offline. All UI text is in German.

It is a plain web app built from ES modules, with no build step and no dependencies,
and it installs as a PWA that opens full screen on a tablet.

## Running it

```bash
cd lernwelt
npm start          # http://localhost:8080/  (node tools/serve.mjs)
npm test           # unit tests (node --test)
```

Any static web server works, including GitHub Pages in a sub-path, because all paths are relative.
For the service worker (offline mode and installing) the app has to be served over `https://` or from `localhost`.
To install it on a tablet, open it in Chrome or Safari and choose "Zum Startbildschirm hinzufügen".

## Structure

```
lernwelt/
  index.html, manifest.webmanifest, sw.js   PWA shell + offline cache
  src/
    main.js              boot + router (Home is always the bottom history entry)
    theme.css            shared colors, fonts, buttons, number pad, dialogs
    core/                storage, profiles, stars/rewards, session log, app registry
    services/            speech (de-DE), sounds, per-app services object
    ui/                  h() DOM helper, icons, number pad, dialogs, form fields, top bar
    screens/             home, app host, collection, parent gate, parent area
  apps/
    index.json           registry: list of app folders
    uhr-lesen/           manifest.json, index.js, clock.js, style.css, icon.svg
    einmaleins/          manifest.json, index.js, logic.js, style.css, icon.svg
  tests/                 node --test
  tools/                 dev server, icon rendering
```

## Adding a new app

1. Create a folder `apps/<id>/` containing `manifest.json`, `index.js` and an icon.
2. Add `"<id>"` to `apps/index.json`.

You don't have to change any launcher code.

### manifest.json

```json
{
  "id": "einmaleins",
  "name": "Einmaleins",
  "subtitle": "Rechnen mit mal",
  "icon": "icon.svg",
  "color": "#F4A340",
  "order": 2,
  "version": "1.0.0",
  "files": ["style.css", "logic.js"]
}
```

`id` must match the folder name (`a-z`, `0-9`, `-`).
`entry` is optional and defaults to `index.js`.
`files` is also optional: it lists extra files the service worker should cache for offline use at install time.
Modules the entry imports are cached anyway once the launcher has loaded them.

### Entry module

```js
export function mount(container, services) { … }   // required: render the app
export function unmount() { … }                     // required: clean up (timers, listeners, number pad)
export function SettingsScreen(container, services) { … return cleanup? }   // optional, parent area
export function ProgressSummary(container, services) { … return cleanup? }  // optional, progress card
```

The launcher draws the **Home button** (top left) and the top bar itself, so it looks the same in every app.
Each app shows its own reward screen at the end of a round and then calls `services.goHome()`.

### `services`

| Field | Purpose |
| --- | --- |
| `storage.get(key, fallback)`, `.set`, `.remove`, `.update`, `.keys`, `.clear` | JSON storage under `lernwelt.<appId>.<profileId>.*`. Apps can't reach each other's data. |
| `session.begin()` | Starts a round. While a round is running, Home and the back button ask before leaving. |
| `session.update({correct,total})` | Optional. Lets the launcher still log an interrupted round. |
| `session.end({correct,total,stars?})` | Logs `{appId, date, duration, correct, total}` and adds the stars to the shared total (1–5 by default, see `ui.starsForRound`). |
| `stars.total()`, `stars.forApp()` | Current star counts. |
| `speech.speak(text)`, `.stop()`, `.available` | German text-to-speech (Web Speech API, `de-DE`). |
| `sounds.correct()`, `.wrong()`, `.reward()`, `.tap()` | Shared sounds, synthesized with Web Audio. |
| `ui.h`, `ui.icon`, `ui.createNumpad`, `ui.confirm`, `ui.starsRow`, `ui.switchField`, `ui.selectField`, `ui.chipsField`, `ui.loadStylesheet` | Shared UI building blocks, styled by `theme.css`. |
| `asset(path)` | URL of a file inside the app folder. |
| `profile` | `{ id, name, avatar }` of the child. |
| `log.list()` | This app's past sessions. |
| `goHome()` | Back to the home screen. |

## Behavior

- **Home:** shows "Hallo [Name]!", the star total, and a tile per visible app with an icon, name, subtitle, star counter, a "Heute geübt" badge, and a speaker button that reads the name aloud. The grid has 2, 3 or 4 columns depending on screen width.
- **Navigation:** the browser or Android back button always returns to Home. During a running round the child is asked "Wirklich aufhören?" first. After a reload the app always starts on Home.
- **Parent gate:** a question like 14 × 7, which is well outside the 1×1 range.
- **Parent area:** name and avatar; show or hide apps; per-app settings; one progress card per app (Uhr: current stage; Einmaleins: 10×10 grid); daily time limit (off by default; a running round is still finished); sound and speech switches; reset progress per app. Resetting keeps the shared star total and the unlocked rewards.
- **Rewards:** every 20 stars unlocks a figure, a background or a sticker ("Meine Sammlung", reached by tapping the star counter or the avatar). There is no shop and nothing to spend.

## Data layout (ready for more child profiles)

```
lernwelt._launcher.profiles              [{ id: "p1", name, avatar, background }]
lernwelt._launcher.activeProfile
lernwelt._launcher.<profileId>.stars     { total, byApp }
lernwelt._launcher.<profileId>.sessions  [{ appId, profileId, date, day, duration, correct, total, stars, completed }]
lernwelt._launcher.<profileId>.usage     { "YYYY-MM-DD": { appId: seconds } }
lernwelt._launcher.<profileId>.settings  { sound, speech, timeLimitEnabled, timeLimitMinutes }
lernwelt.<appId>.<profileId>.*           app data
```

Adding a second child only needs a profile picker. The data model already supports it.

## Updating

If you change files under `src/`, bump `VERSION` in `sw.js` and add any new file to `CORE`.
A test catches files that are missing from `CORE`.
To regenerate the PNG icons from the SVGs, run `node tools/make-icons.mjs`, which needs Playwright.
