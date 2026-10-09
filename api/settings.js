// POST /api/settings  {want_test?, want_notify?, level?, banner_dismissed?}  or  {delete: true}
const db = require('../lib/db');
const H = require('../lib/http');

module.exports = H.handler(async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return H.send(res, 405, { ok: false, error: 'Method not allowed' }); }
  if (!H.sameOrigin(req)) return H.send(res, 403, { ok: false, error: 'Forbidden' });
  if (!db.configured()) return H.send(res, 503, { ok: false, error: 'not_configured' });
  const user = await H.currentUser(req);
  if (!user) return H.send(res, 401, { ok: false });

  const body = H.readBody(req);
  if (body.delete === true) {                                   // right to erasure: removes the account and its data
    await db.query('DELETE FROM users WHERE id = $1', [user.id]);
    H.endSession(res);
    return H.send(res, 200, { ok: true, deleted: true });
  }

  const sets = []; const vals = [];
  const add = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  for (const col of ['want_test', 'want_notify', 'banner_dismissed']) {
    if (col in body) { if (typeof body[col] !== 'boolean') return H.send(res, 400, { ok: false, error: `${col} must be true or false` }); add(col, body[col]); }
  }
  if ('level' in body) {
    const lv = String(body.level).toUpperCase();
    if (!H.LEVELS.includes(lv)) return H.send(res, 400, { ok: false, error: 'Unknown level' });
    add('level', lv);
  }
  if (!sets.length) return H.send(res, 400, { ok: false, error: 'Nothing to change' });
  vals.push(user.id);
  const rows = await db.query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${vals.length}
     RETURNING id, full_name, level, want_test, want_notify, banner_dismissed, created_at`, vals);
  return H.send(res, 200, { ok: true, user: H.publicUser(rows[0]) });
});
