import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timeToWords, label, spoken, handAngles, makeQuestion, passes, STAGES, nextHour, prevHour } from '../apps/uhr-lesen/clock.js';

test('German time phrases', () => {
  assert.equal(timeToWords(3, 0), '3 Uhr');
  assert.equal(timeToWords(3, 15), 'Viertel nach 3');
  assert.equal(timeToWords(3, 30), 'halb 4');
  assert.equal(timeToWords(12, 30), 'halb 1');
  assert.equal(timeToWords(3, 45), 'Viertel vor 4');
  assert.equal(timeToWords(3, 25), '5 vor halb 4');
  assert.equal(timeToWords(3, 35), '5 nach halb 4');
  assert.equal(timeToWords(11, 55), '5 vor 12');
  assert.equal(nextHour(12), 1);
  assert.equal(prevHour(1), 12);
});

test('stage 5 uses digital labels and readable speech', () => {
  assert.equal(label(5, 3, 7), '3:07');
  assert.equal(spoken(5, 3, 7), '3 Uhr 7');
  assert.equal(spoken(2, 3, 30), 'halb 4');
});

test('hand angles', () => {
  assert.deepEqual(handAngles(3, 0), { hour: 90, minute: 0 });
  assert.deepEqual(handAngles(12, 30), { hour: 15, minute: 180 });
});

function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

test('questions: 4 unique options, one correct, minutes fit the stage', () => {
  const rng = seeded(42);
  for (const st of STAGES) {
    let prev = null;
    for (let i = 0; i < 300; i++) {
      const q = makeQuestion(st.n, rng, prev);
      assert.equal(q.options.length, 4, `stage ${st.n}`);
      assert.equal(new Set(q.options.map((o) => o.label)).size, 4);
      assert.equal(q.options[q.answerIndex].label, label(st.n, q.h, q.m));
      assert.ok(st.minutes.includes(q.m));
      for (const o of q.options) {
        assert.ok(st.minutes.includes(o.m), `option minute ${o.m} in stage ${st.n}`);
        assert.ok(o.h >= 1 && o.h <= 12);
      }
      assert.ok(!(prev && prev.h === q.h && prev.m === q.m), 'no immediate repeat');
      prev = q;
    }
  }
});

test('"halb" questions always offer the classic one-hour mix-up', () => {
  const rng = seeded(7);
  for (let i = 0; i < 200; i++) {
    const q = makeQuestion(2, rng);
    if (q.m !== 30) continue;
    assert.ok(q.options.some((o) => o.label === timeToWords(prevHour(q.h), 30)));
  }
});

test('80 % passes a stage', () => {
  assert.equal(passes(8, 10), true);
  assert.equal(passes(7, 10), false);
  assert.equal(passes(0, 0), false);
});
