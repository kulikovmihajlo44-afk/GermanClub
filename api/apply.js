// Vercel serverless function: POST /apply  ->  Google Apps Script -> Google Sheet.
// The Apps Script URL lives in the Vercel env var APPS_SCRIPT_URL (never committed: this repo is public).
const LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const raw = req.body;
  const body = typeof raw === 'string' ? Object.fromEntries(new URLSearchParams(raw)) : (raw || {});

  if (body.website) return res.status(200).json({ ok: true });          // honeypot: pretend success to bots

  // Spreadsheet formula injection: a value starting with = + - @ would run as a formula in Google Sheets.
  const noFormula = (v) => String(v || '').trim().replace(/^[\s=+\-@]+/, '').trim();
  const fullname = noFormula(body.fullname).slice(0, 120);
  const email = noFormula(body.email).slice(0, 200);
  const level = String(body.level || '').trim().toUpperCase();
  if (!fullname || !EMAIL_RE.test(email) || !LEVELS.includes(level)) {
    return res.status(400).json({ ok: false, error: 'Please check your name, e-mail and level.' });
  }

  const url = process.env.APPS_SCRIPT_URL;
  if (!url) return res.status(500).json({ ok: false, error: 'Collector is not configured.' });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ fullname, email, level }).toString(),
      redirect: 'follow',                                                // Apps Script answers via a 302
      signal: ctrl.signal,
    });
    const out = JSON.parse(await r.text());
    return res.status(out.ok ? 200 : 400).json(out);
  } catch (err) {
    return res.status(502).json({ ok: false, error: 'Could not store the application, please try again.' });
  } finally {
    clearTimeout(timer);
  }
};
