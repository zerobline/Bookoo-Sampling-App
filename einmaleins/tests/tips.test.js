'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { tip, splitTip, maskTip, speakable } = require('../js/tips.js');

const ALL = [];
for (let a = 1; a <= 10; a++) for (let b = 1; b <= 10; b++) ALL.push([a, b]);

// Evaluate "5 × 8 + 2 × 8" with × and : before + and −.
function evaluate(expr) {
  const tokens = expr.trim().split(/\s+/);
  const terms = [];
  const signs = [1];
  let value = Number(tokens[0]);
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const n = Number(tokens[i + 1]);
    assert.ok(Number.isFinite(n), `not a number in "${expr}"`);
    if (op === '×') value *= n;
    else if (op === ':') value /= n;
    else if (op === '+' || op === '−') {
      terms.push(value);
      signs.push(op === '+' ? 1 : -1);
      value = n;
    } else assert.fail(`unknown operator "${op}" in "${expr}"`);
  }
  terms.push(value);
  return terms.reduce((sum, t, i) => sum + signs[i] * t, 0);
}

// Strip the leading label ("Verdoppeln: ") but not a division " : ".
function mathPart(text) {
  const m = text.match(/^[^:]*?[^ ]: /);
  return (m ? text.slice(m[0].length) : text).replace(/\.$/, '');
}

test('tip() gives a non-empty German tip ending with the product for all 100 facts', () => {
  for (const [a, b] of ALL) {
    const t = tip(a, b);
    assert.equal(typeof t, 'string');
    assert.ok(t.length > 10, `${a}×${b}: too short`);
    assert.ok(t.endsWith(` ${a * b}.`), `${a}×${b}: "${t}" must end with the product`);
    assert.ok(t.includes(`${a} × ${b}`), `${a}×${b}: "${t}" must name the fact`);
  }
});

test('every calculation inside every tip is correct', () => {
  for (const [a, b] of ALL) {
    const t = tip(a, b);
    const math = mathPart(t).replace(' ist dasselbe wie ', ' = ');
    if (math.includes('→')) {
      // Doubling chain: 4 × 6 → 12 → 24
      const [start, ...steps] = math.split(' → ').map((s) => s.trim());
      let v = evaluate(start) / 4;
      for (const s of steps) {
        v *= 2;
        assert.equal(Number(s), v, `${a}×${b}: "${t}"`);
      }
      continue;
    }
    const parts = math.split(' = ');
    for (const part of parts) {
      assert.equal(evaluate(part), a * b, `${a}×${b}: "${part}" in "${t}"`);
    }
  }
});

test('rules apply in priority order', () => {
  const rule = (a, b) => {
    const t = tip(a, b);
    if (t.startsWith('Mal 10 minus')) return 9;
    if (t.startsWith('Mal 1 ')) return 1;
    if (t.startsWith('Hänge')) return 10;
    if (t.startsWith('Verdoppeln')) return 2;
    if (t.startsWith('Die Hälfte')) return 5;
    if (t.startsWith('Zweimal')) return 4;
    if (t.startsWith('Quadratzahl')) return 'square';
    if (t.startsWith('Nachbar')) return 'neighbor';
    if (t.includes('ist dasselbe wie')) return 'swap';
    return 'split';
  };
  for (const [a, b] of ALL) {
    const has = (n) => a === n || b === n;
    let expected;
    if (has(1)) expected = 1;
    else if (has(10)) expected = 10;
    else if (has(2)) expected = 2;
    else if (has(5)) expected = 5;
    else if (has(9)) expected = 9;
    else if (has(4)) expected = 4;
    else if (a === b) expected = 'square';
    else if (Math.abs(a - b) === 1) expected = 'neighbor';
    else expected = rule(a, b) === 'swap' ? 'swap' : 'split';
    assert.equal(rule(a, b), expected, `${a}×${b}: "${tip(a, b)}"`);
  }
});

test('commutative tip only points to the easier swapped fact', () => {
  const order = [1, 10, 2, 5, 4, 9, 3, 6, 8, 7];
  for (const [a, b] of ALL) {
    const t = tip(a, b);
    if (t.includes('ist dasselbe wie')) {
      assert.ok(order.indexOf(a) < order.indexOf(b), `${a}×${b}: "${t}"`);
      assert.ok(!tip(b, a).includes('ist dasselbe wie'), `${b}×${a} must not point back`);
    }
  }
});

test('examples from the brief', () => {
  assert.equal(tip(7, 10), 'Hänge eine 0 an: 7 × 10 = 70.');
  assert.equal(tip(2, 8), 'Verdoppeln: 2 × 8 = 8 + 8 = 16.');
  assert.equal(tip(5, 8), 'Die Hälfte von mal 10: 5 × 8 = 80 : 2 = 40.');
  assert.equal(tip(9, 7), 'Mal 10 minus einmal: 9 × 7 = 70 − 7 = 63.');
  assert.equal(tip(4, 6), 'Zweimal verdoppeln: 4 × 6 → 12 → 24.');
  assert.equal(tip(7, 7), 'Quadratzahl – merk sie dir: 7 × 7 = 49.');
  assert.equal(tip(6, 7), 'Nachbar der Quadratzahl: 6 × 7 = 6 × 6 + 6 = 36 + 6 = 42.');
  assert.equal(tip(3, 8), '3 × 8 ist dasselbe wie 8 × 3 = 24.');
  assert.equal(splitTip(7, 8), '7 × 8 = 5 × 8 + 2 × 8 = 40 + 16 = 56.');
  assert.equal(tip(1, 6), 'Mal 1 bleibt die Zahl gleich: 1 × 6 = 6.');
});

test('maskTip hides only the final result', () => {
  for (const [a, b] of ALL) {
    const masked = maskTip(tip(a, b), a, b);
    assert.ok(masked.endsWith('?'), masked);
    assert.ok(!masked.endsWith(`${a * b}.`), masked);
  }
  assert.equal(maskTip(tip(9, 7), 9, 7), 'Mal 10 minus einmal: 9 × 7 = 70 − 7 = ?');
});

test('speakable reads symbols as German words', () => {
  assert.equal(speakable(tip(9, 7)), 'Mal 10 minus einmal: 9 mal 7 ist 70 minus 7 ist 63.');
  assert.equal(speakable(maskTip(tip(4, 6), 4, 6)), 'Zweimal verdoppeln: 4 mal 6, dann 12, dann wie viel?');
});
