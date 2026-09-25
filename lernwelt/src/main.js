import { createBackend } from './core/storage.js';
import { createProfiles } from './core/profiles.js';
import { createLauncherData } from './core/launcher-data.js';
import { loadRegistry } from './core/registry.js';
import { createSpeech } from './services/speech.js';
import { createSounds } from './services/sounds.js';
import { h, clear } from './ui/dom.js';
import { homeScreen } from './screens/home.js';
import { appScreen } from './screens/app-host.js';
import { collectionScreen } from './screens/collection.js';
import { gateScreen } from './screens/gate.js';
import { parentScreen, appSettingsScreen } from './screens/parent.js';

const root = document.getElementById('root');

const backend = createBackend();
const profiles = createProfiles(backend);
let profile = profiles.active();
const data = createLauncherData(backend, profile.id);

// Shared launcher context passed to every screen.
const ctx = {
  backend,
  data,
  registry: null,
  speech: createSpeech({ isEnabled: () => data.settings().speech }),
  sounds: createSounds({ isEnabled: () => data.settings().sound }),
  parentUnlocked: false,
  get profile() {
    return profile;
  },
  updateProfile(patch) {
    profile = profiles.update(profile.id, patch);
  },
  navigate,
  goHome,
  back: () => history.back(),
  refresh: () => show(current.hash),
};

// --- Routing -----------------------------------------------------------------
// Home is always the bottom history entry of this app; every other screen is
// pushed on top of it (history.state.depth). Browser/Android "back" therefore
// always lands on Home, and a running round asks before it is left.

const ROUTES = [
  [/^#\/$/, () => homeScreen(ctx)],
  [/^#\/app\/([a-z0-9-]+)$/, (m) => appScreen(ctx, m[1])],
  [/^#\/sammlung$/, () => collectionScreen(ctx)],
  [/^#\/eltern$/, () => (ctx.parentUnlocked ? parentScreen(ctx) : gateScreen(ctx))],
  [/^#\/eltern\/app\/([a-z0-9-]+)$/, (m) => (ctx.parentUnlocked ? appSettingsScreen(ctx, m[1]) : gateScreen(ctx))],
];

let current = null;
let leaving = false;
let confirming = false;

function show(hash) {
  try {
    current?.screen.destroy?.();
  } catch (err) {
    console.error(err);
  }
  clear(root);
  let match = null;
  let factory = null;
  for (const [re, f] of ROUTES) {
    match = re.exec(hash);
    if (match) {
      factory = f;
      break;
    }
  }
  if (!factory) {
    hash = '#/';
    history.replaceState({ depth: 0 }, '', hash);
    factory = ROUTES[0][1];
  }
  if (hash === '#/') ctx.parentUnlocked = false;
  const screen = factory(match);
  current = { hash, depth: history.state?.depth ?? 0, screen };
  root.append(screen.el);
  window.scrollTo(0, 0);
}

function navigate(hash) {
  const depth = (history.state?.depth ?? 0) + 1;
  history.pushState({ depth }, '', hash);
  show(hash);
}

async function goHome({ force = false } = {}) {
  if (!force && current?.screen.needsConfirm?.()) {
    if (confirming) return;
    confirming = true;
    const ok = await current.screen.confirmLeave();
    confirming = false;
    if (!ok) return;
  }
  const depth = history.state?.depth ?? 0;
  if (depth > 0) {
    leaving = true;
    history.go(-depth);
  } else {
    history.replaceState({ depth: 0 }, '', '#/');
    show('#/');
  }
}

window.addEventListener('popstate', async () => {
  const target = location.hash || '#/';
  if (leaving) {
    leaving = false;
    show(target);
    return;
  }
  if (current?.screen.needsConfirm?.()) {
    // Undo the back step, then ask.
    history.pushState({ depth: current.depth }, '', current.hash);
    if (confirming) return;
    confirming = true;
    const ok = await current.screen.confirmLeave();
    confirming = false;
    if (ok) goHome({ force: true });
    return;
  }
  show(target);
});

// --- Boot --------------------------------------------------------------------

async function boot() {
  try {
    ctx.registry = await loadRegistry(new URL('../apps/', import.meta.url));
  } catch (err) {
    console.error(err);
    root.replaceChildren(
      h('div', { class: 'lw-fatal' }, h('div', { class: 'lw-fatal__emoji' }, '😕'), h('p', {}, 'Die Lernwelt konnte nicht geladen werden.'), h('button', { class: 'lw-btn lw-btn--primary lw-btn--big', onclick: () => location.reload() }, 'Nochmal versuchen')),
    );
    return;
  }
  // Always start on Home (also after a reload in the middle of an app).
  history.replaceState({ depth: 0 }, '', '#/');
  show('#/');

  // Unlock audio on the first touch (autoplay rules).
  window.addEventListener('pointerdown', () => ctx.sounds.unlock(), { once: true });

  // Pre-load app modules in the background so the service worker caches them for offline use.
  const warm = () => ctx.registry.apps.forEach((a) => ctx.registry.load(a.id).catch(() => {}));
  (window.requestIdleCallback ?? ((f) => setTimeout(f, 1500)))(warm);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { scope: new URL('../', import.meta.url).pathname }).catch((err) => console.warn('[lernwelt] Service Worker:', err));
  }
}

boot();
