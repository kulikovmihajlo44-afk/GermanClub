// Sign up / log in with Google or Microsoft, so a new member's e-mail address is confirmed by its provider.
//   GET /api/auth?a=providers                                  -> { google: bool, microsoft: bool }
//   GET /api/auth?a=start&p=google|microsoft&intent=signup|login&level=A0..C1&next=/app/...  -> 302 to the provider
//   GET /auth/callback?code=…&state=…   (rewritten to this function)  -> session cookie, 302 into the app
// A short-lived signed cookie carries state, PKCE verifier and nonce between the two legs.
const crypto = require('crypto');
const db = require('../lib/db');
const H = require('../lib/http');
const O = require('../lib/oauth');
const { generateId } = require('../lib/ids');

const FLOW = 'dk_oauth';
const noFormula = (v) => String(v || '').trim().replace(/^[\s=+\-@]+/, '').trim();
function flowCookie(value, maxAge) { return `${FLOW}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`; }
function addCookie(res, c) {
  const prev = res.getHeader ? res.getHeader('Set-Cookie') : null;
  res.setHeader('Set-Cookie', prev ? [].concat(prev, c) : c);
}
function redirect(res, to) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Location', to);
  res.statusCode = 302;
  return res.end();
}
function baseUrl(req) { return process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/\/+$/, '') : 'https://' + req.headers.host; }
function safeNext(n) { n = String(n || ''); return /^\/(app|test)(\/|\?|$)/.test(n) && n.indexOf('//') === -1 ? n : ''; }
function fail(res, code) { addCookie(res, flowCookie('', 0)); return redirect(res, '/?home=1&auth=' + code + '#join'); }

module.exports = H.handler(async (req, res) => {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return H.send(res, 405, { ok: false, error: 'Method not allowed' }); }
  const url = new URL(req.url || '/', 'http://x'), q = url.searchParams;
  const a = q.get('a') || (q.has('state') || q.has('error') ? 'callback' : '');

  if (a === 'providers') {
    const on = db.configured() ? O.enabled() : [];
    return H.send(res, 200, { ok: true, google: on.includes('google'), microsoft: on.includes('microsoft') });
  }

  if (a === 'start') {
    const p = q.get('p');
    if (!O.PROVIDERS[p] || !O.creds(p)) return fail(res, 'config');
    if (!db.configured()) return fail(res, 'config');
    const intent = q.get('intent') === 'login' ? 'login' : 'signup';
    const level = String(q.get('level') || '').toUpperCase();
    if (intent === 'signup' && !H.LEVELS.includes(level)) return fail(res, 'level');
    const { verifier, challenge } = O.pkce();
    const state = crypto.randomBytes(16).toString('base64url'), nonce = crypto.randomBytes(16).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    addCookie(res, flowCookie(await H.sign({ p, s: state, v: verifier, n: nonce, i: intent, l: level, x: safeNext(q.get('next')), exp: now + 600 }), 600));
    return redirect(res, O.authorizeUrl(p, { redirectUri: baseUrl(req) + '/auth/callback', state, nonce, challenge }));
  }

  if (a === 'callback') {
    const flow = await H.verify(H.parseCookies(req)[FLOW]);
    if (!flow) return fail(res, 'expired');
    if (q.get('error')) return fail(res, 'cancelled');
    const given = String(q.get('state') || ''), want = String(flow.s);
    if (given.length !== want.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(want))) return fail(res, 'state');
    let idToken;
    try { idToken = await O.exchange(flow.p, { code: String(q.get('code') || ''), redirectUri: baseUrl(req) + '/auth/callback', verifier: flow.v }); }
    catch (e) { return fail(res, 'provider'); }
    const who = O.verifiedIdentity(flow.p, O.claimsOf(idToken), { nonce: flow.n });
    if (who.error) return fail(res, who.error);

    const found = await db.query('SELECT id FROM users WHERE email = $1', [who.email]);
    let userId, isNew = false;
    if (found.length) {                                   // the address is confirmed: log the owner in, and remember the confirmation
      userId = found[0].id;
      await db.query(`UPDATE users SET last_login = now(), email_verified_at = COALESCE(email_verified_at, now()), auth_provider = COALESCE(auth_provider, $2) WHERE id = $1`, [userId, flow.p]);
    } else {
      if (flow.i === 'login') return fail(res, 'noaccount');
      const ipk = await H.ipKey(req);
      if (await H.count('reg', ipk, 60) >= 10) return fail(res, 'ratelimit');
      await H.record('reg', ipk);
      const name = noFormula(who.name).slice(0, 120) || who.email.split('@')[0];
      for (let attempt = 0; attempt < 6 && !userId; attempt++) {
        const rows = await db.query(
          `INSERT INTO users (id, full_name, email, level, last_login, auth_provider, email_verified_at) VALUES ($1, $2, $3, $4, now(), $5, now())
           ON CONFLICT DO NOTHING RETURNING id`, [generateId(), name, who.email, flow.l, flow.p]);
        if (rows.length) { userId = rows[0].id; isNew = true; }
        else { const again = await db.query('SELECT id FROM users WHERE email = $1', [who.email]); if (again.length) userId = again[0].id; }
      }
      if (!userId) return fail(res, 'provider');
    }
    await H.startSession(res, userId);
    addCookie(res, flowCookie('', 0));
    return redirect(res, isNew ? '/app?welcome=1' : (flow.x || '/app'));
  }

  return H.send(res, 404, { ok: false, error: 'Unknown action' });
});
