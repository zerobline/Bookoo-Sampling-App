/* Uhr lesen – app logic (screens, sessions, audio, local progress). */
(function () {
  'use strict';

  var Z = window.UhrZeit;
  var QUESTIONS = 10;
  var PROMOTE_SCORE = 8;
  var HELP_ORDER = ['keine', 'wenig', 'viel'];
  var STORE_KEY = 'uhr-lesen-v1';
  var STUFE_NAMES = { 1: 'volle Stunden', 2: 'halbe Stunden', 3: 'Viertelstunden', 4: '5-Minuten-Schritte', 5: 'jede Minute' };

  // ------------------------------------------------------------------
  // Storage (localStorage only, fails soft)
  // ------------------------------------------------------------------

  function defaults() {
    return {
      settings: { help: 'viel', stufe: 1, mode: 'leicht', region: 'standard', speech: true, sound: true, rate: 0.9 },
      stats: {},
      errorTypes: { hour: 0, minute: 0, direction: 0, other: 0 },
      history: [],
      suggestDismissedAt: -1
    };
  }

  function load() {
    var data = defaults();
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        for (var k in saved) data[k] = saved[k];
        data.settings = Object.assign(defaults().settings, saved.settings || {});
      }
    } catch (e) { /* private mode or blocked storage: start fresh */ }
    return data;
  }

  var store = load();

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* ignore */ }
  }

  function phraseOpts() { return { region: store.settings.region }; }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  var $ = function (id) { return document.getElementById(id); };

  function rand(n) { return Math.floor(Math.random() * n); }
  function pick(list) { return list[rand(list.length)]; }
  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = rand(i + 1), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function h12(h) { return Z.hour12(h); }
  function sameTime(a, b) { return a && b && h12(a.hour) === h12(b.hour) && a.minute === b.minute; }

  var SPEAKER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>';
  var STAR_PATH = 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z';

  function starSvg(kind) {
    var cls = kind === 'first' || kind === 'second' ? 'star-full' : kind === 'later' ? 'star-silver' : 'star-empty';
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="' + cls + '" d="' + STAR_PATH + '"/></svg>';
  }

  function show(screenId) {
    ['screen-start', 'screen-quiz', 'screen-reward', 'screen-parent'].forEach(function (id) {
      $(id).hidden = id !== screenId;
    });
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------------
  // Speech (Web Speech API, de-DE)
  // ------------------------------------------------------------------

  var voice = null;
  var synth = window.speechSynthesis;

  function pickVoice() {
    if (!synth) return;
    var voices = synth.getVoices() || [];
    var german = voices.filter(function (v) { return /^de([-_]|$)/i.test(v.lang); });
    voice = german.filter(function (v) { return /de[-_]DE/i.test(v.lang); })[0] || german[0] || null;
    updateVoiceNote();
  }
  if (synth) {
    pickVoice();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', pickVoice);
  }

  function speak(text, onEnd) {
    if (!synth || !store.settings.speech || !text) { if (onEnd) onEnd(); return; }
    try {
      synth.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'de-DE';
      if (voice) u.voice = voice;
      u.rate = store.settings.rate;
      if (onEnd) u.onend = onEnd;
      synth.speak(u);
    } catch (e) { if (onEnd) onEnd(); }
  }

  function updateVoiceNote() {
    var note = $('voice-note');
    if (!note) return;
    if (!synth) note.textContent = 'Dieser Browser kann nicht vorlesen.';
    else if (!voice) note.textContent = 'Keine deutsche Stimme gefunden. Unter Android/iOS kann man sie in den Systemeinstellungen (Sprachausgabe) laden.';
    else note.textContent = 'Stimme: ' + voice.name;
  }

  // ------------------------------------------------------------------
  // Sounds (Web Audio, no files)
  // ------------------------------------------------------------------

  var audioCtx = null;
  function tone(freq, start, dur, type, gain) {
    var ctx = audioCtx;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'triangle';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, ctx.currentTime + start);
    g.gain.linearRampToValueAtTime(gain || 0.18, ctx.currentTime + start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
    o.connect(g).connect(ctx.destination);
    o.start(ctx.currentTime + start);
    o.stop(ctx.currentTime + start + dur + 0.05);
  }
  function sound(kind) {
    if (!store.settings.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      if (kind === 'happy') [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.09, 0.28); });
      else if (kind === 'oops') { tone(392, 0, 0.22, 'sine', 0.12); tone(330, 0.16, 0.3, 'sine', 0.12); }
      else if (kind === 'fanfare') [523, 659, 784, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.12, 0.35); });
      else if (kind === 'tap') tone(880, 0, 0.06, 'sine', 0.06);
    } catch (e) { /* no audio */ }
  }

  // ------------------------------------------------------------------
  // Start screen
  // ------------------------------------------------------------------

  function bindPicker(groupId, key, parse) {
    var group = $(groupId);
    var buttons = Array.prototype.slice.call(group.querySelectorAll('.pick'));
    function refresh() {
      buttons.forEach(function (b) {
        b.setAttribute('aria-pressed', String(parse(b.dataset.value) === store.settings[key]));
      });
    }
    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        store.settings[key] = parse(b.dataset.value);
        save();
        refresh();
        sound('tap');
      });
    });
    refresh();
    return refresh;
  }

  var id = function (v) { return v; };
  var refreshPickers = [
    bindPicker('pick-help', 'help', id),
    bindPicker('pick-stufe', 'stufe', Number),
    bindPicker('pick-mode', 'mode', id)
  ];

  // Small preview clocks on the help buttons.
  Array.prototype.forEach.call(document.querySelectorAll('.mini-clock'), function (holder) {
    var c = UhrClock.create(holder, { onFaceTap: false });
    c.setHelp(holder.dataset.help);
    c.set({ hour: 3, minute: 15 });
    c.el.setAttribute('aria-hidden', 'true');
  });

  function refreshStart() {
    refreshPickers.forEach(function (f) { f(); });
    var s = suggestion();
    $('suggest-banner').hidden = !s;
    if (s) $('banner-text').textContent = 'Zweimal hintereinander ' + PROMOTE_SCORE + ' von 10! Weiter zu Stufe ' + s + ' (' + STUFE_NAMES[s] + ')?';
  }

  // ------------------------------------------------------------------
  // Session
  // ------------------------------------------------------------------

  var clock = UhrClock.create($('clock'), {
    onFaceTap: function (hour) { sound('tap'); },
    onChange: function () { if (session && session.mode === 'schwer') clearWrongMarks(); }
  });

  var session = null;

  function newMinutesFor(stufe) {
    var all = Z.STUFE_MINUTES[stufe];
    if (stufe === 1) return all;
    var prev = Z.STUFE_MINUTES[stufe - 1];
    return all.filter(function (m) { return prev.indexOf(m) === -1; });
  }

  function makeTimes(stufe) {
    var all = Z.STUFE_MINUTES[stufe];
    var fresh = newMinutesFor(stufe);
    var times = [];
    var guard = 0;
    while (times.length < QUESTIONS && guard++ < 500) {
      // Half of the questions practise what is new at this Stufe.
      var minute = times.length % 2 === 0 ? pick(fresh) : pick(all);
      var t = { hour: 1 + rand(12), minute: minute };
      var dup = times.some(function (o) { return sameTime(o, t); });
      if (dup && guard < 400) continue;
      times.push(t);
    }
    return shuffle(times);
  }

  function startSession() {
    var s = store.settings;
    session = {
      stufe: s.stufe, mode: s.mode, help: s.help,
      queue: makeTimes(s.stufe).map(function (t, i) { return { hour: t.hour, minute: t.minute, slot: i, reask: false }; }),
      results: new Array(QUESTIONS).fill(null),
      pos: -1,
      item: null,
      attempt: 0,
      done: false,
      startedAt: Date.now()
    };
    show('screen-quiz');
    nextQuestion();
  }

  function renderProgress(popSlot) {
    var ol = $('progress');
    ol.innerHTML = '';
    for (var i = 0; i < QUESTIONS; i++) {
      var li = document.createElement('li');
      li.innerHTML = starSvg(session.results[i]);
      if (session.item && session.item.slot === i && !session.done) li.classList.add('current');
      if (popSlot === i) li.classList.add('pop');
      ol.appendChild(li);
    }
    var solved = session.results.filter(Boolean).length;
    ol.setAttribute('aria-label', 'Fortschritt: ' + solved + ' von ' + QUESTIONS + ' Sternen');
  }

  function helpUp(level) {
    var i = HELP_ORDER.indexOf(level);
    return HELP_ORDER[Math.min(HELP_ORDER.length - 1, i + 1)];
  }

  function nextQuestion() {
    session.pos += 1;
    if (session.pos >= session.queue.length) return finishSession();
    var item = session.queue[session.pos];
    session.item = item;
    session.attempt = 0;
    session.done = false;
    session.phrases = Z.timeToPhrases(item.hour, item.minute, phraseOpts());

    clock.setHelp(session.help);
    clock.setHighlight(null);
    clock.clearHint();
    $('help-note').hidden = true;
    $('feedback').hidden = true;
    $('next-question').hidden = true;
    $('choices').hidden = true;
    $('tiles-wrap').hidden = true;
    $('set-wrap').hidden = true;
    renderProgress();

    var prompt = $('prompt-text');
    if (session.mode === 'schwer') {
      var start;
      do { start = { hour: 1 + rand(12), minute: pick(Z.STUFE_MINUTES[Math.max(session.stufe, 2)].filter(function (m) { return m % Z.STUFE_STEP[session.stufe] === 0; })) }; }
      while (sameTime(start, item));
      clock.set(start);
      clock.setInteractive(true, Z.STUFE_STEP[session.stufe]);
      prompt.innerHTML = 'Stell die Uhr auf:<span class="target"></span>';
      prompt.querySelector('.target').textContent = session.phrases.text;
      $('set-wrap').hidden = false;
      $('set-check').disabled = false;
      speak('Stell die Uhr auf ' + session.phrases.text);
    } else {
      clock.set(item);
      clock.setInteractive(false);
      prompt.textContent = item.reask ? 'Noch einmal: Wie spät ist es?' : 'Wie spät ist es?';
      if (session.mode === 'leicht') renderChoices();
      else renderTiles();
    }
  }

  function promptSpeech() {
    if (!session) return;
    if (session.mode === 'schwer') speak('Stell die Uhr auf ' + session.phrases.text);
    else if (session.mode === 'mittel') speak(buildText() || 'Wie spät ist es?');
    else speak('Wie spät ist es?');
  }

  // ---------- Leicht: 3 choices ----------

  /** Near-miss wrong answers: wrong hour, nach/vor swapped, halb confusion. */
  function distractors(item) {
    var h = h12(item.hour), m = item.minute;
    var cands = [];
    var add = function (hh, mm, prio) { cands.push({ hour: h12(hh), minute: mm, prio: prio }); };

    if (m === 0) { add(h - 1, 30, 1); add(h, 30, 2); add(h + 1, 0, 2); add(h - 1, 0, 3); }
    else if (m === 30) { add(h - 1, 30, 1); add(h, 0, 2); add(h + 1, 30, 2); add(h + 1, 0, 3); }
    else {
      // nach/vor swapped with the same spoken hour word.
      if (m < 25) add(h - 1, 60 - m, 1);
      else if (m > 35) add(h + 1, 60 - m, 1);
      else add(h, 60 - m, 1); // fünf vor halb <-> fünf nach halb
      // wrong hour (the classic "halb"-style off-by-one)
      add(h - 1, m, 1); add(h + 1, m, 2);
      // close minute
      if (session.stufe >= 4) { add(h, (m + 5) % 60, 3); add(h, (m + 55) % 60, 3); }
    }

    var seen = {};
    seen[Z.normalize(session.phrases.text)] = true;
    var out = [];
    shuffle(cands).sort(function (a, b) { return a.prio - b.prio; }).forEach(function (c) {
      if (sameTime(c, item)) return;
      var text = Z.timeToPhrase(c.hour, c.minute, phraseOpts());
      var key = Z.normalize(text);
      if (seen[key]) return;
      seen[key] = true;
      out.push({ hour: c.hour, minute: c.minute, text: text });
    });
    return out.slice(0, 2);
  }

  function renderChoices() {
    var item = session.item;
    var options = shuffle([{ hour: item.hour, minute: item.minute, text: session.phrases.text, right: true }].concat(distractors(item)));
    var box = $('choices');
    box.innerHTML = '';
    options.forEach(function (opt) {
      var row = document.createElement('div');
      row.className = 'choice';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice-btn';
      btn.textContent = opt.text;
      btn.addEventListener('click', function () {
        if (session.done || btn.disabled) return;
        if (opt.right) { btn.classList.add('right'); onCorrect(); }
        else {
          btn.classList.add('wrong', 'shake');
          btn.disabled = true;
          onWrong({ hour: opt.hour, minute: opt.minute });
        }
      });
      var sp = document.createElement('button');
      sp.type = 'button';
      sp.className = 'speak-btn';
      sp.setAttribute('aria-label', 'Vorlesen: ' + opt.text);
      sp.innerHTML = SPEAKER;
      sp.addEventListener('click', function () { speak(opt.text); });
      row.appendChild(btn);
      row.appendChild(sp);
      box.appendChild(row);
      opt.btn = btn;
    });
    session.options = options;
    box.hidden = false;
  }

  // ---------- Mittel: word tiles ----------

  function tileDistractors(item, words) {
    var h = h12(item.hour);
    var lower = words.map(function (w) { return w.toLowerCase(); });
    var extra = [];
    var hourWord = words[words.length - 1] === 'Uhr' ? words[words.length - 2] : words[words.length - 1];
    var hourNum = Z.HOUR_WORDS.lastIndexOf(hourWord === 'ein' ? 'eins' : hourWord);
    if (hourNum > 0) {
      var other = Z.HOUR_WORDS[h12(hourNum - 1)];
      if (words[words.length - 1] === 'Uhr') other = (h12(hourNum - 1) === 1 ? 'ein' : other);
      extra.push(other);
    }
    var nachWord = store.settings.region === 'ch' ? 'ab' : 'nach';
    if (lower.indexOf('nach') !== -1 || lower.indexOf('ab') !== -1) extra.push('vor');
    else if (lower.indexOf('vor') !== -1) extra.push(nachWord);
    if (lower.indexOf('halb') === -1) extra.push('halb');
    else if (lower.indexOf('uhr') === -1) extra.push('Uhr');
    if (item.minute === 0 && extra.indexOf('nach') === -1) extra.push(nachWord);
    return extra.filter(function (w) { return lower.indexOf(w.toLowerCase()) === -1; }).slice(0, 3);
  }

  function renderTiles() {
    var words = session.phrases.text.split(' ');
    var all = shuffle(words.concat(tileDistractors(session.item, words)));
    session.built = [];
    var tiles = $('tiles');
    tiles.innerHTML = '';
    all.forEach(function (word, i) {
      var t = document.createElement('button');
      t.type = 'button';
      t.className = 'tile';
      t.textContent = word;
      t.dataset.idx = String(i);
      t.addEventListener('click', function () {
        if (session.done || t.classList.contains('used')) return;
        t.classList.add('used');
        session.built.push({ word: word, src: t });
        speak(word);
        renderBuild();
      });
      tiles.appendChild(t);
    });
    renderBuild();
    $('tiles-wrap').hidden = false;
  }

  function buildText() {
    return (session.built || []).map(function (b) { return b.word; }).join(' ');
  }

  function renderBuild() {
    var box = $('build');
    box.innerHTML = '';
    box.classList.remove('wrong', 'right');
    if (!session.built.length) {
      box.innerHTML = '<span class="build-empty">Tippe die Wörter an</span>';
    }
    session.built.forEach(function (b, i) {
      var t = document.createElement('button');
      t.type = 'button';
      t.className = 'tile';
      t.textContent = b.word;
      t.setAttribute('aria-label', b.word + ' zurücklegen');
      t.addEventListener('click', function () {
        if (session.done) return;
        b.src.classList.remove('used');
        session.built.splice(i, 1);
        renderBuild();
      });
      box.appendChild(t);
    });
    $('build-check').disabled = !session.built.length || session.done;
  }

  $('build-clear').addEventListener('click', function () {
    if (!session || session.done) return;
    session.built.forEach(function (b) { b.src.classList.remove('used'); });
    session.built = [];
    renderBuild();
  });
  $('build-speak').addEventListener('click', function () {
    if (session) speak(buildText() || 'Wie spät ist es?');
  });
  $('build-check').addEventListener('click', function () {
    if (!session || session.done) return;
    var text = buildText();
    var item = session.item;
    if (Z.isCorrect(text, item.hour, item.minute, phraseOpts())) {
      $('build').classList.add('right');
      onCorrect();
    } else {
      var box = $('build');
      box.classList.remove('shake');
      void box.offsetWidth;
      box.classList.add('wrong', 'shake');
      onWrong(Z.phraseToTime(text, phraseOpts()));
    }
  });

  // ---------- Schwer: set the hands ----------

  function clearWrongMarks() {
    clock.setHighlight(null);
  }

  $('set-check').addEventListener('click', function () {
    if (!session || session.done) return;
    var t = clock.get();
    if (sameTime(t, session.item)) onCorrect();
    else onWrong(t);
  });

  // ---------- evaluation ----------

  /** Which hand was misread, and what kind of mistake was it? */
  function diagnose(given, item) {
    if (!given) return { hour: true, minute: true, type: 'other' };
    var hourWrong = h12(given.hour) !== h12(item.hour);
    var minuteWrong = given.minute !== item.minute;
    var type = 'other';
    if (minuteWrong && item.minute !== 0 && item.minute !== 30 && given.minute === 60 - item.minute) type = 'direction';
    else if (hourWrong && !minuteWrong) type = 'hour';
    else if (minuteWrong && !hourWrong) type = 'minute';
    return { hour: hourWrong, minute: minuteWrong || type === 'direction', type: type };
  }

  function recordFirstAttempt(correct, diag) {
    if (session.item.reask) return; // re-asks are practice, not stats
    var cat = Z.categoryOf(session.item.minute);
    var s = store.stats[cat] || (store.stats[cat] = { asked: 0, wrong: 0 });
    s.asked += 1;
    if (!correct) {
      s.wrong += 1;
      store.errorTypes[diag.type] = (store.errorTypes[diag.type] || 0) + 1;
    }
    save();
  }

  function setFeedback(kind, html) {
    var fb = $('feedback');
    fb.hidden = false;
    fb.className = 'feedback ' + kind;
    $('feedback-msg').innerHTML = html;
  }

  function esc(text) {
    var d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  var PRAISE = ['Super!', 'Richtig!', 'Toll gemacht!', 'Genau!', 'Klasse!', 'Prima!'];

  function onCorrect() {
    var item = session.item;
    if (session.attempt === 0) recordFirstAttempt(true);
    session.done = true;
    var slot = item.slot;
    var kind = item.reask ? 'later' : session.attempt === 0 ? 'first' : 'second';
    if (!session.results[slot]) session.results[slot] = kind;
    else if (session.results[slot] === 'missed') session.results[slot] = 'later';
    renderProgress(slot);
    clock.setInteractive(false);
    clock.setHighlight(null);
    sound('happy');
    var praise = pick(PRAISE);
    setFeedback('good', esc(praise) + '<span class="say">' + esc(session.phrases.text) + '</span>');
    lockAnswers();
    $('next-question').hidden = false;
    $('next-question').focus({ preventScroll: true });
    var said = praise + ' ' + session.phrases.text;
    var asked = session.item;
    setTimeout(function () { if (session && session.item === asked) speak(said); }, 350);
  }

  function onWrong(given) {
    var item = session.item;
    var diag = diagnose(given, item);
    if (session.attempt === 0) recordFirstAttempt(false, diag);
    session.attempt += 1;
    sound('oops');

    if (session.attempt === 1) {
      // First miss: one more help level, highlight the misread hand, try again.
      var level = helpUp(session.help);
      clock.setHelp(level);
      clock.setHighlight({ hour: diag.hour, minute: diag.minute });
      if (level !== session.help) {
        var note = $('help-note');
        note.hidden = false;
        note.textContent = level === 'viel' ? 'Jetzt mit mehr Hilfe an der Uhr' : 'Jetzt mit Zahlen an der Uhr';
      }
      var hint;
      if (diag.hour && diag.minute) hint = 'Schau dir beide Zeiger genau an.';
      else if (diag.hour) hint = 'Schau auf den kleinen roten Zeiger.';
      else hint = 'Schau auf den großen blauen Zeiger.';
      if (diag.type === 'direction') hint = 'Ist es „nach“ oder „vor“? Schau auf den großen blauen Zeiger.';
      if (session.mode === 'schwer') hint = hint.replace('Schau auf', 'Prüfe').replace('Schau dir', 'Prüfe').replace(' genau an', '');
      setFeedback('oops', 'Fast! ' + esc(hint));
      speak('Fast! ' + hint);
      return;
    }

    // Second miss: show and say the answer, no penalty, ask again later.
    session.done = true;
    if (!session.results[item.slot]) session.results[item.slot] = 'missed';
    if (!item.reask) {
      var at = Math.min(session.queue.length, session.pos + 3);
      session.queue.splice(at, 0, { hour: item.hour, minute: item.minute, slot: item.slot, reask: true });
    }
    clock.setInteractive(false);
    clock.setHighlight(null);
    lockAnswers(true);
    var say = session.phrases.text;
    setFeedback('oops', 'So heißt es:<span class="say">' + esc(say) + '</span>' +
      (item.reask ? '' : '<small>Die Uhrzeit kommt gleich noch einmal.</small>'));
    if (session.mode === 'schwer') clock.animateTo(item.hour, item.minute);
    speak('So heißt es: ' + say);
    renderProgress();
    $('next-question').hidden = false;
  }

  function lockAnswers(revealRight) {
    if (session.mode === 'leicht' && session.options) {
      session.options.forEach(function (o) {
        o.btn.disabled = true;
        if (revealRight && o.right) o.btn.classList.add('right');
      });
    }
    if (session.mode === 'mittel') {
      $('build-check').disabled = true;
      if (revealRight) $('build').classList.remove('wrong');
    }
    if (session.mode === 'schwer') $('set-check').disabled = true;
  }

  $('next-question').addEventListener('click', function () {
    if (synth) synth.cancel();
    nextQuestion();
  });
  $('prompt-speak').innerHTML = SPEAKER;
  $('prompt-speak').addEventListener('click', promptSpeech);

  $('quit-session').addEventListener('click', function () {
    if (synth) synth.cancel();
    session = null;
    refreshStart();
    show('screen-start');
  });

  // ------------------------------------------------------------------
  // End of session, progression
  // ------------------------------------------------------------------

  function finishSession() {
    var r = session.results;
    var first = r.filter(function (x) { return x === 'first'; }).length;
    var stars = r.filter(function (x) { return x && x !== 'missed'; }).length;
    store.history.push({
      date: new Date().toISOString(),
      stufe: session.stufe, mode: session.mode, help: session.help,
      firstTry: first, stars: stars, total: QUESTIONS,
      minutes: Math.max(1, Math.round((Date.now() - session.startedAt) / 60000))
    });
    if (store.history.length > 200) store.history = store.history.slice(-200);
    save();

    $('reward-stars').innerHTML = r.map(function (x, i) {
      return starSvg(x).replace('<svg ', '<svg style="animation-delay:' + (i * 0.12) + 's" ');
    }).join('');
    var title = stars >= 9 ? 'Super gemacht!' : stars >= 6 ? 'Toll gemacht!' : 'Gut geübt!';
    $('reward-title').textContent = title;
    $('reward-text').textContent = stars + ' von ' + QUESTIONS + ' Sternen gesammelt.';
    sound('fanfare');
    speak(title + ' Du hast ' + stars + ' Sterne gesammelt.');

    var next = suggestion();
    var card = $('suggest-card');
    if (next) {
      card.hidden = false;
      $('suggest-text').textContent = 'Zweimal hintereinander ' + PROMOTE_SCORE + ' von 10 beim ersten Versuch! Weiter zu Stufe ' + next + ' (' + STUFE_NAMES[next] + ')?';
    } else card.hidden = true;

    session = null;
    show('screen-reward');
  }

  /** Next Stufe to suggest, or 0. */
  function suggestion() {
    var h = store.history;
    if (h.length < 2 || store.suggestDismissedAt >= h.length - 1) return 0;
    var a = h[h.length - 1], b = h[h.length - 2];
    var cur = store.settings.stufe;
    if (a.stufe !== cur || b.stufe !== cur || cur >= 5) return 0;
    if (a.firstTry >= PROMOTE_SCORE && b.firstTry >= PROMOTE_SCORE) return cur + 1;
    return 0;
  }

  // Hold-to-confirm button used as a simple parent gate.
  function holdButton(btn, onDone, ms) {
    ms = ms || 1600;
    var timer = null;
    function start(evt) {
      evt.preventDefault();
      btn.classList.add('holding');
      timer = setTimeout(function () {
        btn.classList.remove('holding');
        timer = null;
        onDone();
      }, ms);
    }
    function stop() {
      if (timer) clearTimeout(timer);
      timer = null;
      btn.classList.remove('holding');
    }
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    btn.addEventListener('keydown', function (e) { if ((e.key === ' ' || e.key === 'Enter') && !timer && !e.repeat) start(e); });
    btn.addEventListener('keyup', function (e) { if (e.key === ' ' || e.key === 'Enter') stop(); });
  }

  function acceptSuggestion() {
    var next = suggestion();
    if (!next) return 0;
    store.settings.stufe = next;
    store.suggestDismissedAt = store.history.length - 1;
    save();
    sound('happy');
    return next;
  }
  function dismissSuggestion() {
    store.suggestDismissedAt = store.history.length - 1;
    save();
  }

  holdButton($('suggest-yes'), function () {
    var next = acceptSuggestion();
    $('suggest-card').hidden = true;
    if (next) $('reward-text').textContent = 'Ab jetzt: Stufe ' + next + ' – ' + STUFE_NAMES[next] + '.';
  });
  $('suggest-no').addEventListener('click', function () {
    dismissSuggestion();
    $('suggest-card').hidden = true;
  });
  holdButton($('banner-yes'), function () { acceptSuggestion(); refreshStart(); });
  $('banner-no').addEventListener('click', function () { dismissSuggestion(); refreshStart(); });

  $('again').addEventListener('click', startSession);
  $('to-start').addEventListener('click', function () { refreshStart(); show('screen-start'); });
  $('start-session').addEventListener('click', function () {
    sound('tap'); // unlocks audio on iOS from a user gesture
    startSession();
  });

  // ------------------------------------------------------------------
  // Parent view
  // ------------------------------------------------------------------

  var MODE_NAMES = { leicht: 'Leicht', mittel: 'Mittel', schwer: 'Schwer' };
  var HELP_NAMES = { viel: 'viel', wenig: 'wenig', keine: 'keine' };
  var ERROR_NAMES = { hour: 'Stunde falsch', minute: 'Minuten falsch', direction: '„nach“ und „vor“ vertauscht', other: 'Sonstiges' };

  function renderParent() {
    var rows = Object.keys(Z.CATEGORY_LABELS).map(function (cat) {
      var s = store.stats[cat] || { asked: 0, wrong: 0 };
      return { cat: cat, asked: s.asked, wrong: s.wrong, rate: s.asked ? s.wrong / s.asked : 0 };
    }).filter(function (r) { return r.asked > 0; })
      .sort(function (a, b) { return b.rate - a.rate || b.wrong - a.wrong; });

    var table = $('stats-table');
    if (!rows.length) {
      table.innerHTML = '<p class="panel-note">Noch keine Daten. Nach der ersten Runde steht hier, welche Uhrzeiten schwerfallen.</p>';
    } else {
      table.innerHTML = rows.map(function (r) {
        var pct = Math.round(r.rate * 100);
        return '<div class="stat-row"><span class="stat-name">' + esc(Z.CATEGORY_LABELS[r.cat]) + '</span>' +
          '<span class="stat-nums">' + r.wrong + ' / ' + r.asked + ' falsch</span>' +
          '<span class="stat-bar" aria-hidden="true"><span style="width:' + pct + '%"></span></span></div>';
      }).join('');
    }

    var et = store.errorTypes;
    var types = Object.keys(ERROR_NAMES).filter(function (k) { return et[k]; });
    $('error-types').innerHTML = types.length
      ? '<p class="panel-note">Art der Fehler:</p><div class="chips">' + types.map(function (k) {
        return '<span class="chip">' + esc(ERROR_NAMES[k]) + ': ' + et[k] + '</span>';
      }).join('') + '</div>'
      : '';

    var hist = store.history.slice(-10).reverse();
    $('history').innerHTML = hist.length
      ? '<div class="hist-wrap"><table class="hist"><thead><tr><th>Datum</th><th>Stufe</th><th>Antwort</th><th>Hilfe</th><th>1. Versuch</th><th>Sterne</th></tr></thead><tbody>' +
        hist.map(function (h) {
          var d = new Date(h.date);
          return '<tr><td>' + d.toLocaleDateString('de-DE') + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + '</td><td>' + h.stufe +
            '</td><td>' + MODE_NAMES[h.mode] + '</td><td>' + HELP_NAMES[h.help] + '</td><td>' + h.firstTry + ' / ' + h.total +
            '</td><td>' + h.stars + '</td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<p class="panel-note">Noch keine Runden gespielt.</p>';

    $('set-region').value = store.settings.region;
    $('set-speech').checked = !!store.settings.speech;
    $('set-sound').checked = !!store.settings.sound;
    $('set-rate').value = String(store.settings.rate);
    updateVoiceNote();
  }

  $('open-parent').addEventListener('click', function () {
    $('parent-gate').hidden = false;
    $('parent-body').hidden = true;
    show('screen-parent');
  });
  $('parent-close').addEventListener('click', function () { refreshStart(); show('screen-start'); });
  holdButton($('parent-unlock'), function () {
    $('parent-gate').hidden = true;
    $('parent-body').hidden = false;
    renderParent();
  });

  $('set-region').addEventListener('change', function (e) { store.settings.region = e.target.value; save(); });
  $('set-speech').addEventListener('change', function (e) { store.settings.speech = e.target.checked; save(); });
  $('set-sound').addEventListener('change', function (e) { store.settings.sound = e.target.checked; save(); });
  $('set-rate').addEventListener('change', function (e) {
    store.settings.rate = Number(e.target.value);
    save();
    speak('Viertel nach drei');
  });
  holdButton($('reset-progress'), function () {
    var keep = store.settings;
    store = defaults();
    store.settings = keep;
    save();
    renderParent();
  });

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------

  refreshStart();
  show('screen-start');

  // Offline cache when served over http(s). Not available everywhere; ignore failures.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    try { navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) { /* ignore */ }
  }
})();
