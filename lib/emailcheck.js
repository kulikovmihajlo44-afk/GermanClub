// Can this e-mail domain receive mail at all? Looks up the domain's MX records (or, as mail servers do, its address
// records when there is no MX). Format, throw-away domains and typo hints come from assets/validate.js.
// A slow or failing DNS server never blocks a sign-up: only a definite "no such domain / no mail" does.
const dns = require('dns').promises;
const V = require('../assets/validate');

const cache = new Map();                                    // domain -> { ok, at }
const TTL = 6 * 3600 * 1000;
let resolver = { mx: (d) => dns.resolveMx(d), a: (d) => dns.resolve4(d), aaaa: (d) => dns.resolve6(d) };
function setResolver(r) { resolver = r; cache.clear(); }    // used by the tests

const NO = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN', 'ENONAME']);
function within(ms, p) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), ms))]); }

async function receivesMail(domain) {
  if (process.env.DK_DNS_OFFLINE === '1') return true;
  const hit = cache.get(domain);
  if (hit && Date.now() - hit.at < TTL) return hit.ok;
  let ok;
  try {
    const mx = await within(3000, resolver.mx(domain));
    // RFC 7505 "null MX" (a single record pointing at ".") means: this domain accepts no mail
    ok = mx.some((r) => r && r.exchange && r.exchange !== '.' && r.exchange !== '');
  } catch (e) {
    if (!NO.has(e.code)) return true;                       // DNS trouble on our side: let the sign-up through
    try { ok = (await within(3000, resolver.a(domain).catch(() => resolver.aaaa(domain)))).length > 0; }
    catch (e2) { if (!NO.has(e2.code)) return true; ok = false; }
  }
  cache.set(domain, { ok, at: Date.now() });
  return ok;
}

// -> { ok, value, error?, suggestion? }
async function checkEmail(raw) {
  const r = V.email(raw);
  if (!r.ok) return r;
  if (!(await receivesMail(r.domain))) {
    return { ok: false, value: r.value, suggestion: r.suggestion, error: r.suggestion
      ? `There is no mail server at ${r.domain}. Did you mean ${r.suggestion}?`
      : `There is no mail server at ${r.domain} — please check the address.` };
  }
  return r;
}

module.exports = { checkEmail, receivesMail, setResolver };
