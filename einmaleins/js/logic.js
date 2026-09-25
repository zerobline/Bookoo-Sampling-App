/*
 * Practice logic: facts, Leitner boxes, session building, answer options,
 * and the "move up a help level" suggestion. Pure functions, no DOM.
 */
(function (root) {
  'use strict';

  var ORDER = [1, 10, 2, 5, 4, 9, 3, 6, 8, 7];
  var SESSION_SIZE = 15;
  var MAX_BOX = 5;
  // Draw weight per box: low boxes come up far more often.
  var BOX_WEIGHT = { 1: 8, 2: 5, 3: 3, 4: 2, 5: 1 };
  // Multiple choice with all help visible can lift a fact only this far;
  // the green boxes need an answer typed from memory.
  var MAX_BOX_BY_LEVEL = { 1: 2, 2: 5, 3: 5 };
  var LEVEL_UP_THRESHOLD = 0.9;
  var MIN_FACTS_PER_REIHE = 3;
  var MAX_REPEATS = 2;
  var REPEAT_GAP = 3;

  function key(a, b) {
    return a + 'x' + b;
  }

  // All facts of the chosen Reihen, including swapped ones (3 × 8 and 8 × 3).
  function factsFor(reihen) {
    var seen = {};
    var out = [];
    reihen.forEach(function (r) {
      for (var n = 1; n <= 10; n++) {
        [[n, r], [r, n]].forEach(function (f) {
          var k = key(f[0], f[1]);
          if (!seen[k]) {
            seen[k] = true;
            out.push({ a: f[0], b: f[1] });
          }
        });
      }
    });
    return out;
  }

  function newStat() {
    return { box: 1, seen: 0, right: 0, wrong: 0, hints: 0 };
  }

  function statOf(facts, a, b) {
    return facts[key(a, b)] || newStat();
  }

  // Leitner update: correct without hint -> up one box (capped by level),
  // correct with hint -> stay, wrong -> back to box 1.
  function applyAnswer(stat, correct, usedHint, level) {
    var s = Object.assign(newStat(), stat);
    s.seen += 1;
    if (usedHint) s.hints += 1;
    if (!correct) {
      s.wrong += 1;
      s.box = 1;
      return s;
    }
    s.right += 1;
    if (!usedHint) {
      var cap = MAX_BOX_BY_LEVEL[level] || MAX_BOX;
      if (s.box < cap) s.box += 1;
    }
    return s;
  }

  // Weighted draw without replacement; no fact directly after its own swap.
  function buildSession(pool, facts, size, rng) {
    size = size || SESSION_SIZE;
    rng = rng || Math.random;
    var left = pool.slice();
    var out = [];
    while (out.length < size && left.length) {
      var prev = out[out.length - 1];
      var candidates = left.filter(function (f) {
        return !prev || !(f.a === prev.b && f.b === prev.a);
      });
      if (!candidates.length) candidates = left;
      var total = 0;
      var weights = candidates.map(function (f) {
        var w = BOX_WEIGHT[statOf(facts, f.a, f.b).box];
        total += w;
        return w;
      });
      var r = rng() * total;
      var i = 0;
      while (i < candidates.length - 1 && r >= weights[i]) {
        r -= weights[i];
        i++;
      }
      var pick = candidates[i];
      out.push({ a: pick.a, b: pick.b, repeat: false });
      left.splice(left.indexOf(pick), 1);
    }
    return out;
  }

  // After a wrong answer, ask the same fact again a few cards later.
  function requeue(queue, index, card, repeats) {
    var k = key(card.a, card.b);
    if ((repeats[k] || 0) >= MAX_REPEATS) return false;
    repeats[k] = (repeats[k] || 0) + 1;
    var at = Math.min(queue.length, index + 1 + REPEAT_GAP);
    queue.splice(at, 0, { a: card.a, b: card.b, repeat: true });
    return true;
  }

  function shuffle(list, rng) {
    rng = rng || Math.random;
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = list[i];
      list[i] = list[j];
      list[j] = t;
    }
    return list;
  }

  // Four answer options: the product plus near-misses
  // (one row more/less, one column more/less, digits swapped), sorted.
  function choices(a, b, rng) {
    rng = rng || Math.random;
    var p = a * b;
    var picks = [];
    function add(v) {
      if (v > 0 && v !== p && picks.indexOf(v) < 0 && picks.length < 3) picks.push(v);
    }
    var s = String(p);
    if (s.length === 2 && s[0] !== s[1]) add(Number(s[1] + s[0]));
    var rowMiss = shuffle([(a + 1) * b, (a - 1) * b], rng);
    var colMiss = shuffle([a * (b + 1), a * (b - 1)], rng);
    add(rowMiss[0]);
    add(colMiss[0]);
    add(rowMiss[1]);
    add(colMiss[1]);
    [p + 1, p - 1, p + 2, p - 2, p + 10, p + 3].forEach(add);
    return picks.concat([p]).sort(function (x, y) { return x - y; });
  }

  // Which Reihen a fact counts toward (a × b is in the a- and the b-Reihe).
  function reihenOf(a, b) {
    return a === b ? [a] : [a, b];
  }

  // Per Reihe: correct (without hint) / total, from first attempts only.
  function reiheScores(results) {
    var scores = {};
    results.forEach(function (r) {
      reihenOf(r.a, r.b).forEach(function (n) {
        var s = scores[n] || (scores[n] = { right: 0, total: 0 });
        s.total += 1;
        if (r.correct && !r.hint) s.right += 1;
      });
    });
    return scores;
  }

  // Reihen that were >= 90 % correct over the last two sessions at this level.
  function levelUpReihen(sessions, level, candidates) {
    if (level >= 3) return [];
    return candidates.filter(function (r) {
      var recent = [];
      for (var i = sessions.length - 1; i >= 0 && recent.length < 2; i--) {
        var s = sessions[i];
        if (s.level !== level) continue;
        var score = reiheScores(s.results)[r];
        if (score && score.total >= MIN_FACTS_PER_REIHE) recent.push(score);
      }
      if (recent.length < 2) return false;
      var right = recent[0].right + recent[1].right;
      var total = recent[0].total + recent[1].total;
      return right / total >= LEVEL_UP_THRESHOLD;
    });
  }

  var api = {
    ORDER: ORDER,
    SESSION_SIZE: SESSION_SIZE,
    MAX_BOX_BY_LEVEL: MAX_BOX_BY_LEVEL,
    key: key,
    factsFor: factsFor,
    newStat: newStat,
    statOf: statOf,
    applyAnswer: applyAnswer,
    buildSession: buildSession,
    requeue: requeue,
    choices: choices,
    shuffle: shuffle,
    reihenOf: reihenOf,
    reiheScores: reiheScores,
    levelUpReihen: levelUpReihen
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Logic = api;
})(this);
