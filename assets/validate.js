// Deutsch-Klub — checks for a member's name and e-mail address, shared by the browser (window.DKValidate) and the
// server (require). Names: real-looking first + last name, tidied capitals. E-mail: strict format, no throw-away
// inboxes, and a "did you mean …?" for typos in common domains. Whether the domain can receive mail at all is checked
// on the server with DNS (lib/emailcheck.js).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DKValidate = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------------- names ----------------
  var PARTICLES = ["von", "van", "der", "den", "de", "del", "della", "di", "da", "du", "la", "le", "zu", "zum", "zur", "ten", "ter", "bin", "ibn", "al", "el"];
  var VOWELS = /[aeiouyäöüàáâãåæèéêëìíîïòóôõøùúûýÿœаеєиіїоуюяыэё]/i;
  var LATIN = /[A-Za-zÀ-ÖØ-öø-ɏ]/, CYRILLIC = /[Ѐ-ӿ]/;

  function capFirst(w) { return w.charAt(0).toLocaleUpperCase() + w.slice(1); }
  function tidyWord(w, first) {
    // only touch words typed all in small letters or all in capitals; keep deliberate spellings like "McDonald" or "DiCaprio"
    return w.split(/([-'’])/).map(function (part, i, all) {
      if (!part || /^[-'’]$/.test(part)) return part;
      var low = part.toLocaleLowerCase(), up = part.toLocaleUpperCase();
      if (part !== low && part !== up) return part;
      if (!first && i === 0 && PARTICLES.indexOf(low) > -1 && all.length === 1) return low;     // "von", "van der" stay small
      if (i > 0 && all[i - 1] !== "-" && low.length <= 1) return low;                            // O'Brien -> O'Brien, d'Arc
      return capFirst(low);
    }).join("");
  }
  function name(raw) {
    var s = String(raw == null ? "" : raw).normalize("NFC").replace(/[\u0000-\u001f]/g, " ").replace(/^[\s=+\-@]+/, "").replace(/\s+/g, " ").trim();
    if (!s) return { ok: false, error: "Please enter your name." };
    if (/\d/.test(s)) return { ok: false, error: "A name has no digits — please write it in letters." };
    if (!/^[\p{L}\p{M}'’\-. ]+$/u.test(s)) return { ok: false, error: "Please use letters only (hyphens and apostrophes are fine)." };
    if (s.length > 80) return { ok: false, error: "That name is too long." };
    var words = s.split(" ");
    if (words.length < 2) return { ok: false, error: "Please write your first and last name." };
    for (var i = 0; i < words.length; i++) {
      var w = words[i], letters = w.replace(/[^\p{L}]/gu, "");
      if (!letters.length || /^[-'’.]|[-'’]$/.test(w)) return { ok: false, error: "Please check the punctuation in your name." };
      if (letters.length === 1 && !/\.$/.test(w)) return { ok: false, error: "Please write initials with a dot (J.) or the full name." };
      if (/(\p{L})\1\1/iu.test(w)) return { ok: false, error: "That does not look like a name — please check the spelling." };
      if (LATIN.test(w) && CYRILLIC.test(w)) return { ok: false, error: "Please don't mix Latin and Cyrillic letters in one word." };
      if (letters.length >= 5 && (LATIN.test(w) || CYRILLIC.test(w)) && !VOWELS.test(w)) return { ok: false, error: "That does not look like a name — please check the spelling." };
      if (letters.length > 30) return { ok: false, error: "Please check the spelling of your name." };
    }
    var value = words.map(function (w, k) { return tidyWord(w, k === 0); }).join(" ");
    return { ok: true, value: value, changed: value !== s };
  }

  // ---------------- e-mail ----------------
  var DISPOSABLE = ["mailinator.com", "10minutemail.com", "10minutemail.net", "guerrillamail.com", "guerrillamail.net", "guerrillamailblock.com",
    "sharklasers.com", "grr.la", "temp-mail.org", "tempmail.com", "tempmail.net", "temp-mail.io", "tempail.com", "yopmail.com", "yopmail.net",
    "trashmail.com", "trashmail.de", "getnada.com", "nada.email", "dispostable.com", "maildrop.cc", "throwawaymail.com", "fakeinbox.com",
    "mintemail.com", "mohmal.com", "emailondeck.com", "burnermail.io", "mailnesia.com", "spamgourmet.com", "wegwerfmail.de", "einrot.com",
    "trash-mail.com", "mytemp.email", "tempr.email", "discard.email", "moakt.com", "mailcatch.com", "inboxkitten.com", "tmpmail.org", "byom.de"];
  var COMMON = ["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "icloud.com", "me.com", "aol.com",
    "proton.me", "protonmail.com", "gmx.de", "gmx.net", "web.de", "t-online.de", "posteo.de", "mail.de", "freenet.de", "ukr.net", "i.ua",
    "meta.ua", "mail.com", "constructor.university", "jacobs-university.de"];
  var TLD_FIX = { con: "com", cmo: "com", ocm: "com", comm: "com", cm: "com", vom: "com", xom: "com", coom: "com", nte: "net", nett: "net", ogr: "org", dee: "de" };

  function distance(a, b) {                     // Damerau–Levenshtein (optimal string alignment)
    var d = [], i, j;
    for (i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (j = 0; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++) {
      var cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[a.length][b.length];
  }
  function suggestDomain(domain) {
    if (COMMON.indexOf(domain) > -1) return "";
    var best = "", bd = 3;
    COMMON.forEach(function (c) { var dd = distance(domain, c); if (dd < bd && dd <= (c.length > 8 ? 2 : 1)) { bd = dd; best = c; } });
    if (best) return best;
    var parts = domain.split("."), tld = parts[parts.length - 1];
    if (TLD_FIX[tld]) { parts[parts.length - 1] = TLD_FIX[tld]; return parts.join("."); }
    return "";
  }
  var LOCAL = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
  var LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
  function email(raw) {
    var s = String(raw == null ? "" : raw).trim().toLowerCase();
    if (!s) return { ok: false, error: "Please enter your e-mail address." };
    if (/\s/.test(s)) return { ok: false, error: "An e-mail address has no spaces." };
    var at = s.lastIndexOf("@");
    if (at < 1 || s.indexOf("@") !== at) return { ok: false, error: "Please check the address — it needs exactly one @." };
    var local = s.slice(0, at), domain = s.slice(at + 1).replace(/\.$/, "");
    if (s.length > 254 || local.length > 64 || !LOCAL.test(local)) return { ok: false, error: "Please check the part before the @." };
    var labels = domain.split(".");
    if (labels.length < 2 || !labels.every(function (l) { return LABEL.test(l); }) || !/^(?:[a-z]{2,63}|xn--[a-z0-9-]+)$/.test(labels[labels.length - 1])) {
      return { ok: false, error: "Please check the part after the @ (like gmail.com)." };
    }
    var value = local + "@" + domain, hint = suggestDomain(domain), suggestion = hint ? local + "@" + hint : "";
    if (DISPOSABLE.indexOf(domain) > -1 || DISPOSABLE.some(function (d) { return domain.slice(-d.length - 1) === "." + d; })) {
      return { ok: false, error: "Please use your own e-mail address — temporary inboxes can't receive club news.", value: value };
    }
    return { ok: true, value: value, domain: domain, suggestion: suggestion };
  }

  return { name: name, email: email, suggestDomain: suggestDomain };
});
