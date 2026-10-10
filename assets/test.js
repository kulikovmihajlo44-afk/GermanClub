// Placement test (public). Questions come from the server without the answer key; the server scores.
(function () {
  "use strict";
  var main = document.getElementById("main"), SK = { grammar: "Grammar", vocab: "Vocabulary", reading: "Reading" };
  DK.renderHeader(document.getElementById("top"), "public");
  function h(tag, a, kids) { var e = document.createElement(tag); Object.keys(a || {}).forEach(function (k) { var v = a[k]; if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v); }); (function add(l) { (l || []).forEach(function (c) { if (c == null || c === false) return; if (Array.isArray(c)) return add(c); e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); }); })(kids); return e; }
  function mount() { main.innerHTML = ""; Array.prototype.slice.call(arguments).forEach(function (n) { if (n) main.appendChild(n); }); window.scrollTo(0, 0); }
  var eyebrow = function (t) { return h("p", { "class": "eyebrow" }, [h("span", { "class": "mark mark-circle", "aria-hidden": "true" }), t]); };
  var questions = [], answers = {}, i = 0, blockEnd = 0, partNo = 0, order = {};
  function shuffled(n) { var a = []; for (var k = 0; k < n; k++) a.push(k); for (var j = n - 1; j > 0; j--) { var r = Math.floor(Math.random() * (j + 1)), t = a[j]; a[j] = a[r]; a[r] = t; } return a; }  // display order of the options (the answer key is not position based)

  function intro() {
    mount(eyebrow("Placement test"), h("h1", { "class": "a-h1", text: "Find your German level" }),
      h("p", { "class": "a-muted", text: "Up to 75 questions in five parts (A1 to C1), grammar, vocabulary and reading. Free, no account needed." }),
      h("ul", { "class": "a-list" }, [h("li", { text: "Each part has 15 questions. You need 12 right to move on, and the test stops after the first part you don’t pass — so it takes about 3 to 15 minutes." }), h("li", { text: "If you don’t know an answer, choose “I don’t know” — guessing makes the result less accurate." }), h("li", { text: "The result is indicative, not an official certificate. Listening is not part of this test." }), h("li", { text: "Your answers are scored on our server; nothing is saved unless you have an account." })]),
      h("button", { "class": "btn-solid", id: "go", type: "button", text: "Start the test", onclick: function () { questions = []; answers = {}; i = 0; partNo = 0; loadBlock("A1", true); } }));
  }
  function loadBlock(level, first) {
    var b = document.getElementById("go"); if (b) { b.disabled = true; b.textContent = "Loading…"; }
    DK.api("/api/app?a=test.questions&level=" + level).then(function (r) {
      if (r.status === 503) { if (b) { b.textContent = "Start the test"; b.disabled = false; } return mount(eyebrow("Placement test"), h("p", { text: "The test is being set up — please try again in a few minutes." })); }
      if (r.status !== 200 || !r.j.ok) throw new Error("q");
      r.j.questions.forEach(function (q) { order[q.id] = shuffled(q.options.length); });
      questions = questions.concat(r.j.questions); blockEnd = questions.length; partNo++;
      if (!first) i = blockEnd - r.j.questions.length;
      ask();
    }).catch(function () { if (b) { b.disabled = false; b.textContent = "Try again"; } else mount(h("div", { "class": "a-card a-empty" }, [h("p", { text: "Could not load the next part — check your connection. Your answers are kept." }), h("button", { "class": "btn-solid", type: "button", text: "Try again", onclick: function () { checkpoint(); } })])); });
  }
  function ask() {
    var q = questions[i], chosen = answers[q.id], start = blockEnd - 15, ord = order[q.id];
    var opts = ord.map(function (k) { return h("button", { type: "button", "class": "t-opt" + (chosen === k ? " on" : ""), text: q.options[k], onclick: function () { answers[q.id] = k; next(); } }); });
    opts.push(h("button", { type: "button", "class": "t-opt skip" + (chosen === -1 ? " on" : ""), text: "I don’t know", onclick: function () { answers[q.id] = -1; next(); } }));
    mount(h("div", { "class": "t-meta" }, [h("span", { text: "Part " + partNo + " · " + SK[q.skill] }), h("span", { text: (i - start + 1) + " / 15" })]),
      h("div", { "class": "t-bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "15", "aria-valuenow": String(i - start) }, [h("i", { style: "width:" + ((i - start) / 15 * 100) + "%" })]),
      q.text ? h("p", { "class": "t-text", lang: "de", text: q.text }) : null,
      h("p", { "class": "t-q", lang: "de", text: q.q }),
      h("div", { "class": "t-opts" }, opts),
      h("div", { "class": "t-nav" }, [i > start ? h("button", { type: "button", "class": "btn-line", text: "← Back", onclick: function () { i--; ask(); } }) : h("span"), h("span", { "class": "a-muted a-small", text: "Tap an answer to continue" })]));
  }
  function next() { if (i < blockEnd - 1) { i++; ask(); } else checkpoint(); }
  // end of a part: ask the server whether the level was passed (not saved yet); continue with the next part or finish
  function checkpoint() {
    mount(h("p", { "class": "a-muted", text: "Checking this part…" }));
    DK.api("/api/app?a=test.submit", { answers: answers, final: false }).then(function (r) {
      if (r.status !== 200 || !r.j.ok) throw new Error("s");
      if (r.j.next && questions.length < 75 && !questions.some(function (q) { return q.id.indexOf(r.j.next) === 0; })) loadBlock(r.j.next, false); else submit();
    }).catch(function () { mount(h("div", { "class": "a-card a-empty" }, [h("p", { text: "We couldn’t check your answers — check your connection. Nothing was lost." }), h("button", { "class": "btn-solid", type: "button", text: "Try again", onclick: checkpoint })])); });
  }
  function submit() {
    mount(h("p", { "class": "a-muted", text: "Scoring your answers…" }));
    DK.api("/api/app?a=test.submit", { answers: answers }).then(function (r) {
      if (r.status !== 200 || !r.j.ok) throw new Error("s");
      result(r.j);
    }).catch(function () {
      mount(h("div", { "class": "a-card a-empty" }, [h("p", { text: "We couldn’t score your answers — check your connection. Nothing was lost." }), h("button", { "class": "btn-solid", type: "button", text: "Try again", onclick: submit })]));
    });
  }
  function result(r) {
    var guest = !r.saved;
    if (guest) { try { localStorage.setItem("dk_guest_answers", JSON.stringify(answers)); } catch (e) {} }
    var skills = Object.keys(r.skills).map(function (k) { return h("li", null, [h("span", { text: SK[k] }), h("strong", { text: r.skills[k] === "A0" ? "below A1" : r.skills[k] })]); });
    mount(eyebrow("Your result"), h("p", { "class": "t-level", text: r.level === "A0" ? "A0" : r.level }),
      h("p", { "class": "a-muted", style: "text-align:center", text: (r.level === "A0" ? "You are at the very beginning — a perfect place to start. " : "Estimated level. ") + r.score + " of " + r.total + " answers correct (pass mark: 12 of 15 in each part)." }),
      h("ul", { "class": "t-skills" }, skills),
      h("p", { "class": "a-muted a-small", text: "Indicative result, not an official certificate. It is based on grammar, vocabulary and reading only." }),
      h("div", { "class": "t-cta" }, guest ? [
        h("a", { "class": "btn-solid", href: "/signup", text: "Create my free account and save this" }),
        h("button", { "class": "btn-line", type: "button", text: "I already have an ID — log in", onclick: DK.openLogin })]
        : [h("a", { "class": "btn-solid", href: "/app/onboarding", text: "Continue" })]));
  }
  intro();
})();
