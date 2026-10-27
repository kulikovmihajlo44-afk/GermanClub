# Sign-up with a confirmed e-mail (Google / Microsoft)

New members sign up with **Continue with Google** or **Continue with Microsoft**. The provider confirms that the
e-mail address exists and belongs to them; name and address come from the provider, the member only picks a level.
Existing members can also log in that way (the 12-digit ID keeps working). Until at least one provider is set up,
the old form works exactly as before.

Code: `api/auth.js`, `lib/oauth.js` (authorization code + PKCE, state and nonce, no password ever reaches us),
`tests/auth.test.js` (20 checks). Only `openid email profile` is requested.

## 1. Google (about 10 minutes)

1. <https://console.cloud.google.com/> → create a project “Deutsch-Klub”.
2. **APIs & Services → OAuth consent screen**: External, app name “Deutsch-Klub”, your e-mail as support and
   developer contact; scopes: `openid`, `email`, `profile` (no verification needed for these). Publish the app.
3. **Credentials → Create credentials → OAuth client ID → Web application**
   - Authorized JavaScript origins: `https://www.germanstudy.tech`, `https://germanstudy.tech`
   - Authorized redirect URIs: `https://www.germanstudy.tech/auth/callback`, `https://germanstudy.tech/auth/callback`
   - Branding: home page `https://www.germanstudy.tech`, privacy `…/privacy`, terms `…/terms`;
     authorized domain `germanstudy.tech`
4. Copy the **Client ID** and **Client secret**.

## 2. Microsoft (about 10 minutes)

1. <https://entra.microsoft.com/> → **App registrations → New registration**, name “Deutsch-Klub”.
2. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**.
3. Redirect URI: platform **Web**, `https://www.germanstudy.tech/auth/callback`.
4. **Certificates & secrets → New client secret** (24 months) → copy the **Value** (shown once).
5. Copy the **Application (client) ID** from the overview page.

University accounts: some universities only allow apps an admin has approved. If students see “Need admin
approval”, ask the university IT to approve “Deutsch-Klub” (it only reads name and e-mail) — or they use Google.

## 3. Vercel

Project → **Settings → Environment Variables** (Production), then **Redeploy**:

| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | from step 1 |
| `GOOGLE_CLIENT_SECRET` | from step 1 |
| `MICROSOFT_CLIENT_ID` | from step 2 |
| `MICROSOFT_CLIENT_SECRET` | from step 2 |

One provider is enough; its button appears as soon as both of its variables are set. Microsoft client secrets
expire — put a reminder in the calendar to renew it.

## Domain

The site lives at **https://www.germanstudy.tech** (`germanstudy.tech` redirects there; both are set up in Vercel →
Settings → Domains). `germanclub.vercel.app` permanently redirects to it (`vercel.json`), so everybody signs in on one
address. The sign-in code builds the return address from the domain the visitor is on (or from `PUBLIC_URL`, if set),
so every domain people can sign in on must be listed as a redirect URI at Google / Microsoft. The old
`germanclub.vercel.app` entries can stay. Preview deployments have other addresses, so sign-in works on the
production domain only.
