import { h } from './dom.js';
import { icon } from './icons.js';

/**
 * Big-button number pad shared by all apps (and the parent gate).
 *   const pad = createNumpad({ maxLength: 3, onChange: v => ..., onSubmit: v => ... });
 *   container.append(pad.el);  ...  pad.destroy();
 * A hardware keyboard works too (digits, Backspace, Enter) while the pad is on screen.
 */
export function createNumpad({ maxLength = 3, onChange = () => {}, onSubmit = () => {}, onKey = () => {} } = {}) {
  let value = '';
  let disabled = false;

  function set(v) {
    value = v;
    onChange(value);
  }

  function press(key) {
    if (disabled) return;
    onKey(key);
    if (key === 'del') set(value.slice(0, -1));
    else if (key === 'ok') {
      if (value !== '') onSubmit(value);
    } else if (value.length < maxLength) set(value === '0' ? key : value + key);
  }

  const btn = (key, content, cls = '') =>
    h(
      'button',
      {
        type: 'button',
        class: `lw-numpad__key ${cls}`,
        'aria-label': key === 'del' ? 'Löschen' : key === 'ok' ? 'Fertig' : key,
        onpointerdown: (e) => {
          e.preventDefault(); // instant response, no double-tap zoom / focus shift
          press(key);
        },
        onclick: (e) => {
          // Keyboard activation (Enter/Space on a focused key) produces click without pointerdown.
          if (e.detail === 0) press(key);
        },
      },
      content,
    );

  const el = h(
    'div',
    { class: 'lw-numpad' },
    ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => btn(d, d)),
    btn('del', icon('backspace'), 'lw-numpad__key--del'),
    btn('0', '0'),
    btn('ok', icon('check'), 'lw-numpad__key--ok'),
  );

  function onKeyDown(e) {
    if (!el.isConnected || disabled || e.target?.matches?.('input, textarea, select')) return;
    if (/^[0-9]$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('del');
    else if (e.key === 'Enter') press('ok');
    else return;
    e.preventDefault();
  }
  window.addEventListener('keydown', onKeyDown);

  return {
    el,
    get value() {
      return value;
    },
    clear: () => set(''),
    setDisabled(d) {
      disabled = d;
      el.classList.toggle('is-disabled', d);
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      el.remove();
    },
  };
}
