# Deutsch-KLUB

Website of the university German language club: landing page, 12-digit-ID accounts, adaptive placement test (A1–C1),
grammar lessons, FSRS flashcards and an admin area. Runs on Vercel with Neon Postgres. Everyone who wants to learn German is welcome.

## Run the tests locally

```bash
npm install
npm install --no-save @electric-sql/pglite
node tests/backend.test.js && node tests/app.test.js && node tests/admin.test.js && node tests/avatar.test.js && node tests/no-database.test.js && node tests/db-env.test.js
```

Local preview with an in-memory database: `node tests/dev-server.js` → http://127.0.0.1:8061

Admin setup (who can open /app/admin): see [ADMIN.md](ADMIN.md).
