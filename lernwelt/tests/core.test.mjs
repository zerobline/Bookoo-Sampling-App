import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryBackend, createStore } from '../src/core/storage.js';
import { createProfiles } from '../src/core/profiles.js';
import { createLauncherData } from '../src/core/launcher-data.js';
import { REWARDS, REWARD_STEP, unlockedCount, nextReward, availableAvatars, BASE_AVATARS, BACKGROUNDS } from '../src/core/rewards.js';
import { validateManifest, sortApps, loadRegistry } from '../src/core/registry.js';
import { dayKey } from '../src/core/dates.js';
import { starsForRound, createAppServices } from '../src/services/app-services.js';
import { gateQuestion } from '../src/screens/gate.js';

test('stores are namespaced per app and profile', () => {
  const b = createMemoryBackend();
  const a = createStore(b, 'einmaleins.p1');
  const c = createStore(b, 'uhr-lesen.p1');
  const other = createStore(b, 'einmaleins.p10');
  a.set('x', { n: 1 });
  c.set('x', { n: 2 });
  other.set('x', 3);
  assert.deepEqual(a.get('x'), { n: 1 });
  assert.deepEqual(c.get('x'), { n: 2 });
  assert.ok(b.keys().includes('lernwelt.einmaleins.p1.x'));
  a.clear();
  assert.equal(a.get('x'), null);
  assert.deepEqual(c.get('x'), { n: 2 });
  assert.equal(other.get('x'), 3, 'clearing p1 must not touch p10');
});

test('store returns fallback for missing or corrupt values', () => {
  const b = createMemoryBackend();
  b.setItem('lernwelt.app.p1.bad', '{not json');
  const s = createStore(b, 'app.p1');
  assert.equal(s.get('bad', 'fb'), 'fb');
  assert.equal(s.get('missing', 7), 7);
  assert.equal(s.update('n', (v) => v + 1, 0), 1);
  assert.equal(s.get('n'), 1);
});

test('a default profile exists and can be updated', () => {
  const b = createMemoryBackend();
  const p = createProfiles(b);
  assert.equal(p.active().id, 'p1');
  p.update('p1', { name: 'Mia' });
  assert.equal(createProfiles(b).active().name, 'Mia');
});

test('stars add up, per-app counters and new rewards are reported', () => {
  const d = createLauncherData(createMemoryBackend(), 'p1');
  let r = d.addStars('uhr-lesen', 15);
  assert.equal(r.total, 15);
  assert.deepEqual(r.newRewards, []);
  r = d.addStars('einmaleins', 7);
  assert.equal(r.total, 22);
  assert.deepEqual(r.newRewards, [REWARDS[0]]);
  assert.equal(d.starsForApp('uhr-lesen'), 15);
  assert.equal(d.addStars('x', -5).added, 0, 'negative stars are ignored');
  assert.equal(d.addStars('x', 9999).added, 50, 'per-session stars are capped');
});

test('resetting an app keeps the shared star total', () => {
  const d = createLauncherData(createMemoryBackend(), 'p1');
  d.addStars('einmaleins', 10);
  d.addSession({ appId: 'einmaleins', day: dayKey(), total: 10, correct: 9 });
  d.addSession({ appId: 'uhr-lesen', day: dayKey(), total: 5, correct: 5 });
  d.addUsage('einmaleins', 120);
  d.resetApp('einmaleins');
  assert.equal(d.starsTotal(), 10);
  assert.equal(d.starsForApp('einmaleins'), 0);
  assert.equal(d.sessions('einmaleins').length, 0);
  assert.equal(d.sessions('uhr-lesen').length, 1);
  assert.equal(d.usageSeconds(dayKey(), 'einmaleins'), 0);
});

test('time limit is off by default and counts usage of all apps today', () => {
  const d = createLauncherData(createMemoryBackend(), 'p1');
  d.addUsage('a', 30 * 60);
  assert.equal(d.timeLimitReached(), false);
  d.setSettings({ timeLimitEnabled: true, timeLimitMinutes: 20 });
  assert.equal(d.timeLimitReached(), true);
  const yesterday = new Date(Date.now() - 86400000);
  const d2 = createLauncherData(createMemoryBackend(), 'p1');
  d2.setSettings({ timeLimitEnabled: true, timeLimitMinutes: 10 });
  d2.addUsage('a', 3600, yesterday);
  assert.equal(d2.timeLimitReached(), false, "yesterday's usage does not count");
});

test('"Heute geübt" after a minute of use or a logged round', () => {
  const d = createLauncherData(createMemoryBackend(), 'p1');
  assert.equal(d.practicedToday('a'), false);
  d.addUsage('a', 30);
  assert.equal(d.practicedToday('a'), false);
  d.addSession({ appId: 'a', day: dayKey(), total: 3, correct: 1 });
  assert.equal(d.practicedToday('a'), true);
  d.addUsage('b', 61);
  assert.equal(d.practicedToday('b'), true);
});

