// End-to-end backend tests: real Postgres (PGlite) behind the same lib/ + api/ code that runs on Vercel.
// Run:  NODE_PATH=/opt/data/cache/scratch/npmtest/node_modules node tests/backend.test.js
const assert = require('assert');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');
const root = path.join(__dirname, '..');
const db = require(root + '/lib/db');
const ids = require(root + '/lib/ids');
let passed = 0; const ok = (name) => { passed++; console.log('  ✓', name); };

const pg = new PGlite();
db.setClient({ query: async (t, p) => (await pg.query(t, p)).rows });
process.env.DATABASE_URL = 'test';
const apply = require(root + '/api/apply.js'), login = require(root + '/api/login.js'), logout = require(root + '/api/logout.js'),
      me = require(root + '/api/me.js'), settings = require(root + '/api/settings.js'), admin = require(root + '/api/admin.js');

function call(fn, { method = 'POST', body = {}, cookie = '', ip = '1.2.3.4', origin = 'https://site.test', headers = {} } = {}) {
  return new Promise((resolve) => {
    const out = { code: 0, headers: {}, body: null };
    const res = { setHeader(k, v) { out.headers[k.toLowerCase()] = v; }, status(c) { out.code = c; return this; }, json(j) { out.body = j; resolve(out); return this; } };
    const req = { method, body, headers: { host: 'site.test', origin, cookie, 'x-forwarded-for': ip, ...headers }, socket: {} };
    if (!origin) delete req.headers.origin;
    Promise.resolve(fn(req, res)).catch((e) => { out.err = e; resolve(out); });
  });
}
const cookieOf = (r) => (r.headers['set-cookie'] || '').split(';')[0];

