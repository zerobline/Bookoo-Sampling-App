import { createStore } from './storage.js';
import { dayKey } from './dates.js';
import { unlockedCount, REWARDS } from './rewards.js';

export const DEFAULT_SETTINGS = Object.freeze({
  sound: true,
  speech: true,
  timeLimitEnabled: false,
  timeLimitMinutes: 20,
});

const MAX_SESSIONS = 2000;
const USAGE_DAYS_KEPT = 60;
const MAX_STARS_PER_SESSION = 50;

/** Launcher-owned data for one child profile: stars, session log, usage time, settings. */
export function createLauncherData(backend, profileId) {
  const store = createStore(backend, `_launcher.${profileId}`);

  // --- settings --------------------------------------------------------------
  function settings() {
    return { ...DEFAULT_SETTINGS, ...store.get('settings', {}) };
  }
  function setSettings(patch) {
    return store.set('settings', { ...settings(), ...patch });
  }

  // --- app visibility ----------------------------------------------------------
  function hiddenApps() {
    return store.get('hiddenApps', []);
  }
  function setAppHidden(appId, hidden) {
    const set = new Set(hiddenApps());
    hidden ? set.add(appId) : set.delete(appId);
    store.set('hiddenApps', [...set]);
  }

  // --- stars -------------------------------------------------------------------
  function stars() {
    return store.get('stars', { total: 0, byApp: {} });
  }
  function starsTotal() {
    return stars().total;
  }
  function starsForApp(appId) {
    return stars().byApp[appId] ?? 0;
  }
  /** Adds stars; returns the rewards newly unlocked by this addition. */
  function addStars(appId, n) {
    const amount = Math.max(0, Math.min(MAX_STARS_PER_SESSION, Math.round(Number(n) || 0)));
    const s = stars();
    const before = unlockedCount(s.total);
    s.total += amount;
    s.byApp[appId] = (s.byApp[appId] ?? 0) + amount;
    store.set('stars', s);
    const after = unlockedCount(s.total);
    return { added: amount, total: s.total, newRewards: REWARDS.slice(before, after) };
  }
  /** Clears an app's own star counter. The shared total (and unlocked rewards) stays. */
  function resetAppStars(appId) {
    const s = stars();
    delete s.byApp[appId];
    store.set('stars', s);
  }

  // Rewards the child has already been shown a "Neu!" celebration for.
  function rewardsSeen() {
    return store.get('rewardsSeen', 0);
  }
  function markRewardsSeen(count) {
    store.set('rewardsSeen', count);
  }

  // --- session log -------------------------------------------------------------
  function sessions(appId = null) {
    const all = store.get('sessions', []);
    return appId ? all.filter((s) => s.appId === appId) : all;
  }
  function addSession(entry) {
    const all = sessions();
    all.push(entry);
    store.set('sessions', all.slice(-MAX_SESSIONS));
  }
  function removeSessions(appId) {
    store.set(
      'sessions',
      sessions().filter((s) => s.appId !== appId),
    );
  }

  // --- usage time (for "Heute geübt" and the daily limit) -------------------------
  function usage() {
    return store.get('usage', {});
  }
  function addUsage(appId, seconds, now = new Date()) {
    if (!(seconds > 0)) return;
    const day = dayKey(now);
    const u = usage();
    u[day] = u[day] ?? {};
    u[day][appId] = (u[day][appId] ?? 0) + seconds;
    const days = Object.keys(u).sort();
    for (const old of days.slice(0, Math.max(0, days.length - USAGE_DAYS_KEPT))) delete u[old];
    store.set('usage', u);
  }
  function usageSeconds(day = dayKey(), appId = null) {
    const d = usage()[day] ?? {};
    if (appId) return d[appId] ?? 0;
    return Object.values(d).reduce((a, b) => a + b, 0);
  }

  function practicedToday(appId, now = new Date()) {
    const day = dayKey(now);
    if (usageSeconds(day, appId) >= 60) return true;
    return sessions(appId).some((s) => s.day === day && s.total > 0);
  }

  function timeLimitReached(now = new Date()) {
    const s = settings();
    if (!s.timeLimitEnabled) return false;
    return usageSeconds(dayKey(now)) >= s.timeLimitMinutes * 60;
  }

  function resetApp(appId) {
    resetAppStars(appId);
    removeSessions(appId);
    const u = usage();
    for (const day of Object.keys(u)) delete u[day][appId];
    store.set('usage', u);
  }

  return {
    settings,
    setSettings,
    hiddenApps,
    setAppHidden,
    starsTotal,
    starsForApp,
    addStars,
    rewardsSeen,
    markRewardsSeen,
    sessions,
    addSession,
    addUsage,
    usageSeconds,
    practicedToday,
    timeLimitReached,
    resetApp,
  };
}
