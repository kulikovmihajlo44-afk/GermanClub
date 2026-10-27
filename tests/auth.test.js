// Tests for sign-up / log-in with Google and Microsoft (api/auth.js, lib/oauth.js) on real Postgres (PGlite).
// The providers' token endpoints are simulated: each test decides which ID token the provider "returns".
// Run:  node tests/auth.test.js   (needs: npm install && npm install --no-save @electric-sql/pglite)
process.env.DK_DNS_OFFLINE = '1';                 // no real DNS lookups in tests (see tests/validate.test.js)
const assert = require('assert');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');
const root = path.join(__dirname, '..');
const db = require(root + '/lib/db');
let passed = 0; const ok = (name) => { passed++; console.log('  ✓', name); };
const pg = new PGlite();
db.setClient({ query: async (t, p) => (await pg.query(t, p)).rows });
process.env.DATABASE_URL = 'test';
Object.assign(process.env, { GOOGLE_CLIENT_ID: 'g-client', GOOGLE_CLIENT_SECRET: 'g-secret', MICROSOFT_CLIENT_ID: 'm-client', MICROSOFT_CLIENT_SECRET: 'm-secret' });
const auth = require(root + '/api/auth.js'), apply = require(root + '/api/apply.js'), app = require(root + '/api/app.js');
const { MS_CONSUMERS } = require(root + '/lib/oauth');

// --- fake provider: the next token request returns this ID token (and records what was sent)
let nextClaims = null, lastTokenRequest = null;
global.fetch = async (url, opts) => {
  lastTokenRequest = { url: String(url), body: new URLSearchParams(opts.body) };
  if (!nextClaims) return { ok: false, json: async () => ({ error: 'invalid_grant' }) };
  const tok = 'x.' + Buffer.from(JSON.stringify(nextClaims)).toString('base64url') + '.sig';
  return { ok: true, json: async () => ({ id_token: tok, access_token: 'a' }) };
};

function call(fn, { method = 'GET', url = '/', cookie = '', body, origin = 'https://site.test' } = {}) {
  return new Promise((resolve) => {
    const out = { code: 0, headers: {}, body: null };
    const res = {
      statusCode: 200, setHeader(k, v) { out.headers[k.toLowerCase()] = v; }, getHeader(k) { return out.headers[k.toLowerCase()]; },
      status(c) { out.code = c; return this; }, json(j) { out.body = j; resolve(out); return this; },
      end() { out.code = this.statusCode; resolve(out); },
    };
    const req = { method, url, body, headers: { host: 'site.test', origin, cookie, 'x-forwarded-for': '7.7.7.7' }, socket: {} };
    Promise.resolve(fn(req, res)).catch((e) => { out.err = e; resolve(out); });
  });
}
const cookies = (r) => [].concat(r.headers['set-cookie'] || []).map((c) => c.split(';')[0]);
const cookieVal = (r, name) => (cookies(r).find((c) => c.startsWith(name + '=')) || '').slice(name.length + 1);
async function start(p, params) {
  const r = await call(auth, { url: '/api/auth?a=start&p=' + p + '&' + new URLSearchParams(params) });
  assert.strictEqual(r.code, 302, JSON.stringify(r));
  const loc = new URL(r.headers.location);
  return { r, loc, flow: 'dk_oauth=' + cookieVal(r, 'dk_oauth'), state: loc.searchParams.get('state'), nonce: loc.searchParams.get('nonce') };
}
async function finish(s, claims, { state } = {}) {
  nextClaims = claims;
  return call(auth, { url: '/auth/callback?code=abc&state=' + encodeURIComponent(state || s.state), cookie: s.flow });
}
const now = () => Math.floor(Date.now() / 1000);
const google = (s, extra) => Object.assign({ iss: 'https://accounts.google.com', aud: 'g-client', exp: now() + 300, nonce: s.nonce, sub: '1', email: 'lena@gmail.com', email_verified: true, name: 'Lena Vogel' }, extra);
const microsoft = (s, extra) => Object.assign({ iss: 'https://login.microsoftonline.com/' + MS_CONSUMERS + '/v2.0', tid: MS_CONSUMERS, aud: 'm-client', exp: now() + 300, nonce: s.nonce, preferred_username: 'tom@outlook.com', email: 'tom@outlook.com', name: 'Tom Berg' }, extra);

