// Pure logic for "Einmaleins" (no DOM) – unit tested in tests/einmaleins.test.mjs.
// facts: { "3x7": { seen, correct, streak } } keyed by the task as shown (a × b).

export const key = (a, b) => `${a}x${b}`;

/** 0 = not practised, 1 = needs practice, 2 = getting there, 3 = mastered (3× in a row right). */
export function mastery(rec) {
  if (!rec || !rec.seen) return 0;
  if (rec.streak >= 3) return 3;
  if (rec.correct / rec.seen >= 0.6) return 2;
  return 1;
}

export const MASTERY_LABELS = ['noch nicht geübt', 'übt noch', 'fast sicher', 'sicher'];

/** Record an answer. `firstTry` = right on the first attempt. Returns a new facts object. */
export function record(facts, a, b, firstTry) {
  const k = key(a, b);
  const prev = facts[k] ?? { seen: 0, correct: 0, streak: 0 };
  return {
    ...facts,
    [k]: {
      seen: prev.seen + 1,
      correct: prev.correct + (firstTry ? 1 : 0),
      streak: firstTry ? prev.streak + 1 : 0,
    },
  };
}

/** All tasks for the chosen rows ("Reihen"); with swap also b × a. */
export function candidates(rows, swap = true) {
  const out = new Map();
  for (const a of rows) {
    for (let b = 1; b <= 10; b++) {
      out.set(key(a, b), { a, b });
      if (swap) out.set(key(b, a), { a: b, b: a });
    }
  }
  return [...out.values()];
}

const WEIGHT = [3, 5, 2, 0.6];

/** Pick the next task, preferring weak and new facts and avoiding the last few. */
export function pickTask(rows, facts, { swap = true, recent = [], rng = Math.random } = {}) {
  let pool = candidates(rows.length ? rows : [1, 2, 5, 10], swap);
  const fresh = pool.filter((t) => !recent.includes(key(t.a, t.b)));
  if (fresh.length) pool = fresh;
  const weights = pool.map((t) => WEIGHT[mastery(facts[key(t.a, t.b)])]);
  let r = rng() * weights.reduce((x, y) => x + y, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

export function masteredCount(facts) {
  let n = 0;
  for (let a = 1; a <= 10; a++) for (let b = 1; b <= 10; b++) if (mastery(facts[key(a, b)]) === 3) n++;
  return n;
}
