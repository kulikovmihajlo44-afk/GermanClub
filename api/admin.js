// GET /api/admin  (Authorization: Bearer <key>)  ->  all accounts, read-only, for the club leader's reporting + the Google Sheet sync.
// The key itself is NOT in this repository. Only its SHA-256 fingerprint is (below), so nobody can derive the key from the public code.
// Alternatively set the ADMIN_TOKEN (or ADMIN_TOKEN_SHA256) environment variable in Vercel.
const crypto = require('crypto');
const db = require('../lib/db');
const H = require('../lib/http');

const ADMIN_KEY_SHA256 = '3a132c8772382f09611bec6fe3b91c25583b5d4beba3d71d70e8cb7e7a9d9b96';
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

module.exports = H.handler(async (req, res) => {
  const envToken = process.env.ADMIN_TOKEN && process.env.ADMIN_TOKEN.length >= 20 ? process.env.ADMIN_TOKEN : '';
  const hashHex = process.env.ADMIN_TOKEN_SHA256 || ADMIN_KEY_SHA256;
  if (!envToken && !/^[0-9a-f]{64}$/.test(hashHex)) return H.send(res, 404, { ok: false });
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const okEnv = envToken && crypto.timingSafeEqual(sha(given), sha(envToken));
  const okHash = /^[0-9a-f]{64}$/.test(hashHex) && crypto.timingSafeEqual(sha(given), Buffer.from(hashHex, 'hex'));
  if (!okEnv && !okHash) return H.send(res, 401, { ok: false });
  const rows = await db.query(
    `SELECT id, full_name, email, level, want_test, want_notify, source, created_at, last_login FROM users ORDER BY created_at`, []);
  return H.send(res, 200, { ok: true, count: rows.length, users: rows });
});
