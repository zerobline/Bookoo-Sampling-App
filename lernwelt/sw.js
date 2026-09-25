// Service worker: makes Lernwelt work offline.
// - On install: caches the launcher (CORE) and every app listed in apps/index.json
//   (its manifest, icon, entry module and any extra "files" from its manifest).
// - Afterwards: stale-while-revalidate – answer from cache, refresh in the background.
// Bump VERSION when CORE changes so old caches are dropped.

const VERSION = 'lernwelt-v1';

const CORE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'src/theme.css',
  'src/main.js',
  'src/core/dates.js',
  'src/core/launcher-data.js',
  'src/core/profiles.js',
  'src/core/registry.js',
  'src/core/rewards.js',
  'src/core/storage.js',
  'src/screens/app-host.js',
  'src/screens/collection.js',
  'src/screens/gate.js',
  'src/screens/home.js',
  'src/screens/parent.js',
  'src/services/app-services.js',
  'src/services/sounds.js',
  'src/services/speech.js',
  'src/ui/dialog.js',
  'src/ui/dom.js',
  'src/ui/forms.js',
  'src/ui/icons.js',
  'src/ui/numpad.js',
  'src/ui/topbar.js',
  'apps/index.json',
];

async function appFiles() {
  try {
    const folders = await (await fetch('apps/index.json', { cache: 'no-cache' })).json();
    const lists = await Promise.all(
      folders.map(async (folder) => {
        const base = `apps/${folder}/`;
        try {
          const m = await (await fetch(`${base}manifest.json`, { cache: 'no-cache' })).json();
          return [`${base}manifest.json`, base + m.icon, base + (m.entry ?? 'index.js'), ...(m.files ?? []).map((f) => base + f)];
        } catch {
          return [];
        }
      }),
    );
    return lists.flat();
  } catch {
    return [];
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      await cache.addAll(CORE);
      // App files are best effort: a broken app must not break the whole install.
      await Promise.all((await appFiles()).map((url) => cache.add(url).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      const res = await network;
      if (res) return res;
      if (req.mode === 'navigate') return (await cache.match('index.html')) ?? Response.error();
      return Response.error();
    })(),
  );
});
