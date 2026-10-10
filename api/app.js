// One function for all member data (keeps us far below the 12-function limit of the free Vercel plan).
//   GET  ?a=state            dashboard data (profile, latest placement, lesson progress, card counts)
//   GET  ?a=test.questions   placement test questions (public, no answer key)
//   POST ?a=test.submit      {answers:{id:index}}  -> {level, skills, score, total, saved}   (public; saved only when logged in)
//   POST ?a=onboarding       {goal, interests[], minutes, exam_date?}
//   POST ?a=lesson.done      {topic, score, total}
//   POST ?a=cards.add        {deck, source?, cards:[{front, back, example?}]}
//   GET  ?a=cards.due        today's queue (learning/review cards due + up to NEW_PER_DAY new ones)
//   POST ?a=cards.review     {id, rating 1..4}
//   GET  ?a=history          the member's own history     GET ?a=export   everything we store about the member
const db = require('../lib/db');
const H = require('../lib/http');
const P = require('../lib/placement');
const F = require('../lib/fsrs');

const NEW_PER_DAY = 10;
const GOALS = ['goethe', 'career', 'interest'];
const INTERESTS = ['music', 'film', 'travel', 'science', 'sport', 'food', 'tech', 'history', 'art', 'business'];
const MINUTES = [5, 10, 15, 20, 30, 45, 60];
const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const bad = (res, msg) => H.send(res, 400, { ok: false, error: msg || 'Invalid request' });
const lvlOk = (l) => /^(A0|A1|A2|B1|B2|C1)$/.test(l);

