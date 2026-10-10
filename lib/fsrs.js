// Spaced repetition with FSRS (ts-fsrs). Target retention 0.9. Card state is stored as JSON in the database.
const { fsrs, generatorParameters, createEmptyCard, Rating } = require('ts-fsrs');
const scheduler = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: false }));

const hydrate = (o) => ({ ...o, due: new Date(o.due), last_review: o.last_review ? new Date(o.last_review) : undefined });
function newCard(now) { return JSON.parse(JSON.stringify(createEmptyCard(now || new Date()))); }

function human(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return '<1 min';
  if (m < 60) return m + ' min';
  const h = Math.round(m / 60); if (h < 24) return h + ' h';
  const d = Math.round(h / 24); if (d < 30) return d + ' d';
  const mo = Math.round(d / 30); return mo < 12 ? mo + ' mo' : (Math.round(d / 365 * 10) / 10) + ' y';
}
// what each button would do: {1:'1 min',2:'6 min',3:'10 min',4:'8 d'}
function previews(card, now) {
  const r = scheduler.repeat(hydrate(card), now); const out = {};
  for (const k of [1, 2, 3, 4]) out[k] = human(r[k].card.due.getTime() - now.getTime());
  return out;
}
function review(card, rating, now) {
  const r = scheduler.next(hydrate(card), now, rating);
  return JSON.parse(JSON.stringify(r.card));
}
module.exports = { newCard, previews, review, Rating };
