// Pure logic for "Uhr lesen" (no DOM) – unit tested in tests/uhr-lesen.test.mjs.

const range = (from, to, step = 1) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

export const STAGES = [
  { n: 1, name: 'Volle Stunden', minutes: [0] },
  { n: 2, name: 'Halbe Stunden', minutes: [0, 30] },
  { n: 3, name: 'Viertelstunden', minutes: [0, 15, 30, 45] },
  { n: 4, name: '5-Minuten-Schritte', minutes: range(0, 55, 5) },
  { n: 5, name: 'Minutengenau', minutes: range(0, 59), digital: true },
];

export const MAX_STAGE = STAGES.length;

export function stage(n) {
  return STAGES[Math.min(Math.max(1, n), MAX_STAGE) - 1];
}

export const nextHour = (h) => (h % 12) + 1;
export const prevHour = (h) => ((h + 10) % 12) + 1;

/** Everyday German reading of a time, h = 1–12, m in 5-minute steps. */
export function timeToWords(h, m) {
  const n = nextHour(h);
  switch (m) {
    case 0: return `${h} Uhr`;
    case 5: return `5 nach ${h}`;
    case 10: return `10 nach ${h}`;
    case 15: return `Viertel nach ${h}`;
    case 20: return `20 nach ${h}`;
    case 25: return `5 vor halb ${n}`;
    case 30: return `halb ${n}`;
    case 35: return `5 nach halb ${n}`;
    case 40: return `20 vor ${n}`;
    case 45: return `Viertel vor ${n}`;
    case 50: return `10 vor ${n}`;
    case 55: return `5 vor ${n}`;
    default: return formatDigital(h, m);
  }
}

export function formatDigital(h, m) {
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** Answer label shown on the buttons for a given stage. */
export function label(stageN, h, m) {
  return stage(stageN).digital ? formatDigital(h, m) : timeToWords(h, m);
}

/** Text for speech output. "3:07" is read as "3 Uhr 7". */
export function spoken(stageN, h, m) {
  if (!stage(stageN).digital) return timeToWords(h, m);
  return m === 0 ? `${h} Uhr` : `${h} Uhr ${m}`;
}

/** Hand angles in degrees (0 = 12 o'clock, clockwise). */
export function handAngles(h, m) {
  return { hour: ((h % 12) + m / 60) * 30, minute: m * 6 };
}

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * One question: a time to show on the clock plus 4 answer options.
 * Newly introduced minutes of the stage come up more often, and distractors
 * include the typical mix-ups (halb 3 vs. halb 4, swapped hands, ±1 hour).
 */
export function makeQuestion(stageN, rng = Math.random, previous = null) {
  const st = stage(stageN);
  const earlier = stageN > 1 ? stage(stageN - 1).minutes : [];
  const fresh = st.minutes.filter((m) => !earlier.includes(m));

  let h, m;
  do {
    h = 1 + Math.floor(rng() * 12);
    m = fresh.length && rng() < 0.6 ? pick(fresh, rng) : pick(st.minutes, rng);
  } while (previous && previous.h === h && previous.m === m);

  const allowed = new Set(st.minutes);
  const correct = label(stageN, h, m);
  const labels = new Set([correct]);
  const options = [{ h, m, label: correct }];
  const add = (hh, mm) => {
    if (options.length >= 4 || !allowed.has(mm)) return;
    const l = label(stageN, hh, mm);
    if (labels.has(l)) return;
    labels.add(l);
    options.push({ h: hh, m: mm, label: l });
  };

  // The classic mistake: reading "halb 4" (3:30) as "halb 3" – always offered.
  if (m >= 25 && m <= 35) add(prevHour(h), m);
  const tricky = [[nextHour(h), m], [prevHour(h), m]];
  if (m > 0 && m % 5 === 0) tricky.push([m / 5, (h * 5) % 60]); // hands swapped
  if (st.minutes.length > 1) tricky.push([h, pick(st.minutes.filter((x) => x !== m), rng)]);
  if (st.digital) tricky.push([h, (m + 5) % 60], [h, (m + 55) % 60], [h, (60 - m) % 60]);

  for (const [hh, mm] of shuffle(tricky, rng).slice(0, 2)) add(hh, mm);
  let guard = 0;
  while (options.length < 4 && guard++ < 200) add(1 + Math.floor(rng() * 12), pick(st.minutes, rng));

  const shuffled = shuffle(options, rng);
  return { h, m, options: shuffled, answerIndex: shuffled.findIndex((o) => o.label === correct) };
}

/** A round passes (and unlocks the next stage) with at least 80 % correct. */
export function passes(correct, total) {
  return total > 0 && correct / total >= 0.8;
}
