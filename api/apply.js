// POST /apply  ->  create an account (12-digit ID), start a session.
// If the database is not connected yet, falls back to the old behaviour (Google Apps Script -> Google Sheet).
const db = require('../lib/db');
const H = require('../lib/http');
const { generateId } = require('../lib/ids');
const O = require('../lib/oauth');
const V = require('../assets/validate');
const { checkEmail } = require('../lib/emailcheck');

const noFormula = (v) => String(v || '').trim().replace(/^[\s=+\-@]+/, '').trim();   // spreadsheet-formula safety

async function legacySheet(req, res, fullname, email, level) {
  const url = process.env.APPS_SCRIPT_URL;
  if (!url) return H.send(res, 503, { ok: false, error: 'not_configured' });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ fullname, email, level }).toString(),
      redirect: 'follow', signal: ctrl.signal,
    });
    const out = JSON.parse(await r.text());
    return H.send(res, out.ok ? 200 : 400, out);
  } catch (e) {
    return H.send(res, 502, { ok: false, error: 'Could not store the application, please try again.' });
  } finally { clearTimeout(timer); }
}

module.exports = H.handler(async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return H.send(res, 405, { ok: false, error: 'Method not allowed' }); }
  if (!H.sameOrigin(req)) return H.send(res, 403, { ok: false, error: 'Forbidden' });

  const body = H.readBody(req);
  if (body.website) return H.send(res, 200, { ok: true });                    // honeypot: pretend success to bots

  // the same checks the form runs in the browser (assets/validate.js), plus a DNS check that the domain receives mail
  const level = String(body.level || '').trim().toUpperCase();
  const nm = V.name(noFormula(body.fullname).slice(0, 120));
  if (!nm.ok) return H.send(res, 400, { ok: false, field: 'fullname', error: nm.error });
  const em = await checkEmail(noFormula(body.email).slice(0, 254));
  if (!em.ok) return H.send(res, 400, { ok: false, field: 'email', error: em.error, suggestion: em.suggestion || undefined });
  // a likely typo of a common provider (gmial.com): ask once; "keep mine" sends email_confirmed=1
  if (em.suggestion && String(body.email_confirmed || '') !== '1') {
    return H.send(res, 400, { ok: false, field: 'email', typo: true, suggestion: em.suggestion, error: `Did you mean ${em.suggestion}?` });
  }
  if (!H.LEVELS.includes(level)) return H.send(res, 400, { ok: false, field: 'level', error: 'Please choose your level.' });
  const fullname = nm.value, email = em.value;

  if (!db.configured()) return legacySheet(req, res, fullname, email, level);

  const ipk = await H.ipKey(req);
  if (await H.count('reg', ipk, 60) >= 10) return H.send(res, 429, { ok: false, error: 'Too many sign-ups from this device. Please try again later.' });
  await H.record('reg', ipk);

  const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.length) return H.send(res, 200, { ok: true, duplicate: true });  // never reveal the ID of an existing account
  // once Google or Microsoft sign-in is set up, new accounts need a confirmed address (api/auth.js), not a typed one
  if (O.enabled().length) return H.send(res, 403, { ok: false, verify: true, error: 'Please sign up with Google or Microsoft so we can confirm your e-mail address.' });

  for (let attempt = 0; attempt < 6; attempt++) {
    const id = generateId();
    const rows = await db.query(
      `INSERT INTO users (id, full_name, email, level, last_login) VALUES ($1, $2, $3, $4, now())
       ON CONFLICT DO NOTHING
       RETURNING id, full_name, level, want_test, want_notify, banner_dismissed, created_at`,
      [id, fullname, email, level]);
    if (rows.length) {
      await H.startSession(res, rows[0].id);
      return H.send(res, 200, { ok: true, duplicate: false, user: H.publicUser(rows[0]) });
    }
    const again = await db.query('SELECT id FROM users WHERE email = $1', [email]);   // lost a race on the e-mail, or an ID collision
    if (again.length) return H.send(res, 200, { ok: true, duplicate: true });
  }
  return H.send(res, 500, { ok: false, error: 'Could not create the account, please try again.' });
});
