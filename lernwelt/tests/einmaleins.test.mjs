import { test } from 'node:test';
import assert from 'node:assert/strict';
import { key, mastery, record, candidates, pickTask, masteredCount } from '../apps/einmaleins/logic.js';

test('mastery levels', () => {
  let f = {};
  assert.equal(mastery(f[key(3, 4)]), 0);
  f = record(f, 3, 4, false);
  assert.equal(mastery(f['3x4']), 1);
  f = record(f, 3, 4, true);
  f = record(f, 3, 4, true);
  assert.equal(mastery(f['3x4']), 2);
  f = record(f, 3, 4, true);
  assert.equal(mastery(f['3x4']), 3);
  assert.equal(masteredCount(f), 1);
  f = record(f, 3, 4, false);
  assert.equal(f['3x4'].streak, 0);
});

test('candidates cover selected rows, with and without swap', () => {
  assert.equal(candidates([3], false).length, 10);
  const swapped = candidates([3], true);
  assert.equal(swapped.length, 19); // 3×3 only once
  assert.ok(swapped.some((t) => t.a === 7 && t.b === 3));
});

test('pickTask stays inside the chosen rows and avoids recent tasks', () => {
  const rows = [2, 5];
  for (let i = 0; i < 500; i++) {
    const t = pickTask(rows, {}, { swap: false, recent: ['2x1', '2x2'] });
    assert.ok(rows.includes(t.a));
    assert.ok(t.b >= 1 && t.b <= 10);
    assert.ok(!['2x1', '2x2'].includes(key(t.a, t.b)));
  }
});

test('pickTask prefers weak facts over mastered ones', () => {
  let facts = {};
  for (let b = 1; b <= 10; b++) {
    if (b === 7) continue;
    for (let i = 0; i < 3; i++) facts = record(facts, 4, b, true);
  }
  facts = record(facts, 4, 7, false); // level 1: needs practice
  let weak = 0;
  for (let i = 0; i < 2000; i++) {
    const t = pickTask([4], facts, { swap: false });
    if (key(t.a, t.b) === '4x7') weak++;
  }
  // weight 5 vs 9 × 0.6 → about 48 % (uniform would be 10 %)
  assert.ok(weak > 700, `weak fact picked ${weak} times`);
});