(async () => {
  console.log('Providers and start');
  let r = await call(auth, { url: '/api/auth?a=providers' });
  assert.deepStrictEqual([r.body.google, r.body.microsoft], [true, true]); ok('both providers report as available once their variables are set');
  let s = await start('google', { intent: 'signup', level: 'B1' });
  assert.strictEqual(s.loc.origin + s.loc.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.strictEqual(s.loc.searchParams.get('redirect_uri'), 'https://site.test/auth/callback');
  assert.strictEqual(s.loc.searchParams.get('code_challenge_method'), 'S256'); assert.ok(s.loc.searchParams.get('code_challenge').length >= 43);
  assert.ok(s.state && s.nonce && s.flow.length > 20); assert.ok(/HttpOnly; Secure; SameSite=Lax/.test([].concat(s.r.headers['set-cookie'])[0]));
  ok('start: redirect to Google with PKCE (S256), state and nonce; the flow lives in an HttpOnly cookie');
  r = await call(auth, { url: '/api/auth?a=start&p=google&intent=signup&level=ZZ' }); assert.ok(/auth=level/.test(r.headers.location));
  r = await call(auth, { url: '/api/auth?a=start&p=yahoo&intent=signup&level=A1' }); assert.ok(/auth=config/.test(r.headers.location)); ok('unknown level or provider is refused');

  console.log('Sign-up with a confirmed address');
  r = await finish(s, google(s));
  assert.strictEqual(r.code, 302); assert.strictEqual(r.headers.location, '/app?welcome=1');
  assert.ok(cookieVal(r, 'dk_session').length > 20); assert.strictEqual(cookieVal(r, 'dk_oauth'), '');
  assert.strictEqual(lastTokenRequest.url, 'https://oauth2.googleapis.com/token'); assert.ok(lastTokenRequest.body.get('code_verifier').length >= 43);
  let u = await db.query('SELECT full_name, level, auth_provider, email_verified_at FROM users WHERE email = $1', ['lena@gmail.com']);
  assert.strictEqual(u.length, 1); assert.strictEqual(u[0].full_name, 'Lena Vogel'); assert.strictEqual(u[0].level, 'B1'); assert.strictEqual(u[0].auth_provider, 'google'); assert.ok(u[0].email_verified_at);
  ok('Google: account created with the chosen level, name from Google, marked as verified; session started');
  const lena = 'dk_session=' + cookieVal(r, 'dk_session');
  r = await call(app, { url: '/api/app?a=state', cookie: lena }); assert.strictEqual(r.code, 200); assert.strictEqual(r.body.user.full_name, 'Lena Vogel'); ok('the new session works in the app');

  s = await start('microsoft', { intent: 'signup', level: 'A1' });
  assert.ok(s.loc.href.startsWith('https://login.microsoftonline.com/common/oauth2/v2.0/authorize'));
  r = await finish(s, microsoft(s)); assert.strictEqual(r.headers.location, '/app?welcome=1');
  u = await db.query('SELECT auth_provider FROM users WHERE email = $1', ['tom@outlook.com']); assert.strictEqual(u[0].auth_provider, 'microsoft');
  ok('Microsoft personal account: account created');
  s = await start('microsoft', { intent: 'signup', level: 'A1' });
  r = await finish(s, microsoft(s, { tid: 'uni-tenant', iss: 'https://login.microsoftonline.com/uni-tenant/v2.0', preferred_username: 'JSimens@Constructor.University', email: 'jsimens@constructor.university' }));
  assert.strictEqual(r.headers.location, '/app?welcome=1'); ok('Microsoft work/school account: accepted when the e-mail is the sign-in name');

  console.log('Refusals');
  s = await start('google', { intent: 'signup', level: 'A1' });
  r = await finish(s, google(s, { email: 'ghost@gmail.com', email_verified: false }));
  assert.ok(/auth=unverified/.test(r.headers.location)); assert.strictEqual((await db.query('SELECT 1 FROM users WHERE email = $1', ['ghost@gmail.com'])).length, 0);
  ok('Google address not verified: refused, nothing stored');
  s = await start('microsoft', { intent: 'signup', level: 'A1' });
  r = await finish(s, microsoft(s, { tid: 'other', iss: 'https://login.microsoftonline.com/other/v2.0', preferred_username: 'eve@evil.example', email: 'lena@gmail.com' }));
  assert.ok(/auth=unverified/.test(r.headers.location)); ok('Microsoft tenant claiming someone else\'s e-mail (not its sign-in name): refused');
  s = await start('google', { intent: 'signup', level: 'A1' });
  r = await finish(s, google(s, { nonce: 'replayed' })); assert.ok(/auth=provider/.test(r.headers.location)); ok('wrong nonce (replayed token): refused');
  s = await start('google', { intent: 'signup', level: 'A1' });
  r = await finish(s, google(s, { aud: 'someone-else' })); assert.ok(/auth=provider/.test(r.headers.location)); ok('token for another app (audience): refused');
  s = await start('google', { intent: 'signup', level: 'A1' });
  r = await finish(s, google(s, { exp: now() - 3600 })); assert.ok(/auth=provider/.test(r.headers.location)); ok('expired token: refused');
  s = await start('google', { intent: 'signup', level: 'A1' });
  r = await finish(s, google(s), { state: 'forged-state-value' }); assert.ok(/auth=state/.test(r.headers.location)); ok('forged state (login CSRF): refused');
  r = await call(auth, { url: '/auth/callback?code=abc&state=x' }); assert.ok(/auth=expired/.test(r.headers.location)); ok('callback without the flow cookie: refused');
  s = await start('google', { intent: 'signup', level: 'A1' });
  r = await finish(s, null); assert.ok(/auth=provider/.test(r.headers.location)); ok('provider rejects the code: refused');
  r = await call(auth, { url: '/auth/callback?error=access_denied&state=x', cookie: s.flow }); assert.ok(/auth=cancelled/.test(r.headers.location)); ok('user cancels at the provider: friendly message');

  console.log('Log-in and the old form');
  s = await start('google', { intent: 'login', next: '/app/cards' });
  r = await finish(s, google(s, { name: 'Somebody Else' })); assert.strictEqual(r.headers.location, '/app/cards');
  assert.strictEqual((await db.query('SELECT count(*)::int AS n FROM users WHERE email = $1', ['lena@gmail.com']))[0].n, 1);
  assert.strictEqual((await db.query('SELECT full_name FROM users WHERE email = $1', ['lena@gmail.com']))[0].full_name, 'Lena Vogel');
  ok('existing member logs in with Google: same account (no duplicate, name kept), back to the page they wanted');
  s = await start('google', { intent: 'login', next: 'https://evil.example' });
  r = await finish(s, google(s)); assert.strictEqual(r.headers.location, '/app'); ok('open redirect via next is ignored');
  s = await start('google', { intent: 'login' });
  r = await finish(s, google(s, { email: 'new@gmail.com' })); assert.ok(/auth=noaccount/.test(r.headers.location));
  assert.strictEqual((await db.query('SELECT 1 FROM users WHERE email = $1', ['new@gmail.com'])).length, 0); ok('log-in with an unknown address: sent to sign-up, no account created');
  r = await call(apply, { method: 'POST', body: { fullname: 'Typed Name', email: 'typed@example.com', level: 'A1' } });
  assert.strictEqual(r.code, 403); assert.strictEqual(r.body.verify, true); ok('the plain form no longer creates accounts while a provider is set up');

  console.log(`\nAuth: ${passed} checks passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
