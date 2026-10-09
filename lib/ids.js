// 12-digit account IDs: 11 random digits + 1 Luhn check digit (typos are caught before any database lookup).
const crypto = require('crypto');

function luhnCheckDigit(payload) {                 // payload: string of digits, check digit NOT included
  let sum = 0;
  for (let i = 0; i < payload.length; i++) {
    let d = payload.charCodeAt(payload.length - 1 - i) - 48;
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return String((10 - (sum % 10)) % 10);
}
function isValidId(id) {
  return /^[1-9]\d{11}$/.test(id) && luhnCheckDigit(id.slice(0, 11)) === id[11];
}
function generateId() {
  let p = String(crypto.randomInt(1, 10));         // first digit 1-9: never a leading zero
  for (let i = 1; i < 11; i++) p += String(crypto.randomInt(0, 10));
  return p + luhnCheckDigit(p);
}
function normalizeId(input) { return String(input == null ? '' : input).replace(/\D/g, ''); }
function formatId(id) { return String(id).replace(/(\d{4})(?=\d)/g, '$1 '); }

module.exports = { generateId, isValidId, normalizeId, formatId, luhnCheckDigit };
