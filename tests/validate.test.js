// Tests for the name and e-mail checks (assets/validate.js, lib/emailcheck.js) and how sign-up uses them.
// DNS answers are simulated, so the tests never depend on the network.
// Run:  node tests/validate.test.js   (needs: npm install && npm install --no-save @electric-sql/pglite)
const assert = require('assert');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');
const root = path.join(__dirname, '..');
const db = require(root + '/lib/db');
const V = require(root + '/assets/validate');
const E = require(root + '/lib/emailcheck');
let passed = 0; const ok = (name) => { passed++; console.log('  ✓', name); };

// simulated DNS: gmail.com / gmial.com / web.de have mail servers, example.com says "no mail" (null MX),
// a-only.de has no MX but an address record (mail still works), nowhere.de does not exist, slow.de times out
const err = (code) => Object.assign(new Error(code), { code });
E.setResolver({
  mx: async (d) => ({ 'gmail.com': [{ exchange: 'gmail-smtp-in.l.google.com', priority: 5 }], 'gmial.com': [{ exchange: 'mx.gmial.com', priority: 10 }],
    'web.de': [{ exchange: 'mx-ha03.web.de', priority: 100 }], 'example.com': [{ exchange: '', priority: 0 }] })[d] || (() => { throw err(d === 'slow.de' ? 'ETIMEOUT' : 'ENOTFOUND'); })(),
  a: async (d) => { if (d === 'a-only.de') return ['93.184.216.34']; throw err('ENOTFOUND'); },
  aaaa: async () => { throw err('ENOTFOUND'); },
});

