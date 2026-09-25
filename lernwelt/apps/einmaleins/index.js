// "Einmaleins" – multiplication practice. Lernwelt app contract:
//   mount(container, services) / unmount() / SettingsScreen / ProgressSummary
import { key, mastery, record, pickTask, masteredCount, MASTERY_LABELS } from './logic.js';

const DEFAULT_SETTINGS = { rows: [1, 2, 5, 10], rounds: 10, swap: true, secondTry: true, autoSpeak: true };

const loadSettings = (s) => ({ ...DEFAULT_SETTINGS, ...s.storage.get('settings', {}) });
const loadFacts = (s) => s.storage.get('facts', {});

let instance = null;

export function mount(container, services) {
  unmount();
  const { h, icon, starsRow, createNumpad } = services.ui;
  const removeCss = services.ui.loadStylesheet(services.asset('style.css'));
  const timers = new Set();
  const later = (fn, ms) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };
  let pad = null;
  const root = h('div', { class: 'emx' });
  container.append(root);

  const settings = loadSettings(services);
  let facts = loadFacts(services);
  const rows = settings.rows.length ? settings.rows : DEFAULT_SETTINGS.rows;

  const speakBtn = (text) =>
    services.speech.available && h('button', { type: 'button', class: 'emx-speak', 'aria-label': 'Vorlesen', onclick: () => services.speech.speak(text) }, icon('speaker'));

  function clearPad() {
    pad?.destroy();
    pad = null;
  }

  // ---------------------------------------------------------------- start
  function showStart() {
    clearPad();
    root.replaceChildren(
      h(
        'div',
        { class: 'emx-start' },
        h('div', { class: 'emx-hero', 'aria-hidden': 'true' }, h('span', {}, rows[0] ?? 3), h('span', { class: 'emx-hero__x' }, '×'), h('span', {}, '?')),
        h('div', { class: 'emx-rows', 'aria-label': 'Reihen' }, rows.map((r) => h('span', { class: 'emx-row-chip' }, `${r}er`))),
        masteryGrid(h, facts, { compact: true, rows }),
        h('button', { type: 'button', class: 'lw-btn lw-btn--primary lw-btn--huge', onclick: startRound }, icon('play'), 'Los geht’s'),
      ),
    );
  }

  // ---------------------------------------------------------------- round
  let round = null;

  function startRound() {
    services.sounds.tap();
    round = { index: 0, correct: 0, results: [], task: null, tries: 0, recent: [], before: { ...facts } };
    services.session.begin();
    nextTask();
  }

  function nextTask() {
    if (round.index >= settings.rounds) return finish();
    round.task = pickTask(rows, facts, { swap: settings.swap, recent: round.recent });
    round.recent = [...round.recent, key(round.task.a, round.task.b)].slice(-4);
    round.tries = 0;
    renderTask();
    if (settings.autoSpeak) services.speech.speak(`${round.task.a} mal ${round.task.b}`);
  }

  function renderTask() {
    clearPad();
    const { a, b } = round.task;
    const display = h('div', { class: 'lw-answer emx-answer', 'aria-live': 'polite' }, '');
    const feedback = h('div', { class: 'emx-feedback', 'aria-live': 'polite' });
    const card = h('div', { class: 'emx-task' }, h('span', {}, `${a} × ${b} =`), display);

    pad = createNumpad({
      maxLength: 3,
      onChange: (v) => {
        display.textContent = v;
        display.classList.remove('is-wrong');
      },
      onSubmit: (v) => check(Number(v), { display, feedback, card }),
    });

    root.replaceChildren(
      h(
        'div',
        { class: 'emx-question' },
        dots(),
        h('div', { class: 'emx-task-row' }, card, speakBtn(`${a} mal ${b}`)),
        feedback,
        pad.el,
      ),
    );
  }

  function dots() {
    return h(
      'div',
      { class: 'lw-dots', 'aria-label': `Aufgabe ${round.index + 1} von ${settings.rounds}` },
      Array.from({ length: settings.rounds }, (_, i) =>
        h('span', { class: ['lw-dot', i === round.index && 'is-current', round.results[i] === true && 'is-right', round.results[i] === false && 'is-wrong'] }),
      ),
    );
  }

  function check(value, { display, feedback, card }) {
    const { a, b } = round.task;
    const solution = a * b;
    round.tries++;

    if (value === solution) {
      const firstTry = round.tries === 1;
      done(firstTry);
      display.classList.add('is-right');
      feedback.replaceChildren(firstTry ? '🎉 Richtig!' : '👍 Jetzt stimmt’s!');
      pad.setDisabled(true);
      services.sounds.correct();
      services.speech.speak(`Richtig! ${a} mal ${b} ist ${solution}.`);
      later(advance, 1300);
      return;
    }

    services.sounds.wrong();
    card.classList.remove('lw-shake');
    void card.offsetWidth;
    card.classList.add('lw-shake');

    if (settings.secondTry && round.tries === 1) {
      display.classList.add('is-wrong');
      feedback.replaceChildren('🤔 Fast! Versuch es nochmal.');
      services.speech.speak('Versuch es nochmal.');
      pad.clear();
      display.textContent = '';
      return;
    }

    done(false);
    pad.setDisabled(true);
    display.textContent = String(solution);
    display.classList.add('is-solution');
    feedback.replaceChildren(
      h('span', {}, `${a} × ${b} = ${solution}`),
      h('button', { type: 'button', class: 'lw-btn lw-btn--primary lw-btn--big', onclick: advance }, 'Weiter', icon('next')),
    );
    services.speech.speak(`${a} mal ${b} ist ${solution}.`);
  }

  function done(firstTry) {
    const { a, b } = round.task;
    round.results[round.index] = firstTry;
    if (firstTry) round.correct++;
    facts = record(facts, a, b, firstTry);
    services.storage.set('facts', facts);
    services.session.update({ correct: round.correct, total: round.index + 1 });
  }

  function advance() {
    round.index++;
    nextTask();
  }

  // ---------------------------------------------------------------- reward
  function finish() {
    clearPad();
    const total = settings.rounds;
    const { stars } = services.session.end({ correct: round.correct, total });
    const stats = services.storage.get('stats', { rounds: 0 });
    services.storage.set('stats', { rounds: stats.rounds + 1, last: { correct: round.correct, total, date: new Date().toISOString() } });

    const newlyMastered = Object.keys(facts).filter((k) => mastery(facts[k]) === 3 && mastery(round.before[k]) !== 3);
    const pct = round.correct / total;
    const praise = pct === 1 ? 'Perfekt!' : pct >= 0.8 ? 'Super gerechnet!' : pct >= 0.5 ? 'Gut geübt!' : 'Toll, dass du geübt hast!';
    services.sounds.reward();
    services.speech.speak(`${praise} Du hast ${round.correct} von ${total} richtig.`);

    root.replaceChildren(
      h(
        'div',
        { class: 'emx-reward' },
        h('div', { class: 'emx-reward__emoji' }, pct >= 0.8 ? '🏆' : '🎉'),
        h('h1', {}, praise),
        starsRow(stars, 5),
        h('p', { class: 'emx-reward__score' }, `${round.correct} von ${total} richtig`),
        newlyMastered.length > 0 &&
          h('div', { class: 'emx-mastered' }, h('span', {}, '💪 Jetzt sicher:'), newlyMastered.slice(0, 6).map((k) => h('span', { class: 'emx-row-chip' }, k.replace('x', ' × ')))),
        h(
          'div',
          { class: 'emx-reward__actions' },
          h('button', { type: 'button', class: 'lw-btn lw-btn--big', onclick: startRound }, icon('replay'), 'Nochmal'),
          h('button', { type: 'button', class: 'lw-btn lw-btn--big lw-btn--primary', onclick: () => services.goHome() }, icon('home'), 'Fertig'),
        ),
      ),
    );
  }

  showStart();
  instance = {
    destroy() {
      timers.forEach(clearTimeout);
      clearPad();
      removeCss();
      root.remove();
    },
  };
}

