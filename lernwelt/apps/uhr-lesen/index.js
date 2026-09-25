// "Uhr lesen" – read an analogue clock. Lernwelt app contract:
//   mount(container, services) / unmount() / SettingsScreen / ProgressSummary
import { STAGES, MAX_STAGE, stage, label, spoken, handAngles, makeQuestion, passes } from './clock.js';

const DEFAULT_SETTINGS = { rounds: 10, showNumbers: true, minuteHelp: false, autoSpeak: true };
const DEFAULT_PROGRESS = { maxStage: 1, stage: 1, best: {}, rounds: 0, last: null };

const loadSettings = (s) => ({ ...DEFAULT_SETTINGS, ...s.storage.get('settings', {}) });
const loadProgress = (s) => ({ ...DEFAULT_PROGRESS, ...s.storage.get('progress', {}) });

let instance = null;

export function mount(container, services) {
  unmount();
  const { h, icon, starsRow } = services.ui;
  const removeCss = services.ui.loadStylesheet(services.asset('style.css'));
  const timers = new Set();
  const later = (fn, ms) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };
  const root = h('div', { class: 'uhr' });
  container.append(root);

  const settings = loadSettings(services);
  let progress = loadProgress(services);

  const speakBtn = (text, cls = '') =>
    services.speech.available &&
    h('button', { type: 'button', class: `uhr-speak ${cls}`, 'aria-label': 'Vorlesen', onclick: (e) => (e.stopPropagation(), services.speech.speak(text)) }, icon('speaker'));

  // ---------------------------------------------------------------- start
  function showStart() {
    const stageChips = STAGES.map((st) => {
      const locked = st.n > progress.maxStage;
      return h(
        'button',
        {
          type: 'button',
          class: ['uhr-stage', st.n === progress.stage && 'is-on', locked && 'is-locked'],
          disabled: locked,
          'aria-label': `Stufe ${st.n}: ${st.name}${locked ? ' (gesperrt)' : ''}`,
          onclick: () => {
            services.sounds.tap();
            progress.stage = st.n;
            services.storage.set('progress', progress);
            showStart();
            services.speech.speak(`Stufe ${st.n}. ${st.name}`);
          },
        },
        locked ? '🔒' : st.n,
      );
    });
    const now = new Date();
    const h12 = ((now.getHours() + 11) % 12) + 1;
    root.replaceChildren(
      h(
        'div',
        { class: 'uhr-start' },
        clockFace(h, h12, now.getMinutes(), settings),
        h('div', { class: 'uhr-stage-name' }, `Stufe ${progress.stage}: ${stage(progress.stage).name}`, speakBtn(`Stufe ${progress.stage}. ${stage(progress.stage).name}`)),
        h('div', { class: 'uhr-stages' }, stageChips),
        h('button', { type: 'button', class: 'lw-btn lw-btn--primary lw-btn--huge', onclick: startRound }, icon('play'), 'Los geht’s'),
      ),
    );
  }

  // ---------------------------------------------------------------- round
  let round = null;

  function startRound() {
    services.sounds.tap();
    round = { stage: progress.stage, index: 0, correct: 0, results: [], question: null };
    services.session.begin();
    nextQuestion();
  }

  function nextQuestion() {
    if (round.index >= settings.rounds) return finish();
    round.question = makeQuestion(round.stage, Math.random, round.question);
    renderQuestion();
    if (settings.autoSpeak) services.speech.speak('Wie spät ist es?');
  }

  function renderQuestion(answered = null) {
    const q = round.question;
    const dots = h(
      'div',
      { class: 'lw-dots', 'aria-label': `Aufgabe ${round.index + 1} von ${settings.rounds}` },
      Array.from({ length: settings.rounds }, (_, i) =>
        h('span', { class: ['lw-dot', i === round.index && 'is-current', round.results[i] === true && 'is-right', round.results[i] === false && 'is-wrong'] }),
      ),
    );
    const options = q.options.map((o, i) => {
      let state = '';
      if (answered !== null) {
        if (i === q.answerIndex) state = 'is-right';
        else if (i === answered) state = 'is-wrong';
      }
      return h(
        'div',
        { class: ['uhr-option', state] },
        h('button', { type: 'button', class: 'uhr-option__btn', disabled: answered !== null, onclick: () => answer(i) }, o.label),
        speakBtn(spoken(round.stage, o.h, o.m), 'uhr-option__speak'),
      );
    });

    root.replaceChildren(
      h(
        'div',
        { class: 'uhr-question' },
        dots,
        h('div', { class: 'uhr-question__clock' }, clockFace(h, q.h, q.m, settings)),
        h('div', { class: 'uhr-question__text' }, 'Wie spät ist es?', speakBtn('Wie spät ist es?')),
        h('div', { class: 'uhr-options' }, options),
        answered !== null && answered !== q.answerIndex &&
          h('button', { type: 'button', class: 'lw-btn lw-btn--primary lw-btn--big uhr-next', onclick: advance }, 'Weiter', icon('next')),
      ),
    );
  }

  function answer(i) {
    const q = round.question;
    const right = i === q.answerIndex;
    round.results[round.index] = right;
    if (right) round.correct++;
    services.session.update({ correct: round.correct, total: round.index + 1 });
    renderQuestion(i);
    const text = spoken(round.stage, q.h, q.m);
    if (right) {
      services.sounds.correct();
      services.speech.speak(`Richtig! ${text}.`);
      later(advance, 1400);
    } else {
      services.sounds.wrong();
      services.speech.speak(`Schau genau: Es ist ${text}.`);
    }
  }

  function advance() {
    round.index++;
    nextQuestion();
  }

  // ---------------------------------------------------------------- reward
  function finish() {
    const total = settings.rounds;
    const { stars } = services.session.end({ correct: round.correct, total });

    const pct = Math.round((100 * round.correct) / total);
    progress.best[round.stage] = Math.max(progress.best[round.stage] ?? 0, pct);
    progress.rounds++;
    progress.last = { stage: round.stage, correct: round.correct, total, date: new Date().toISOString() };
    let levelUp = null;
    if (passes(round.correct, total) && round.stage === progress.maxStage && progress.maxStage < MAX_STAGE) {
      progress.maxStage++;
      progress.stage = progress.maxStage;
      levelUp = stage(progress.maxStage);
    }
    services.storage.set('progress', progress);

    const praise = pct === 100 ? 'Perfekt!' : pct >= 80 ? 'Super gemacht!' : pct >= 50 ? 'Gut geübt!' : 'Toll, dass du geübt hast!';
    services.sounds.reward();
    services.speech.speak(`${praise} Du hast ${round.correct} von ${total} richtig.${levelUp ? ` Neue Stufe: ${levelUp.name}!` : ''}`);

    root.replaceChildren(
      h(
        'div',
        { class: 'uhr-reward' },
        h('div', { class: 'uhr-reward__emoji' }, pct >= 80 ? '🏆' : '🎉'),
        h('h1', {}, praise),
        starsRow(stars, 5),
        h('p', { class: 'uhr-reward__score' }, `${round.correct} von ${total} richtig`),
        levelUp && h('div', { class: 'uhr-levelup' }, '🔓 Neue Stufe: ', h('strong', {}, `${levelUp.n} – ${levelUp.name}`)),
        h(
          'div',
          { class: 'uhr-reward__actions' },
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
  const { h, switchField, selectField } = services.ui;
  const settings = loadSettings(services);
  const progress = loadProgress(services);
  const save = (patch) => services.storage.set('settings', Object.assign(settings, patch));

  container.append(
    h('h2', { class: 'lw-card__title' }, 'Uhr lesen'),
    selectField('Aufgaben pro Runde', settings.rounds, [5, 10, 15].map((n) => ({ value: n, label: `${n} Aufgaben` })), (v) => save({ rounds: Number(v) })),
    selectField(
      'Freigeschaltete Stufe',
      progress.maxStage,
      STAGES.map((s) => ({ value: s.n, label: `${s.n} – ${s.name}` })),
      (v) => {
        const p = loadProgress(services);
        p.maxStage = Number(v);
        p.stage = Number(v);
        services.storage.set('progress', p);
      },
    ),
    switchField('Zahlen auf dem Zifferblatt', settings.showNumbers, (on) => save({ showNumbers: on })),
    switchField('Minutenhilfe am Rand', settings.minuteHelp, (on) => save({ minuteHelp: on }), 'Zeigt 5, 10, 15 … außen an der Uhr.'),
    switchField('Frage automatisch vorlesen', settings.autoSpeak, (on) => save({ autoSpeak: on })),
    h('p', { class: 'lw-muted' }, 'Eine Runde mit mindestens 80 % richtigen Antworten schaltet die nächste Stufe frei.'),
  );
}

export function ProgressSummary(container, services) {
  const { h } = services.ui;
  const p = loadProgress(services);
  container.append(
    h('p', {}, h('strong', {}, `Stufe ${p.maxStage} von ${MAX_STAGE}: `), stage(p.maxStage).name),
    h(
      'ol',
      { class: 'uhr-summary' },
      STAGES.map((s) =>
        h(
          'li',
          { class: s.n < p.maxStage ? 'is-done' : s.n === p.maxStage ? 'is-current' : '' },
          h('span', {}, s.name),
          h('span', {}, p.best[s.n] != null ? `beste Runde ${p.best[s.n]} %` : s.n <= p.maxStage ? '–' : '🔒'),
        ),
      ),
    ),
  );
  return services.ui.loadStylesheet(services.asset('style.css'));
}

// ------------------------------------------------------------------ clock SVG

function clockFace(h, hour, minute, { showNumbers = true, minuteHelp = false } = {}) {
  const { hour: ha, minute: ma } = handAngles(hour, minute);
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const major = i % 5 === 0;
    return `<line x1="100" y1="${major ? 17 : 19}" x2="100" y2="${major ? 29 : 24}" stroke="${major ? '#243049' : '#9aa6bb'}" stroke-width="${major ? 3.2 : 1.4}" stroke-linecap="round" transform="rotate(${i * 6} 100 100)"/>`;
  }).join('');
  const pos = (i, r) => {
    const a = (i * 30 * Math.PI) / 180;
    return [100 + r * Math.sin(a), 100 - r * Math.cos(a)];
  };
  const numbers = showNumbers
    ? Array.from({ length: 12 }, (_, i) => {
        const [x, y] = pos(i + 1, 58);
        return `<text x="${x}" y="${y}" class="uhr-num">${i + 1}</text>`;
      }).join('')
    : '';
  const minuteNums = minuteHelp
    ? Array.from({ length: 12 }, (_, i) => {
        const [x, y] = pos(i, 88);
        return `<text x="${x}" y="${y}" class="uhr-min">${i === 0 ? '00' : i * 5}</text>`;
      }).join('')
    : '';
  const r = minuteHelp ? 80 : 90;
  const svg = `<svg viewBox="${minuteHelp ? -2 : 0} ${minuteHelp ? -2 : 0} ${minuteHelp ? 204 : 200} ${minuteHelp ? 204 : 200}" class="uhr-face" role="img" aria-label="Uhr">
    ${minuteHelp ? '<circle cx="100" cy="100" r="99" fill="#fff6d8"/>' : ''}
    <circle cx="100" cy="100" r="${r}" fill="#fff" stroke="#243049" stroke-width="5"/>
    <g transform="translate(100 100) scale(${r / 90}) translate(-100 -100)">${ticks}${numbers}</g>
    ${minuteNums}
    <line x1="100" y1="106" x2="100" y2="${100 - r * 0.5}" stroke="#e0564f" stroke-width="9" stroke-linecap="round" transform="rotate(${ha} 100 100)"/>
    <line x1="100" y1="110" x2="100" y2="${100 - r * 0.8}" stroke="#3b7ddd" stroke-width="5.5" stroke-linecap="round" transform="rotate(${ma} 100 100)"/>
    <circle cx="100" cy="100" r="7" fill="#243049"/>
  </svg>`;
  return h('div', { class: 'uhr-clock', html: svg });
}
