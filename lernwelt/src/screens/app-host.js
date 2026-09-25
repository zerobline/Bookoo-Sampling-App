import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { topbar } from '../ui/topbar.js';
import { confirmDialog, showOverlay } from '../ui/dialog.js';
import { createAppServices } from '../services/app-services.js';

/** Full-screen view that mounts one app and tracks its session and usage time. */
export function appScreen(ctx, appId) {
  const app = ctx.registry.get(appId);
  if (!app || ctx.data.hiddenApps().includes(appId) || ctx.data.timeLimitReached()) {
    queueMicrotask(() => ctx.goHome({ force: true }));
    return { el: h('div') };
  }

  let sessionActive = false;
  let destroyed = false;
  let mod = null;
  let closeLimit = null;

  const main = h('main', { class: 'lw-appmain' }, h('div', { class: 'lw-loading' }, '…'));
  const el = h('div', { class: 'lw-apphost', style: { '--app-color': app.color } }, topbar(ctx, { title: app.name, iconUrl: app.iconUrl }), main);

  const services = createAppServices(ctx, app, {
    goHome: () => ctx.goHome(),
    onSessionChange(active) {
      sessionActive = active;
      if (!active) checkLimit();
    },
  });

  (async () => {
    try {
      mod = await ctx.registry.load(appId);
      if (destroyed) return;
      main.replaceChildren();
      await mod.mount(main, services);
    } catch (err) {
      console.error(err);
      if (destroyed) return;
      main.replaceChildren(
        h('div', { class: 'lw-fatal' }, h('div', { class: 'lw-fatal__emoji' }, '😕'), h('p', {}, 'Diese App konnte nicht gestartet werden.'), h('button', { class: 'lw-btn lw-btn--primary lw-btn--big', onclick: () => ctx.goHome({ force: true }) }, icon('home'), 'Zur Startseite')),
      );
    }
  })();

  // Usage time: counted only while the page is visible.
  let last = Date.now();
  let pending = 0;
  function flush() {
    const now = Date.now();
    if (document.visibilityState === 'visible') pending += Math.min(30, (now - last) / 1000);
    last = now;
    const whole = Math.floor(pending);
    if (whole > 0) {
      ctx.data.addUsage(appId, whole);
      pending -= whole;
    }
  }
  const timer = setInterval(() => {
    flush();
    checkLimit();
  }, 5000);
  const onVisibility = () => {
    if (document.visibilityState === 'visible') last = Date.now();
    else flush();
  };
  document.addEventListener('visibilitychange', onVisibility);

  // A running round is never interrupted; the limit applies once it is over.
  function checkLimit() {
    if (closeLimit || sessionActive || destroyed || !ctx.data.timeLimitReached()) return;
    ctx.speech.speak('Für heute ist Schluss. Du hast toll geübt!');
    closeLimit = showOverlay(
      h('div', { class: 'lw-dialog__emoji' }, '🌙'),
      h('h2', { class: 'lw-dialog__title' }, 'Für heute ist Schluss!'),
      h('p', { class: 'lw-dialog__text' }, 'Du hast toll geübt. Morgen geht es weiter.'),
      h('div', { class: 'lw-dialog__actions' }, h('button', { type: 'button', class: 'lw-btn lw-btn--big lw-btn--primary', onclick: () => ctx.goHome({ force: true }) }, icon('home'), 'Zur Startseite')),
    );
  }

  const onBeforeUnload = (e) => {
    if (!sessionActive) return;
    e.preventDefault();
    e.returnValue = '';
  };
  window.addEventListener('beforeunload', onBeforeUnload);

  return {
    el,
    needsConfirm: () => sessionActive,
    confirmLeave: () =>
      confirmDialog({ emoji: '🛑', title: 'Wirklich aufhören?', text: 'Die Runde ist noch nicht fertig.', yes: 'Ja, aufhören', no: 'Weiter üben' }),
    destroy() {
      destroyed = true;
      flush();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
      closeLimit?.();
      services.session.abort();
      ctx.speech.stop();
      try {
        mod?.unmount?.();
      } catch (err) {
        console.error(err);
      }
    },
  };
}
