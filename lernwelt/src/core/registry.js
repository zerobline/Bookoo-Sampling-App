// App discovery. The launcher knows nothing about individual apps: it reads
// apps/index.json (a list of folder names), then each folder's manifest.json.
// The entry module (index.js by default) is only imported when needed.

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Returns a list of problems; empty when the manifest is usable. */
export function validateManifest(m, folder) {
  const errors = [];
  if (!m || typeof m !== 'object') return ['manifest.json ist kein Objekt'];
  if (typeof m.id !== 'string' || !ID_PATTERN.test(m.id)) errors.push('id fehlt oder ist ungültig (a-z, 0-9, -)');
  if (folder && m.id !== folder) errors.push(`id "${m.id}" muss dem Ordnernamen "${folder}" entsprechen`);
  for (const key of ['name', 'subtitle', 'icon', 'color', 'version']) {
    if (typeof m[key] !== 'string' || !m[key]) errors.push(`${key} fehlt`);
  }
  if (m.order != null && typeof m.order !== 'number') errors.push('order muss eine Zahl sein');
  if (m.entry != null && typeof m.entry !== 'string') errors.push('entry muss ein Dateiname sein');
  if (m.files != null && !(Array.isArray(m.files) && m.files.every((f) => typeof f === 'string'))) errors.push('files muss eine Liste von Dateinamen sein');
  return errors;
}

export function sortApps(apps) {
  return [...apps].sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name, 'de'));
}

/**
 * @param {URL|string} appsBase URL of the apps/ folder (with trailing slash)
 * @param {(url: string) => Promise<any>} fetchJson
 * @param {(url: string) => Promise<any>} importModule
 */
export async function loadRegistry(appsBase, { fetchJson = defaultFetchJson, importModule = (u) => import(u) } = {}) {
  const base = new URL(appsBase);
  const folders = await fetchJson(new URL('index.json', base).href);
  if (!Array.isArray(folders)) throw new Error('apps/index.json muss eine Liste von Ordnernamen sein');

  const loaded = await Promise.all(
    folders.map(async (folder) => {
      const dir = new URL(`${folder}/`, base);
      try {
        const manifest = await fetchJson(new URL('manifest.json', dir).href);
        const errors = validateManifest(manifest, folder);
        if (errors.length) throw new Error(errors.join('; '));
        return Object.freeze({
          ...manifest,
          folder,
          baseUrl: dir.href,
          iconUrl: new URL(manifest.icon, dir).href,
          entryUrl: new URL(manifest.entry ?? 'index.js', dir).href,
        });
      } catch (err) {
        console.warn(`[lernwelt] App "${folder}" wird übersprungen:`, err.message);
        return null;
      }
    }),
  );

  const seen = new Set();
  const apps = sortApps(
    loaded.filter((a) => {
      if (!a || seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    }),
  );
  const modules = new Map();

  return {
    apps,
    get: (id) => apps.find((a) => a.id === id) ?? null,
    /** Imports (once) and checks the app's entry module. */
    async load(id) {
      const app = apps.find((a) => a.id === id);
      if (!app) throw new Error(`Unbekannte App: ${id}`);
      if (!modules.has(id)) {
        modules.set(
          id,
          importModule(app.entryUrl).then((mod) => {
            if (typeof mod.mount !== 'function') throw new Error(`${id}: mount() fehlt`);
            return mod;
          }),
        );
        modules.get(id).catch(() => modules.delete(id));
      }
      return modules.get(id);
    },
  };
}

async function defaultFetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}
