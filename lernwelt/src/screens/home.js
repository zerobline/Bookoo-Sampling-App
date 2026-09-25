import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showOverlay } from '../ui/dialog.js';
import { BACKGROUNDS, REWARDS, unlockedCount, rewardPreview } from '../core/rewards.js';

export function applyBackground(el, profile) {
  const bg = BACKGROUNDS[profile.background] ?? BACKGROUNDS.standard;
  el.style.setProperty('--lw-screen-bg', bg.css);
  el.classList.toggle('is-dark-bg', !!bg.dark);
}

export function homeScreen(ctx) {
  const { data, registry, speech, sounds } = ctx;
  const profile = ctx.profile;
  const hidden = new Set(data.hiddenApps());
  const apps = registry.apps.filter((a) => !hidden.has(a.id));
  const limitReached = data.timeLimitReached();
  const greeting = profile.name ? `Hallo ${profile.name}!` : 'Hallo!';
  const total = data.starsTotal();

  const tile = (app) => {
    const today = data.practicedToday(app.id);
    return h(
      'div',
      { class: ['lw-tile', limitReached && 'is-locked'], style: { '--tile-color': app.color } },
      h(
        'button',
        {
          type: 'button',
          class: 'lw-tile__main',
          disabled: limitReached,
          'aria-label': `${app.name} – ${app.subtitle}`,
          onclick: () => {
            sounds.tap();
            ctx.navigate(`#/app/${app.id}`);
          },
        },
        h('img', { class: 'lw-tile__icon', src: app.iconUrl, alt: '' }),
        h('span', { class: 'lw-tile__name' }, app.name),
        h('span', { class: 'lw-tile__subtitle' }, app.subtitle),
        h('span', { class: 'lw-tile__stars', 'aria-label': `${data.starsForApp(app.id)} Sterne` }, '★ ', data.starsForApp(app.id)),
        today && h('span', { class: 'lw-tile__badge' }, '✓ Heute geübt'),
      ),
      speech.available &&
        h(
          'button',
          { type: 'button', class: 'lw-tile__speak', 'aria-label': `${app.name} vorlesen`, onclick: () => speech.speak(`${app.name}. ${app.subtitle}`) },
          icon('speaker'),
        ),
    );
  };

  const el = h(
    'div',
    { class: 'lw-screen lw-home' },
    h(
      'header',
      { class: 'lw-home__header' },
      h('button', { type: 'button', class: 'lw-avatar', 'aria-label': 'Meine Sammlung', onclick: () => ctx.navigate('#/sammlung') }, profile.avatar),
      h('button', { type: 'button', class: 'lw-home__greeting', onclick: () => speech.speak(greeting) }, greeting),
      h(
        'button',
        { type: 'button', class: 'lw-star-pill lw-star-pill--big', 'aria-label': `${total} Sterne – Meine Sammlung`, onclick: () => ctx.navigate('#/sammlung') },
        h('span', { class: 'lw-star-pill__star' }, '★'),
        total,
      ),
      h('button', { type: 'button', class: 'lw-parent-btn', 'aria-label': 'Elternbereich', title: 'Elternbereich', onclick: () => ctx.navigate('#/eltern') }, icon('gear')),
    ),
    limitReached &&
      h('div', { class: 'lw-banner' }, h('span', { class: 'lw-banner__icon' }, icon('moon')), h('span', {}, 'Für heute ist genug geübt. Bis morgen!')),
    apps.length
      ? h('main', { class: 'lw-grid' }, apps.map(tile))
      : h('p', { class: 'lw-empty' }, 'Keine Apps sichtbar. Im Elternbereich können Apps eingeblendet werden.'),
  );
  applyBackground(el, profile);

  // Celebrate rewards unlocked since the last visit.
  const unlocked = unlockedCount(total);
  const seen = data.rewardsSeen();
  let closeCelebration = null;
  if (unlocked > seen) {
    const fresh = REWARDS.slice(seen, unlocked);
    data.markRewardsSeen(unlocked);
    setTimeout(() => {
      sounds.reward();
      speech.speak('Toll! Du hast etwas Neues bekommen!');
      closeCelebration = showOverlay(
        h('div', { class: 'lw-dialog__emoji lw-bounce' }, '🎁'),
        h('h2', { class: 'lw-dialog__title' }, 'Neu für dich!'),
        h('div', { class: 'lw-reward-row' }, fresh.map(rewardBadge)),
        h(
          'div',
          { class: 'lw-dialog__actions' },
          h('button', { type: 'button', class: 'lw-btn lw-btn--big lw-btn--ghost', onclick: () => closeCelebration() }, 'OK'),
          h(
            'button',
            {
              type: 'button',
              class: 'lw-btn lw-btn--big lw-btn--primary',
              onclick: () => {
                closeCelebration();
                ctx.navigate('#/sammlung');
              },
            },
            'Anschauen',
          ),
        ),
      );
    }, 300);
  }

  return { el, destroy: () => closeCelebration?.() };
}

export function rewardBadge(reward) {
  if (reward.kind === 'background') {
    return h('span', { class: 'lw-reward lw-reward--bg', style: { background: rewardPreview(reward) }, 'aria-label': 'Hintergrund' });
  }
  return h('span', { class: 'lw-reward' }, reward.value);
}
