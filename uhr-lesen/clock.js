/*
 * Uhr lesen – SVG analog clock.
 *
 * UhrClock.create(container, { onChange, onFaceTap })
 *   .set({ hour, minute })                 hands
 *   .setHelp('viel' | 'wenig' | 'keine')   face detail
 *   .setHighlight({ hour, minute })        glow on misread hand(s)
 *   .setInteractive(bool, step)            drag hands (Schwer mode)
 *   .animateTo(hour, minute)               smooth move (show answer)
 *   .showHourHint()                        highlight passed hour number
 */
(function (root) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var QUARTER_LABELS = [
    { angle: 90, lines: ['Viertel', 'nach'] },
    { angle: 180, lines: ['halb'] },
    { angle: 270, lines: ['Viertel', 'vor'] }
  ];

  function el(name, attrs, parent) {
    var node = document.createElementNS(NS, name);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  function polar(angleDeg, r) {
    var a = (angleDeg - 90) * Math.PI / 180;
    return { x: +(r * Math.cos(a)).toFixed(2), y: +(r * Math.sin(a)).toFixed(2) };
  }

  function wedge(fromDeg, toDeg, r) {
    var a = polar(fromDeg, r), b = polar(toDeg, r);
    return 'M0 0 L' + a.x + ' ' + a.y + ' A' + r + ' ' + r + ' 0 0 1 ' + b.x + ' ' + b.y + ' Z';
  }

  function mod(n, m) { return ((n % m) + m) % m; }

  function create(container, opts) {
    opts = opts || {};
    var state = { hour: 12, minute: 0, help: 'viel', interactive: false, step: 5 };
    var drag = null;
    var anim = null;

    var svg = el('svg', {
      viewBox: '-110 -110 220 220', class: 'clock', role: 'img',
      'aria-label': 'Analoge Uhr'
    });
    var face = el('g', { class: 'clock-face' }, svg);
    var hint = el('g', { class: 'clock-hint' }, svg);
    var hands = el('g', { class: 'clock-hands' }, svg);

    var hourGlow = el('line', { x1: 0, y1: 8, x2: 0, y2: -50, class: 'hand-glow' }, hands);
    var minuteGlow = el('line', { x1: 0, y1: 10, x2: 0, y2: -82, class: 'hand-glow' }, hands);
    var hourHand = el('g', { class: 'hand hand-hour' }, hands);
    el('line', { x1: 0, y1: 10, x2: 0, y2: -50, class: 'hand-hit' }, hourHand);
    el('line', { x1: 0, y1: 8, x2: 0, y2: -48, class: 'hand-line' }, hourHand);
    var minuteHand = el('g', { class: 'hand hand-minute' }, hands);
    el('line', { x1: 0, y1: 12, x2: 0, y2: -84, class: 'hand-hit' }, minuteHand);
    el('line', { x1: 0, y1: 10, x2: 0, y2: -82, class: 'hand-line' }, minuteHand);
    el('circle', { r: 6, class: 'hand-cap' }, hands);
    el('circle', { r: 2, class: 'hand-cap-dot' }, hands);

    container.appendChild(svg);

    function drawFace() {
      face.textContent = '';
      svg.setAttribute('data-help', state.help);
      el('circle', { r: 104, class: 'rim' }, face);
      el('circle', { r: 100, class: 'dial' }, face);

      if (state.help === 'viel') {
        // Right half "nach" (green), left half "vor" (orange); quarters alternate.
        el('path', { d: wedge(0, 90, 81), class: 'q q-nach-1' }, face);
        el('path', { d: wedge(90, 180, 81), class: 'q q-nach-2' }, face);
        el('path', { d: wedge(180, 270, 81), class: 'q q-vor-2' }, face);
        el('path', { d: wedge(270, 360, 81), class: 'q q-vor-1' }, face);
        el('circle', { r: 81, class: 'minute-ring-edge' }, face);
        for (var i = 0; i < 60; i++) {
          var p1 = polar(i * 6, 81), p2 = polar(i * 6, i % 5 ? 84 : 86);
          el('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, class: i % 5 ? 'tick' : 'tick tick-5' }, face);
        }
        for (var m = 0; m < 60; m += 5) {
          var mp = polar(m * 6, 93);
          var mt = el('text', { x: mp.x, y: mp.y, class: 'minute-num' }, face);
          mt.textContent = String(m);
        }
        QUARTER_LABELS.forEach(function (q) {
          var p = polar(q.angle, 43);
          var t = el('text', { x: p.x, y: p.y - (q.lines.length - 1) * 4.2, class: 'quarter-label' }, face);
          q.lines.forEach(function (line, idx) {
            var span = el('tspan', { x: p.x, dy: idx ? 8.4 : 0 }, t);
            span.textContent = line;
          });
        });
      } else {
        for (var j = 0; j < 60; j++) {
          var big = j % 5 === 0;
          var a = polar(j * 6, big ? 86 : 91), b = polar(j * 6, 97);
          el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: big ? 'tick tick-5' : 'tick' }, face);
        }
      }

      if (state.help !== 'keine') {
        var r = state.help === 'viel' ? 67 : 72;
        for (var h = 1; h <= 12; h++) {
          var hp = polar(h * 30, r);
          var ht = el('text', { x: hp.x, y: hp.y, class: 'hour-num', 'data-hour': h }, face);
          ht.textContent = String(h);
        }
      }
    }

    function place(hour, minute) {
      var minuteAngle = minute * 6;
      var hourAngle = mod(hour, 12) * 30 + minute * 0.5;
      hourHand.setAttribute('transform', 'rotate(' + hourAngle + ')');
      hourGlow.setAttribute('transform', 'rotate(' + hourAngle + ')');
      minuteHand.setAttribute('transform', 'rotate(' + minuteAngle + ')');
      minuteGlow.setAttribute('transform', 'rotate(' + minuteAngle + ')');
    }

    function render() {
      place(state.hour, state.minute);
      var h12 = mod(state.hour, 12) || 12;
      svg.setAttribute('aria-label', 'Analoge Uhr, kleiner Zeiger bei ' + h12 +
        ', großer Zeiger bei Minute ' + state.minute);
    }

    function set(t) {
      stopAnim();
      state.hour = mod(t.hour, 12) || 12;
      state.minute = t.minute;
      clearHint();
      render();
    }

    function setHelp(level) {
      if (level === state.help && face.childNodes.length) return;
      state.help = level;
      drawFace();
    }

    function setHighlight(h) {
      h = h || {};
      hourGlow.classList.toggle('on', !!h.hour);
      minuteGlow.classList.toggle('on', !!h.minute);
    }

    function clearHint() { hint.textContent = ''; }

    function showHourHint() {
      clearHint();
      var passed = mod(state.hour, 12) || 12;
      var r = state.help === 'viel' ? 67 : 72;
      var p = polar(passed * 30, r);
      el('circle', { cx: p.x, cy: p.y, r: 12, class: 'hour-hint' }, hint);
    }

    // ---- dragging (Schwer) ----

    function pointerAngle(evt) {
      var box = svg.getBoundingClientRect();
      var dx = evt.clientX - (box.left + box.width / 2);
      var dy = evt.clientY - (box.top + box.height / 2);
      var dist = Math.sqrt(dx * dx + dy * dy) / (box.width / 2) * 110;
      return { angle: mod(Math.atan2(dx, -dy) * 180 / Math.PI, 360), dist: dist };
    }

    function angleGap(a, b) {
      var d = Math.abs(a - b) % 360;
      return d > 180 ? 360 - d : d;
    }

    function onDown(evt) {
      if (!state.interactive) {
        if (state.help === 'viel' && opts.onFaceTap !== false) {
          showHourHint();
          if (opts.onFaceTap) opts.onFaceTap(mod(state.hour, 12) || 12);
        }
        return;
      }
      evt.preventDefault();
      var p = pointerAngle(evt);
      var hourAngle = mod(state.hour, 12) * 30 + state.minute * 0.5;
      var minuteAngle = state.minute * 6;
      var target;
      if (evt.target.closest && evt.target.closest('.hand-hour')) target = 'hour';
      else if (evt.target.closest && evt.target.closest('.hand-minute')) target = 'minute';
      else {
        var gh = angleGap(p.angle, hourAngle), gm = angleGap(p.angle, minuteAngle);
        if (Math.abs(gh - gm) < 20) target = p.dist < 55 ? 'hour' : 'minute';
        else target = gh < gm ? 'hour' : 'minute';
      }
      drag = { target: target, turns: mod(state.hour, 12), raw: state.minute };
      svg.classList.add('dragging');
      svg.setPointerCapture && svg.setPointerCapture(evt.pointerId);
      onMove(evt);
    }

    function onMove(evt) {
      if (!drag) return;
      evt.preventDefault();
      var p = pointerAngle(evt);
      if (drag.target === 'minute') {
        var raw = p.angle / 6;
        if (drag.raw > 45 && raw < 15) drag.turns += 1;
        else if (drag.raw < 15 && raw > 45) drag.turns -= 1;
        drag.raw = raw;
        var total = Math.round((drag.turns * 60 + raw) / state.step) * state.step;
        state.hour = mod(Math.floor(total / 60), 12) || 12;
        state.minute = mod(total, 60);
      } else {
        var h = Math.round((p.angle - state.minute * 0.5) / 30);
        state.hour = mod(h, 12) || 12;
        drag.turns = mod(state.hour, 12);
        drag.raw = state.minute;
      }
      render();
      if (opts.onChange) opts.onChange({ hour: state.hour, minute: state.minute });
    }

    function onUp() {
      if (!drag) return;
      drag = null;
      svg.classList.remove('dragging');
    }

    function onKey(evt) {
      if (!state.interactive) return;
      var dm = 0, dh = 0;
      if (evt.key === 'ArrowUp' || evt.key === 'ArrowRight') dm = state.step;
      else if (evt.key === 'ArrowDown' || evt.key === 'ArrowLeft') dm = -state.step;
      else if (evt.key === 'PageUp' || evt.key === '+') dh = 1;
      else if (evt.key === 'PageDown' || evt.key === '-') dh = -1;
      else return;
      evt.preventDefault();
      var total = mod((mod(state.hour, 12) + dh) * 60 + state.minute + dm, 720);
      state.hour = Math.floor(total / 60) || 12;
      state.minute = total % 60;
      render();
      if (opts.onChange) opts.onChange({ hour: state.hour, minute: state.minute });
    }

    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
    svg.addEventListener('keydown', onKey);

    function setInteractive(on, step) {
      state.interactive = !!on;
      if (step) state.step = step;
      svg.classList.toggle('interactive', state.interactive);
      if (state.interactive) {
        svg.setAttribute('tabindex', '0');
        svg.setAttribute('role', 'slider');
      } else {
        svg.removeAttribute('tabindex');
        svg.setAttribute('role', 'img');
      }
    }

    function stopAnim() {
      if (anim) cancelAnimationFrame(anim);
      anim = null;
    }

    function animateTo(hour, minute, done) {
      stopAnim();
      var from = mod(state.hour, 12) * 60 + state.minute;
      var to = mod(hour, 12) * 60 + minute;
      var diff = mod(to - from + 360, 720) - 360; // shortest way round
      var reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var dur = reduce ? 0 : Math.min(1400, 300 + Math.abs(diff) * 3);
      var start = null;
      function step(ts) {
        if (start === null) start = ts;
        var t = dur ? Math.min(1, (ts - start) / dur) : 1;
        var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        var cur = from + diff * e;
        place(Math.floor(cur / 60), mod(cur, 60));
        if (t < 1) anim = requestAnimationFrame(step);
        else {
          anim = null;
          state.hour = mod(hour, 12) || 12;
          state.minute = minute;
          render();
          if (done) done();
        }
      }
      anim = requestAnimationFrame(step);
    }

    drawFace();
    render();

    return {
      el: svg,
      set: set,
      get: function () { return { hour: state.hour, minute: state.minute }; },
      setHelp: setHelp,
      setHighlight: setHighlight,
      setInteractive: setInteractive,
      animateTo: animateTo,
      showHourHint: showHourHint,
      clearHint: clearHint
    };
  }

  root.UhrClock = { create: create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
