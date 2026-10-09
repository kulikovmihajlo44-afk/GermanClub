// Small helpers shared by the API functions: JSON replies, cookies, signed sessions, rate limiting.
const crypto = require('crypto');
const db = require('./db');
const COOKIE = 'dk_session';
const YEAR = 365 * 24 * 3600;
const LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function send(res, code, obj, headers) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  for (const [k, v] of Object.entries(headers || {})) res.setHeader(k, v);
  return res.status(code).json(obj);
}

function readBody(req) {
  const raw = req.body;
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch (e) { return Object.fromEntries(new URLSearchParams(raw)); }
  }
  return raw;
}

// The account is a cookie bound to this site; refuse state-changing requests that come from another origin.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (origin) { try { return new URL(origin).host === req.headers.host; } catch (e) { return false; } }
  return req.headers['sec-fetch-site'] !== 'cross-site';
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function cookieHeader(value, maxAge) {
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

// ---- session secret: generated once, kept in the database (no environment variable to set)
let secretCache = null;
async function secret() {
  if (secretCache) return secretCache;
  await db.query(`INSERT INTO config (key, value) VALUES ('session_secret', $1) ON CONFLICT (key) DO NOTHING`,
    [crypto.randomBytes(32).toString('hex')]);
  const rows = await db.query(`SELECT value FROM config WHERE key = 'session_secret'`, []);
  secretCache = rows[0].value;
  return secretCache;
}
const b64u = (b) => Buffer.from(b).toString('base64url');
async function sign(payload) {
  const body = b64u(JSON.stringify(payload));
  const mac = crypto.createHmac('sha256', await secret()).update(body).digest('base64url');
  return `v1.${body}.${mac}`;
}
async function verify(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  const want = crypto.createHmac('sha256', await secret()).update(parts[1]).digest();
  let got; try { got = Buffer.from(parts[2], 'base64url'); } catch (e) { return null; }
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return p && p.exp > Math.floor(Date.now() / 1000) ? p : null;
  } catch (e) { return null; }
}
async function startSession(res, userId) {
  const now = Math.floor(Date.now() / 1000);
  res.setHeader('Set-Cookie', cookieHeader(await sign({ u: userId, iat: now, exp: now + YEAR }), YEAR));
}
function endSession(res) { res.setHeader('Set-Cookie', cookieHeader('', 0)); }

const PUBLIC_COLS = 'id, full_name, level, want_test, want_notify, banner_dismissed, created_at';
async function currentUser(req) {
  const tok = parseCookies(req)[COOKIE];
  const p = tok && await verify(tok);
  if (!p) return null;
  const rows = await db.query(`SELECT ${PUBLIC_COLS} FROM users WHERE id = $1`, [p.u]);
  return rows[0] || null;
}
function publicUser(u) {
  const { formatId } = require('./ids');
  return { id: formatId(u.id), full_name: u.full_name, level: u.level, want_test: u.want_test,
           want_notify: u.want_notify, banner_dismissed: u.banner_dismissed, created_at: u.created_at };
}

// ---- rate limiting (stored in the database; the visitor's IP is only kept as a salted hash)
async function ipKey(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket && req.socket.remoteAddress || '').split(',')[0].trim();
  return crypto.createHash('sha256').update((await secret()) + ip).digest('hex').slice(0, 32);
}
async function count(kind, key, minutes) {
  const r = await db.query(`SELECT count(*)::int AS n FROM attempts WHERE kind = $1 AND key = $2 AND at > now() - make_interval(mins => $3::int)`,
    [kind, key, minutes]);
  return r[0].n;
}
async function record(kind, key) {
  await db.query(`INSERT INTO attempts (kind, key) VALUES ($1, $2)`, [kind, key]);
  if (Math.random() < 0.02) await db.query(`DELETE FROM attempts WHERE at < now() - interval '2 days'`, []);
}

// Wrap every handler: not-configured and unexpected errors become clean JSON replies.
function handler(fn) {
  return async (req, res) => {
    try { return await fn(req, res); }
    catch (e) {
      if (e && e.code === 'NOT_CONFIGURED') return send(res, 503, { ok: false, error: 'not_configured' });
      console.error('api error:', e && e.stack || e);
      return send(res, 500, { ok: false, error: 'Something went wrong, please try again.' });
    }
  };
}

module.exports = { send, readBody, sameOrigin, parseCookies, startSession, endSession, currentUser, publicUser,
                   ipKey, count, record, handler, LEVELS, EMAIL_RE };
