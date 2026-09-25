// Namespaced key/value storage on top of localStorage.
//
// Key layout (everything is JSON-encoded):
//   lernwelt._launcher.<key>                 launcher-global (profile list, active profile)
//   lernwelt._launcher.<profileId>.<key>     launcher data per child (stars, sessions, settings)
//   lernwelt.<appId>.<profileId>.<key>       app data per child
//
// Apps only ever receive a store bound to their own "<appId>.<profileId>" namespace,
// so they cannot overwrite each other or the launcher.

export const ROOT = 'lernwelt';

/** Wraps localStorage; falls back to memory when storage is unavailable (private mode, tests). */
export function createBackend(ls = safeLocalStorage()) {
  if (ls) {
    return {
      getItem: (k) => ls.getItem(k),
      setItem: (k, v) => ls.setItem(k, v),
      removeItem: (k) => ls.removeItem(k),
      keys: () => {
        const out = [];
        for (let i = 0; i < ls.length; i++) out.push(ls.key(i));
        return out;
      },
    };
  }
  return createMemoryBackend();
}

export function createMemoryBackend() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    keys: () => [...map.keys()],
  };
}

function safeLocalStorage() {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    const probe = `${ROOT}.__probe`;
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

/**
 * A store scoped to `lernwelt.<namespace>.`.
 * @param {ReturnType<typeof createBackend>} backend
 * @param {string} namespace e.g. "einmaleins.p1"
 */
export function createStore(backend, namespace) {
  const prefix = `${ROOT}.${namespace}.`;

  function get(key, fallback = null) {
    let raw;
    try {
      raw = backend.getItem(prefix + key);
    } catch {
      return fallback;
    }
    if (raw == null) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function set(key, value) {
    try {
      backend.setItem(prefix + key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn('[lernwelt] could not save', prefix + key, err);
      return false;
    }
  }

  function remove(key) {
    try {
      backend.removeItem(prefix + key);
    } catch {
      /* ignore */
    }
  }

  function keys() {
    return backend
      .keys()
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length));
  }

  function clear() {
    for (const k of keys()) remove(k);
  }

  function update(key, fn, fallback = null) {
    const next = fn(get(key, fallback));
    set(key, next);
    return next;
  }

  return Object.freeze({ namespace, get, set, remove, keys, clear, update });
}
