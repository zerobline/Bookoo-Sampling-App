import { createStore } from './storage.js';

// v1 has exactly one child profile, but everything is keyed by profileId so a
// second child only needs a profile picker – no data migration.

export const DEFAULT_PROFILE_ID = 'p1';

export function createProfiles(backend) {
  const global = createStore(backend, '_launcher');

  function list() {
    const stored = global.get('profiles');
    if (Array.isArray(stored) && stored.length) return stored;
    const initial = [newProfile(DEFAULT_PROFILE_ID)];
    global.set('profiles', initial);
    return initial;
  }

  function active() {
    const all = list();
    const id = global.get('activeProfile', all[0].id);
    return all.find((p) => p.id === id) ?? all[0];
  }

  function update(id, patch) {
    const all = list().map((p) => (p.id === id ? { ...p, ...patch } : p));
    global.set('profiles', all);
    return all.find((p) => p.id === id);
  }

  return { list, active, update };
}

function newProfile(id) {
  return { id, name: '', avatar: '🦊', background: 'standard', createdAt: new Date().toISOString() };
}
