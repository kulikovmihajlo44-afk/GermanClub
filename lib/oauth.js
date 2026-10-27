// Sign-in with Google or Microsoft (OpenID Connect, authorization code + PKCE). Used to confirm that a new member's
// e-mail address really exists and belongs to them. A provider is active once its two environment variables are set
// in Vercel: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET, MICROSOFT_CLIENT_ID + MICROSOFT_CLIENT_SECRET.
const crypto = require('crypto');

const MS_CONSUMERS = '9188040d-6c67-4c5b-b112-36a304b66dad';      // tenant of personal Microsoft accounts (outlook.com, hotmail …)
const PROVIDERS = {
  google: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    issuers: ['https://accounts.google.com', 'accounts.google.com'],
  },
  microsoft: {
    authorize: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  },
};

function creds(p) {
  const up = p.toUpperCase();
  const id = process.env[up + '_CLIENT_ID'], secret = process.env[up + '_CLIENT_SECRET'];
  return id && secret ? { id, secret } : null;
}
function enabled() { return Object.keys(PROVIDERS).filter((p) => creds(p)); }

const b64u = (buf) => Buffer.from(buf).toString('base64url');
function pkce() {
  const verifier = b64u(crypto.randomBytes(32));
  return { verifier, challenge: b64u(crypto.createHash('sha256').update(verifier).digest()) };
}

function authorizeUrl(p, { redirectUri, state, nonce, challenge }) {
  const q = new URLSearchParams({
    client_id: creds(p).id, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile',
    state, nonce, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account',
  });
  return PROVIDERS[p].authorize + '?' + q.toString();
}

// Exchange the code at the provider's token endpoint. The ID token arrives directly from the provider over TLS,
// so (OpenID Connect Core 3.1.3.7) its signature need not be checked again; issuer, audience, expiry and nonce are.
async function exchange(p, { code, redirectUri, verifier }) {
  const c = creds(p);
  const r = await fetch(PROVIDERS[p].token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: c.id, client_secret: c.secret, code, redirect_uri: redirectUri,
      grant_type: 'authorization_code', code_verifier: verifier }).toString(),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id_token) { const e = new Error('token'); e.code = 'provider'; throw e; }
  return j.id_token;
}

function claimsOf(idToken) {
  const parts = String(idToken).split('.');
  if (parts.length < 2) return null;
  try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch (e) { return null; }
}

// -> { email, name } when the token is valid for us and the provider vouches for the address; otherwise { error }
function verifiedIdentity(p, claims, { nonce }) {
  const c = creds(p), now = Math.floor(Date.now() / 1000);
  if (!claims) return { error: 'provider' };
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(c.id) || !(claims.exp > now - 60) || claims.nonce !== nonce) return { error: 'provider' };
  let email = '', ok = false;
  if (p === 'google') {
    if (!PROVIDERS.google.issuers.includes(claims.iss)) return { error: 'provider' };
    email = String(claims.email || '');
    ok = claims.email_verified === true || claims.email_verified === 'true';     // Google's own check of the address
  } else {
    if (!claims.tid || claims.iss !== `https://login.microsoftonline.com/${claims.tid}/v2.0`) return { error: 'provider' };
    const upn = String(claims.preferred_username || '');
    email = String(claims.email || upn);
    // personal accounts: Microsoft verified the address at sign-up; work / school accounts: the sign-in name sits in a
    // domain the organisation has verified — only trust the e-mail claim when it is that same name (or Microsoft flags
    // its domain as verified), so an unverified "email" set in some other tenant cannot take over an address
    ok = claims.tid === MS_CONSUMERS || claims.xms_edov === true || claims.xms_edov === 'true' ||
         (!!upn && email.toLowerCase() === upn.toLowerCase());
  }
  email = email.trim().toLowerCase();
  if (!ok || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'unverified' };
  const name = String(claims.name || [claims.given_name, claims.family_name].filter(Boolean).join(' ') || email.split('@')[0]);
  return { email, name };
}

module.exports = { PROVIDERS, enabled, creds, pkce, authorizeUrl, exchange, claimsOf, verifiedIdentity, MS_CONSUMERS };
