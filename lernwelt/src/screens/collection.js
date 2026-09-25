import { h } from '../ui/dom.js';
import { topbar } from '../ui/topbar.js';
import { applyBackground } from './home.js';
import { BASE_AVATARS, BACKGROUNDS, REWARDS, REWARD_STEP, nextReward, starsFor, unlockedCount } from '../core/rewards.js';

/** "Meine Sammlung": the child's unlocked avatars, backgrounds and stickers. */
export function collectionScreen(ctx) {
  const el = h('div', { class: 'lw-screen lw-collection' });
  render();
  return { el };

  function render() {
    const total = ctx.data.starsTotal();
    const unlocked = unlockedCount(total);
    const next = nextReward(total);
    const profile = ctx.profile;

    const pick = (patch) => {
      ctx.sounds.tap();
      ctx.updateProfile(patch);
      render();
    };

    const lockedItem = (i) =>
      h('span', { class: 'lw-collect__item is-locked', 'aria-label': `Gesperrt – ab ${starsFor(i)} Sternen` }, h('span', { class: 'lw-collect__lock' }, '🔒'), h('span', { class: 'lw-collect__need' }, `★ ${starsFor(i)}`));

    const avatars = [
      ...BASE_AVATARS.map((a) => ({ value: a, i: -1 })),
      ...REWARDS.map((r, i) => ({ ...r, i })).filter((r) => r.kind === 'avatar'),
    ].map(({ value, i }) =>
      i >= unlocked
        ? lockedItem(i)
        : h('button', { type: 'button', class: ['lw-collect__item', profile.avatar === value && 'is-selected'], 'aria-label': `Avatar ${value}`, onclick: () => pick({ avatar: value }) }, value),
    );

    const backgrounds = [
      { value: 'standard', i: -1 },
      ...REWARDS.map((r, i) => ({ ...r, i })).filter((r) => r.kind === 'background'),
    ].map(({ value, i }) =>
      i >= unlocked
        ? lockedItem(i)
        : h('button', {
            type: 'button',
            class: ['lw-collect__item lw-collect__item--bg', profile.background === value && 'is-selected'],
            style: { background: BACKGROUNDS[value].css },
            'aria-label': `Hintergrund ${BACKGROUNDS[value].name}`,
            onclick: () => pick({ background: value }),
          }),
    );

    const stickers = REWARDS.map((r, i) => ({ ...r, i }))
      .filter((r) => r.kind === 'sticker')
      .map(({ value, i }) => (i >= unlocked ? lockedItem(i) : h('span', { class: 'lw-collect__item lw-collect__item--sticker' }, value)));

    const progress = next ? (REWARD_STEP - next.missing) / REWARD_STEP : 1;

    el.replaceChildren(
      topbar(ctx, { title: 'Meine Sammlung' }),
      h(
        'main',
        { class: 'lw-collection__body' },
        h(
          'section',
          { class: 'lw-card lw-collect__total' },
          h('div', { class: 'lw-collect__big' }, h('span', { class: 'lw-star-pill__star' }, '★'), total),
          h('div', { class: 'lw-progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': REWARD_STEP, 'aria-valuenow': REWARD_STEP - (next?.missing ?? 0) }, h('div', { class: 'lw-progress__bar', style: { width: `${progress * 100}%` } })),
          h('p', { class: 'lw-collect__next' }, next ? `Noch ${next.missing} ★ bis zur nächsten Überraschung 🎁` : 'Du hast alles gesammelt! 🎉'),
        ),
        section('😀', 'Figuren', avatars),
        section('🖼️', 'Hintergründe', backgrounds),
        section('⭐', 'Sticker', stickers),
      ),
    );
    applyBackground(el, profile);
  }
}

function section(emoji, title, items) {
  return h('section', { class: 'lw-card' }, h('h2', { class: 'lw-card__title' }, h('span', { 'aria-hidden': 'true' }, emoji, ' '), title), h('div', { class: 'lw-collect__grid' }, items));
}
