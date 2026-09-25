/* Einmaleins – UI, speech, sounds, storage. Depends on Tips and Logic. */
(function () {
  'use strict';

  var T = window.Tips;
  var L = window.Logic;
  var STORE = 'einmaleins.v1';
  var MAX_SESSIONS = 60;
  var LEVELS = {
    1: { name: 'Viel Hilfe', sub: 'Punkte, Zahlenstrahl und Tipp' },
    2: { name: 'Wenig Hilfe', sub: 'Tipp auf Knopfdruck' },
    3: { name: 'Keine Hilfe', sub: 'Aus dem Kopf' }
  };
  var TIMERS = [0, 30, 20, 10];

  var app = document.getElementById('app');

  // ---------------------------------------------------------------- storage
  function defaults() {
    return { v: 1, level: 1, reihen: [1], facts: {}, sessions: [], settings: { timer: 0, sound: true, voice: true } };
  }
  function load() {
    var base = defaults();
    try {
      var raw = localStorage.getItem(STORE);
      if (raw) {
        var d = JSON.parse(raw);
        return Object.assign(base, d, { settings: Object.assign(base.settings, d.settings || {}) });
      }
    } catch (e) { /* storage blocked: keep progress in memory only */ }
    return base;
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(data)); } catch (e) { /* ignore */ }
  }

  var data = load();
  var S = { screen: 'home', run: null, sel: null, gate: false, toast: '' };

  // ---------------------------------------------------------------- speech + sound
  var Voice = {
    voice: null,
    init: function () {
      if (!('speechSynthesis' in window)) return;
      var pick = function () {
        var all = window.speechSynthesis.getVoices();
        Voice.voice = all.filter(function (v) { return v.lang === 'de-DE'; })[0] ||
          all.filter(function (v) { return /^de/i.test(v.lang); })[0] || null;
      };
      pick();
      window.speechSynthesis.addEventListener('voiceschanged', pick);
    },
    say: function (text) {
      if (!data.settings.voice || !('speechSynthesis' in window)) return;
      try {
        window.speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(text);
        u.lang = 'de-DE';
        if (Voice.voice) u.voice = Voice.voice;
        u.rate = 0.9;
        window.speechSynthesis.speak(u);
      } catch (e) { /* no speech on this device */ }
    }
  };
  Voice.init();

  var audio = null;
  function tone(freq, start, dur, type, gain) {
    var o = audio.createOscillator();
    var g = audio.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, audio.currentTime + start);
    g.gain.exponentialRampToValueAtTime(gain, audio.currentTime + start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + start + dur);
    o.connect(g).connect(audio.destination);
    o.start(audio.currentTime + start);
    o.stop(audio.currentTime + start + dur + 0.05);
  }
  function sound(kind) {
    if (!data.settings.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      if (kind === 'right') {
        tone(784, 0, 0.18, 'triangle', 0.25);
        tone(988, 0.1, 0.18, 'triangle', 0.25);
        tone(1319, 0.2, 0.35, 'triangle', 0.25);
      } else if (kind === 'wrong') {
        tone(392, 0, 0.22, 'sine', 0.18);
        tone(330, 0.16, 0.3, 'sine', 0.18);
      } else if (kind === 'fanfare') {
        [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.12, 0.3, 'triangle', 0.22); });
      }
    } catch (e) { /* no audio */ }
  }

  // ---------------------------------------------------------------- icons
  var ICON = {
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="5" height="5" rx="1.2"/><rect x="9.5" y="3" width="5" height="5" rx="1.2"/><rect x="16" y="3" width="5" height="5" rx="1.2"/><rect x="3" y="9.5" width="5" height="5" rx="1.2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1.2"/><rect x="16" y="9.5" width="5" height="5" rx="1.2" opacity=".35"/><rect x="3" y="16" width="5" height="5" rx="1.2"/><rect x="9.5" y="16" width="5" height="5" rx="1.2" opacity=".35"/><rect x="16" y="16" width="5" height="5" rx="1.2" opacity=".35"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>',
    speaker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11"/></svg>',
    bulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z"/></svg>',
    del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5h11v14H9l-6-7z"/><path d="M12.5 9.5l5 5M17.5 9.5l-5 5"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5 10-11"/></svg>'
  };
  function starPath(cx, cy, R, r) {
    var pts = [];
    for (var i = 0; i < 10; i++) {
      var rad = i % 2 ? r : R;
      var ang = Math.PI / 5 * i - Math.PI / 2;
      pts.push((cx + rad * Math.cos(ang)).toFixed(1) + ',' + (cy + rad * Math.sin(ang)).toFixed(1));
    }
    return pts.join(' ');
  }
  function star(cls) {
    return '<svg viewBox="0 0 100 100" aria-hidden="true"><polygon class="' + (cls || '') + '" fill="var(--sun)" stroke="var(--sun-deep)" stroke-width="3" stroke-linejoin="round" points="' + starPath(50, 53, 47, 21) + '"/></svg>';
  }
  function levelIcon(n) {
    var s = '<svg viewBox="0 0 64 48" aria-hidden="true">';
    for (var r = 0; r < 3; r++) {
      for (var c = 0; c < 4; c++) {
        var x = 11 + c * 14;
        var y = 10 + r * 14;
        if (n === 1) s += '<circle cx="' + x + '" cy="' + y + '" r="5" fill="var(--accent)"/>';
        else if (n === 2) s += '<circle cx="' + x + '" cy="' + y + '" r="4.5" fill="none" stroke="var(--dot)" stroke-width="2"/>';
      }
    }
    if (n === 3) s += '<text x="32" y="36" text-anchor="middle" font-family="var(--font)" font-weight="800" font-size="30" fill="var(--accent)">?</text>';
    return s + '</svg>';
  }

  // ---------------------------------------------------------------- helpers
  function stat(a, b) { return L.statOf(data.facts, a, b); }
  // 0 = never seen (shown as "neu"), otherwise the Leitner box 1–5.
  function shade(a, b) {
    var s = data.facts[L.key(a, b)];
    return s && s.seen ? s.box : 0;
  }
  function allReihen() { return data.reihen.length === 10; }
  function reiheLabel(list) {
    if (list.length === 10) return 'Gemischt';
    return list.map(function (r) { return r + 'er'; }).join(', ');
  }
  function boxMeter(facts) {
    var counts = [0, 0, 0, 0, 0, 0];
    facts.forEach(function (f) { counts[shade(f.a, f.b)]++; });
    var html = '';
    for (var i = 5; i >= 1; i--) {
      if (counts[i]) html += '<i class="bx' + i + '" style="width:' + (counts[i] / facts.length * 100) + '%"></i>';
    }
    return '<span class="meter" aria-hidden="true">' + html + '</span>';
  }
  function known(facts) {
    return facts.filter(function (f) { return shade(f.a, f.b) >= 4; }).length;
  }
  function holdButton(action, label, extra) {
    return '<button class="btn hold ' + (extra || '') + '" data-hold="' + action + '"><span class="fill"></span><span class="lbl">' + label + '</span></button>';
  }

  // ---------------------------------------------------------------- home
  function viewHome() {
    var levels = [1, 2, 3].map(function (n) {
      return '<button class="level" data-act="level" data-n="' + n + '" aria-pressed="' + (data.level === n) + '">' +
        levelIcon(n) + '<b>' + LEVELS[n].name + '</b><span>' + LEVELS[n].sub + '</span></button>';
    }).join('');
    var chips = '<button class="chip mixed" data-act="mixed" aria-pressed="' + allReihen() + '">Gemischt</button>' +
      L.ORDER.map(function (r) {
        var on = !allReihen() && data.reihen.indexOf(r) >= 0;
        return '<button class="chip" data-act="reihe" data-n="' + r + '" aria-pressed="' + on + '" aria-label="' + r + 'er-Reihe">' +
          r + 'er' + boxMeter(L.factsFor([r])) + '</button>';
      }).join('');
    return '<section class="screen narrow">' +
      '<header class="home-head"><h1 class="logo">Einmaleins<small>1 × 1 bis 10 × 10</small></h1>' +
      '<div class="head-actions"><button class="btn icon" data-act="go" data-to="progress" aria-label="Fortschritt">' + ICON.grid + '</button>' +
      '<button class="btn icon" data-act="go" data-to="parents" aria-label="Für Eltern">' + ICON.gear + '</button></div></header>' +
      '<div><h2 class="section-title">Wie viel Hilfe?</h2><div class="levels">' + levels + '</div></div>' +
      '<div><h2 class="section-title">Welche Reihen?</h2><div class="chips">' + chips + '</div></div>' +
      '<div class="go-row"><button class="btn primary big" data-act="start">Los geht’s!</button>' +
      '<span class="hint-line">' + L.SESSION_SIZE + ' Karten · etwa 5 Minuten · ' + reiheLabel(data.reihen) + '</span></div>' +
      '</section>';
  }

  // ---------------------------------------------------------------- practice
  function startSession() {
    var pool = L.factsFor(data.reihen);
    S.run = {
      level: data.level,
      reihen: data.reihen.slice(),
      queue: L.buildSession(pool, data.facts),
      i: 0,
      marks: [],
      repeats: {},
      results: [],
      promoted: 0,
      missed: []
    };
    S.screen = 'practice';
    setCard();
  }

  function setCard() {
    var run = S.run;
    var card = run.queue[run.i];
    run.card = card;
    run.input = '';
    run.hint = 0;
    run.counted = 0;
    run.state = 'ask';
    run.given = null;
    run.timeout = false;
    run.confirmExit = false;
    run.enter = true;
    run.options = run.level === 1 ? L.choices(card.a, card.b) : null;
    stopTimer();
    if (run.level === 3 && data.settings.timer) {
      run.deadline = Date.now() + data.settings.timer * 1000;
      run.timerId = setInterval(tickTimer, 100);
    }
    render();
  }

  function tickTimer() {
    var run = S.run;
    if (!run || run.state !== 'ask') return stopTimer();
    var left = run.deadline - Date.now();
    var bar = document.querySelector('.timer i');
    if (bar) bar.style.transform = 'scaleX(' + Math.max(0, left / (data.settings.timer * 1000)) + ')';
    if (left <= 0) {
      run.timeout = true;
      answer(null);
    }
  }
  function stopTimer() {
    if (S.run && S.run.timerId) {
      clearInterval(S.run.timerId);
      S.run.timerId = null;
    }
  }

  function answer(value) {
    var run = S.run;
    if (run.state !== 'ask') return;
    stopTimer();
    var a = run.card.a;
    var b = run.card.b;
    var correct = value === a * b;
    var usedHint = run.hint > 0;
    run.given = value;
    run.enter = false;
    if (!run.card.repeat) {
      var before = stat(a, b);
      var after = L.applyAnswer(before, correct, usedHint, run.level);
      data.facts[L.key(a, b)] = after;
      if (after.box > before.box) run.promoted++;
      run.results.push({ a: a, b: b, correct: correct, hint: usedHint });
      save();
    }
    run.marks[run.i] = correct ? 'ok' : 'bad';
    var spoken = a + ' mal ' + b + ' ist ' + a * b;
    if (correct) {
      run.state = 'right';
      sound('right');
      Voice.say(spoken);
      render();
      run.autoNext = setTimeout(next, 2200);
    } else {
      run.state = 'wrong';
      run.counted = a;
      if (run.missed.indexOf(L.key(a, b)) < 0) run.missed.push(L.key(a, b));
      L.requeue(run.queue, run.i, run.card, run.repeats);
      sound('wrong');
      setTimeout(function () { Voice.say(spoken + '.'); }, 450);
      render();
    }
  }

  function next() {
    var run = S.run;
    if (!run || S.screen !== 'practice') return;
    clearTimeout(run.autoNext);
    run.i++;
    if (run.i >= run.queue.length) finish();
    else setCard();
  }

  function finish() {
    var run = S.run;
    stopTimer();
    data.sessions.push({ t: Date.now(), level: run.level, reihen: run.reihen, results: run.results });
    if (data.sessions.length > MAX_SESSIONS) data.sessions = data.sessions.slice(-MAX_SESSIONS);
    save();
    var practiced = {};
    run.results.forEach(function (r) { L.reihenOf(r.a, r.b).forEach(function (n) { practiced[n] = true; }); });
    var candidates = run.reihen.filter(function (r) { return practiced[r]; });
    run.suggest = run.level === data.level ? L.levelUpReihen(data.sessions, run.level, candidates) : [];
    S.screen = 'reward';
    sound('fanfare');
    render();
  }

  function dotsSVG(a, b, counted) {
    var cell = 30;
    var pad = 6;
    var labelW = 50;
    var w = b * cell + pad * 2 + labelW;
    var h = a * cell + pad * 2;
    var s = '<svg class="dots" viewBox="0 0 ' + w + ' ' + h + '" style="max-width:' + Math.round(w * 1.25) + 'px" role="img" aria-label="' + a + ' Reihen mit je ' + b + ' Punkten">';
    for (var i = 0; i < a; i++) {
      var y = pad + i * cell;
      s += '<g class="row' + (i < counted ? ' on' : '') + '" data-act="row" data-i="' + i + '">' +
        '<rect class="hit" x="0" y="' + y + '" width="' + w + '" height="' + cell + '"/>';
      for (var j = 0; j < b; j++) {
        s += '<circle cx="' + (pad + j * cell + cell / 2) + '" cy="' + (y + cell / 2) + '" r="' + cell * 0.34 + '"/>';
      }
      s += '<text class="cnt" x="' + (pad + b * cell + 10) + '" y="' + (y + cell / 2 + 6) + '">' + (i + 1) * b + '</text></g>';
    }
    return s + '</svg>';
  }

  function lineSVG(a, b, counted) {
    var W = 640;
    var H = 96;
    var x0 = 22;
    var x1 = W - 22;
    var base = 60;
    var max = a * b;
    var x = function (v) { return x0 + (x1 - x0) * v / max; };
    var s = '<svg class="nline" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Zahlenstrahl in ' + b + 'er-Sprüngen bis ' + max + '">' +
      '<line class="axis" x1="' + x0 + '" y1="' + base + '" x2="' + x1 + '" y2="' + base + '"/>' +
      '<line class="tick" x1="' + x0 + '" y1="' + (base - 7) + '" x2="' + x0 + '" y2="' + (base + 7) + '"/>' +
      '<text x="' + x0 + '" y="' + (base + 28) + '">0</text>';
    var lift = Math.min(40, (x1 - x0) / a * 0.6 + 8);
    for (var k = 0; k < a; k++) {
      var xa = x(k * b);
      var xb = x((k + 1) * b);
      var on = k < counted ? ' on' : '';
      s += '<path class="arc' + on + '" d="M' + xa.toFixed(1) + ' ' + (base - 4) + ' Q' + ((xa + xb) / 2).toFixed(1) + ' ' + (base - lift * 1.6).toFixed(1) + ' ' + xb.toFixed(1) + ' ' + (base - 4) + '"/>' +
        '<line class="tick" x1="' + xb.toFixed(1) + '" y1="' + (base - 7) + '" x2="' + xb.toFixed(1) + '" y2="' + (base + 7) + '"/>' +
        '<text class="' + on + '" x="' + xb.toFixed(1) + '" y="' + (base + 28) + '">' + (k + 1) * b + '</text>';
      if (k === 0) s += '<text class="jump" x="' + ((xa + xb) / 2).toFixed(1) + '" y="' + (base - lift * 0.8 - 6).toFixed(1) + '">+' + b + '</text>';
    }
    return s + '</svg>';
  }

  function tipPanel(a, b, reveal) {
    var text = T.tip(a, b);
    var shown = reveal ? text : T.maskTip(text, a, b);
    return '<div class="panel tip"><button class="say" data-act="sayTip" aria-label="Tipp vorlesen">' + ICON.speaker + '</button>' +
      '<p><span class="panel-label">Tipp</span><br>' + shown + '</p></div>';
  }

  function dotsPanel(a, b, counted, interactive) {
    return '<div class="panel dots-wrap"><div class="panel-label">' + (a === 1 ? '1 Reihe mit ' : a + ' Reihen mit je ') + b + '</div>' +
      dotsSVG(a, b, counted) + lineSVG(a, b, counted) +
      (interactive ? '<span class="tap-hint">Tippe die Reihen an und zähle mit.</span>' : '') + '</div>';
  }

  function viewPractice() {
    var run = S.run;
    var a = run.card.a;
    var b = run.card.b;
    var p = a * b;
    var done = run.state !== 'ask';

    var pips = run.queue.map(function (c, i) {
      var cls = run.marks[i] || (i === run.i ? 'now' : '');
      return '<span class="pip ' + cls + '"></span>';
    }).join('');
    var exitBtn = run.confirmExit
      ? '<button class="btn exit-confirm" data-act="exit">Beenden?</button>'
      : '<button class="btn icon" data-act="askExit" aria-label="Übung beenden">' + ICON.close + '</button>';
    var bar = '<header class="bar">' + exitBtn + '<div class="pips" aria-hidden="true">' + pips + '</div>' +
      '<span class="count">' + Math.min(run.i + 1, run.queue.length) + ' / ' + run.queue.length + '</span></header>';

    var slotText = run.state === 'ask'
      ? (run.level === 1 ? '?' : (run.input || '?'))
      : String(p);
    var slotEmpty = run.state === 'ask' && (run.level === 1 || !run.input);
    var cardCls = 'card' + (run.enter ? ' enter' : '') + (run.state === 'right' ? ' right' : '') + (run.state === 'wrong' ? ' wrong' : '');
    var card = '<div class="' + cardCls + '">' +
      '<div class="card-tools"><button class="say" data-act="sayProblem" aria-label="Aufgabe vorlesen">' + ICON.speaker + '</button></div>' +
      '<div class="problem" aria-label="' + a + ' mal ' + b + '"><span>' + a + '</span><span class="op">×</span><span>' + b + '</span><span class="op">=</span>' +
      '<span class="slot' + (slotEmpty ? ' empty' : '') + '">' + slotText + '</span></div>' +
      (run.state === 'wrong' ? '<div class="given">' + (run.timeout ? 'Die Zeit ist um.' : 'Deine Antwort: <s>' + run.given + '</s>') + '</div>' : '') +
      (run.level === 3 && data.settings.timer && run.state === 'ask' ? '<div class="timer"><i></i></div>' : '') +
      (run.state === 'right' ? '<div class="star-pop">' + star() + '</div>' : '') +
      '</div>';

    // Help area
    var help = '';
    if (run.level === 1 || run.state === 'wrong') {
      help = dotsPanel(a, b, run.counted, true) + tipPanel(a, b, done);
    } else if (run.level === 2) {
      if (run.hint >= 1) help += tipPanel(a, b, done);
      if (run.hint >= 2) help += dotsPanel(a, b, run.counted, true);
    }

    // Answer area
    var ans = '';
    if (run.state === 'right') {
      ans = '<p class="feedback good">Richtig! ' + a + ' × ' + b + ' = ' + p + '</p>' +
        '<button class="btn primary big next-btn" data-act="next">Weiter</button>';
    } else if (run.state === 'wrong') {
      ans = '<p class="feedback bad">Schau mal: ' + a + ' × ' + b + ' = ' + p + '</p>' +
        '<p class="hint-line" style="text-align:center">Die Aufgabe kommt gleich noch einmal.</p>' +
        '<button class="btn primary big next-btn" data-act="next">Weiter</button>';
    } else if (run.level === 1) {
      ans = '<div class="choices">' + run.options.map(function (v, i) {
        return '<button class="btn" data-act="choose" data-v="' + v + '" aria-keyshortcuts="' + (i + 1) + '">' + v + '</button>';
      }).join('') + '</div>';
    } else {
      if (run.level === 2) {
        var hintLabel = run.hint === 0 ? 'Tipp' : run.hint === 1 ? 'Punkte zeigen' : 'Alle Hilfen offen';
        ans += '<button class="btn hint-btn" data-act="hint"' + (run.hint >= 2 ? ' disabled' : '') + '>' + ICON.bulb + hintLabel + '</button>';
      }
      var keys = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) {
        return '<button class="btn" data-act="digit" data-v="' + n + '">' + n + '</button>';
      }).join('');
      ans += '<div class="pad">' + keys +
        '<button class="btn del" data-act="del" aria-label="Löschen">' + ICON.del + '</button>' +
        '<button class="btn" data-act="digit" data-v="0">0</button>' +
        '<button class="btn ok" data-act="submit" aria-label="Fertig"' + (run.input ? '' : ' disabled') + '>' + ICON.check + '</button></div>';
    }

    return '<section class="screen practice">' + bar +
      '<div class="stage"><div class="col">' + card + help + '</div>' +
      '<div class="col answer-col">' + ans + '</div></div></section>';
  }

  // ---------------------------------------------------------------- reward
  function viewReward() {
    var run = S.run;
    var right = run.results.filter(function (r) { return r.correct; }).length;
    var total = run.results.length;
    var title = right >= total - 1 ? 'Super gemacht!' : right >= total * 0.6 ? 'Gut gemacht!' : 'Weiter so!';
    var stars = run.results.map(function (r) {
      return '<svg viewBox="0 0 100 100" aria-hidden="true"><polygon class="' + (r.correct ? 'on' : 'off') + '" points="' + starPath(50, 53, 47, 21) + '"/></svg>';
    }).join('');
    var lines = '';
    if (run.promoted) {
      lines += '<div class="panel"><b>' + run.promoted + (run.promoted === 1 ? ' Aufgabe ist' : ' Aufgaben sind') + ' eine Stufe höher gerutscht.</b></div>';
    }
    if (run.missed.length) {
      lines += '<div class="panel"><div class="panel-label">Die üben wir noch</div><div class="fact-chips">' +
        run.missed.map(function (k) { var f = k.split('x'); return '<span class="fact-chip">' + f[0] + ' × ' + f[1] + ' = ' + f[0] * f[1] + '</span>'; }).join('') +
        '</div></div>';
    }
    if (run.suggest && run.suggest.length) {
      var names = run.suggest.map(function (r) { return 'die ' + r + 'er-Reihe'; });
      var list = names.length > 1 ? names.slice(0, -1).join(', ') + ' und ' + names[names.length - 1] : names[0];
      lines += '<div class="panel parent-box"><div class="panel-label">Für Eltern</div>' +
        '<p>' + list.charAt(0).toUpperCase() + list.slice(1) + ' ' + (names.length > 1 ? 'klappen' : 'klappt') +
        ' in zwei Übungen hintereinander zu mindestens 90 %. Ab jetzt mit „' + LEVELS[run.level + 1].name + '“ üben?</p>' +
        '<div class="btn-row">' + holdButton('levelUp', 'Ja – gedrückt halten') +
        '<button class="btn" data-act="dismissSuggest">Noch nicht</button></div></div>';
    } else if (S.toast) {
      lines += '<p class="toast">' + S.toast + '</p>';
    }
    return '<section class="screen reward narrow">' +
      '<div class="trophy">' + star() + '<b>' + right + '</b></div>' +
      '<h1>' + title + '</h1>' +
      '<p class="hint-line">' + right + ' von ' + total + ' Karten auf Anhieb richtig</p>' +
      '<div class="star-row">' + stars + '</div>' +
      '<div class="summary">' + lines +
      '<div class="btn-row"><button class="btn primary big" data-act="start">Nochmal</button>' +
      '<button class="btn big" data-act="go" data-to="home">Fertig</button></div></div></section>';
  }

  // ---------------------------------------------------------------- progress grid
  function viewProgress() {
    var cells = '<span class="h">×</span>';
    for (var c = 1; c <= 10; c++) cells += '<span class="h">' + c + '</span>';
    for (var a = 1; a <= 10; a++) {
      cells += '<span class="h">' + a + '</span>';
      for (var b = 1; b <= 10; b++) {
        var sel = S.sel && S.sel.a === a && S.sel.b === b ? ' sel' : '';
        cells += '<button class="cell bx' + shade(a, b) + sel + '" data-act="cell" data-a="' + a + '" data-b="' + b + '" aria-label="' + a + ' mal ' + b + '">' + a * b + '</button>';
      }
    }
    var all = L.factsFor(L.ORDER);
    var detail = '<span class="hint-line">Tippe ein Feld an, um mehr zu sehen.</span>';
    if (S.sel) {
      var st = stat(S.sel.a, S.sel.b);
      var sh = shade(S.sel.a, S.sel.b);
      detail = '<b>' + S.sel.a + ' × ' + S.sel.b + ' = ' + S.sel.a * S.sel.b + '</b><span class="hint-line">' +
        (sh ? 'Stufe ' + st.box + ' · ' + st.right + '× richtig · ' + st.wrong + '× falsch · ' + st.hints + '× mit Tipp' : 'Noch nicht geübt') + '</span>';
    }
    var legend = [['bx0', 'neu'], ['bx1', '1'], ['bx2', '2'], ['bx3', '3'], ['bx4', '4'], ['bx5', '5 · sitzt']].map(function (l) {
      return '<span><i class="' + l[0] + '"></i>' + l[1] + '</span>';
    }).join('');
    var reihen = L.ORDER.map(function (r) {
      var f = L.factsFor([r]);
      return '<div class="reihe-row"><span>' + r + 'er</span>' + boxMeter(f) + '<small>' + known(f) + '/' + f.length + '</small></div>';
    }).join('');
    var last = data.sessions[data.sessions.length - 1];
    return '<section class="screen narrow">' +
      '<header class="page-head"><button class="btn icon" data-act="go" data-to="home" aria-label="Zurück">' + ICON.back + '</button><h1>Fortschritt</h1></header>' +
      '<div class="stats"><span><b>' + known(all) + '</b> von 100 sitzen</span><span><b>' + data.sessions.length + '</b> Übungen</span>' +
      (last ? '<span>zuletzt ' + new Date(last.t).toLocaleDateString('de-DE') + '</span>' : '') +
      '<span>Stufe: ' + LEVELS[data.level].name + '</span></div>' +
      '<div class="grid-wrap"><div class="grid">' + cells + '</div></div>' +
      '<div class="legend">' + legend + '</div>' +
      '<div class="panel detail">' + detail + '</div>' +
      '<div><h2 class="section-title">Reihen (sitzt = Stufe 4 oder 5)</h2><div class="reihen">' + reihen + '</div></div>' +
      '</section>';
  }

  // ---------------------------------------------------------------- parents
  function seg(action, options, current) {
    return '<div class="seg">' + options.map(function (o) {
      return '<button class="btn" data-act="' + action + '" data-v="' + o[0] + '" aria-pressed="' + (String(o[0]) === String(current)) + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  function viewParents() {
    var head = '<header class="page-head"><button class="btn icon" data-act="go" data-to="home" aria-label="Zurück">' + ICON.back + '</button><h1>Für Eltern</h1></header>';
    if (!S.gate) {
      return '<section class="screen narrow">' + head + '<div class="screen gate">' +
        '<p>Hier stellen Eltern die Übung ein.</p>' + holdButton('unlock', 'Zum Öffnen 2 Sekunden gedrückt halten') + '</div></section>';
    }
    var voiceInfo = !('speechSynthesis' in window)
      ? 'Dieser Browser kann nicht vorlesen.'
      : Voice.voice ? 'Stimme: ' + Voice.voice.name : 'Keine deutsche Stimme gefunden. Vorlesen klingt dann evtl. englisch – in den Geräte-Einstellungen lässt sich eine deutsche Stimme laden.';
    return '<section class="screen narrow">' + head + '<div class="settings">' +
      '<div class="panel setting"><h2>Hilfestufe</h2>' + seg('setLevel', [[1, 'Viel Hilfe'], [2, 'Wenig Hilfe'], [3, 'Keine Hilfe']], data.level) +
      '<p>Mit „Viel Hilfe“ (Auswahl aus 4 Antworten) steigt eine Aufgabe höchstens bis Stufe ' + L.MAX_BOX_BY_LEVEL[1] + '. Grün wird sie erst, wenn sie ohne Tipp eingetippt wird. Ein Tipp ist erlaubt, die Aufgabe bleibt dann auf ihrer Stufe und kommt öfter dran.</p></div>' +
      '<div class="panel setting"><h2>Zeitlimit bei „Keine Hilfe“</h2>' + seg('setTimer', TIMERS.map(function (t) { return [t, t ? t + ' s' : 'Aus']; }), data.settings.timer) +
      '<p>Ein ruhiger Balken zeigt die Zeit. Ist sie um, wird die Lösung gezeigt und die Aufgabe kommt noch einmal.</p></div>' +
      '<div class="panel setting"><h2>Vorlesen</h2>' + seg('setVoice', [['1', 'An'], ['0', 'Aus']], data.settings.voice ? '1' : '0') +
      '<p>' + voiceInfo + '</p><div><button class="btn" data-act="testVoice">' + ICON.speaker + 'Probe hören</button></div></div>' +
      '<div class="panel setting"><h2>Töne</h2>' + seg('setSound', [['1', 'An'], ['0', 'Aus']], data.settings.sound ? '1' : '0') + '</div>' +
      '<div class="panel setting"><h2>Fortschritt löschen</h2><p>Setzt alle 100 Aufgaben auf „neu“ zurück. Das lässt sich nicht rückgängig machen.</p>' +
      holdButton('reset', 'Alles löschen – gedrückt halten', 'danger') +
      (S.toast ? '<p class="toast">' + S.toast + '</p>' : '') + '</div>' +
      '</div></section>';
  }

  // ---------------------------------------------------------------- render + events
  function render() {
    var views = { home: viewHome, practice: viewPractice, reward: viewReward, progress: viewProgress, parents: viewParents };
    app.innerHTML = views[S.screen]();
  }

  function go(to) {
    stopTimer();
    if (S.run) clearTimeout(S.run.autoNext);
    if (to !== 'parents') S.gate = false;
    S.screen = to;
    S.sel = null;
    S.toast = '';
    render();
    window.scrollTo(0, 0);
  }

  var actions = {
    go: function (el) { go(el.dataset.to); },
    level: function (el) { data.level = Number(el.dataset.n); save(); render(); },
    mixed: function () { data.reihen = L.ORDER.slice(); save(); render(); },
    reihe: function (el) {
      var n = Number(el.dataset.n);
      if (allReihen()) data.reihen = [n];
      else if (data.reihen.indexOf(n) >= 0) {
        if (data.reihen.length > 1) data.reihen = data.reihen.filter(function (r) { return r !== n; });
      } else data.reihen = data.reihen.concat(n);
      save();
      render();
    },
    start: function () { S.toast = ''; startSession(); window.scrollTo(0, 0); },
    askExit: function () {
      S.run.confirmExit = true;
      S.run.enter = false;
      render();
      setTimeout(function () {
        if (S.run && S.run.confirmExit && S.screen === 'practice') { S.run.confirmExit = false; render(); }
      }, 3000);
    },
    exit: function () { go('home'); },
    choose: function (el) { answer(Number(el.dataset.v)); },
    digit: function (el) {
      var run = S.run;
      if (run.state !== 'ask' || run.input.length >= 3) return;
      run.input = (run.input + el.dataset.v).replace(/^0+(?=\d)/, '');
      run.enter = false;
      render();
    },
    del: function () { S.run.input = S.run.input.slice(0, -1); S.run.enter = false; render(); },
    submit: function () { if (S.run.input) answer(Number(S.run.input)); },
    hint: function () {
      var run = S.run;
      if (run.hint >= 2 || run.state !== 'ask') return;
      run.hint++;
      run.enter = false;
      if (run.hint === 1) Voice.say(T.speakable(T.maskTip(T.tip(run.card.a, run.card.b), run.card.a, run.card.b)));
      render();
    },
    row: function (el) {
      var run = S.run;
      var i = Number(el.dataset.i);
      run.counted = run.counted === i + 1 ? i : i + 1;
      run.enter = false;
      if (run.counted) Voice.say(String(run.counted * run.card.b));
      render();
    },
    sayTip: function () {
      var run = S.run;
      var t = T.tip(run.card.a, run.card.b);
      Voice.say(T.speakable(run.state === 'ask' ? T.maskTip(t, run.card.a, run.card.b) : t));
    },
    sayProblem: function () {
      var c = S.run.card;
      Voice.say(S.run.state === 'ask' ? c.a + ' mal ' + c.b : c.a + ' mal ' + c.b + ' ist ' + c.a * c.b);
    },
    next: next,
    dismissSuggest: function () { S.run.suggest = []; render(); },
    cell: function (el) { S.sel = { a: Number(el.dataset.a), b: Number(el.dataset.b) }; render(); },
    setLevel: function (el) { data.level = Number(el.dataset.v); save(); render(); },
    setTimer: function (el) { data.settings.timer = Number(el.dataset.v); save(); render(); },
    setVoice: function (el) { data.settings.voice = el.dataset.v === '1'; save(); render(); },
    setSound: function (el) { data.settings.sound = el.dataset.v === '1'; save(); render(); },
    testVoice: function () { Voice.say('3 mal 4 ist 12. Super gemacht!'); }
  };

  var holdActions = {
    unlock: function () { S.gate = true; render(); },
    levelUp: function () {
      data.level = Math.min(3, S.run.level + 1);
      S.run.suggest = [];
      S.toast = 'Ab jetzt: ' + LEVELS[data.level].name + '.';
      save();
      render();
    },
    reset: function () {
      var keep = data.settings;
      data = defaults();
      data.settings = keep;
      save();
      S.toast = 'Der Fortschritt wurde gelöscht.';
      render();
    }
  };

  app.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || el.disabled || !actions[el.dataset.act]) return;
    actions[el.dataset.act](el);
  });

  // Hold-to-confirm buttons (parent gate, level change, reset).
  var HOLD_MS = 1800;
  var hold = null;
  function holdStart(el) {
    holdCancel();
    var t0 = performance.now();
    hold = { el: el, raf: 0 };
    var step = function (now) {
      if (!hold) return;
      var p = Math.min(1, (now - t0) / HOLD_MS);
      el.style.setProperty('--p', p);
      if (p >= 1) {
        var name = el.dataset.hold;
        hold = null;
        holdActions[name]();
        return;
      }
      hold.raf = requestAnimationFrame(step);
    };
    hold.raf = requestAnimationFrame(step);
  }
  function holdCancel() {
    if (!hold) return;
    cancelAnimationFrame(hold.raf);
    hold.el.style.setProperty('--p', 0);
    hold = null;
  }
  app.addEventListener('pointerdown', function (e) {
    var el = e.target.closest('[data-hold]');
    if (el) { e.preventDefault(); holdStart(el); }
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
    app.addEventListener(ev, function (e) {
      if (hold && (ev !== 'pointerleave' || e.target === hold.el)) holdCancel();
    }, true);
  });
  app.addEventListener('contextmenu', function (e) { if (e.target.closest('[data-hold]')) e.preventDefault(); });

  document.addEventListener('keydown', function (e) {
    var el = document.activeElement && document.activeElement.closest && document.activeElement.closest('[data-hold]');
    if (el && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      if (!e.repeat) holdStart(el);
      return;
    }
    if (S.screen !== 'practice' || !S.run) {
      if (e.key === 'Escape' && S.screen !== 'home') go('home');
      return;
    }
    var run = S.run;
    if (run.state !== 'ask') {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next(); }
      return;
    }
    if (run.level === 1) {
      var n = Number(e.key);
      if (n >= 1 && n <= 4) answer(run.options[n - 1]);
      return;
    }
    if (/^[0-9]$/.test(e.key)) actions.digit({ dataset: { v: e.key } });
    else if (e.key === 'Backspace') actions.del();
    else if (e.key === 'Enter') { e.preventDefault(); actions.submit(); }
  });
  document.addEventListener('keyup', function (e) {
    if (e.key === 'Enter' || e.key === ' ') holdCancel();
  });

  render();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* offline cache is optional */ });
  }
})();
