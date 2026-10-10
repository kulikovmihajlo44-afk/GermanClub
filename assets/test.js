// Placement test (public). Questions come from the server without the answer key; the server scores.
(function () {
  "use strict";
  var main = document.getElementById("main"), SK = { grammar: "Grammar", vocab: "Vocabulary", reading: "Reading" };
  DK.renderHeader(document.getElementById("top"), "public");
  function h(tag, a, kids) { var e = document.createElement(tag); Object.keys(a || {}).forEach(function (k) { var v = a[k]; if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v); }); (function add(l) { (l || []).forEach(function (c) { if (c == null || c === false) return; if (Array.isArray(c)) return add(c); e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); }); })(kids); return e; }
  function mount() { main.innerHTML = ""; Array.prototype.slice.call(arguments).forEach(function (n) { if (n) main.appendChild(n); }); window.scrollTo(0, 0); }
  var eyebrow = function (t) { return h("p", { "class": "eyebrow" }, [h("span", { "class": "mark mark-circle", "aria-hidden": "true" }), t]); };
  var questions = [], answers = {}, i = 0;

  function intro() {
    mount(eyebrow("Placement test"), h("h1", { "class": "a-h1", text: "Find your German level" }),
      h("p", { "class": "a-muted", text: "30 questions · about 5 minutes · grammar, vocabulary and reading. Free, no account needed." }),
      h("ul", { "class": "a-list" }, [h("li", { text: "If you don’t know an answer, choose “I don’t know” — guessing makes the result less accurate." }), h("li", { text: "The result is indicative, not an official certificate. Listening is not part of this test." }), h("li", { text: "Your answers are scored on our server; nothing is saved unless you have an account." })]),
      h("button", { "class": "btn-solid", id: "go", type: "button", text: "Start the test", onclick: load }));
  }
  function load() {
    var b = document.getElementById("go"); b.disabled = true; b.textContent = "Loading…";
    DK.api("/api/app?a=test.questions").then(function (r) {
      if (r.status === 503) { b.textContent = "Start the test"; b.disabled = false; return mount(eyebrow("Placement test"), h("p", { text: "The test is being set up — please try again in a few minutes." })); }
      if (r.status !== 200 || !r.j.ok) throw new Error("q");
      questions = r.j.questions; answers = {}; i = 0; ask();
    }).catch(function () { b.disabled = false; b.textContent = "Try again"; });
  }
  function ask() {
    var q = questions[i], chosen = answers[q.id];
    var opts = q.options.map(function (o, k) { return h("button", { type: "button", "class": "t-opt" + (chosen === k ? " on" : ""), text: o, onclick: function () { answers[q.id] = k; next(); } }); });
    opts.push(h("button", { type: "button", "class": "t-opt skip" + (chosen === -1 ? " on" : ""), text: "I don’t know", onclick: function () { answers[q.id] = -1; next(); } }));
    mount(h("div", { "class": "t-meta" }, [h("span", { text: SK[q.skill] }), h("span", { text: (i + 1) + " / " + questions.length })]),
      h("div", { "class": "t-bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(questions.length), "aria-valuenow": String(i) }, [h("i", { style: "width:" + (i / questions.length * 100) + "%" })]),
      q.text ? h("p", { "class": "t-text", lang: "de", text: q.text }) : null,
      h("p", { "class": "t-q", lang: q.skill === "reading" ? "en" : "de", text: q.q }),
      h("div", { "class": "t-opts" }, opts),
      h("div", { "class": "t-nav" }, [i > 0 ? h("button", { type: "button", "class": "btn-line", text: "← Back", onclick: function () { i--; ask(); } }) : h("span"), h("span", { "class": "a-muted a-small", text: "Tap an answer to continue" })]));
  }
  function next() { if (i < questions.length - 1) { i++; ask(); } else submit(); }
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
      h("p", { "class": "a-muted", style: "text-align:center", text: (r.level === "A0" ? "You are at the very beginning — a perfect place to start. " : "Estimated level. ") + r.score + " of " + r.total + " answers correct." }),
      h("ul", { "class": "t-skills" }, skills),
      h("p", { "class": "a-muted a-small", text: "Indicative result, not an official certificate. It is based on grammar, vocabulary and reading only." }),
      h("div", { "class": "t-cta" }, guest ? [
        h("a", { "class": "btn-solid", href: "/signup", text: "Create my free account and save this" }),
        h("button", { "class": "btn-line", type: "button", text: "I already have an ID — log in", onclick: DK.openLogin })]
        : [h("a", { "class": "btn-solid", href: "/app/onboarding", text: "Continue" })]));
  }
  intro();
})();
