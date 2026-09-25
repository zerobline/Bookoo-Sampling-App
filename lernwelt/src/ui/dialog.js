import { h } from './dom.js';

/**
 * Child-friendly modal with big buttons. Resolves true for "yes", false otherwise.
 *   await confirmDialog({ emoji: '🛑', title: 'Aufhören?', yes: 'Ja, aufhören', no: 'Weiter üben' })
 */
export function confirmDialog({ emoji = '', title, text = '', yes = 'Ja', no = 'Nein', danger = false } = {}) {
  return new Promise((resolve) => {
    const done = (result) => {
      overlay.remove();
      window.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') done(false);
    };
    const noBtn = h('button', { type: 'button', class: 'lw-btn lw-btn--big lw-btn--ghost', onclick: () => done(false) }, no);
    const overlay = h(
      'div',
      { class: 'lw-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h(
        'div',
        { class: 'lw-dialog' },
        emoji && h('div', { class: 'lw-dialog__emoji', 'aria-hidden': 'true' }, emoji),
        h('h2', { class: 'lw-dialog__title' }, title),
        text && h('p', { class: 'lw-dialog__text' }, text),
        h(
          'div',
          { class: 'lw-dialog__actions' },
          noBtn,
          h('button', { type: 'button', class: `lw-btn lw-btn--big ${danger ? 'lw-btn--danger' : 'lw-btn--primary'}`, onclick: () => done(true) }, yes),
        ),
      ),
    );
    window.addEventListener('keydown', onKey);
    document.body.append(overlay);
    noBtn.focus({ preventScroll: true });
  });
}

/** Non-dismissable overlay with custom content; returns a close() function. */
export function showOverlay(...content) {
  const overlay = h('div', { class: 'lw-overlay', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'lw-dialog' }, ...content));
  document.body.append(overlay);
  return () => overlay.remove();
}

/** Row of star icons, `filled` of `max` lit. */
export function starsRow(filled, max = filled) {
  return h(
    'div',
    { class: 'lw-stars', role: 'img', 'aria-label': `${filled} Sterne` },
    Array.from({ length: max }, (_, i) => h('span', { class: i < filled ? 'lw-star is-on' : 'lw-star', style: { '--i': i } }, '★')),
  );
}