export function unmount() {
  instance?.destroy();
  instance = null;
}

// ------------------------------------------------------------------ parent area

export function SettingsScreen(container, services) {
  const { h, switchField, selectField, chipsField } = services.ui;
  const settings = loadSettings(services);
  const save = (patch) => services.storage.set('settings', Object.assign(settings, patch));
  const hint = h('p', { class: 'lw-muted' });
  const updateHint = () => (hint.textContent = settings.rows.length ? '' : 'Bitte mindestens eine Reihe wählen (sonst werden 1, 2, 5 und 10 geübt).');
  updateHint();

  container.append(
    h('h2', { class: 'lw-card__title' }, 'Einmaleins'),
    chipsField(
      'Welche Reihen?',
      settings.rows,
      Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: `${i + 1}er` })),
      (rows) => {
        save({ rows });
        updateHint();
      },
    ),
    hint,
    selectField('Aufgaben pro Runde', settings.rounds, [5, 10, 15, 20].map((n) => ({ value: n, label: `${n} Aufgaben` })), (v) => save({ rounds: Number(v) })),
    switchField('Tauschaufgaben', settings.swap, (on) => save({ swap: on }), 'Auch 7 × 3, wenn die 3er-Reihe gewählt ist.'),
    switchField('Zweiter Versuch', settings.secondTry, (on) => save({ secondTry: on })),
    switchField('Aufgabe automatisch vorlesen', settings.autoSpeak, (on) => save({ autoSpeak: on })),
  );
}

export function ProgressSummary(container, services) {
  const { h } = services.ui;
  const facts = loadFacts(services);
  container.append(h('p', {}, h('strong', {}, `${masteredCount(facts)} von 100`), ' Aufgaben sicher'), masteryGrid(h, facts), legend(h));
  return services.ui.loadStylesheet(services.asset('style.css'));
}

// ------------------------------------------------------------------ 10 × 10 grid

function masteryGrid(h, facts, { compact = false, rows = null } = {}) {
  const cells = [h('span', { class: 'emx-grid__head' }, '×')];
  for (let b = 1; b <= 10; b++) cells.push(h('span', { class: 'emx-grid__head' }, b));
  for (let a = 1; a <= 10; a++) {
    cells.push(h('span', { class: ['emx-grid__head', rows?.includes(a) && 'is-active'] }, a));
    for (let b = 1; b <= 10; b++) {
      const level = mastery(facts[key(a, b)]);
      cells.push(h('span', { class: `emx-grid__cell lvl-${level}`, title: `${a} × ${b}: ${MASTERY_LABELS[level]}` }, compact ? '' : a * b));
    }
  }
  return h('div', { class: ['emx-grid', compact && 'emx-grid--compact'], role: 'img', 'aria-label': `Einmaleins-Übersicht: ${masteredCount(facts)} von 100 sicher` }, cells);
}

function legend(h) {
  return h('div', { class: 'emx-legend' }, MASTERY_LABELS.map((l, i) => h('span', {}, h('i', { class: `emx-grid__cell lvl-${i}` }), l)));
}
