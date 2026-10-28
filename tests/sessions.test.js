// Tests for the next-session lookup (lib/sessions.js) and its public API action (?a=next-session).
// Notion is simulated: each test decides which rows the "Sessions" table returns.
// Run:  node tests/sessions.test.js
const assert = require('assert');
const path = require('path');
const root = path.join(__dirname, '..');
const S = require(root + '/lib/sessions');
let passed = 0; const ok = (name) => { passed++; console.log('  ✓', name); };

let rows = [], lastBody = null, status = 200;
global.fetch = async (url, opts) => {
  lastBody = { url: String(url), headers: opts.headers, body: JSON.parse(opts.body) };
  return { ok: status === 200, status, json: async () => ({ results: rows }) };
};
const row = (title, start, end, place, level) => ({ properties: {
  Session: { title: [{ plain_text: title }] }, Date: { date: { start, end: end || null } },
  Place: { rich_text: place ? [{ plain_text: place }] : [] }, Level: { rich_text: level ? [{ plain_text: level }] : [] },
} });
const NOW = new Date('2026-11-01T10:00:00Z');

(async () => {
  console.log('Next session');
  delete process.env.NOTION_TOKEN; S._reset();
  let r = await S.nextSession(NOW);
  assert.strictEqual(r.session, null); assert.strictEqual(r.reason, 'not_configured'); ok('no NOTION_TOKEN: no session (the site shows "unknown")');

  process.env.NOTION_TOKEN = 'secret_test'; S._reset();
  rows = [row('Past', '2026-10-25T13:00:00+01:00', '2026-10-25T16:00:00+01:00', 'Room 1'),
          row('Later', '2026-11-15T13:00:00+01:00', '2026-11-15T16:00:00+01:00', 'Room 9'),
          row('Next', '2026-11-08T13:00:00+01:00', '2026-11-08T16:00:00+01:00', 'East Hall, Seminar Room 3', 'all levels welcome')];
  r = await S.nextSession(NOW);
  assert.strictEqual(r.session.title, 'Next'); assert.strictEqual(r.session.start, '2026-11-08T12:00:00.000Z');
  assert.strictEqual(r.session.place, 'East Hall, Seminar Room 3'); assert.strictEqual(r.session.level, 'all levels welcome');
  ok('earliest planned session that has not ended wins; past ones are skipped');
  assert.ok(/databases\/bfd7c3efd44f4f8c8865f8079604eca8\/query$/.test(lastBody.url));
  assert.strictEqual(lastBody.headers.Authorization, 'Bearer secret_test');
  assert.deepStrictEqual(lastBody.body.filter.and[0], { property: 'Status', select: { equals: 'Planned' } });
  ok('asks Notion for Planned rows of the Sessions database, with the token');

  S._reset();
  rows = [row('Running', '2026-11-01T10:30:00+01:00', '2026-11-01T13:30:00+01:00')];
  r = await S.nextSession(NOW); assert.strictEqual(r.session.title, 'Running'); ok('a session that is running right now still counts');
  S._reset();
  rows = [row('No end', '2026-11-01T09:00:00+01:00')];
  r = await S.nextSession(NOW); assert.strictEqual(r.session.end, '2026-11-01T11:00:00.000Z'); ok('without an end time a session lasts three hours');
  S._reset();
  rows = [row('Day only', '2026-11-08')];
  r = await S.nextSession(NOW); assert.strictEqual(r.session, null); assert.strictEqual(r.reason, 'none_planned'); ok('a row with a day but no time is not shown');

  S._reset(); rows = [];
  r = await S.nextSession(NOW); assert.strictEqual(r.reason, 'none_planned'); ok('empty table: no session');
  S._reset(); status = 401;
  r = await S.nextSession(NOW); assert.strictEqual(r.session, null); assert.strictEqual(r.reason, 'unavailable'); ok('Notion error (bad token, not shared): no session, no crash');
  status = 200;

  console.log('API');
  S._reset(); delete process.env.DATABASE_URL;
  rows = [row('Next', '2099-11-08T13:00:00+01:00', '2099-11-08T16:00:00+01:00', 'East Hall')];
  const app = require(root + '/api/app.js');
  const out = await new Promise((resolve) => {
    const o = { code: 0, headers: {}, body: null };
    app({ method: 'GET', url: '/api/app?a=next-session', headers: { host: 'site.test' }, socket: {} },
      { setHeader(k, v) { o.headers[k] = v; }, getHeader() {}, status(c) { o.code = c; return this; }, json(j) { o.body = j; resolve(o); return this; }, end() { resolve(o); } });
  });
  assert.strictEqual(out.code, 200); assert.strictEqual(out.body.session.place, 'East Hall');
  assert.ok(/s-maxage=60/.test(out.headers['Cache-Control']));
  ok('?a=next-session is public, works without our database and is cached for a minute at the edge');

  console.log(`\nSessions: ${passed} checks passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
