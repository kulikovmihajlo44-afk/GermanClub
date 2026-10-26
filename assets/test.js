// Adaptive placement test (public).
// Part 1: DKPlacement - the engine (item selection + level estimation). Pure functions, no DOM.
//         The SAME code must run on the server (Node: require("./placement.js")) to replay and score the answers.
// Part 2: the browser UI. Questions come from the server WITHOUT the answer key.
var DKPlacement = (function () {
  "use strict";

  var CFG = {
    total: 20,                 // always exactly 20 questions
    scale: 12,                 // steepness of the difficulty curve (points). P(right) = 50% when ability == difficulty
    guess: 0.25,               // chance of a lucky guess with 4 options
    // beginner mode ("A0"): the first questions are the easiest A1 ones and the estimate starts near zero
    starts: { A0: { mean: 5, sd: 15, warm: 5, maxD: 14 } },   // warm: the first 5 questions come only from A1 (difficulty <= 14)
    priorMean: 35,             // we start at "upper A2", so the first question is easy-to-medium
    priorSd: 30,
    gridMin: -10, gridMax: 120,
    // level thresholds on the 0-100 points scale: ability must reach this to be placed in the level
    levels: [["A1", 12], ["A2", 32], ["B1", 52], ["B2", 72], ["C1", 92]],
    pickSd: 8,                 // how tightly questions cluster around the target difficulty
    streakStep: 4, streakMax: 12,   // 2+ right (or wrong) in a row pushes the target harder (or easier)
    maxPerText: 2,             // max questions on the same reading text
    quota: { grammar: 8, vocab: 6, reading: 6 },   // 8 + 6 + 6 = 20
    chanceFloor: 5,            // 5 of 20 = what pure guessing gives (25 %): this or less is never placed above A0
    skillPriorSd: 15, minSkillAnswers: 2
  };
  var NAMES = ["A0", "A1", "A2", "B1", "B2", "C1"];

  function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
  function textOf(item) { return item.text || item.ctx || ""; }

  // Bayesian ability estimate (EAP on a grid). history = [{item:{d,skill,...}, correct:bool}]
  // Works for any mix of answers (all right, all wrong, "I don't know" = wrong), no special cases.
  function estimate(history, mean, sd) {
    mean = mean == null ? CFG.priorMean : mean; sd = sd || CFG.priorSd;
    var g, i, lp, p, L, best = -Infinity, pts = [];
    for (g = CFG.gridMin; g <= CFG.gridMax; g++) {
      lp = -0.5 * Math.pow((g - mean) / sd, 2);
      for (i = 0; i < history.length; i++) {
        L = sigmoid((g - history[i].item.d) / CFG.scale);
        p = CFG.guess + (1 - CFG.guess) * L;
        lp += Math.log(Math.max(history[i].correct ? p : 1 - p, 1e-9));
      }
      pts.push([g, lp]); if (lp > best) best = lp;
    }
    var sw = 0, sm = 0, sv = 0;
    pts.forEach(function (x) { x[1] = Math.exp(x[1] - best); sw += x[1]; sm += x[0] * x[1]; });
    var theta = sm / sw;
    pts.forEach(function (x) { sv += Math.pow(x[0] - theta, 2) * x[1]; });
    return { theta: theta, sd: Math.sqrt(sv / sw) };
  }

  function levelIndex(theta) { var k = 0; CFG.levels.forEach(function (l, j) { if (theta >= l[1]) k = j + 1; }); return k; }
  function levelOf(theta) { return NAMES[levelIndex(theta)]; }

  // trailing streak: +n = n right in a row, -n = n wrong in a row
  function streakShift(history) {
    var r = 0, last = null, i;
    for (i = history.length - 1; i >= 0; i--) {
      if (last === null) last = history[i].correct;
      if (history[i].correct === last) r++; else break;
    }
    if (r < 2) return 0;
    var s = Math.min(CFG.streakMax, CFG.streakStep * (r - 1));
    return last ? s : -s;
  }

  // Choose the next question: random, but weighted towards the current difficulty target.
  // start: optional start mode ("A0" = complete beginner) - it only steers which questions are chosen, never the final score
  function pickNext(bank, history, rnd, start) {
    rnd = rnd || Math.random;
    var asked = {}, skillN = {}, textN = {};
    history.forEach(function (h) {
      asked[h.item.id] = 1; skillN[h.item.skill] = (skillN[h.item.skill] || 0) + 1;
      var t = textOf(h.item); if (t) textN[t] = (textN[t] || 0) + 1;
    });
    var st = start && CFG.starts[start];
    var target = (st ? estimate(history, st.mean, st.sd) : estimate(history)).theta + streakShift(history);
    var pool = bank.filter(function (q) { return !asked[q.id]; });
    if (st && history.length < st.warm) { var easy = pool.filter(function (q) { return q.d <= st.maxD; }); if (easy.length) pool = easy; }
    var spread = pool.filter(function (q) { var t = textOf(q); return !t || (textN[t] || 0) < CFG.maxPerText; });
    if (spread.length) pool = spread;
    // closeness is measured relative to the nearest question that is still available, so when the questions
    // around the target run out we still get the next-closest ones (never a random far-away question)
    var minDist = Math.min.apply(null, pool.map(function (q) { return Math.abs(q.d - target); }));
    var w = pool.map(function (q) {
      var near = Math.exp(-0.5 * Math.pow((Math.abs(q.d - target) - minDist) / CFG.pickSd, 2)) + 1e-12;
      var n = skillN[q.skill] || 0, quota = CFG.quota[q.skill] || 6;
      var mix = n >= quota ? 0.05 : 0.4 + 0.6 * (1 - n / quota);
      return near * mix;
    });
    var sum = w.reduce(function (a, b) { return a + b; }, 0), r = rnd() * sum, i;
    for (i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }

  // Final result from the full history (server and client use this same function).
  function summarize(history) {
    var est = estimate(history), idx = levelIndex(est.theta);
    var right = history.filter(function (h) { return h.correct; }).length;
    if (right <= CFG.chanceFloor) { idx = 0; est = { theta: Math.min(est.theta, CFG.levels[0][1] - 1), sd: est.sd }; }   // not above guessing level = A0
    var cuts = [0].concat(CFG.levels.map(function (l) { return l[1]; }), [112]);
    var lo = cuts[idx], hi = cuts[idx + 1];
    var progress = Math.max(0, Math.min(1, (est.theta - lo) / (hi - lo)));
    var border = null;
    if (idx > 0 && est.theta - lo < 0.5 * est.sd) border = NAMES[idx - 1] + "/" + NAMES[idx];
    else if (idx < 5 && hi - est.theta < 0.5 * est.sd) border = NAMES[idx] + "/" + NAMES[idx + 1];
    var skills = {};
    ["grammar", "vocab", "reading"].forEach(function (s) {
      var sub = history.filter(function (h) { return h.item.skill === s; });
      skills[s] = sub.length < CFG.minSkillAnswers ? NAMES[idx] : levelOf(estimate(sub, est.theta, CFG.skillPriorSd).theta);
    });
    return {
      level: NAMES[idx], points: Math.round(Math.max(0, Math.min(100, est.theta))), sd: est.sd,
      progress: progress, border: border, skills: skills,
      score: history.filter(function (h) { return h.correct; }).length, total: history.length
    };
  }

  return { CFG: CFG, estimate: estimate, pickNext: pickNext, summarize: summarize, levelOf: levelOf };
})();

if (typeof module !== "undefined" && module.exports) module.exports = DKPlacement;

// ---------------------------------------------------------------- browser UI
if (typeof document !== "undefined") (function () {
  "use strict";
  var main = document.getElementById("main"), SK = { grammar: "Grammar", vocab: "Vocabulary", reading: "Reading" };
  var TOTAL = DKPlacement.CFG.total;
  DK.renderHeader(document.getElementById("top"), "public");
  function h(tag, a, kids) { var e = document.createElement(tag); Object.keys(a || {}).forEach(function (k) { var v = a[k]; if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v); }); (function add(l) { (l || []).forEach(function (c) { if (c == null || c === false) return; if (Array.isArray(c)) return add(c); e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); }); })(kids); return e; }
  function mount() { main.innerHTML = ""; Array.prototype.slice.call(arguments).forEach(function (n) { if (n) main.appendChild(n); }); window.scrollTo(0, 0); }
  var eyebrow = function (t) { return h("p", { "class": "eyebrow" }, [h("span", { "class": "mark mark-circle", "aria-hidden": "true" }), t]); };
  var bank = [], history = [], seq = [], answers = {}, current = null, order = [], busy = false;
  function intro() {
    mount(eyebrow("Placement test"), h("h1", { "class": "a-h1", text: "Find your German level" }),
      h("p", { "class": "a-muted", text: TOTAL + " questions in grammar, vocabulary and reading. The test adapts to you: the better you do, the harder the questions get. Free, no account needed." }),
      h("ul", { "class": "a-list" }, [h("li", { text: "It takes about 8 to 12 minutes. The questions run from A1 to C1 and you will not see all of them." }), h("li", { text: "If you don’t know an answer, choose “I don’t know” — guessing makes the result less accurate." }), h("li", { text: "You can’t go back to an earlier question, because the next question depends on your answer." }), h("li", { text: "If you do not reach the A1 mark, your level is A0 (absolute beginner) and we suggest where to begin." }), h("li", { text: "The result is indicative, not an official certificate. Listening is not part of this test." }), h("li", { text: "Your answers are scored on our server; nothing is saved unless you have an account." })]),
      h("button", { "class": "btn-solid", id: "go", type: "button", text: "Start the test", onclick: start }),
      h("p", { "class": "a-muted a-small", style: "margin-top:1.2rem", text: "Never learned any German? Then you do not need a test." }),
      h("button", { "class": "btn-line", id: "go0", type: "button", text: "I’m a complete beginner (A0) — skip the test", onclick: beginner }));
  }
  // A0 = no test: logged-in members get level A0 and go to the dashboard; visitors continue to sign-up with A0 preselected
  function beginner() {
    var b0 = document.getElementById("go0"); if (b0) { b0.disabled = true; b0.textContent = "One moment…"; }
    DK.api("/api/app?a=beginner", {}).then(function (r) {
      if (r.status === 200 && r.j.ok) { location.href = "/app"; return; }
      try { localStorage.setItem("dk_start", "A0"); } catch (e) {}
      location.href = "/signup";
    }).catch(function () { if (b0) { b0.disabled = false; b0.textContent = "I’m a complete beginner (A0) — skip the test"; } });
  }
  function start() {
    var b = document.getElementById("go"); if (b) { b.disabled = true; b.textContent = "Loading…"; }
    var b0 = document.getElementById("go0"); if (b0) b0.disabled = true;
    DK.api("/api/app?a=test.bank").then(function (r) {
      if (r.status === 503) { if (b) { b.textContent = "Start the test"; b.disabled = false; } if (b0) b0.disabled = false; return mount(eyebrow("Placement test"), h("p", { text: "The test is being set up — please try again in a few minutes." })); }
      if (r.status !== 200 || !r.j.ok) throw new Error("q");
      bank = r.j.questions; history = []; seq = []; answers = {}; busy = false; nextQuestion();
    }).catch(function () { if (b) { b.disabled = false; b.textContent = "Try again"; } if (b0) b0.disabled = false; });
  }
  function nextQuestion() {
    if (history.length >= TOTAL) return submit();
    current = DKPlacement.pickNext(bank, history);
    order = shuffled(current.options.length);
    ask();
  }
  function ask() {
    var q = current, n = history.length;
    var opts = order.map(function (k) { return h("button", { type: "button", "class": "t-opt", text: q.options[k], onclick: function () { choose(k); } }); });
    opts.push(h("button", { type: "button", "class": "t-opt skip", text: "I don’t know", onclick: function () { choose(-1); } }));
    mount(h("div", { "class": "t-meta" }, [h("span", { text: SK[q.skill] }), h("span", { text: (n + 1) + " / " + TOTAL })]),
      h("div", { "class": "t-bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(TOTAL), "aria-valuenow": String(n) }, [h("i", { style: "width:" + (n / TOTAL * 100) + "%" })]),
      q.text ? h("p", { "class": "t-text", lang: "de", text: q.text }) : null,
      h("p", { "class": "t-q", lang: "de", text: q.q }),
      h("div", { "class": "t-opts" }, opts),
      h("div", { "class": "t-nav" }, [h("span"), h("span", { "class": "a-muted a-small", text: "Tap an answer to continue" })]));
  }
  // the server checks one answer at a time and only says right/wrong, so the answer key never reaches the browser
  function choose(k) {
    if (busy) return; busy = true;
    Array.prototype.forEach.call(main.querySelectorAll(".t-opt"), function (b) { b.disabled = true; });
    if (k === -1) return record(k, false);
    DK.api("/api/app?a=test.check", { id: current.id, answer: k }).then(function (r) {
      if (r.status !== 200 || !r.j.ok) throw new Error("c");
      record(k, !!r.j.correct);
    }).catch(function () {
      busy = false;
      mount(h("div", { "class": "a-card a-empty" }, [h("p", { text: "We couldn’t check your answer — check your connection. Your progress is kept." }), h("button", { "class": "btn-solid", type: "button", text: "Try again", onclick: ask })]));
    });
  }
  function record(k, correct) {
    history.push({ item: current, correct: correct }); seq.push(current.id); answers[current.id] = k;
    busy = false; nextQuestion();
  }
  // the server replays the answers in order with the same engine, so the saved result is authoritative
  function submit() {
    mount(h("p", { "class": "a-muted", text: "Scoring your answers…" }));
    DK.api("/api/app?a=test.submit", { seq: seq, answers: answers }).then(function (r) {
      if (r.status !== 200 || !r.j.ok) throw new Error("s");
      result(r.j);
    }).catch(function () {
      mount(h("div", { "class": "a-card a-empty" }, [h("p", { text: "We couldn’t score your answers — check your connection. Nothing was lost." }), h("button", { "class": "btn-solid", type: "button", text: "Try again", onclick: submit })]));
    });
  }
  function result(r) {
    var guest = !r.saved, beginner = r.level === "A0";
    if (guest) { try { localStorage.setItem("dk_guest_answers", JSON.stringify({ seq: seq, answers: answers })); } catch (e) {} }
    var skills = Object.keys(r.skills).map(function (k) { return h("li", null, [h("span", { text: SK[k] }), h("strong", { text: r.skills[k] === "A0" ? "below A1" : r.skills[k] })]); });
    var head = beginner
      ? [h("p", { "class": "t-level", text: "A0" }),
         h("p", { "class": "a-muted", style: "text-align:center", text: "Absolute beginner. You did not reach the A1 mark yet, and that is completely fine: we suggest that you start at level A0 with the alphabet, greetings and everyday phrases, then move on to A1." }),
         h("p", { "class": "a-muted a-small", style: "text-align:center", text: r.score + " of " + r.total + " answers correct. This is only a suggestion — if it feels too low, you can retake the test." })]
      : [h("p", { "class": "t-level", text: r.level }),
         h("p", { "class": "a-muted", style: "text-align:center", text: "Estimated level. " + (r.border ? "You are close to the border between " + r.border.replace("/", " and ") + ". " : "") + r.score + " of " + r.total + " answers correct. The questions adapt to you, so the level matters more than the number of correct answers." })];
    mount.apply(null, [eyebrow("Your result")].concat(head, [
      h("ul", { "class": "t-skills" }, skills),
      h("p", { "class": "a-muted a-small", text: "Indicative result, not an official certificate. It is based on grammar, vocabulary and reading only." }),
      h("div", { "class": "t-cta" }, (guest ? [
        h("a", { "class": "btn-solid", href: "/signup", text: beginner ? "Create my free account and start at A0" : "Create my free account and save this" }),
        h("button", { "class": "btn-line", type: "button", text: "I already have an ID — log in", onclick: DK.openLogin })]
        : [h("a", { "class": "btn-solid", href: "/app/onboarding", text: beginner ? "Start at A0" : "Continue" })]).concat(
        beginner ? [h("button", { "class": "btn-line", type: "button", text: "Retake the test", onclick: intro })] : []))]));
  }
  intro();
})();
