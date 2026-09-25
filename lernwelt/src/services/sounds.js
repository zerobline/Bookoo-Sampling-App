// Shared feedback sounds, synthesised with Web Audio so they need no files and
// work offline. Kept short and soft – "wrong" is a gentle low tone, not a buzzer.

export function createSounds({ isEnabled = () => true } = {}) {
  let ctx = null;

  function audio() {
    if (!ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function play(notes) {
    if (!isEnabled()) return;
    const c = audio();
    if (!c) return;
    const t0 = c.currentTime + 0.02;
    for (const [freq, offset, dur, { type = 'sine', gain = 0.18 } = {}] of notes) {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      const start = t0 + offset;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(gain, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(g).connect(c.destination);
      osc.start(start);
      osc.stop(start + dur + 0.05);
    }
  }

  return {
    correct: () =>
      play([
        [660, 0, 0.14],
        [880, 0.11, 0.25],
      ]),
    wrong: () =>
      play([
        [330, 0, 0.2, { type: 'triangle', gain: 0.14 }],
        [262, 0.16, 0.3, { type: 'triangle', gain: 0.12 }],
      ]),
    reward: () =>
      play([
        [523, 0, 0.16],
        [659, 0.13, 0.16],
        [784, 0.26, 0.16],
        [1047, 0.39, 0.45, { gain: 0.2 }],
      ]),
    tap: () => play([[520, 0, 0.06, { gain: 0.06 }]]),
    /** Call from a user gesture so later sounds are allowed to play (iOS/Chrome autoplay rules). */
    unlock: () => void audio(),
  };
}
