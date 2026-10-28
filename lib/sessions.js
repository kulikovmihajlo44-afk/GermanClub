// The next club session, read from the Notion database "Deutsch-Klub · Sessions" (Sunday widget on the home page).
// Only rows with Status = Planned whose end has not passed are shown; the earliest one wins. Without NOTION_TOKEN, or
// when Notion is unreachable or the table has no planned session, the answer is { session: null } and the site shows
// "unknown" instead of a date it cannot vouch for. Results are kept for a minute so visitors don't hit Notion each time.
//   NOTION_TOKEN        secret of an internal Notion integration that the database is shared with (read content only)
//   NOTION_SESSIONS_DB  optional; the database id (defaults to the club's Sessions database)
const DEFAULT_DB = 'bfd7c3efd44f4f8c8865f8079604eca8';
const TTL = 60 * 1000;
const LENGTH_IF_NO_END = 3 * 3600 * 1000;           // a session without an end time counts as three hours long
let cache = null;                                    // { at, value }

const text = (p) => (p && (p.rich_text || p.title) || []).map((t) => t.plain_text || '').join('').trim();

// one Notion page -> { title, start, end, place, level } or null when it has no usable date
function toSession(page) {
  const pr = page.properties || {};
  const d = pr.Date && pr.Date.date;
  if (!d || !d.start || !/T\d\d:\d\d/.test(d.start)) return null;  // a session needs a start time, not just a day
  const start = new Date(d.start), end = d.end ? new Date(d.end) : new Date(start.getTime() + LENGTH_IF_NO_END);
  if (isNaN(start) || isNaN(end)) return null;
  return {
    title: text(pr.Session).slice(0, 120),
    start: start.toISOString(), end: end.toISOString(),
    place: text(pr.Place).slice(0, 120) || null,
    level: text(pr.Level).slice(0, 80) || null,
  };
}

async function nextSession(now = new Date()) {
  const token = process.env.NOTION_TOKEN;
  if (!token) return { session: null, reason: 'not_configured' };
  if (cache && now.getTime() - cache.at < TTL) return cache.value;
  const dbId = (process.env.NOTION_SESSIONS_DB || DEFAULT_DB).replace(/-/g, '');
  const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();   // sessions that started up to a day ago may still run
  let value;
  try {
    const r = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: { and: [{ property: 'Status', select: { equals: 'Planned' } }, { property: 'Date', date: { on_or_after: since } }] },
        sorts: [{ property: 'Date', direction: 'ascending' }],
        page_size: 20,
      }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined,
    });
    if (!r.ok) throw new Error('notion ' + r.status);
    const j = await r.json();
    const next = (j.results || []).map(toSession).filter(Boolean)
      .filter((s) => new Date(s.end).getTime() > now.getTime())
      .sort((a, b) => a.start.localeCompare(b.start))[0] || null;
    value = next ? { session: next } : { session: null, reason: 'none_planned' };
  } catch (e) {
    value = { session: null, reason: 'unavailable' };
  }
  cache = { at: now.getTime(), value };
  return value;
}

function _reset() { cache = null; }                  // tests

module.exports = { nextSession, toSession, _reset };
