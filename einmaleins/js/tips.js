/*
 * Strategy tips for the multiplication facts 1–10 × 1–10.
 *
 * Convention used throughout the app: a × b means "a rows of b"
 * (3 × 4 = 3 rows of 4 dots, skip-counted 4, 8, 12). The fact therefore
 * belongs to the b-Reihe.
 *
 * Every tip ends with "<product>." so the UI can hide the result
 * (maskTip) until the child has answered.
 */
(function (root) {
  'use strict';

  // Suggested learning order of the Reihen; earlier = easier.
  var ORDER = [1, 10, 2, 5, 4, 9, 3, 6, 8, 7];

  function fact(a, b) {
    return a + ' × ' + b;
  }

  // The factor that is not n (for "×n" rules). If both are n, it is n.
  function other(a, b, n) {
    return a === n ? b : a;
  }

  // Fallback: split the larger-than-5 factor into 5 + rest, otherwise 2 + rest.
  function splitTip(a, b) {
    var p = a * b;
    if (a > 5) {
      return fact(a, b) + ' = ' + fact(5, b) + ' + ' + fact(a - 5, b) +
        ' = ' + 5 * b + ' + ' + (a - 5) * b + ' = ' + p + '.';
    }
    if (b > 5) {
      return fact(a, b) + ' = ' + fact(a, 5) + ' + ' + fact(a, b - 5) +
        ' = ' + a * 5 + ' + ' + a * (b - 5) + ' = ' + p + '.';
    }
    return fact(a, b) + ' = ' + fact(2, b) + ' + ' + fact(a - 2, b) +
      ' = ' + 2 * b + ' + ' + (a - 2) * b + ' = ' + p + '.';
  }

  function tip(a, b) {
    var p = a * b;
    var n;

    if (a === 1 || b === 1) {
      return 'Mal 1 bleibt die Zahl gleich: ' + fact(a, b) + ' = ' + p + '.';
    }
    if (a === 10 || b === 10) {
      return 'Hänge eine 0 an: ' + fact(a, b) + ' = ' + p + '.';
    }
    if (a === 2 || b === 2) {
      n = other(a, b, 2);
      return 'Verdoppeln: ' + fact(a, b) + ' = ' + n + ' + ' + n + ' = ' + p + '.';
    }
    if (a === 5 || b === 5) {
      n = other(a, b, 5);
      return 'Die Hälfte von mal 10: ' + fact(a, b) + ' = ' + 10 * n + ' : 2 = ' + p + '.';
    }
    if (a === 9 || b === 9) {
      n = other(a, b, 9);
      return 'Mal 10 minus einmal: ' + fact(a, b) + ' = ' + 10 * n + ' − ' + n + ' = ' + p + '.';
    }
    if (a === 4 || b === 4) {
      n = other(a, b, 4);
      return 'Zweimal verdoppeln: ' + fact(a, b) + ' → ' + 2 * n + ' → ' + p + '.';
    }
    if (a === b) {
      return 'Quadratzahl – merk sie dir: ' + fact(a, b) + ' = ' + p + '.';
    }
    if (Math.abs(a - b) === 1) {
      var s = Math.min(a, b);
      return 'Nachbar der Quadratzahl: ' + fact(a, b) + ' = ' + fact(s, s) + ' + ' + s +
        ' = ' + s * s + ' + ' + s + ' = ' + p + '.';
    }
    // The swapped fact b × a belongs to the a-Reihe. Say so if that Reihe is easier.
    if (ORDER.indexOf(a) < ORDER.indexOf(b)) {
      return fact(a, b) + ' ist dasselbe wie ' + fact(b, a) + ' = ' + p + '.';
    }
    return splitTip(a, b);
  }

  // Replace the trailing result with "?" so the tip helps without giving it away.
  function maskTip(text, a, b) {
    var tail = String(a * b) + '.';
    if (text.slice(-tail.length) !== tail) return text;
    return text.slice(0, -tail.length) + '?';
  }

  // Turn a tip into something the German speech voice reads naturally.
  function speakable(text) {
    return text
      .replace(/ × /g, ' mal ')
      .replace(/ − /g, ' minus ')
      .replace(/ \+ /g, ' plus ')
      .replace(/ : /g, ' geteilt durch ')
      .replace(/ = /g, ' ist ')
      .replace(/ → /g, ', dann ')
      .replace(/ – /g, ', ')
      .replace(/\?$/, 'wie viel?');
  }

  var api = { tip: tip, splitTip: splitTip, maskTip: maskTip, speakable: speakable, ORDER: ORDER };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Tips = api;
})(this);
