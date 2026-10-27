// Tests for the member card avatar (POST ?a=avatar, profile.avatar) on real Postgres (PGlite).
// Run:  node tests/avatar.test.js   (needs: npm install && npm install --no-save @electric-sql/pglite)
const assert = require('assert');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');
const root = path.join(__dirname, '..');
const db = require(root + '/lib/db');
let passed = 0; const ok = (name) => { passed++; console.log('  ✓', name); };
const pg = new PGlite();
db.setClient({ query: async (t, p) => (await pg.query(t, p)).rows });
process.env.DATABASE_URL = 'test';
const apply = require(root + '/api/apply.js'), app = require(root + '/api/app.js');

function call(fn, { method = 'POST', body = {}, cookie = '', url = '/', origin = 'https://site.test' } = {}) {
  return new Promise((resolve) => {
    const out = { code: 0, headers: {}, body: null };
    const res = { setHeader(k, v) { out.headers[k.toLowerCase()] = v; }, status(c) { out.code = c; return this; }, json(j) { out.body = j; resolve(out); return this; } };
    const req = { method, url, body, headers: { host: 'site.test', origin, cookie, 'x-forwarded-for': '9.9.9.9' }, socket: {} };
    if (!origin) delete req.headers.origin;
    Promise.resolve(fn(req, res)).catch((e) => { out.err = e; resolve(out); });
  });
}
const A = (a, o = {}) => call(app, { method: o.body !== undefined ? 'POST' : 'GET', url: '/api/app?a=' + a, ...o });
const cookieOf = (r) => (r.headers['set-cookie'] || '').split(';')[0];
async function signup(name, email) { const r = await call(apply, { body: { fullname: name, email, level: 'A1' } }); assert.strictEqual(r.code, 200); return cookieOf(r); }

(async () => {
  console.log('Member card avatar');
  const mia = await signup('Mia', 'mia@example.com'), tom = await signup('Tom', 'tom@example.com');
  let r = await A('state', { cookie: mia }); assert.strictEqual(r.body.profile.avatar, null); ok('a new member has no avatar yet (the card asks for one)');
  r = await A('avatar', { cookie: mia, body: { avatar: 'kugel' } }); assert.strictEqual(r.code, 200); assert.strictEqual(r.body.profile.avatar, 'kugel');
  r = await A('state', { cookie: mia }); assert.strictEqual(r.body.profile.avatar, 'kugel'); ok('choosing an avatar is saved and returned in state');
  r = await A('avatar', { cookie: mia, body: { avatar: 'wuerfel' } }); r = await A('state', { cookie: mia }); assert.strictEqual(r.body.profile.avatar, 'wuerfel'); ok('the avatar can be changed');
  r = await A('avatar', { cookie: mia, body: { avatar: '<script>' } }); assert.strictEqual(r.code, 400);
  r = await A('avatar', { cookie: mia, body: {} }); assert.strictEqual(r.code, 400); ok('unknown or missing avatar refused (400)');
  r = await A('avatar', { body: { avatar: 'ring' } }); assert.strictEqual(r.code, 401); ok('logged-out visitors get 401');
  r = await A('avatar', { cookie: mia, body: { avatar: 'ring' }, origin: 'https://evil.test' }); assert.strictEqual(r.code, 403); ok('cross-origin request refused (403)');
  r = await A('state', { cookie: tom }); assert.strictEqual(r.body.profile.avatar, null); ok("one member's avatar does not touch another's");
  r = await A('export', { cookie: mia }); assert.strictEqual(r.body.profile.avatar, 'wuerfel'); ok('the avatar is part of the data export');
  console.log(`\nAvatar: ${passed} checks passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
