/*
 * Uhr lesen – Uhrzeit -> gesprochene deutsche Uhrzeit.
 *
 * Pure functions only (no DOM), so the same file runs in the browser
 * (global `UhrZeit`) and in Node for the unit tests (module.exports).
 *
 * Region options:
 *   'standard' – "Viertel nach drei", "Viertel vor vier"
 *   'viertel'  – "Viertel vier" (3:15), "drei viertel vier" (3:45)
 *   'ch'       – Swiss "ab" instead of "nach" ("Viertel ab drei")
 * Standard forms are always accepted as answers, whatever the region.
 */
(function (root) {
  'use strict';

  // Index = hour on the clock face (0 and 12 both "zwölf").
  var HOUR_WORDS = ['zwölf', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs',
    'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf'];

  // Index = number of minutes (1–29).
  var MINUTE_WORDS = [null, 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs',
    'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn',
    'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn', 'zwanzig',
    'einundzwanzig', 'zweiundzwanzig', 'dreiundzwanzig', 'vierundzwanzig',
    'fünfundzwanzig', 'sechsundzwanzig', 'siebenundzwanzig',
    'achtundzwanzig', 'neunundzwanzig'];

  /** Clock hour 1–12 for any integer hour (0, 12, 24 -> 12; 13 -> 1). */
  function hour12(hour) {
    var h = ((Math.round(hour) % 12) + 12) % 12;
    return h === 0 ? 12 : h;
  }

  function nextHour12(hour) {
    return hour12(hour12(hour) + 1);
  }

  /** "eine Minute" for 1, otherwise the plain number word. */
  function minuteCount(n) {
    return n === 1 ? 'eine Minute' : MINUTE_WORDS[n];
  }

  /** Normalise user/phrase text for comparison. */
  function normalize(text) {
    return String(text).toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function uniq(list) {
    var seen = {};
    return list.filter(function (item) {
      var key = normalize(item);
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  /**
   * All correct standard-German phrases for a time. First entry is the
   * canonical (taught) form, the rest are accepted alternatives.
   */
  function standardPhrases(hour, minute) {
    var H = HOUR_WORDS[hour12(hour)];
    var N = HOUR_WORDS[nextHour12(hour)];
    var m = minute;

    if (m === 0) return [(hour12(hour) === 1 ? 'ein' : H) + ' Uhr'];
    if (m === 15) return ['Viertel nach ' + H, 'fünfzehn nach ' + H];
    if (m === 30) return ['halb ' + N];
    if (m === 45) return ['Viertel vor ' + N, 'fünfzehn vor ' + N];
    if (m === 25) return ['fünf vor halb ' + N, 'fünfundzwanzig nach ' + H];
    if (m === 35) return ['fünf nach halb ' + N, 'fünfundzwanzig vor ' + N];
    if (m === 20) return ['zwanzig nach ' + H, 'zehn vor halb ' + N];
    if (m === 40) return ['zwanzig vor ' + N, 'zehn nach halb ' + N];
    if (m === 1) return ['eine Minute nach ' + H, 'eins nach ' + H];
    if (m === 59) return ['eine Minute vor ' + N, 'eins vor ' + N];
    if (m < 30) return [minuteCount(m) + ' nach ' + H];
    return [minuteCount(60 - m) + ' vor ' + N];
  }

  /**
   * Phrases for a time.
   * @param {number} hour   any integer hour (0–23 fine)
   * @param {number} minute 0–59
   * @param {{region?: 'standard'|'viertel'|'ch'}} [opts]
   * @returns {{text: string, accepted: string[], category: string}}
   */
  function timeToPhrases(hour, minute, opts) {
    if (!(minute >= 0 && minute <= 59 && minute === Math.floor(minute))) {
      throw new RangeError('minute must be an integer 0–59, got ' + minute);
    }
    var region = (opts && opts.region) || 'standard';
    var std = standardPhrases(hour, minute);
    var N = HOUR_WORDS[nextHour12(hour)];
    var regional = [];
    var extra = [];

    if (region === 'viertel') {
      if (minute === 15) regional = ['Viertel ' + N];
      if (minute === 45) regional = ['drei viertel ' + N, 'dreiviertel ' + N];
    } else if (region === 'ch') {
      var hasNach = function (p) { return / nach /.test(' ' + p + ' '); };
      var ab = std.filter(hasNach).map(function (p) {
        return (' ' + p).replace(' nach ', ' ab ').trim();
      });
      // Swiss form first when the canonical phrase uses "nach".
      if (hasNach(std[0])) regional = ab; else extra = ab;
    }

    var accepted = uniq(regional.concat(std, extra));
    return { text: accepted[0], accepted: accepted, category: categoryOf(minute) };
  }

  /** Canonical phrase only. */
  function timeToPhrase(hour, minute, opts) {
    return timeToPhrases(hour, minute, opts).text;
  }

  /** Is `answer` a correct way to say hour:minute? */
  function isCorrect(answer, hour, minute, opts) {
    var a = normalize(answer);
    return timeToPhrases(hour, minute, opts).accepted.some(function (p) {
      return normalize(p) === a;
    });
  }

  /** Time type, used for the parent statistics. */
  function categoryOf(minute) {
    if (minute === 0) return 'voll';
    if (minute === 30) return 'halb';
    if (minute === 15) return 'viertelNach';
    if (minute === 45) return 'viertelVor';
    if (minute === 25 || minute === 35) return 'umHalb';
    if (minute % 5 === 0) return minute < 30 ? 'fuenfNach' : 'fuenfVor';
    return minute < 30 ? 'minuteNach' : 'minuteVor';
  }

  var CATEGORY_LABELS = {
    voll: 'Volle Stunden (drei Uhr)',
    halb: 'Halbe Stunden (halb vier)',
    viertelNach: 'Viertel nach',
    viertelVor: 'Viertel vor',
    fuenfNach: '„nach“-Zeiten (zehn nach drei)',
    fuenfVor: '„vor“-Zeiten (zehn vor vier)',
    umHalb: 'Um halb herum (fünf vor halb vier)',
    minuteNach: 'Einzelne Minuten nach',
    minuteVor: 'Einzelne Minuten vor'
  };

  /**
   * Reverse lookup: which time (hour 1–12, minute) does a phrase mean?
   * Brute force over all 720 times, so it always agrees with timeToPhrases.
   * Returns null if the phrase is not a valid time.
   */
  function phraseToTime(phrase, opts) {
    var target = normalize(phrase);
    for (var h = 1; h <= 12; h++) {
      for (var m = 0; m < 60; m++) {
        var accepted = timeToPhrases(h, m, opts).accepted;
        for (var i = 0; i < accepted.length; i++) {
          if (normalize(accepted[i]) === target) return { hour: h, minute: m };
        }
      }
    }
    return null;
  }

  /** Minutes allowed at each Stufe (1–5). */
  var STUFE_MINUTES = {
    1: [0],
    2: [0, 30],
    3: [0, 15, 30, 45],
    4: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55],
    5: Array.apply(null, Array(60)).map(function (_, i) { return i; })
  };

  /** Minute snap step for dragging hands (Schwer mode). */
  var STUFE_STEP = { 1: 30, 2: 30, 3: 15, 4: 5, 5: 1 };

  var api = {
    HOUR_WORDS: HOUR_WORDS,
    MINUTE_WORDS: MINUTE_WORDS,
    CATEGORY_LABELS: CATEGORY_LABELS,
    STUFE_MINUTES: STUFE_MINUTES,
    STUFE_STEP: STUFE_STEP,
    hour12: hour12,
    nextHour12: nextHour12,
    normalize: normalize,
    timeToPhrases: timeToPhrases,
    timeToPhrase: timeToPhrase,
    isCorrect: isCorrect,
    categoryOf: categoryOf,
    phraseToTime: phraseToTime
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.UhrZeit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
