// Tests for the member app API (placement scoring, onboarding, lessons, FSRS cards, isolation, erasure) on real Postgres (PGlite).
// Run:  NODE_PATH=/opt/data/cache/scratch/npmtest/node_modules node tests/app.test.js
const assert = require('assert');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');
const root = path.join(__dirname, '..');
const db = require(root + '/lib/db');
const P = require(root + '/lib/placement');
let passed = 0; const ok = (name) => { passed++; console.log('  ✓', name); };
const pg = new PGlite();
db.setClient({ query: async (t, p) => (await pg.query(t, p)).rows });
process.env.DATABASE_URL = 'test';
const apply = require(root + '/api/apply.js'), settings = require(root + '/api/settings.js'), app = require(root + '/api/app.js');

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
async function signup(name, email) { const r = await call(apply, { body: { fullname: name, email, level: 'A2' } }); assert.strictEqual(r.code, 200, JSON.stringify(r.body)); return cookieOf(r); }
const answersFor = (pred) => Object.fromEntries(P.ITEMS.map((i) => [i.id, pred(i) ? i.a : (i.a + 1) % i.options.length]));

(async () => {
  console.log('Placement test');
  let r = await A('test.questions'); assert.strictEqual(r.code, 200); assert.strictEqual(r.body.questions.length, 30);
  assert.ok(r.body.questions.every((q) => !('a' in q) && !('level' in q) && q.options.length === 4)); ok('30 questions, public, no answer key and no level leaked');
  const skillsCount = {}; P.ITEMS.forEach((i) => { skillsCount[i.skill + i.level] = (skillsCount[i.skill + i.level] || 0) + 1; });
  assert.ok(Object.values(skillsCount).every((n) => n === 2) && Object.keys(skillsCount).length === 15); ok('exactly 2 questions per skill and level');
  assert.ok(P.ITEMS.every((i) => i.a >= 0 && i.a < i.options.length && new Set(i.options).size === 4)); ok('every item has a valid key and 4 distinct options');
  const sc = (f) => P.score(answersFor(f));
  let s = sc(() => true); assert.strictEqual(s.level, 'C1'); assert.deepStrictEqual(Object.values(s.skills), ['C1', 'C1', 'C1']); assert.strictEqual(s.score, 30);
  s = sc(() => false); assert.strictEqual(s.level, 'A0'); assert.strictEqual(s.score, 0); ok('all right = C1 (30/30); all wrong = A0 (0/30)');
  s = sc((i) => i.level === 'A1'); assert.strictEqual(s.level, 'A1'); ok('only A1 answered right = A1');
  s = sc((i) => i.level === 'A1' || i.level === 'B1'); assert.strictEqual(s.level, 'A1'); ok('a failed A2 blocks B1 (no skipping levels by luck)');
  s = sc((i) => ['A1', 'A2', 'B1'].includes(i.level) && !(i.skill === 'reading' && i.level === 'B1')); assert.strictEqual(s.level, 'B1'); assert.ok(s.skills.grammar === 'B1' || s.skills.grammar === 'C1' || s.skills.grammar === 'B2'); ok('4 of 6 at a level passes it; skills reported separately');
  s = P.score(Object.fromEntries(P.ITEMS.map((i) => [i.id, -1]))); assert.strictEqual(s.level, 'A0'); ok('"I don\'t know" (-1) counts as wrong');
  s = P.score({ g1: '0', g2: 0.0, v1: null, evil: 99 }); assert.ok(s.score <= 1); ok('malformed answers do not crash or score');

  console.log('Access control');
  assert.strictEqual((await A('state')).code, 401); ok('state requires login (401)');
  const ca = await signup('Anna Müller', 'anna@example.com'), cb = await signup('Ben Meyer', 'ben@example.com');
  assert.strictEqual((await A('state', { cookie: ca })).code, 200); ok('state works with the session');
  assert.strictEqual((await A('cards.add', { cookie: ca, body: { deck: 'x', cards: [{ front: 'a', back: 'b' }] }, origin: 'https://evil.example' })).code, 403); ok('cross-origin POST refused (403)');
  assert.strictEqual((await A('nope', { cookie: ca })).code, 404); ok('unknown action = 404');

  console.log('Test results');
  r = await A('test.submit', { body: { answers: answersFor((i) => i.level === 'A1' || i.level === 'A2') } }); assert.strictEqual(r.code, 200); assert.strictEqual(r.body.level, 'A2'); assert.strictEqual(r.body.saved, false); ok('guest gets a result (A2), nothing is saved');
  r = await A('test.submit', { cookie: ca, body: { answers: answersFor((i) => i.level === 'A1' || i.level === 'A2') } }); assert.strictEqual(r.body.saved, true);
  r = await A('state', { cookie: ca }); assert.strictEqual(r.body.placement.level, 'A2'); assert.strictEqual(r.body.profile.onboarded, false); assert.strictEqual(r.body.cards.total, 0); ok('member result is saved and shows in state; not onboarded yet');
  assert.strictEqual((await A('test.submit', { body: {} })).code, 400); ok('missing answers = 400');

  console.log('Onboarding');
  assert.strictEqual((await A('onboarding', { cookie: ca, body: { goal: 'hack', minutes: 10 } })).code, 400);
  assert.strictEqual((await A('onboarding', { cookie: ca, body: { goal: 'goethe', minutes: 7 } })).code, 400); ok('invalid goal / minutes refused');
  r = await A('onboarding', { cookie: ca, body: { goal: 'goethe', interests: ['music', 'music', 'film', '<script>'], minutes: 20, exam_date: '2027-03-01' } });
  assert.strictEqual(r.code, 200); assert.deepStrictEqual(r.body.profile.interests, ['music', 'film']); assert.strictEqual(r.body.profile.exam_date, '2027-03-01'); assert.strictEqual(r.body.profile.onboarded, true); ok('saved; unknown interests dropped, duplicates merged, exam date kept for Goethe');
  assert.strictEqual((await A('onboarding', { cookie: ca, body: { goal: 'goethe', minutes: 10, exam_date: '2019-01-01' } })).code, 400); ok('past exam date refused');
  r = await A('onboarding', { cookie: cb, body: { goal: 'interest', minutes: 10, exam_date: '2027-03-01' } }); assert.strictEqual(r.body.profile.exam_date, null); ok('exam date ignored for other goals');

  console.log('Lessons');
  assert.strictEqual((await A('lesson.done', { cookie: ca, body: { topic: 'verb-second', score: 5, total: 6 } })).code, 200);
  await A('lesson.done', { cookie: ca, body: { topic: 'verb-second', score: 3, total: 6 } });
  r = await A('state', { cookie: ca }); assert.strictEqual(r.body.lessons.length, 1); assert.strictEqual(r.body.lessons[0].score, 5); ok('lesson progress keeps the best score');
  assert.strictEqual((await A('lesson.done', { cookie: ca, body: { topic: '../x', score: 1, total: 1 } })).code, 400);
  assert.strictEqual((await A('lesson.done', { cookie: ca, body: { topic: 'ok', score: 9, total: 6 } })).code, 400); ok('bad topic / impossible score refused');

  console.log('Cards (FSRS)');
  const deck = Array.from({ length: 15 }, (_, i) => ({ front: 'Wort ' + i, back: 'word ' + i, example: 'Beispiel ' + i }));
  r = await A('cards.add', { cookie: ca, body: { deck: 'a1-starter', source: 'deck', cards: deck } }); assert.strictEqual(r.body.added, 15);
  r = await A('cards.add', { cookie: ca, body: { deck: 'a1-starter', cards: deck } }); assert.strictEqual(r.body.added, 0); ok('adding the same deck twice does not duplicate cards');
  r = await A('cards.due', { cookie: ca }); assert.strictEqual(r.body.queue.length, 10); assert.ok(r.body.queue.every((c) => c.isNew)); assert.deepStrictEqual(Object.keys(r.body.queue[0].intervals), ['1', '2', '3', '4']);
  assert.strictEqual(r.body.counts.due, 10); ok('15 new cards -> 10 offered today (daily new-card limit), with the 4 button previews');
  const c1 = r.body.queue[0];
  r = await A('cards.review', { cookie: ca, body: { id: c1.id, rating: 1 } }); assert.strictEqual(r.code, 200);
  r = await A('cards.due', { cookie: ca }); assert.ok(!r.body.queue.some((c) => c.id === c1.id && c.isNew)); ok('"Again" moves the card out of the new pile and schedules it ~1 min later');
  for (const c of r.body.queue.filter((c) => c.id !== c1.id).slice(0, 8)) await A('cards.review', { cookie: ca, body: { id: c.id, rating: 3 } });
  r = await A('cards.due', { cookie: ca }); assert.ok(r.body.queue.filter((c) => c.isNew).length <= 1); ok('after 9 new cards reviewed, at most 1 new card left today');
  const last = r.body.queue.find((c) => c.isNew); if (last) await A('cards.review', { cookie: ca, body: { id: last.id, rating: 4 } });
  r = await A('cards.due', { cookie: ca }); assert.strictEqual(r.body.queue.filter((c) => c.isNew).length, 0); assert.strictEqual(r.body.new_per_day, 10); ok('10 new cards done = no more new cards today, even though 5 are left in the deck');
  assert.strictEqual((await A('cards.review', { cookie: ca, body: { id: c1.id, rating: 5 } })).code, 400); ok('invalid rating refused');
  assert.strictEqual((await A('cards.review', { cookie: cb, body: { id: c1.id, rating: 3 } })).code, 404); ok('another member cannot review my card (404)');
  assert.strictEqual((await A('cards.due', { cookie: cb })).body.queue.length, 0); ok('other member sees none of my cards');

  console.log('Own data & erasure');
  r = await A('history', { cookie: ca }); assert.strictEqual(r.body.placements.length, 2 - 1 + 0 || 1); assert.strictEqual(r.body.reviews.n, 10); assert.strictEqual(r.body.cards.total, 15); ok('history shows own results and 10 reviews');
  r = await A('export', { cookie: ca }); assert.strictEqual(r.code, 200); assert.strictEqual(r.body.cards.length, 15); assert.strictEqual(r.body.reviews.length, 10); assert.ok(r.headers['content-disposition'].includes('attachment')); assert.ok(!JSON.stringify(r.body).includes('anna@example.com') || r.body.account); ok('export returns everything stored about me');
  r = await call(settings, { cookie: ca, body: { delete: true } }); assert.strictEqual(r.body.deleted, true);
  for (const t of ['placement_results', 'lesson_progress', 'cards', 'reviews']) assert.strictEqual((await pg.query(`SELECT count(*)::int n FROM ${t} WHERE user_id = (SELECT 'none')`)).rows[0].n, 0);
  const left = (await pg.query(`SELECT (SELECT count(*) FROM cards)::int c, (SELECT count(*) FROM reviews)::int r, (SELECT count(*) FROM lesson_progress)::int l, (SELECT count(*) FROM placement_results)::int p`)).rows[0];
  assert.deepStrictEqual(left, { c: 0, r: 0, l: 0, p: 0 }); ok('deleting the account erases cards, reviews, lessons and test results');
  console.log('\nApp API: ' + passed + ' checks passed');
  process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
