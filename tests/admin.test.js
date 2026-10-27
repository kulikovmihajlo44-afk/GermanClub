// Tests for the admin window API (admin.users, admin.delete, user.is_admin) on real Postgres (PGlite).
// Run:  node tests/admin.test.js   (needs: npm install && npm install --no-save @electric-sql/pglite)
const assert = require('assert');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');
const root = path.join(__dirname, '..');
const db = require(root + '/lib/db');
let passed = 0; const ok = (name) => { passed++; console.log('  ✓', name); };
const pg = new PGlite();
db.setClient({ query: async (t, p) => (await pg.query(t, p)).rows });
process.env.DATABASE_URL = 'test';
const apply = require(root + '/api/apply.js'), settings = require(root + '/api/settings.js'), app = require(root + '/api/app.js');
const P = require(root + '/lib/placement'), E = require(root + '/assets/test.js');

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
async function signup(name, email, level = 'A2') { const r = await call(apply, { body: { fullname: name, email, level } }); assert.strictEqual(r.code, 200, JSON.stringify(r.body)); return cookieOf(r); }
const idOf = async (cookie) => (await A('state', { cookie })).body.user.id.replace(/\s/g, '');
const fullTest = () => { const hist = [], seq = [], answers = {}; for (let n = 0; n < 20; n++) { const q = E.pickNext(P.publicBank(), hist), it = P.ITEMS.find((x) => x.id === q.id); hist.push({ item: q, correct: true }); seq.push(q.id); answers[q.id] = it.a; } return { seq, answers }; };

(async () => {
  console.log('Admin window');
  const boss = await signup('Admin Anna', 'anna@example.com'), second = await signup('Admin Boris', 'boris@example.com');
  const bea = await signup('Bea Beginner', 'bea@example.com', 'A0'), carl = await signup('Carl Goethe', 'carl@example.com', 'B1');
  const ids = { boss: await idOf(boss), second: await idOf(second), bea: await idOf(bea), carl: await idOf(carl) };

  delete process.env.ADMIN_IDS;
  let r = await A('state', { cookie: boss }); assert.strictEqual(r.body.user.is_admin, false);
  r = await A('admin.users', { cookie: boss }); assert.strictEqual(r.code, 403); ok('without ADMIN_IDS nobody is an admin (403)');

  process.env.ADMIN_IDS = ids.boss.replace(/(\d{4})(?=\d)/g, '$1 ') + ' , ' + ids.second;      // spaced and plain spelling both work
  r = await A('state', { cookie: boss }); assert.strictEqual(r.body.user.is_admin, true);
  r = await A('state', { cookie: bea }); assert.strictEqual(r.body.user.is_admin, false); ok('state: user.is_admin is true only for IDs in ADMIN_IDS');

  r = await A('admin.users', { cookie: bea }); assert.strictEqual(r.code, 403);
  r = await A('admin.delete', { cookie: bea, body: { id: ids.carl } }); assert.strictEqual(r.code, 403); ok('members get 403 on every admin action');
  r = await A('admin.users'); assert.strictEqual(r.code, 401); ok('logged-out visitors get 401');

  await A('onboarding', { cookie: carl, body: { goal: 'goethe', interests: ['music', 'film'], minutes: 15, exam_date: new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10) } });
  const t = fullTest(); r = await A('test.submit', { cookie: carl, body: t }); assert.strictEqual(r.body.saved, true);

  r = await A('admin.users', { cookie: boss }); assert.strictEqual(r.code, 200); assert.strictEqual(r.body.users.length, 4);
  const byName = Object.fromEntries(r.body.users.map((u) => [u.full_name, u]));
  const c = byName['Carl Goethe'], b = byName['Bea Beginner'];
  assert.ok(/^\d{4} \d{4} \d{4}$/.test(c.id) && c.email === 'carl@example.com'); ok('admin.users lists every member with ID (4-4-4) and e-mail');
  assert.ok(c.placement && c.placement.level && c.placement.total === 20 && c.placement.taken_at); assert.strictEqual(b.placement, null); ok('latest placement result per member (null if no test)');
  assert.strictEqual(c.goal, 'goethe'); assert.deepStrictEqual(c.interests, ['music', 'film']); assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(c.exam_date)); ok('goal, interests and Goethe exam date');
  assert.strictEqual(byName['Admin Anna'].is_me, true); assert.strictEqual(byName['Admin Anna'].is_admin, true); assert.strictEqual(byName['Admin Boris'].is_admin, true); assert.strictEqual(c.is_admin, false); ok('is_me / is_admin flags');
  assert.ok(r.body.users.every((u) => !('session' in u) && !('secret' in u))); ok('no secrets in the list');

  r = await A('admin.delete', { cookie: boss, body: { id: 'abc' } }); assert.strictEqual(r.code, 400); ok('malformed ID refused (400)');
  r = await A('admin.delete', { cookie: boss, body: { id: ids.boss } }); assert.strictEqual(r.code, 400); ok('an admin cannot delete themselves here');
  r = await A('admin.delete', { cookie: boss, body: { id: ids.second } }); assert.strictEqual(r.code, 400); ok('an admin cannot delete another admin');
  r = await A('admin.delete', { cookie: boss, body: { id: '100000000009' } }); assert.strictEqual(r.code, 404); ok('unknown account = 404');
  r = await A('admin.delete', { cookie: boss, body: { id: ids.carl }, origin: 'https://evil.test' }); assert.strictEqual(r.code, 403); ok('cross-origin delete refused (403)');

  r = await A('admin.delete', { cookie: boss, body: { id: ids.carl.replace(/(\d{4})(?=\d)/g, '$1 ') } }); assert.strictEqual(r.code, 200); assert.strictEqual(r.body.deleted, true);
  r = await A('admin.users', { cookie: boss }); assert.ok(!r.body.users.some((u) => u.full_name === 'Carl Goethe')); ok('delete removes the member (spaced ID accepted)');
  const left = await db.query('SELECT count(*)::int AS n FROM placement_results WHERE user_id = $1', [ids.carl]); assert.strictEqual(left[0].n, 0); ok('their test results go with them');
  r = await A('state', { cookie: carl }); assert.strictEqual(r.code, 401); ok('the deleted member is logged out');

  r = await A('admin.nope', { cookie: boss }); assert.strictEqual(r.code, 404); ok('unknown admin action = 404');
  process.env.ADMIN_IDS = 'hello, 12';
  r = await A('admin.users', { cookie: boss }); assert.strictEqual(r.code, 403); ok('removing an ID from ADMIN_IDS removes access at once');

  console.log(`\nAdmin: ${passed} checks passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
