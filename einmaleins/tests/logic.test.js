'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/logic.js');

function seeded(seed) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

test('factsFor includes swapped facts without duplicates', () => {
  const f3 = L.factsFor([3]);
  assert.equal(f3.length, 19);
  const keys = f3.map((f) => L.key(f.a, f.b));
  assert.ok(keys.includes('3x8') && keys.includes('8x3'));
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(L.factsFor(L.ORDER).length, 100);
});

test('Leitner: up without hint, stay with hint, back to 1 when wrong', () => {
  let s = L.newStat();
  s = L.applyAnswer(s, true, false, 3);
  assert.equal(s.box, 2);
  s = L.applyAnswer(s, true, true, 3);
  assert.equal(s.box, 2);
  assert.equal(s.hints, 1);
  s = L.applyAnswer(s, true, false, 3);
  s = L.applyAnswer(s, true, false, 3);
  s = L.applyAnswer(s, true, false, 3);
  s = L.applyAnswer(s, true, false, 3);
  assert.equal(s.box, 5);
  s = L.applyAnswer(s, false, false, 3);
  assert.equal(s.box, 1);
  assert.deepEqual([s.seen, s.right, s.wrong], [7, 6, 1]);
});

test('multiple choice with full help lifts a fact at most to box 2', () => {
  let s = L.newStat();
  for (let i = 0; i < 5; i++) s = L.applyAnswer(s, true, false, 1);
  assert.equal(s.box, 2);
});

test('session has 15 distinct cards, weighted toward low boxes', () => {
  const pool = L.factsFor(L.ORDER);
  const facts = {};
  pool.forEach((f, i) => { facts[L.key(f.a, f.b)] = { ...L.newStat(), box: i < 50 ? 1 : 5 }; });
  let low = 0;
  const rng = seeded(7);
  for (let run = 0; run < 200; run++) {
    const s = L.buildSession(pool, facts, 15, rng);
    assert.equal(s.length, 15);
    assert.equal(new Set(s.map((c) => L.key(c.a, c.b))).size, 15);
    for (let i = 1; i < s.length; i++) {
      assert.ok(!(s[i].a === s[i - 1].b && s[i].b === s[i - 1].a), 'swap directly after fact');
    }
    low += s.filter((c) => facts[L.key(c.a, c.b)].box === 1).length;
  }
  assert.ok(low / (200 * 15) > 0.75, `low-box share ${low / 3000}`);
});

test('wrong answers come back later, at most twice', () => {
  const queue = [{ a: 3, b: 4 }, { a: 1, b: 2 }, { a: 5, b: 5 }, { a: 6, b: 6 }, { a: 7, b: 7 }];
  const repeats = {};
  assert.ok(L.requeue(queue, 0, queue[0], repeats));
  assert.deepEqual(queue[4], { a: 3, b: 4, repeat: true });
  assert.ok(L.requeue(queue, 4, queue[4], repeats));
  assert.deepEqual(queue[6], { a: 3, b: 4, repeat: true });
  assert.ok(!L.requeue(queue, 6, queue[6], repeats));
});

test('choices: 4 distinct positive options containing the answer', () => {
  const rng = seeded(3);
  for (let a = 1; a <= 10; a++) {
    for (let b = 1; b <= 10; b++) {
      const c = L.choices(a, b, rng);
      assert.equal(c.length, 4, `${a}×${b}: ${c}`);
      assert.equal(new Set(c).size, 4);
      assert.ok(c.includes(a * b));
      assert.ok(c.every((v) => v > 0));
    }
  }
  // Near-misses for 3 × 4: swapped digits (21), a row more/less, a column more/less.
  const c = L.choices(3, 4, seeded(1));
  assert.ok(c.includes(21));
  assert.ok(c.filter((v) => [16, 8, 15, 9].includes(v)).length === 2, String(c));
});

test('level-up suggestion needs >= 90 % over two sessions at that level', () => {
  const session = (level, right, total) => ({
    level,
    results: Array.from({ length: total }, (_, i) => ({ a: 2, b: 3 + (i % 5), correct: i < right, hint: false }))
  });
  assert.deepEqual(L.levelUpReihen([session(1, 10, 10)], 1, [2]), []);
  assert.deepEqual(L.levelUpReihen([session(1, 10, 10), session(1, 9, 10)], 1, [2]), [2]);
  assert.deepEqual(L.levelUpReihen([session(1, 10, 10), session(1, 7, 10)], 1, [2]), []);
  assert.deepEqual(L.levelUpReihen([session(1, 10, 10), session(2, 10, 10)], 1, [2]), []);
  assert.deepEqual(L.levelUpReihen([session(3, 10, 10), session(3, 10, 10)], 3, [2]), []);
  // A correct answer with a hint does not count as known.
  const hinted = { level: 2, results: [{ a: 2, b: 3, correct: true, hint: true }, { a: 2, b: 4, correct: true, hint: false }, { a: 2, b: 5, correct: true, hint: false }] };
  assert.deepEqual(L.levelUpReihen([hinted, hinted], 2, [2]), []);
});
