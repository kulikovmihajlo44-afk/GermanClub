// GET /api/me  ->  the logged-in user (or 401).
const db = require('../lib/db');
const H = require('../lib/http');

module.exports = H.handler(async (req, res) => {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return H.send(res, 405, { ok: false, error: 'Method not allowed' }); }
  if (!db.configured()) return H.send(res, 503, { ok: false, error: 'not_configured' });
  const user = await H.currentUser(req);
  if (!user) { H.endSession(res); return H.send(res, 401, { ok: false }); }
  return H.send(res, 200, { ok: true, user: H.publicUser(user) });
});
