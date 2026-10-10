// Placement test engine. The question bank (lib/placement-bank.json, 15 questions per level A1-C1, pass mark 12/15) is the club's own set.
// The answer key never leaves the server. The test is staged: a level block is only offered while the previous level is passed.
const bank = require('./placement-bank.json');
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const SKILLS = ['grammar', 'vocab', 'reading'];
const PASS = bank.pass_mark;                       // correct answers needed in a level of bank.per_level questions
const ITEMS = bank.items.map((i) => ({ id: i.id, level: i.lvl, skill: i.skill, text: i.ctx || null, q: i.q, options: i.opts, a: i.opts.indexOf(i.ans) }));

function publicQuestions(level) {
  const L = LEVELS.includes(level) ? level : LEVELS[0];
  return ITEMS.filter((i) => i.level === L).map(({ id, skill, text, q, options }) => ({ id, skill, text, q, options }));
}

// answers: { [id]: chosenIndex }; a missing answer = level not taken; -1 / anything else = wrong
function score(answers) {
  const a = answers && typeof answers === 'object' ? answers : {};
  const has = (it) => Object.prototype.hasOwnProperty.call(a, it.id);
  const right = (it) => Number.isInteger(a[it.id]) && a[it.id] === it.a;
  const per_level = {}; let level = 'A0', chain = true, next = null, nextFound = false;
  for (const L of LEVELS) {
    const its = ITEMS.filter((i) => i.level === L), answered = its.every(has), correct = its.filter((i) => has(i) && right(i)).length;
    const passed = answered && correct >= PASS;
    per_level[L] = { correct, total: its.length, answered, passed };
    if (chain && passed) level = L; else chain = false;
    if (!nextFound) { if (!answered) { next = L; nextFound = true; } else if (!passed) nextFound = true; }
  }
  // per skill: highest level of an unbroken chain where the skill reaches the same 80 % bar (12/15) in every level so far
  const need = (n) => Math.ceil(n * PASS / bank.per_level);
  const skills = {};
  for (const s of SKILLS) {
    let lvl = 'A0';
    for (const L of LEVELS) {
      const its = ITEMS.filter((i) => i.level === L && i.skill === s);
      if (!its.every(has) || its.filter(right).length < need(its.length)) break;
      lvl = L;
    }
    skills[s] = lvl;
  }
  const given = ITEMS.filter(has);
  return { level, skills, score: given.filter(right).length, total: given.length, per_level, next };
}

module.exports = { ITEMS, LEVELS, SKILLS, PASS, publicQuestions, score };
