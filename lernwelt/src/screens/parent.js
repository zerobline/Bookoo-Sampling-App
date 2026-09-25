import { h } from '../ui/dom.js';
import { topbar } from '../ui/topbar.js';
import { confirmDialog } from '../ui/dialog.js';
import { switchField } from '../ui/forms.js';
import { createStore } from '../core/storage.js';
import { dayKey, minutes } from '../core/dates.js';
import { availableAvatars } from '../core/rewards.js';
import { createAppServices } from '../services/app-services.js';

const TIME_LIMITS = [10, 15, 20, 30, 45, 60, 90];

export function parentScreen(ctx) {
  const { data, registry } = ctx;
  const body = h('main', { class: 'lw-parent' }, h('div', { class: 'lw-loading' }, '…'));
  const el = h('div', { class: 'lw-screen lw-parent-screen' }, topbar(ctx, { title: 'Elternbereich', showStars: false }), body);
  let cleanups = [];
  let modules = new Map();
  let destroyed = false;

  Promise.allSettled(registry.apps.map((a) => registry.load(a.id).then((m) => modules.set(a.id, m)))).then(() => {
    if (!destroyed) render();
  });

  function runCleanups() {
    for (const fn of cleanups) {
      try {
        fn?.();
      } catch (err) {
        console.error(err);
      }
    }
    cleanups = [];
  }

  function render() {
    runCleanups();
    const profile = ctx.profile;
    const settings = data.settings();
    const hidden = new Set(data.hiddenApps());

    // --- Kind ---
    const nameInput = h('input', {
      type: 'text',
      class: 'lw-input',
      value: profile.name,
      maxLength: 20,
      placeholder: 'Name des Kindes',
      autocomplete: 'off',
      oninput: (e) => ctx.updateProfile({ name: e.target.value.trim() }),
    });
    const avatarPicker = h(
      'div',
      { class: 'lw-avatar-picker' },
      availableAvatars(data.starsTotal()).map((a) =>
        h('button', { type: 'button', class: ['lw-avatar lw-avatar--small', profile.avatar === a && 'is-selected'], 'aria-label': `Avatar ${a}`, onclick: () => (ctx.updateProfile({ avatar: a }), render()) }, a),
      ),
    );

    // --- Apps ---
    const appRows = registry.apps.map((app) => {
      const mod = modules.get(app.id);
      return h(
        'div',
        { class: 'lw-app-row' },
        h('img', { src: app.iconUrl, alt: '', class: 'lw-app-row__icon', style: { background: app.color } }),
        h('div', { class: 'lw-app-row__name' }, h('strong', {}, app.name), h('small', {}, `Version ${app.version}`)),
        switchField('Auf Startseite', !hidden.has(app.id), (on) => data.setAppHidden(app.id, !on)),
        h(
          'div',
          { class: 'lw-app-row__actions' },
          mod?.SettingsScreen && h('button', { type: 'button', class: 'lw-btn lw-btn--small', onclick: () => ctx.navigate(`#/eltern/app/${app.id}`) }, 'Einstellungen'),
          h('button', { type: 'button', class: 'lw-btn lw-btn--small lw-btn--danger-ghost', onclick: () => resetApp(app) }, 'Fortschritt zurücksetzen'),
        ),
      );
    });

    // --- Fortschritt ---
    const progressCards = registry.apps.map((app) => progressCard(app, modules.get(app.id)));

    // --- Zeitlimit ---
    const usedToday = minutes(data.usageSeconds(dayKey()));
    const limitSelect = h(
      'select',
      { class: 'lw-input lw-input--inline', disabled: !settings.timeLimitEnabled, onchange: (e) => data.setSettings({ timeLimitMinutes: Number(e.target.value) }) },
      TIME_LIMITS.map((m) => h('option', { value: m, selected: m === settings.timeLimitMinutes }, `${m} Minuten`)),
    );

    body.replaceChildren(
      card(
        'Kind',
        h('label', { class: 'lw-field' }, h('span', {}, 'Name'), nameInput),
        h('div', { class: 'lw-field' }, h('span', {}, 'Figur'), avatarPicker),
      ),
      card('Apps', h('div', { class: 'lw-app-list' }, appRows)),
      card('Fortschritt', h('div', { class: 'lw-progress-cards' }, progressCards)),
      card(
        'Zeitlimit',
        switchField('Tägliches Zeitlimit', settings.timeLimitEnabled, (on) => (data.setSettings({ timeLimitEnabled: on }), render()), 'Nach Ablauf wird die laufende Runde noch beendet.'),
        h('label', { class: 'lw-field lw-field--row' }, h('span', {}, 'Pro Tag'), limitSelect),
        h('p', { class: 'lw-muted' }, `Heute geübt: ${usedToday} ${usedToday === 1 ? 'Minute' : 'Minuten'}`),
      ),
      card(
        'Ton & Sprache',
        switchField('Töne', settings.sound, (on) => data.setSettings({ sound: on })),
        switchField('Vorlesen', settings.speech, (on) => data.setSettings({ speech: on }), speechHint(ctx)),
      ),
      h(
        'p',
        { class: 'lw-muted lw-parent__footer' },
        `Sterne gesamt: ${data.starsTotal()} · Alle Daten bleiben auf diesem Gerät. Keine Werbung, kein Konto, keine Internetverbindung nötig.`,
      ),
    );
  }

  function progressCard(app, mod) {
    const logs = data.sessions(app.id);
    const done = logs.filter((s) => s.completed);
    const correct = logs.reduce((a, s) => a + s.correct, 0);
    const total = logs.reduce((a, s) => a + s.total, 0);
    const last = logs.at(-1);
    const todayMin = minutes(data.usageSeconds(dayKey(), app.id));
    const stat = (label, value) => h('div', { class: 'lw-stat' }, h('strong', {}, value), h('span', {}, label));

    const summary = h('div', { class: 'lw-progress-card__summary' });
    if (mod?.ProgressSummary) {
      try {
        cleanups.push(mod.ProgressSummary(summary, createAppServices(ctx, app)));
      } catch (err) {
        console.error(err);
      }
    }

    return h(
      'article',
      { class: 'lw-progress-card', style: { '--app-color': app.color } },
      h('header', { class: 'lw-progress-card__head' }, h('img', { src: app.iconUrl, alt: '' }), h('strong', {}, app.name)),
      h(
        'div',
        { class: 'lw-stats' },
        stat('Runden', done.length),
        stat('richtig', total ? `${Math.round((100 * correct) / total)} %` : '–'),
        stat('Sterne', data.starsForApp(app.id)),
        stat('heute', `${todayMin} Min.`),
      ),
      h('p', { class: 'lw-muted' }, last ? `Zuletzt: ${new Date(last.date).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Noch nicht gespielt'),
      summary,
    );
  }

  async function resetApp(app) {
    const ok = await confirmDialog({
      emoji: '⚠️',
      title: `${app.name} zurücksetzen?`,
      text: 'Fortschritt, Einstellungen und Verlauf dieser App werden gelöscht. Die gesammelten Sterne und Belohnungen bleiben erhalten.',
      yes: 'Zurücksetzen',
      no: 'Abbrechen',
      danger: true,
    });
    if (!ok) return;
    createStore(ctx.backend, `${app.id}.${ctx.profile.id}`).clear();
    data.resetApp(app.id);
    render();
  }

  return {
    el,
    destroy() {
      destroyed = true;
      runCleanups();
    },
  };
}

/** Hosts an app's own SettingsScreen inside the parent area. */
export function appSettingsScreen(ctx, appId) {
  const app = ctx.registry.get(appId);
  const body = h('main', { class: 'lw-parent' });
  const el = h('div', { class: 'lw-screen lw-parent-screen' }, topbar(ctx, { title: app ? `${app.name}: Einstellungen` : 'Einstellungen', onBack: ctx.back, showStars: false }), body);
  let cleanup = null;
  let destroyed = false;

  if (!app) body.append(h('p', {}, 'Unbekannte App.'));
  else {
    ctx.registry
      .load(appId)
      .then((mod) => {
        if (destroyed) return;
        const container = h('div', { class: 'lw-card lw-app-settings' });
        body.append(container);
        if (mod.SettingsScreen) cleanup = mod.SettingsScreen(container, createAppServices(ctx, app));
        else container.append(h('p', {}, 'Diese App hat keine eigenen Einstellungen.'));
      })
      .catch((err) => {
        console.error(err);
        body.append(h('p', {}, 'Die App konnte nicht geladen werden.'));
      });
  }

  return {
    el,
    destroy() {
      destroyed = true;
      cleanup?.();
    },
  };
}

function card(title, ...content) {
  return h('section', { class: 'lw-card' }, h('h2', { class: 'lw-card__title' }, title), ...content);
}

function speechHint(ctx) {
  const synth = globalThis.speechSynthesis;
  if (!synth) return 'Dieser Browser kann leider nicht vorlesen.';
  const hasGerman = synth.getVoices().some((v) => v.lang?.toLowerCase().startsWith('de'));
  return hasGerman || synth.getVoices().length === 0 ? '' : 'Keine deutsche Stimme gefunden – bitte in den Geräte-Einstellungen installieren.';
}
