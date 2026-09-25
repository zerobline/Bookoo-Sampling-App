import { h } from './dom.js';

/** Toggle switch row. onchange(checked) */
export function switchField(label, checked, onchange, hint = '') {
  return h(
    'label',
    { class: 'lw-switch' },
    h('input', { type: 'checkbox', checked, onchange: (e) => onchange(e.target.checked) }),
    h('span', { class: 'lw-switch__track', 'aria-hidden': 'true' }),
    h('span', { class: 'lw-switch__label' }, label, hint && h('small', {}, hint)),
  );
}

/** <select> row. options: [{ value, label }], onchange(value as string) */
export function selectField(label, value, options, onchange) {
  return h(
    'label',
    { class: 'lw-field lw-field--row' },
    h('span', {}, label),
    h(
      'select',
      { class: 'lw-input lw-input--inline', onchange: (e) => onchange(e.target.value) },
      options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label)),
    ),
  );
}

/** Multi-select chips. values: selected values, onchange(newValues) */
export function chipsField(label, values, options, onchange) {
  const selected = new Set(values);
  const wrap = h('div', { class: 'lw-chips', role: 'group', 'aria-label': label });
  const render = () =>
    wrap.replaceChildren(
      ...options.map((o) =>
        h(
          'button',
          {
            type: 'button',
            class: ['lw-chip', selected.has(o.value) && 'is-on'],
            'aria-pressed': String(selected.has(o.value)),
            onclick: () => {
              selected.has(o.value) ? selected.delete(o.value) : selected.add(o.value);
              render();
              onchange(options.map((x) => x.value).filter((v) => selected.has(v)));
            },
          },
          o.label,
        ),
      ),
    );
  render();
  return h('div', { class: 'lw-field' }, h('span', {}, label), wrap);
}