async function profileOf(userId) {
  const r = await db.query(
    `SELECT goal, interests, minutes_per_day, exam_date, onboarded_at FROM users WHERE id = $1`, [userId]);
  const u = r[0] || {};
  return { goal: u.goal || null, interests: u.interests || [], minutes: u.minutes_per_day || null,
           exam_date: u.exam_date ? String(u.exam_date.toISOString ? u.exam_date.toISOString().slice(0, 10) : u.exam_date).slice(0, 10) : null,
           onboarded: !!u.onboarded_at };
}
async function latestPlacement(userId) {
  const r = await db.query(
    `SELECT level, skills, score, total, taken_at FROM placement_results WHERE user_id = $1 ORDER BY taken_at DESC, id DESC LIMIT 1`, [userId]);
  return r[0] || null;
}
async function newDoneToday(userId) {
  const r = await db.query(
    `SELECT count(*)::int AS n FROM reviews WHERE user_id = $1 AND was_new AND reviewed_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc'`, [userId]);
  return r[0].n;
}
async function cardCounts(userId) {
  const r = await db.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE (fsrs->>'state')::int > 0 AND due <= now())::int AS due_learned,
            count(*) FILTER (WHERE (fsrs->>'state')::int = 0)::int AS fresh
       FROM cards WHERE user_id = $1`, [userId]);
  const c = r[0]; const allowance = Math.max(0, NEW_PER_DAY - await newDoneToday(userId));
  const decks = await db.query(`SELECT deck, count(*)::int AS n FROM cards WHERE user_id = $1 GROUP BY deck ORDER BY deck`, [userId]);
  return { total: c.total, due: c.due_learned + Math.min(c.fresh, allowance), decks };
}

module.exports = H.handler(async (req, res) => {
  if (!db.configured()) return H.send(res, 503, { ok: false, error: 'not_configured' });
  const url = new URL(req.url || '/', 'http://x');
  const a = url.searchParams.get('a') || '';
  const isPost = req.method === 'POST';
  if (!isPost && req.method !== 'GET') { res.setHeader('Allow', 'GET, POST'); return H.send(res, 405, { ok: false, error: 'Method not allowed' }); }
  if (isPost && !H.sameOrigin(req)) return H.send(res, 403, { ok: false, error: 'Forbidden' });
  const body = isPost ? H.readBody(req) : {};
  const now = new Date();

  // ---- public: placement test
  if (a === 'test.questions' && !isPost) return H.send(res, 200, { ok: true, questions: P.publicQuestions() });
  if (a === 'test.submit' && isPost) {
    const given = body.answers && typeof body.answers === 'object' ? body.answers : null;
    if (!given) return bad(res);
    const clean = {}; for (const it of P.ITEMS) clean[it.id] = Number.isInteger(given[it.id]) && given[it.id] >= 0 && given[it.id] < it.options.length ? given[it.id] : -1;
    const result = P.score(clean);
    const user = await H.currentUser(req);
    if (user) {
      await db.query(`INSERT INTO placement_results (user_id, level, skills, score, total, answers) VALUES ($1, $2, $3::jsonb, $4, $5, $6::jsonb)`,
        [user.id, result.level, JSON.stringify(result.skills), result.score, result.total, JSON.stringify(clean)]);
    }
    return H.send(res, 200, { ok: true, ...result, saved: !!user });
  }

  // ---- everything below needs a logged-in member
  const user = await H.currentUser(req);
  if (!user) { H.endSession(res); return H.send(res, 401, { ok: false }); }
  const uid = user.id;

  if (a === 'state' && !isPost) {
    const [profile, placement, lessons, cards] = await Promise.all([
      profileOf(uid), latestPlacement(uid),
      db.query(`SELECT topic, score, total, done_at FROM lesson_progress WHERE user_id = $1`, [uid]),
      cardCounts(uid)]);
    return H.send(res, 200, { ok: true, user: H.publicUser(user), profile, placement, lessons, cards });
  }

  if (a === 'onboarding' && isPost) {
    const goal = str(body.goal, 20);
    if (!GOALS.includes(goal)) return bad(res, 'Please choose a goal.');
    const interests = (Array.isArray(body.interests) ? body.interests : []).map((x) => str(x, 20)).filter((x) => INTERESTS.includes(x));
    const uniq = [...new Set(interests)].slice(0, 8);
    const minutes = Number(body.minutes);
    if (!MINUTES.includes(minutes)) return bad(res, 'Please choose how many minutes per day.');
    let exam = null;
    if (goal === 'goethe' && body.exam_date) {
      const d = new Date(str(body.exam_date, 10) + 'T00:00:00Z');
      if (isNaN(d) || d < new Date(now.getTime() - 864e5) || d > new Date(now.getTime() + 800 * 864e5)) return bad(res, 'Please check the exam date.');
      exam = d.toISOString().slice(0, 10);
    }
    await db.query(`UPDATE users SET goal = $2, interests = $3::jsonb, minutes_per_day = $4, exam_date = $5, onboarded_at = COALESCE(onboarded_at, now()) WHERE id = $1`,
      [uid, goal, JSON.stringify(uniq), minutes, exam]);
    return H.send(res, 200, { ok: true, profile: await profileOf(uid) });
  }

  if (a === 'lesson.done' && isPost) {
    const topic = str(body.topic, 60), score = Number(body.score), total = Number(body.total);
    if (!/^[a-z0-9-]+$/.test(topic) || !Number.isInteger(score) || !Number.isInteger(total) || total < 1 || total > 50 || score < 0 || score > total) return bad(res);
    await db.query(`INSERT INTO lesson_progress (user_id, topic, score, total) VALUES ($1, $2, $3, $4)
                    ON CONFLICT (user_id, topic) DO UPDATE SET score = GREATEST(lesson_progress.score, EXCLUDED.score), total = EXCLUDED.total, done_at = now()`,
      [uid, topic, score, total]);
    return H.send(res, 200, { ok: true });
  }

  if (a === 'cards.add' && isPost) {
    const deck = str(body.deck, 60), source = str(body.source || 'deck', 60);
    if (!/^[a-z0-9-]+$/.test(deck)) return bad(res);
    const list = (Array.isArray(body.cards) ? body.cards : []).slice(0, 80);
    if (!list.length) return bad(res, 'No cards.');
    let added = 0;
    for (const c of list) {
      const front = str(c.front, 120), back = str(c.back, 200), example = str(c.example, 240);
      if (!front || !back) continue;
      const r = await db.query(`INSERT INTO cards (user_id, deck, front, back, example, source, fsrs, due) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
                                ON CONFLICT (user_id, deck, front) DO NOTHING RETURNING id`,
        [uid, deck, front, back, example, source, JSON.stringify(F.newCard(now)), now.toISOString()]);
      added += r.length;
    }
    return H.send(res, 200, { ok: true, added, counts: await cardCounts(uid) });
  }

  if (a === 'cards.due' && !isPost) {
    const allowance = Math.max(0, NEW_PER_DAY - await newDoneToday(uid));
    const learned = await db.query(
      `SELECT id, deck, front, back, example, fsrs FROM cards WHERE user_id = $1 AND (fsrs->>'state')::int > 0 AND due <= now() ORDER BY due LIMIT 60`, [uid]);
    const fresh = allowance ? await db.query(
      `SELECT id, deck, front, back, example, fsrs FROM cards WHERE user_id = $1 AND (fsrs->>'state')::int = 0 ORDER BY id LIMIT $2`, [uid, allowance]) : [];
    const queue = learned.concat(fresh).map((c) => ({ id: String(c.id), deck: c.deck, front: c.front, back: c.back, example: c.example, isNew: Number(c.fsrs.state) === 0, intervals: F.previews(c.fsrs, now) }));
    return H.send(res, 200, { ok: true, queue, counts: await cardCounts(uid), new_per_day: NEW_PER_DAY });
  }

  if (a === 'cards.review' && isPost) {
    const id = String(body.id || ''), rating = Number(body.rating);
    if (!/^\d{1,18}$/.test(id) || ![1, 2, 3, 4].includes(rating)) return bad(res);
    const r = await db.query(`SELECT id, fsrs FROM cards WHERE id = $1 AND user_id = $2`, [id, uid]);
    if (!r.length) return H.send(res, 404, { ok: false, error: 'Card not found' });
    const wasNew = Number(r[0].fsrs.state) === 0;
    const next = F.review(r[0].fsrs, rating, now);
    await db.query(`UPDATE cards SET fsrs = $3::jsonb, due = $4 WHERE id = $1 AND user_id = $2`, [id, uid, JSON.stringify(next), next.due]);
    await db.query(`INSERT INTO reviews (user_id, card_id, rating, was_new) VALUES ($1, $2, $3, $4)`, [uid, id, rating, wasNew]);
    return H.send(res, 200, { ok: true, due: next.due, intervals: F.previews(next, now), counts: await cardCounts(uid) });
  }

  if (a === 'history' && !isPost) {
    const [placements, reviews, lessons, cards] = await Promise.all([
      db.query(`SELECT level, skills, score, total, taken_at FROM placement_results WHERE user_id = $1 ORDER BY taken_at DESC LIMIT 20`, [uid]),
      db.query(`SELECT count(*)::int AS n, max(reviewed_at) AS last FROM reviews WHERE user_id = $1`, [uid]),
      db.query(`SELECT topic, score, total, done_at FROM lesson_progress WHERE user_id = $1 ORDER BY done_at DESC`, [uid]),
      cardCounts(uid)]);
    return H.send(res, 200, { ok: true, placements, reviews: reviews[0], lessons, cards });
  }

  if (a === 'export' && !isPost) {
    const q = (sql) => db.query(sql, [uid]);
    const out = {
      account: H.publicUser(user), profile: await profileOf(uid),
      placement_results: await q(`SELECT level, skills, score, total, taken_at FROM placement_results WHERE user_id = $1 ORDER BY taken_at`),
      lessons: await q(`SELECT topic, score, total, done_at FROM lesson_progress WHERE user_id = $1`),
      cards: await q(`SELECT deck, front, back, example, source, due, created_at FROM cards WHERE user_id = $1 ORDER BY id`),
      reviews: await q(`SELECT card_id, rating, was_new, reviewed_at FROM reviews WHERE user_id = $1 ORDER BY id`),
    };
    res.setHeader('Content-Disposition', 'attachment; filename="my-deutsch-klub-data.json"');
    return H.send(res, 200, { ok: true, exported_at: now.toISOString(), ...out });
  }

  return H.send(res, 404, { ok: false, error: 'Unknown action' });
});
