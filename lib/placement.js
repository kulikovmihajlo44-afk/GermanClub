
Placement · JS
// Placement test (server side). lib/placement-bank.json is the club's own question bank: every item has a difficulty `d` (0-100 points).
// The answer key never leaves the server. The test is ADAPTIVE: the browser picks the next question with the engine in assets/test.js,
// the server only says "right / wrong" for one answer at a time (test.check) and, at the end, replays the answers with the SAME engine
// (test.submit), so the saved result is the server's, not the browser's.
const bank = require('./placement-bank.json');
const E = require('../assets/test.js');           // DKPlacement engine: one source of truth for browser and server
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const SKILLS = ['grammar', 'vocab', 'reading'];
const TOTAL = E.CFG.total;                         // 20 questions per test
const ITEMS = bank.items.map((i) => ({ id: i.id, level: i.lvl, skill: i.skill, d: i.d, text: i.ctx || null, q: i.q, options: i.opts, a: i.opts.indexOf(i.ans) }));
const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
 
// the whole bank without the answer key (the browser needs it to choose the next question)
function publicBank() {
  return ITEMS.map(({ id, skill, d, text, q, options }) => ({ id, skill, d, text, q, options }));
}
 
// one answer -> true / false, or null for an unknown question or a malformed answer
function check(id, answer) {
  const it = BY_ID.get(id);
  if (!it || !Number.isInteger(answer) || answer < 0 || answer >= it.options.length) return null;
  return answer === it.a;
}
 
// seq: question ids in the order they were asked, answers: { [id]: chosenIndex | -1 }.
// Returns null if the request is not a complete, valid test (exactly TOTAL different known questions).
function replay(seq, answers) {
  if (!Array.isArray(seq) || seq.length !== TOTAL || new Set(seq).size !== TOTAL || !seq.every((id) => BY_ID.has(id))) return null;
  const given = answers && typeof answers === 'object' ? answers : {};
  const clean = {}, history = [];
  for (const id of seq) {
    const it = BY_ID.get(id), v = Object.prototype.hasOwnProperty.call(given, id) ? given[id] : -1;
    clean[id] = Number.isInteger(v) && v >= 0 && v < it.options.length ? v : -1;   // -1 = "I don't know" / anything invalid = wrong
    history.push({ item: it, correct: clean[id] === it.a });
  }
  return { ...E.summarize(history), answers: clean };
}
 
module.exports = { ITEMS, LEVELS, SKILLS, TOTAL, publicBank, check, replay };
 





Claude finished the response
