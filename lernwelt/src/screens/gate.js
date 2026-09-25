import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { topbar } from '../ui/topbar.js';
import { createNumpad } from '../ui/numpad.js';

/** A multiplication task well beyond the times tables the child is practising. */
export function gateQuestion(rng = Math.random) {
  const a = 12 + Math.floor(rng() * 8); // 12–19
  const b = 3 + Math.floor(rng() * 7); // 3–9
  return { a, b, answer: a * b };
}

export function gateScreen(ctx) {
  let q = gateQuestion();
  const task = h('div', { class: 'lw-gate__task' });
  const display = h('div', { class: 'lw-answer', 'aria-live': 'polite' }, '');
  const card = h('div', { class: 'lw-card lw-gate' });

  const pad = createNumpad({
    maxLength: 4,
    onChange: (v) => {
      display.textContent = v;
    },
    onSubmit: (v) => {
      if (Number(v) === q.answer) {
        ctx.parentUnlocked = true;
        ctx.refresh();
        return;
      }
      card.classList.remove('lw-shake');
      void card.offsetWidth;
      card.classList.add('lw-shake');
      q = gateQuestion();
      renderTask();
      pad.clear();
    },
  });

  function renderTask() {
    task.textContent = `${q.a} × ${q.b} =`;
  }
  renderTask();

  card.append(
    h('div', { class: 'lw-gate__lock' }, icon('lock')),
    h('h1', { class: 'lw-gate__title' }, 'Nur für Eltern'),
    h('p', { class: 'lw-gate__hint' }, 'Bitte löse die Aufgabe, um den Elternbereich zu öffnen.'),
    h('div', { class: 'lw-gate__row' }, task, display),
    pad.el,
  );

  const el = h('div', { class: 'lw-screen lw-gate-screen' }, topbar(ctx, { title: 'Elternbereich', showStars: false }), h('main', { class: 'lw-center' }, card));
  return { el, destroy: () => pad.destroy() };
}
