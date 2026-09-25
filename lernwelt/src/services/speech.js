// German text-to-speech via the Web Speech API. Silently does nothing when the
// browser has no speech support or the parent switched speech off.

export function createSpeech({ isEnabled = () => true } = {}) {
  const synth = globalThis.speechSynthesis;
  const Utterance = globalThis.SpeechSynthesisUtterance;
  const supported = !!synth && typeof Utterance === 'function';
  let voice = null;

  function pickVoice() {
    const voices = synth.getVoices();
    voice =
      voices.find((v) => v.lang === 'de-DE' && v.localService) ||
      voices.find((v) => v.lang === 'de-DE') ||
      voices.find((v) => v.lang?.toLowerCase().startsWith('de')) ||
      null;
  }
  if (supported) {
    pickVoice();
    synth.addEventListener?.('voiceschanged', pickVoice);
  }

  return {
    get available() {
      return supported && isEnabled();
    },
    /** Speaks `text` (cancelling anything still speaking). Resolves when done. */
    speak(text, { rate = 0.9, pitch = 1.05 } = {}) {
      if (!supported || !isEnabled() || !text) return Promise.resolve();
      synth.cancel();
      const u = new Utterance(String(text));
      u.lang = 'de-DE';
      if (voice) u.voice = voice;
      u.rate = rate;
      u.pitch = pitch;
      return new Promise((resolve) => {
        u.onend = u.onerror = () => resolve();
        synth.speak(u);
      });
    },
    stop() {
      if (supported) synth.cancel();
    },
  };
}