test('rewards unlock every 20 stars', () => {
  assert.equal(REWARD_STEP, 20);
  assert.equal(unlockedCount(19), 0);
  assert.equal(unlockedCount(20), 1);
  assert.equal(unlockedCount(99999), REWARDS.length);
  assert.deepEqual(nextReward(25), { reward: REWARDS[1], index: 1, missing: 15 });
  assert.equal(nextReward(REWARDS.length * 20), null);
  assert.equal(availableAvatars(0).length, BASE_AVATARS.length);
  for (const r of REWARDS) if (r.kind === 'background') assert.ok(BACKGROUNDS[r.value], r.id);
  assert.equal(new Set(REWARDS.map((r) => r.id)).size, REWARDS.length);
});

test('stars per round: 1–5, never 0 for a finished round', () => {
  assert.equal(starsForRound(0, 10), 1);
  assert.equal(starsForRound(5, 10), 3);
  assert.equal(starsForRound(10, 10), 5);
  assert.equal(starsForRound(0, 0), 0);
});

test('app session logs {appId, date, duration, correct, total} and adds stars', () => {
  const backend = createMemoryBackend();
  const data = createLauncherData(backend, 'p1');
  const ctx = { backend, data, profile: { id: 'p1', name: 'Mia', avatar: '🦊' }, speech: {}, sounds: {} };
  const app = { id: 'einmaleins', baseUrl: 'http://x/apps/einmaleins/' };
  const changes = [];
  const s = createAppServices(ctx, app, { goHome() {}, onSessionChange: (a) => changes.push(a) });
  s.session.begin();
  assert.equal(s.session.active, true);
  const res = s.session.end({ correct: 8, total: 10 });
  assert.equal(res.stars, 4);
  assert.equal(data.starsTotal(), 4);
  const [entry] = data.sessions('einmaleins');
  assert.equal(entry.appId, 'einmaleins');
  assert.equal(entry.profileId, 'p1');
  assert.equal(entry.correct, 8);
  assert.equal(entry.total, 10);
  assert.equal(typeof entry.duration, 'number');
  assert.ok(entry.date);
  assert.deepEqual(changes, [true, false]);
  s.storage.set('k', 1);
  assert.ok(backend.keys().includes('lernwelt.einmaleins.p1.k'));
  assert.equal(s.asset('style.css'), 'http://x/apps/einmaleins/style.css');
});

test('aborted session logs partial progress without stars', () => {
  const backend = createMemoryBackend();
  const data = createLauncherData(backend, 'p1');
  const ctx = { backend, data, profile: { id: 'p1' }, speech: {}, sounds: {} };
  const s = createAppServices(ctx, { id: 'a', baseUrl: 'http://x/' }, { goHome() {}, onSessionChange() {} });
  s.session.begin();
  s.session.update({ correct: 2, total: 3 });
  s.session.abort();
  const [e] = data.sessions('a');
  assert.equal(e.completed, false);
  assert.equal(e.stars, 0);
  assert.equal(data.starsTotal(), 0);
});

test('manifest validation', () => {
  const ok = { id: 'einmaleins', name: 'E', subtitle: 's', icon: 'i.svg', color: '#fff', order: 2, version: '1.0.0' };
  assert.deepEqual(validateManifest(ok, 'einmaleins'), []);
  assert.ok(validateManifest({ ...ok, id: 'Bad Id' }).length);
  assert.ok(validateManifest(ok, 'other-folder').length);
  assert.ok(validateManifest({ ...ok, name: '' }).length);
  assert.deepEqual(sortApps([{ name: 'B', order: 2 }, { name: 'A' }, { name: 'C', order: 1 }]).map((a) => a.name), ['C', 'B', 'A']);
});

test('registry skips broken apps and loads entry modules lazily', async () => {
  const files = {
    'http://x/apps/index.json': ['good', 'broken', 'missing'],
    'http://x/apps/good/manifest.json': { id: 'good', name: 'Gut', subtitle: 's', icon: 'icon.svg', color: '#000', version: '1' },
    'http://x/apps/broken/manifest.json': { id: 'nope' },
  };
  const imported = [];
  const reg = await loadRegistry('http://x/apps/', {
    fetchJson: async (u) => {
      if (!(u in files)) throw new Error('404');
      return files[u];
    },
    importModule: async (u) => (imported.push(u), { mount() {} }),
  });
  assert.deepEqual(reg.apps.map((a) => a.id), ['good']);
  assert.equal(reg.get('good').iconUrl, 'http://x/apps/good/icon.svg');
  assert.equal(imported.length, 0);
  await reg.load('good');
  await reg.load('good');
  assert.deepEqual(imported, ['http://x/apps/good/index.js']);
});

test('parent gate question is outside the 1×1', () => {
  for (let i = 0; i < 100; i++) {
    const q = gateQuestion();
    assert.ok(q.a >= 12 && q.a <= 19 && q.b >= 3 && q.b <= 9);
    assert.equal(q.answer, q.a * q.b);
  }
});
