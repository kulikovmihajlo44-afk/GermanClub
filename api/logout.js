// POST /api/logout  ->  clears the session cookie on this device only.
const H = require('../lib/http');

module.exports = H.handler(async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return H.send(res, 405, { ok: false, error: 'Method not allowed' }); }
  if (!H.sameOrigin(req)) return H.send(res, 403, { ok: false, error: 'Forbidden' });
  H.endSession(res);
  return H.send(res, 200, { ok: true });
});
