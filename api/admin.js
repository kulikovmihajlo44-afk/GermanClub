// GET /api/admin  (Authorization: Bearer <ADMIN_TOKEN>)  ->  all accounts, for the club leader / reporting.
// Disabled (404) until the ADMIN_TOKEN environment variable is set in Vercel.
const crypto = require('crypto');
const db = require('../lib/db');
const H = require('../lib/http');

module.exports = H.handler(async (req, res) => {
  const token = process.env.ADMIN_TOKEN;
  if (!token || token.length < 20) return H.send(res, 404, { ok: false });
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(token).digest();
  if (!crypto.timingSafeEqual(a, b)) return H.send(res, 401, { ok: false });
  const rows = await db.query(
    `SELECT id, full_name, email, level, want_test, want_notify, source, created_at, last_login FROM users ORDER BY created_at`, []);
  return H.send(res, 200, { ok: true, count: rows.length, users: rows });
});
