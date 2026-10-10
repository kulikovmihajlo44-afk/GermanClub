// Database access (Neon Postgres, connected through Vercel -> Storage). Tables are created on first use.
let client = null;
let initPromise = null;

function connectionString() {
  const e = process.env;
  const direct = e.DATABASE_URL || e.POSTGRES_URL;
  if (direct) return direct;
  // Vercel's Neon integration may add a custom prefix (e.g. STORAGE_DATABASE_URL): use the first pooled postgres:// variable.
  const names = Object.keys(e).filter((k) => /^postgres(ql)?:\/\//.test(e[k] || '')).sort();
  const pooled = names.find((k) => !/UNPOOLED|NON_POOLING/.test(k));
  return e[pooled || names[0]] || '';
}
function configured() { return !!(client || connectionString()); }

function getClient() {
  if (client) return client;
  const url = connectionString();
  if (!url) return null;
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(url);
  client = { query: (text, params) => sql.query(text, params || []) };
  return client;
}
function setClient(c) { client = c; initPromise = null; }       // used by the automated tests

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id               TEXT PRIMARY KEY,
     full_name        TEXT NOT NULL,
     email            TEXT NOT NULL UNIQUE,
     level            TEXT NOT NULL,
     want_test        BOOLEAN NOT NULL DEFAULT TRUE,
     want_notify      BOOLEAN NOT NULL DEFAULT TRUE,
     banner_dismissed BOOLEAN NOT NULL DEFAULT FALSE,
     source           TEXT NOT NULL DEFAULT 'website',
     created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
     last_login       TIMESTAMPTZ
   )`,
  `CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS attempts (
     kind TEXT NOT NULL,
     key  TEXT NOT NULL,
     at   TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS attempts_lookup ON attempts (kind, key, at)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS goal TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS interests JSONB NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS minutes_per_day INTEGER`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS exam_date DATE`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ`,
  `CREATE TABLE IF NOT EXISTS placement_results (
     id        BIGSERIAL PRIMARY KEY,
     user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     level     TEXT NOT NULL,
     skills    JSONB NOT NULL,
     score     INTEGER NOT NULL,
     total     INTEGER NOT NULL,
     answers   JSONB NOT NULL,
     taken_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS placement_user ON placement_results (user_id, taken_at)`,
  `CREATE TABLE IF NOT EXISTS lesson_progress (
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     topic   TEXT NOT NULL,
     score   INTEGER NOT NULL,
     total   INTEGER NOT NULL,
     done_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (user_id, topic)
   )`,
  `CREATE TABLE IF NOT EXISTS cards (
     id         BIGSERIAL PRIMARY KEY,
     user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     deck       TEXT NOT NULL,
     front      TEXT NOT NULL,
     back       TEXT NOT NULL,
     example    TEXT NOT NULL DEFAULT '',
     source     TEXT NOT NULL DEFAULT 'deck',
     fsrs       JSONB NOT NULL,
     due        TIMESTAMPTZ NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     UNIQUE (user_id, deck, front)
   )`,
  `CREATE INDEX IF NOT EXISTS cards_due ON cards (user_id, due)`,
  `CREATE TABLE IF NOT EXISTS reviews (
     id          BIGSERIAL PRIMARY KEY,
     user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     card_id     BIGINT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
     rating      INTEGER NOT NULL,
     was_new     BOOLEAN NOT NULL,
     reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS reviews_user ON reviews (user_id, reviewed_at)`,
];

async function init() {
  const c = getClient();
  if (!c) { const e = new Error('not_configured'); e.code = 'NOT_CONFIGURED'; throw e; }
  if (!initPromise) {
    initPromise = (async () => { for (const stmt of SCHEMA) await c.query(stmt, []); })()
      .catch((e) => { initPromise = null; throw e; });
  }
  return initPromise;
}

async function query(text, params) {
  await init();
  return getClient().query(text, params || []);
}

module.exports = { configured, query, setClient, init };
