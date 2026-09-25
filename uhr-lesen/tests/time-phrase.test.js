'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Z = require('../time-phrase.js');

// Every minute for 3 o'clock, written out by hand.
const THREE = [
  'drei Uhr', 'eine Minute nach drei', 'zwei nach drei', 'drei nach drei',
  'vier nach drei', 'fünf nach drei', 'sechs nach drei', 'sieben nach drei',
  'acht nach drei', 'neun nach drei', 'zehn nach drei', 'elf nach drei',
  'zwölf nach drei', 'dreizehn nach drei', 'vierzehn nach drei',
  'Viertel nach drei', 'sechzehn nach drei', 'siebzehn nach drei',
  'achtzehn nach drei', 'neunzehn nach drei', 'zwanzig nach drei',
  'einundzwanzig nach drei', 'zweiundzwanzig nach drei',
  'dreiundzwanzig nach drei', 'vierundzwanzig nach drei',
  'fünf vor halb vier', 'sechsundzwanzig nach drei',
  'siebenundzwanzig nach drei', 'achtundzwanzig nach drei',
  'neunundzwanzig nach drei',
  'halb vier',
  'neunundzwanzig vor vier', 'achtundzwanzig vor vier',
  'siebenundzwanzig vor vier', 'sechsundzwanzig vor vier',
  'fünf nach halb vier', 'vierundzwanzig vor vier',
  'dreiundzwanzig vor vier', 'zweiundzwanzig vor vier',
  'einundzwanzig vor vier', 'zwanzig vor vier', 'neunzehn vor vier',
  'achtzehn vor vier', 'siebzehn vor vier', 'sechzehn vor vier',
  'Viertel vor vier', 'vierzehn vor vier', 'dreizehn vor vier',
  'zwölf vor vier', 'elf vor vier', 'zehn vor vier', 'neun vor vier',
  'acht vor vier', 'sieben vor vier', 'sechs vor vier', 'fünf vor vier',
  'vier vor vier', 'drei vor vier', 'zwei vor vier', 'eine Minute vor vier'
];

/** Expected phrase for hour h derived from the 3 o'clock table: the hour
 *  word is always the last word (or the one before "Uhr"). */
function expectedFor(h, m) {
  const words = THREE[m].split(' ');
  if (m === 0) return (h === 1 ? 'ein' : Z.HOUR_WORDS[h]) + ' Uhr';
  const last = words.pop();
  const word = last === 'drei' ? Z.HOUR_WORDS[h] : Z.HOUR_WORDS[h % 12 + 1];
  return words.concat(word).join(' ');
}

test('3 o\'clock table has 60 entries', () => {
  assert.equal(THREE.length, 60);
});

for (const h of [12, 1, 3]) {
  test(`every minute 0–59 for hour ${h}`, () => {
    for (let m = 0; m < 60; m++) {
      assert.equal(Z.timeToPhrase(h, m), expectedFor(h, m), `${h}:${m}`);
    }
  });
}

test('spot checks around 12 and 1', () => {
  assert.equal(Z.timeToPhrase(1, 0), 'ein Uhr');
  assert.equal(Z.timeToPhrase(12, 0), 'zwölf Uhr');
  assert.equal(Z.timeToPhrase(12, 30), 'halb eins');
  assert.equal(Z.timeToPhrase(12, 45), 'Viertel vor eins');
  assert.equal(Z.timeToPhrase(12, 25), 'fünf vor halb eins');
  assert.equal(Z.timeToPhrase(12, 59), 'eine Minute vor eins');
  assert.equal(Z.timeToPhrase(1, 15), 'Viertel nach eins');
  assert.equal(Z.timeToPhrase(1, 30), 'halb zwei');
  assert.equal(Z.timeToPhrase(11, 30), 'halb zwölf');
  assert.equal(Z.timeToPhrase(11, 45), 'Viertel vor zwölf');
  assert.equal(Z.timeToPhrase(3, 17), 'siebzehn nach drei');
});

test('24-hour and 0 input is folded onto the 12-hour face', () => {
  assert.equal(Z.timeToPhrase(0, 30), 'halb eins');
  assert.equal(Z.timeToPhrase(13, 0), 'ein Uhr');
  assert.equal(Z.timeToPhrase(15, 15), 'Viertel nach drei');
});

