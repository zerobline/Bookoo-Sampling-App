/**
 * Tiny element builder: h('button', { class: 'lw-btn', onclick: fn }, 'Text', childNode)
 * - props starting with "on" become event listeners
 * - `style` may be a string or an object (CSS custom properties allowed)
 * - `dataset` sets data-* attributes, `html` sets innerHTML (trusted constants only)
 * - children may be strings, numbers, nodes, arrays, or null/false (skipped)
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'class') {
      el.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
    } else if (key === 'style' && typeof value === 'object') {
      for (const [prop, v] of Object.entries(value)) {
        if (v == null) continue;
        prop.startsWith('--') ? el.style.setProperty(prop, v) : (el.style[prop] = v);
      }
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value);
    } else if (key === 'html') {
      el.innerHTML = value;
    } else if (value === true) {
      el.setAttribute(key, '');
    } else if (key in el && !key.includes('-') && key !== 'list') {
      el[key] = value;
    } else {
      el.setAttribute(key, value);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
}

/** Adds a <link rel=stylesheet>; returns a function that removes it again. */
export function loadStylesheet(href) {
  const existing = document.querySelector(`link[data-lw-href="${CSS.escape(href)}"]`);
  if (existing) {
    existing.dataset.lwRefs = String(Number(existing.dataset.lwRefs) + 1);
    return () => release(existing);
  }
  const link = h('link', { rel: 'stylesheet', href, dataset: { lwHref: href, lwRefs: '1' } });
  document.head.append(link);
  return () => release(link);
}

function release(link) {
  const refs = Number(link.dataset.lwRefs) - 1;
  if (refs <= 0) link.remove();
  else link.dataset.lwRefs = String(refs);
}
