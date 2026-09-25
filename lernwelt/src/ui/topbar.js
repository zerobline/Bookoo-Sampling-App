import { h } from './dom.js';
import { icon } from './icons.js';

/**
 * The one top bar used by every non-home screen. The Home button is always
 * top-left and always looks the same, in every app.
 */
export function topbar(ctx, { title = '', iconUrl = null, onBack = null, showStars = true } = {}) {
  return h(
    'header',
    { class: 'lw-topbar' },
    h(
      'button',
      { type: 'button', class: 'lw-home-btn', 'aria-label': 'Zur Startseite', onclick: () => ctx.goHome() },
      icon('home'),
    ),
    onBack &&
      h('button', { type: 'button', class: 'lw-btn lw-btn--ghost lw-topbar__back', onclick: onBack }, icon('back'), 'Zurück'),
    h(
      'div',
      { class: 'lw-topbar__title' },
      iconUrl && h('img', { src: iconUrl, alt: '', class: 'lw-topbar__icon' }),
      h('span', {}, title),
    ),
    showStars && h('div', { class: 'lw-star-pill', 'aria-label': `${ctx.data.starsTotal()} Sterne` }, h('span', { class: 'lw-star-pill__star' }, '★'), ctx.data.starsTotal()),
  );
}