(async () => {
  console.log('Names');
  const n = (s) => V.name(s);
  assert.strictEqual(n('anna müller').value, 'Anna Müller'); assert.strictEqual(n('ANNA MÜLLER').value, 'Anna Müller');
  assert.strictEqual(n('  =Eva   Klein ').value, 'Eva Klein'); ok('capitals and spaces are tidied, formula characters removed');
  assert.strictEqual(n('ludwig van beethoven').value, 'Ludwig van Beethoven'); assert.strictEqual(n("sean o'brien").value, "Sean O'Brien");
  assert.strictEqual(n('hans-peter schmidt').value, 'Hans-Peter Schmidt'); assert.strictEqual(n('Leonardo DiCaprio').value, 'Leonardo DiCaprio');
  ok('particles stay small (van, von), O\'Brien and Hans-Peter, deliberate capitals like DiCaprio are kept');
  assert.ok(n('Марія Шевченко').ok && n('Zoë Ångström').ok && n('J. Simens').ok); ok('Cyrillic, accents and initials with a dot are fine');
  for (const bad of ['', 'Anna', 'Anna M', 'Anna 2', 'Anna_Müller', 'anna@mail.de', 'asdfg qwrtz', 'Aaaaa Bbb', 'Anna- Müller', 'HYPERLINK("x") y'])
    assert.strictEqual(n(bad).ok, false, bad);
  ok('refused: empty, one word, missing initial dot, digits, symbols, e-mail, gibberish, letter runs, stray punctuation');
  assert.strictEqual(n('Михайло Кулiков').ok, false); ok('a Latin letter hidden in a Cyrillic word (look-alike) is refused');

  console.log('E-mail format');
  const e = (s) => V.email(s);
  assert.strictEqual(e(' Anna@Web.DE ').value, 'anna@web.de'); ok('trimmed and lower-cased');
  for (const bad of ['anna', 'anna@@web.de', 'anna web.de', 'anna@web', 'anna..x@web.de', '.anna@web.de', 'anna@-web.de', 'anna@web.d3'])
    assert.strictEqual(e(bad).ok, false, bad);
  ok('broken addresses are refused with a reason');
  assert.strictEqual(e('a@mailinator.com').ok, false); assert.strictEqual(e('a@x.yopmail.com').ok, false); ok('throw-away inboxes are refused');
  assert.strictEqual(e('anna@gmial.com').suggestion, 'anna@gmail.com'); assert.strictEqual(e('anna@gmail.con').suggestion, 'anna@gmail.com');
  assert.strictEqual(e('x@hotmial.com').suggestion, 'x@hotmail.com'); assert.strictEqual(e('s@constructor.univeristy').suggestion, 's@constructor.university');
  assert.strictEqual(e('anna@gmail.com').suggestion, ''); assert.strictEqual(e('anna@my-company.de').suggestion, ''); ok('typos in common domains get a "did you mean", real domains do not');

  console.log('Does the domain receive mail (DNS)');
  assert.strictEqual((await E.checkEmail('anna@gmail.com')).ok, true); ok('domain with a mail server: accepted');
  let r = await E.checkEmail('x@example.com'); assert.strictEqual(r.ok, false); assert.ok(/no mail server/.test(r.error)); ok('"null MX" (domain accepts no mail): refused');
  r = await E.checkEmail('x@nowhere.de'); assert.strictEqual(r.ok, false); ok('domain that does not exist: refused');
  assert.strictEqual((await E.checkEmail('x@a-only.de')).ok, true); ok('no MX but an address record (mail still delivered): accepted');
  assert.strictEqual((await E.checkEmail('x@slow.de')).ok, true); ok('DNS timeout on our side never blocks a sign-up');

  console.log('Sign-up uses the checks');
  const pg = new PGlite(); db.setClient({ query: async (t, p) => (await pg.query(t, p)).rows }); process.env.DATABASE_URL = 'test';
  const apply = require(root + '/api/apply.js'), auth = require(root + '/api/auth.js');
  const call = (fn, { method = 'POST', body = {}, url = '/' } = {}) => new Promise((resolve) => {
    const out = { code: 0, body: null, headers: {} };
    const res = { setHeader(k, v) { out.headers[k] = v; }, getHeader() {}, status(c) { out.code = c; return this; }, json(j) { out.body = j; resolve(out); return this; }, end() { resolve(out); } };
    fn({ method, url, body, headers: { host: 'site.test', origin: 'https://site.test', 'x-forwarded-for': '5.5.5.5' }, socket: {} }, res);
  });
  r = await call(apply, { body: { fullname: 'anna MÜLLER', email: 'Anna@Gmail.com', level: 'B1' } });
  assert.strictEqual(r.code, 200); assert.strictEqual(r.body.user.full_name, 'Anna Müller'); ok('valid sign-up: stored with the tidied name');
  r = await call(apply, { body: { fullname: 'Anna', email: 'b@gmail.com', level: 'B1' } });
  assert.strictEqual(r.code, 400); assert.strictEqual(r.body.field, 'fullname'); ok('one-word name: 400 with field "fullname"');
  r = await call(apply, { body: { fullname: 'Ben Meyer', email: 'ben@example.com', level: 'B1' } });
  assert.strictEqual(r.code, 400); assert.strictEqual(r.body.field, 'email'); ok('domain without mail: 400 with field "email"');
  r = await call(apply, { body: { fullname: 'Ben Meyer', email: 'ben@mailinator.com', level: 'B1' } }); assert.strictEqual(r.body.field, 'email'); ok('throw-away inbox: refused');
  r = await call(apply, { body: { fullname: 'Ben Meyer', email: 'ben@gmial.com', level: 'B1' } });
  assert.strictEqual(r.code, 400); assert.strictEqual(r.body.typo, true); assert.strictEqual(r.body.suggestion, 'ben@gmail.com'); ok('likely typo (gmial.com): asked "did you mean ben@gmail.com?"');
  r = await call(apply, { body: { fullname: 'Ben Meyer', email: 'ben@gmial.com', level: 'B1', email_confirmed: '1' } });
  assert.strictEqual(r.code, 200); assert.ok(r.body.user); ok('"keep mine" confirmed: accepted');
  r = await call(auth, { method: 'GET', url: '/api/auth?a=check-email&email=' + encodeURIComponent('x@nowhere.de') });
  assert.strictEqual(r.body.valid, false); assert.ok(r.body.error);
  r = await call(auth, { method: 'GET', url: '/api/auth?a=check-email&email=' + encodeURIComponent('x@gmail.con') });
  assert.strictEqual(r.body.suggestion, 'x@gmail.com'); ok('live check endpoint: reason and suggestion for the form');

  console.log(`\nValidation: ${passed} checks passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
