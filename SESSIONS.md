# Next session on the home page (from Notion)

The Sunday widget (`03 / Sunday`) shows the next club session from the Notion database
**Deutsch-Klub · Sessions** (https://www.notion.so/bfd7c3efd44f4f8c8865f8079604eca8).
Code: `lib/sessions.js`, public API `GET /api/app?a=next-session`, widget in `assets/motion.js`, tests in
`tests/sessions.test.js`. Until something is set up, the widget says **unknown** instead of guessing a date.

## The table

| Column | What to enter |
|---|---|
| Session | a short name, e.g. *Introduction session* (not shown yet) |
| Date | start **and** end with times, e.g. 8 Nov 2026 13:00 → 16:00 (Berlin). A day without a time is ignored. |
| Place | shown as *place*, e.g. *East Hall, Seminar Room 3* |
| Level | shown as *level*; empty keeps *all levels welcome* |
| Status | only **Planned** rows appear on the site; Draft and Cancelled are ignored |
| Note | internal |

The site shows the earliest **Planned** session that has not ended yet; while it runs, the widget says
*session is live now*. Changes appear within about a minute.

## Connect the site to Notion (once, about 3 minutes)

1. https://www.notion.so/profile/integrations → **New integration** → name *Deutsch-Klub website*, type **Internal**,
   capabilities: **Read content** only → Save → copy the **Internal Integration Secret**.
2. Open the Sessions database in Notion → **⋯** (top right) → **Connections** → add *Deutsch-Klub website*.
3. Vercel → Project → **Settings → Environment Variables** → add `NOTION_TOKEN` = the secret (Production) → **Redeploy**.

Optional: `NOTION_SESSIONS_DB` if the table is ever replaced by another database (its id from the URL).
