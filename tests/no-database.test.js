// The site must keep working BEFORE the database is connected: the form falls back to the Google Sheet, accounts say "being set up".
const assert = require('assert'), http = require('http'), path = require('path');
const root = path.join(__dirname, '..');
delete process.env.DATABASE_URL; delete process.env.POSTGRES_URL; delete process.env.POSTGRES_URL_NON_POOLING;
const seen = [];
const mock = http.createServer((req, res) => { let b = ''; req.on('data', (c) => b += c); req.on('end', () => { seen.push(b); res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true,"duplicate":false}'); }); });
mock.listen(0, async () => {
  process.env.APPS_SCRIPT_URL = 'http://127.0.0.1:' + mock.address().port + '/exec';
  const call = (fn, o = {}) => new Promise((resolve) => {
    const out = { code: 0, headers: {}, body: null };
    const res = { setHeader(k, v) { out.headers[k.toLowerCase()] = v; }, status(c) { out.code = c; return this; }, json(j) { out.body = j; resolve(out); return this; } };
    fn({ method: o.method || 'POST', body: o.body || {}, headers: { host: 'site.test', origin: 'https://site.test' }, socket: {} }, res);
  });
  let r = await call(require(root + '/api/apply.js'), { body: { fullname: '=EVIL', email: 'A@B.DE', level: 'b1' } });
  assert.strictEqual(r.code, 200); assert.ok(!r.body.user); assert.strictEqual(seen.length, 1);
  assert.ok(/fullname=EVIL/.test(seen[0]) && /email=a%40b.de/.test(seen[0]) && /level=B1/.test(seen[0])); console.log('  ✓ without database: form still goes to the Google Sheet (no ID, formula stripped, e-mail lower-cased)');
  r = await call(require(root + '/api/login.js'), { body: { id: '123456789012' } }); assert.strictEqual(r.code, 503) ; console.log('  ✓ login says "not configured" (503), no crash');
  r = await call(require(root + '/api/me.js'), { method: 'GET' }); assert.strictEqual(r.code, 503); console.log('  ✓ /api/me: 503, no crash');
  r = await call(require(root + '/api/admin.js'), { method: 'GET' }); assert.strictEqual(r.code, 401); console.log('  ✓ admin export refuses without the key (401)');
  console.log('No-database mode: 4 checks passed'); mock.close(); process.exit(0);
});
