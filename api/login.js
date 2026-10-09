// POST /api/login  {id}  ->  session cookie.  5 wrong IDs per 15 minutes per device, then a pause.
const db = require('../lib/db');
const H = require('../lib/http');
const { normalizeId, isValidId } = require('../lib/ids');

module.exports = H.handler(async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return H.send(res, 405, { ok: false, error: 'Method not allowed' }); }
  if (!H.sameOrigin(req)) return H.send(res, 403, { ok: false, error: 'Forbidden' });
  if (!db.configured()) return H.send(res, 503, { ok: false, error: 'not_configured' });

  const ipk = await H.ipKey(req);
  if (await H.count('login', ipk, 15) >= 5) {
    return H.send(res, 429, { ok: false, error: 'Too many wrong attempts. Please wait 15 minutes and try again.' });
  }
  const id = normalizeId(H.readBody(req).id);
  let user = null;
  if (isValidId(id)) {
    const rows = await db.query(
      `UPDATE users SET last_login = now() WHERE id = $1
       RETURNING id, full_name, level, want_test, want_notify, banner_dismissed, created_at`, [id]);
    user = rows[0] || null;
  }
  if (!user) {
    await H.record('login', ipk);
    return H.send(res, 401, { ok: false, error: 'We could not find that ID. Please check the 12 digits.' });
  }
  await H.startSession(res, user.id);
  return H.send(res, 200, { ok: true, user: H.publicUser(user) });
});