test(':20 and :40 accept both forms', () => {
  assert.ok(Z.isCorrect('zwanzig nach drei', 3, 20));
  assert.ok(Z.isCorrect('zehn vor halb vier', 3, 20));
  assert.ok(Z.isCorrect('zwanzig vor vier', 3, 40));
  assert.ok(Z.isCorrect('zehn nach halb vier', 3, 40));
  assert.ok(!Z.isCorrect('zehn nach halb drei', 3, 40));
});

test('answers are compared case- and space-insensitively', () => {
  assert.ok(Z.isCorrect('  VIERTEL   nach drei ', 3, 15));
  assert.ok(!Z.isCorrect('eins Uhr', 1, 0));
});

test('classic mistakes are rejected', () => {
  assert.ok(!Z.isCorrect('halb drei', 3, 30));
  assert.ok(!Z.isCorrect('Viertel vor drei', 3, 15));
  assert.ok(!Z.isCorrect('drei Uhr', 3, 30));
});

test('regional: Viertel-Zählung', () => {
  const o = { region: 'viertel' };
  assert.equal(Z.timeToPhrase(3, 15, o), 'Viertel vier');
  assert.equal(Z.timeToPhrase(3, 45, o), 'drei viertel vier');
  assert.equal(Z.timeToPhrase(12, 15, o), 'Viertel eins');
  assert.ok(Z.isCorrect('dreiviertel vier', 3, 45, o));
  assert.ok(Z.isCorrect('Viertel nach drei', 3, 15, o));
  assert.equal(Z.timeToPhrase(3, 30, o), 'halb vier');
  // Off by default.
  assert.ok(!Z.isCorrect('Viertel vier', 3, 15));
});

test('regional: Swiss "ab"', () => {
  const o = { region: 'ch' };
  assert.equal(Z.timeToPhrase(3, 15, o), 'Viertel ab drei');
  assert.equal(Z.timeToPhrase(3, 10, o), 'zehn ab drei');
  assert.equal(Z.timeToPhrase(3, 35, o), 'fünf ab halb vier');
  assert.equal(Z.timeToPhrase(3, 45, o), 'Viertel vor vier');
  assert.ok(Z.isCorrect('Viertel nach drei', 3, 15, o));
  assert.ok(Z.isCorrect('fünfundzwanzig ab drei', 3, 25, o));
  assert.ok(!Z.isCorrect('zehn ab drei', 3, 10));
});

test('no two times share an accepted phrase (all regions)', () => {
  for (const region of ['standard', 'viertel', 'ch']) {
    const owner = new Map();
    for (let h = 1; h <= 12; h++) {
      for (let m = 0; m < 60; m++) {
        for (const p of Z.timeToPhrases(h, m, { region }).accepted) {
          const key = Z.normalize(p);
          assert.ok(!owner.has(key), `${region}: "${p}" used by ${owner.get(key)} and ${h}:${m}`);
          owner.set(key, `${h}:${m}`);
        }
      }
    }
  }
});

test('phraseToTime round-trips every canonical phrase', () => {
  for (let h = 1; h <= 12; h++) {
    for (let m = 0; m < 60; m++) {
      assert.deepEqual(Z.phraseToTime(Z.timeToPhrase(h, m)), { hour: h, minute: m });
    }
  }
  assert.equal(Z.phraseToTime('Blumenkohl'), null);
});

test('categories', () => {
  assert.equal(Z.categoryOf(0), 'voll');
  assert.equal(Z.categoryOf(30), 'halb');
  assert.equal(Z.categoryOf(15), 'viertelNach');
  assert.equal(Z.categoryOf(45), 'viertelVor');
  assert.equal(Z.categoryOf(25), 'umHalb');
  assert.equal(Z.categoryOf(10), 'fuenfNach');
  assert.equal(Z.categoryOf(50), 'fuenfVor');
  assert.equal(Z.categoryOf(17), 'minuteNach');
  assert.equal(Z.categoryOf(43), 'minuteVor');
});

test('invalid minutes throw', () => {
  assert.throws(() => Z.timeToPhrase(3, 60), RangeError);
  assert.throws(() => Z.timeToPhrase(3, 2.5), RangeError);
});