(async () => {
  console.log('IDs');
  for (let i = 0; i < 2000; i++) { const id = ids.generateId(); assert.ok(ids.isValidId(id) && id.length === 12 && id[0] !== '0', id); }
  ok('2000 generated IDs are 12 digits, no leading zero, valid check digit');
  const sample = ids.generateId(); let flips = 0, caught = 0;
  for (let p = 0; p < 12; p++) for (let d = 0; d < 10; d++) { if (String(d) === sample[p]) continue; const bad = sample.slice(0, p) + d + sample.slice(p + 1); if (/^[1-9]/.test(bad)) { flips++; if (!ids.isValidId(bad)) caught++; } }
  assert.strictEqual(caught, flips); ok(`every single-digit typo is caught (${caught}/${flips})`);
  assert.strictEqual(ids.formatId('482173905516'), '4821 7390 5516'); assert.strictEqual(ids.normalizeId(' 4821-7390 5516 '), '482173905516'); ok('format 4-4-4 and tolerant parsing');

  console.log('Sign-up');
  let r = await call(apply, { body: { fullname: 'Anna Müller', email: 'Anna@Constructor.University', level: 'b1' } });
  assert.strictEqual(r.code, 200); assert.strictEqual(r.body.duplicate, false);
  const anna = r.body.user; const annaCookie = cookieOf(r);
  assert.ok(/^\d{4} \d{4} \d{4}$/.test(anna.id) && anna.full_name === 'Anna Müller' && anna.level === 'B1'); ok('new account: ID, name, level; no e-mail in the reply');
  assert.ok(!('email' in anna)); assert.ok(/HttpOnly/.test(r.headers['set-cookie']) && /Secure/.test(r.headers['set-cookie']) && /SameSite=Lax/.test(r.headers['set-cookie']) && /Max-Age=31536000/.test(r.headers['set-cookie'])); ok('session cookie is HttpOnly, Secure, SameSite=Lax, 1 year');
  r = await call(apply, { body: { fullname: 'Anna again', email: 'anna@constructor.university', level: 'A1' } });
  assert.strictEqual(r.body.duplicate, true); assert.ok(!r.body.user && !r.headers['set-cookie']); ok('same e-mail (any capitals): "duplicate", ID is NOT revealed, no session');
  r = await call(apply, { body: { fullname: '=HYPERLINK("http://evil","x")', email: 'evil@x.de', level: 'A0' } });
  assert.ok(!r.body.user.full_name.startsWith('=')); ok('leading formula characters stripped');
  r = await call(apply, { body: { fullname: 'Bot', email: 'bot@x.de', level: 'A0', website: 'http://spam' } }); assert.strictEqual(r.code, 200); assert.ok(!r.body.user);
  assert.strictEqual((await db.query("SELECT 1 FROM users WHERE email='bot@x.de'", [])).length, 0); ok('honeypot: fake "ok", nothing stored');
  for (const bad of [{ fullname: '', email: 'a@b.de', level: 'A1' }, { fullname: 'A', email: 'nope', level: 'A1' }, { fullname: 'A', email: 'a@b.de', level: 'Z9' }]) assert.strictEqual((await call(apply, { body: bad })).code, 400);
  ok('invalid name / e-mail / level rejected (400)');
  assert.strictEqual((await call(apply, { body: { fullname: 'X', email: 'x@y.de', level: 'A1' }, origin: 'https://evil.example' })).code, 403); ok('cross-site request refused (403)');
  assert.strictEqual((await call(apply, { method: 'GET' })).code, 405); ok('GET refused (405)');

  console.log('Session');
  r = await call(me, { method: 'GET', cookie: annaCookie }); assert.strictEqual(r.code, 200); assert.strictEqual(r.body.user.id, anna.id); ok('/api/me with the cookie returns the same user (stays logged in)');
  assert.strictEqual((await call(me, { method: 'GET' })).code, 401); ok('/api/me without cookie: 401');
  const tampered = annaCookie.replace(/\.[^.]*$/, '.AAAA'); assert.strictEqual((await call(me, { method: 'GET', cookie: tampered })).code, 401); ok('tampered cookie rejected');
  const [, body64] = decodeURIComponent(annaCookie.split('=')[1]).split('.'); const forged = JSON.parse(Buffer.from(body64, 'base64url')); forged.u = '999999999999';
  const forgedCookie = 'dk_session=' + encodeURIComponent('v1.' + Buffer.from(JSON.stringify(forged)).toString('base64url') + '.' + decodeURIComponent(annaCookie).split('.')[2]);
  assert.strictEqual((await call(me, { method: 'GET', cookie: forgedCookie })).code, 401); ok('forged session for another user rejected');

  console.log('Login by ID (other device)');
  const rawId = anna.id.replace(/ /g, '');
  r = await call(login, { body: { id: anna.id }, ip: '9.9.9.9' }); assert.strictEqual(r.code, 200); assert.strictEqual(r.body.user.full_name, 'Anna Müller'); assert.ok(cookieOf(r)); ok('log in with the formatted ID (4-4-4) on a different device');
  assert.strictEqual((await call(login, { body: { id: rawId }, ip: '9.9.9.8' })).code, 200); ok('log in with plain 12 digits');
  r = await call(login, { body: { id: '123456789012' }, ip: '5.5.5.5' }); assert.strictEqual(r.code, 401); ok('unknown / invalid ID: 401, same message either way');
  for (let i = 0; i < 4; i++) await call(login, { body: { id: '111111111111' }, ip: '5.5.5.5' });
  r = await call(login, { body: { id: rawId }, ip: '5.5.5.5' }); assert.strictEqual(r.code, 429); ok('after 5 wrong IDs the device is paused (429) — even for the correct ID');
  assert.strictEqual((await call(login, { body: { id: rawId }, ip: '6.6.6.6' })).code, 200); ok('other devices are not affected by that pause');

  console.log('Settings');
  r = await call(settings, { cookie: annaCookie, body: { want_test: false, banner_dismissed: true } }); assert.strictEqual(r.code, 200); assert.strictEqual(r.body.user.want_test, false); assert.strictEqual(r.body.user.banner_dismissed, true); assert.strictEqual(r.body.user.want_notify, true); ok('toggle level test off, dismiss banner');
  r = await call(me, { method: 'GET', cookie: annaCookie }); assert.strictEqual(r.body.user.want_test, false); ok('settings persist');
  r = await call(settings, { cookie: annaCookie, body: { want_test: true, want_notify: true, level: 'c1' } }); assert.strictEqual(r.body.user.level, 'C1'); assert.ok(r.body.user.want_test && r.body.user.want_notify); ok('both notifications + test can be on; level can change');
  assert.strictEqual((await call(settings, { cookie: annaCookie, body: { want_test: 'yes' } })).code, 400); assert.strictEqual((await call(settings, { cookie: annaCookie, body: { level: 'Q' } })).code, 400); assert.strictEqual((await call(settings, { cookie: annaCookie, body: {} })).code, 400); ok('invalid settings rejected');
  assert.strictEqual((await call(settings, { body: { want_test: true } })).code, 401); ok('settings need a session');

  console.log('Log out / delete');
  r = await call(logout, { cookie: annaCookie }); assert.strictEqual(r.code, 200); assert.ok(/Max-Age=0/.test(r.headers['set-cookie'])); ok('log out clears the cookie');
  r = await call(apply, { body: { fullname: 'Del Me', email: 'del@x.de', level: 'A2' }, ip: '7.7.7.7' }); const delCookie = cookieOf(r);
  r = await call(settings, { cookie: delCookie, body: { delete: true } }); assert.ok(r.body.deleted);
  assert.strictEqual((await call(me, { method: 'GET', cookie: delCookie })).code, 401); assert.strictEqual((await db.query("SELECT 1 FROM users WHERE email='del@x.de'", [])).length, 0); ok('account deletion removes the data; old cookie stops working');

  console.log('Sign-up limits & admin');
  let last; for (let i = 0; i < 12; i++) last = await call(apply, { body: { fullname: 'N' + i, email: `n${i}@x.de`, level: 'A1' }, ip: '8.8.8.8' });
  assert.strictEqual(last.code, 429); ok('more than 10 sign-ups/hour from one device: 429');
  assert.strictEqual((await call(admin, { method: 'GET' })).code, 401); ok('admin export refuses requests without the key (401)');
  assert.strictEqual((await call(admin, { method: 'GET', headers: { authorization: 'Bearer wrong' } })).code, 401); ok('wrong key refused (401)');
  const testKey = 'k'.repeat(48); process.env.ADMIN_TOKEN_SHA256 = require('crypto').createHash('sha256').update(testKey).digest('hex');
  r = await call(admin, { method: 'GET', headers: { authorization: 'Bearer ' + testKey } }); assert.strictEqual(r.code, 200); assert.ok(r.body.users.length >= 2 && r.body.users[0].email && r.body.users[0].id); ok('admin export works with the key whose fingerprint is configured, and returns IDs');
  assert.ok(!JSON.stringify(r.body).includes('session_secret')); ok('export contains no session secret');
  console.log('\nBackend: ' + passed + ' checks passed');
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e && e.stack || e); process.exit(1); });
