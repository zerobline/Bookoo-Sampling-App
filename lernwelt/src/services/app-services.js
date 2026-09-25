import { createStore } from '../core/storage.js';
import { dayKey } from '../core/dates.js';
import { h, clear, loadStylesheet } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { createNumpad } from '../ui/numpad.js';
import { confirmDialog, starsRow } from '../ui/dialog.js';
import { switchField, selectField, chipsField } from '../ui/forms.js';

/**
 * Stars for a finished round: 1–5, never 0 – finishing always counts.
 * Apps may use this or report their own number.
 */
export function starsForRound(correct, total) {
  if (!total) return 0;
  return Math.max(1, Math.round((5 * correct) / total));
}

/**
 * Builds the `services` object handed to an app.
 *
 * @param ctx   launcher context { backend, profile, data, speech, sounds }
 * @param app   registry entry (manifest + urls)
 * @param host  { goHome(), onSessionChange(active) } – only for the full-screen app view
 */
export function createAppServices(ctx, app, host = null) {
  const storage = createStore(ctx.backend, `${app.id}.${ctx.profile.id}`);
  const session = host ? createSession(ctx, app, host) : null;

  return Object.freeze({
    appId: app.id,
    manifest: app,
    /** Resolve a file inside the app's folder, e.g. services.asset('style.css'). */
    asset: (path) => new URL(path, app.baseUrl).href,
    profile: Object.freeze({ id: ctx.profile.id, name: ctx.profile.name, avatar: ctx.profile.avatar }),
    storage,
    stars: Object.freeze({
      total: () => ctx.data.starsTotal(),
      forApp: () => ctx.data.starsForApp(app.id),
    }),
    speech: ctx.speech,
    sounds: ctx.sounds,
    ui: Object.freeze({ h, clear, icon, createNumpad, confirm: confirmDialog, starsRow, loadStylesheet, starsForRound, switchField, selectField, chipsField }),
    session,
    log: Object.freeze({ list: () => ctx.data.sessions(app.id) }),
    goHome: host ? () => host.goHome() : () => {},
  });
}

function createSession(ctx, app, host) {
  let startedAt = null;
  let progress = { correct: 0, total: 0 };

  function write({ correct, total, stars = 0, completed }) {
    const now = new Date();
    const duration = Math.round((now - startedAt) / 1000);
    ctx.data.addSession({
      appId: app.id,
      profileId: ctx.profile.id,
      date: now.toISOString(),
      day: dayKey(now),
      duration,
      correct,
      total,
      stars,
      completed,
    });
    startedAt = null;
    host.onSessionChange(false);
    return duration;
  }

  return Object.freeze({
    get active() {
      return startedAt !== null;
    },
    /** A round starts. While active, Home/back ask before leaving. */
    begin() {
      startedAt = new Date();
      progress = { correct: 0, total: 0 };
      host.onSessionChange(true);
    },
    /** Optional: keep the launcher informed so an interrupted round is still logged. */
    update({ correct = 0, total = 0 } = {}) {
      progress = { correct, total };
    },
    /**
     * Round finished. Logs it and adds stars to the shared total.
     * @returns {{ stars: number, total: number, newRewards: object[] }}
     */
    end({ correct = 0, total = 0, stars = starsForRound(correct, total) } = {}) {
      if (startedAt === null) return { stars: 0, total: ctx.data.starsTotal(), newRewards: [] };
      const result = ctx.data.addStars(app.id, stars);
      write({ correct, total, stars: result.added, completed: true });
      return { stars: result.added, total: result.total, newRewards: result.newRewards };
    },
    /** Used by the launcher when the child leaves mid-round. No stars. */
    abort() {
      if (startedAt === null) return;
      if (progress.total > 0) write({ ...progress, stars: 0, completed: false });
      else {
        startedAt = null;
        host.onSessionChange(false);
      }
    },
  });
}
