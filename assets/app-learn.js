// Deutsch-Klub member app — Learn (grammar lessons) and Cards (FSRS decks + review).
(function () {
  "use strict";
  var DKA = window.DKA, h = DKA.h;

  // "Ich *lerne* heute" -> text with the verb highlighted
  function marked(str) {
    return String(str).split(/\*([^*]+)\*/).map(function (part, i) { return i % 2 ? h("mark", { "class": "a-verb", text: part }) : part; });
  }
  function normalize(s) { return String(s).toLowerCase().replace(/[.!?,;]+$/g, "").replace(/\s+/g, " ").trim(); }
  function pageHead(label, title, sub) {
    return [h("p", { "class": "eyebrow" }, [h("span", { "class": "mark mark-circle", "aria-hidden": "true" }), label]), h("h1", { "class": "a-h1", text: title }), sub ? h("p", { "class": "a-muted", text: sub }) : null];
  }

  // ---------------- Learn: list ----------------
  DKA.route(/^\/app\/learn$/, function (root) {
    return DKA.json("/content/lessons.json").then(function (lessons) {
      var done = {}; DKA.state.lessons.forEach(function (l) { done[l.topic] = l; });
      root.appendChild(h("div", { "class": "a-wrap" }, [].concat(pageHead("Learn", "Grammar lessons", "Grammar comes first: examples, one rule, a table, typical mistakes, then practice."), [
        lessons.length ? h("div", { "class": "a-today" }, lessons.map(function (l) {
          var d = done[l.id];
          return h("a", { "class": "a-item", href: "/app/learn/grammar/" + l.id, "data-link": "" }, [
            h("div", null, [h("strong", { text: l.title }), h("span", { text: l.level + " · about " + l.minutes + " min" + (d ? " · best score " + d.score + "/" + d.total : "") })]),
            h("em", { text: d ? "Repeat →" : "Start →" })]);
        })) : h("div", { "class": "a-card" }, [h("p", { "class": "a-muted", text: "No lessons yet." })]),
        h("p", { "class": "a-muted a-small", text: "More lessons are being added." })])));
    });
  });

  // ---------------- Learn: one lesson (rule 1 order) ----------------
  DKA.route(/^\/app\/learn\/grammar\/([a-z0-9-]+)$/, function (root, m) {
    return DKA.json("/content/lessons/" + m[1] + ".json").then(function (L) {
      var sec = function (title, body, id) { return h("section", { "class": "a-sec", id: id }, [h("h2", { "class": "a-h2", text: title }), body]); };
      var table = h("div", { "class": "a-tablewrap" }, [h("table", { "class": "a-table" }, [
        h("thead", null, [h("tr", null, L.table.headers.map(function (x, i) { return h("th", { "class": i === 1 ? "v" : "", text: x }); }))]),
        h("tbody", null, L.table.rows.map(function (r) { return h("tr", null, r.map(function (c, i) { return h("td", { "class": i === 1 ? "v" : "", text: c }); })); }))])]);
      var wordsHave = DKA.state.cards.decks.some(function (d) { return d.deck === L.cards.deck; });
      var addBtn = h("button", { type: "button", "class": "btn-solid", text: wordsHave ? "Already in your cards ✓" : "Add these " + L.cards.cards.length + " words to my cards", disabled: wordsHave, onclick: function () {
        addBtn.disabled = true;
        DK.api("/api/app?a=cards.add", { deck: L.cards.deck, source: "lesson:" + L.id, cards: L.cards.cards }).then(function (r) {
          if (r.status === 200 && r.j.ok) { addBtn.textContent = "Added ✓ (" + r.j.added + ")"; DKA.refresh(); DK.toast("Words added to your cards"); }
          else { addBtn.disabled = false; DK.toast("Could not add — try again"); } }).catch(function () { addBtn.disabled = false; DK.toast("No connection"); });
      } });
      var practice = h("div", { "class": "a-practice" });
      root.appendChild(h("div", { "class": "a-wrap a-narrow" }, [
        DKA.link("/app/learn", "← All lessons", "a-back"),
        h("p", { "class": "eyebrow" }, [h("span", { "class": "mark mark-circle", "aria-hidden": "true" }), "Grammar · " + L.level + " · about " + L.minutes + " min"]),
        h("h1", { "class": "a-h1", text: L.title }), h("p", { "class": "a-muted", text: L.intro }),
        sec("1 · Examples", h("ul", { "class": "a-examples" }, L.examples.map(function (e) { return h("li", null, [h("span", { "class": "de", lang: "de" }, marked(e.de)), h("span", { "class": "en", text: e.en })]); }))),
        sec("2 · The rule", h("div", null, [h("p", { "class": "a-rule", text: L.rule }), L.note ? h("p", { "class": "a-muted a-small", text: L.note }) : null])),
        sec("3 · At a glance", table),
        sec("4 · Typical mistakes", h("div", { "class": "a-errors" }, L.errors.map(function (e) {
          return h("div", { "class": "a-error" }, [h("p", { "class": "x", lang: "de" }, [h("span", { "class": "sym", "aria-label": "wrong", text: "✗" }), " " + e.wrong]), h("p", { "class": "ok", lang: "de" }, [h("span", { "class": "sym", "aria-label": "correct", text: "✓" }), " " + e.right]),
            h("p", { "class": "a-muted a-small", text: e.who + ": " + e.why })]); }))),
        sec("5 · Practice", practice, "practice"),
        sec("6 · New words", h("div", null, [h("p", { "class": "a-muted a-small", text: "Add them to your cards, so the app brings them back at the right time." }),
          h("ul", { "class": "a-words" }, L.cards.cards.map(function (c) { return h("li", null, [h("strong", { lang: "de", text: c.front }), h("span", { text: c.back })]); })), addBtn])),
        DKA.link("/app", "Back to Today", "btn-line")]));
      runPractice(practice, L);
    });
  });

  function runPractice(host, L) {
    var i = 0, score = 0;
    function show() {
      host.innerHTML = "";
      if (i >= L.exercises.length) {
        DK.api("/api/app?a=lesson.done", { topic: L.id, score: score, total: L.exercises.length }).then(function () { DKA.refresh(); });
        host.appendChild(h("div", { "class": "a-card a-result" }, [h("p", { "class": "a-big", text: score + " / " + L.exercises.length }),
          h("p", { "class": "a-muted", text: score === L.exercises.length ? "All correct. Add the new words below and you are done." : "Read the mistakes section again and try once more — repeating is how this rule sticks." }),
          h("button", { type: "button", "class": "btn-line", text: "Practice again", onclick: function () { i = 0; score = 0; show(); } })]));
        return;
      }
      var ex = L.exercises[i], fb = h("div", { "class": "a-fb", role: "status", hidden: true }), next = h("button", { type: "button", "class": "btn-solid", text: i === L.exercises.length - 1 ? "See my result" : "Next", hidden: true, onclick: function () { i++; show(); } });
      function finish(ok, right) {
        if (ok) score++;
        fb.hidden = false; fb.className = "a-fb " + (ok ? "good" : "bad");
        fb.textContent = ""; fb.appendChild(h("strong", { text: ok ? "Correct. " : "Not quite. " + (right ? "Answer: " + right + ". " : "") })); fb.appendChild(document.createTextNode(ex.explain));
        next.hidden = false; next.focus();
      }
      var body;
      if (ex.type === "choice") {
        var btns = ex.options.map(function (o, k) { return h("button", { type: "button", "class": "a-opt", text: o, onclick: function () {
          btns.forEach(function (b, j) { b.disabled = true; if (j === ex.answer) b.classList.add("right"); });
          if (k !== ex.answer) btns[k].classList.add("wrong"); finish(k === ex.answer, ex.options[ex.answer]); } }); });
        body = h("div", { "class": "a-opts" }, btns);
      } else {
        var inp = h("input", { type: "text", autocomplete: "off", autocapitalize: "off", spellcheck: "false", "aria-label": "Your answer" });
        var chk = h("button", { type: "button", "class": "btn-solid", text: "Check", onclick: function () {
          if (!inp.value.trim()) return; inp.disabled = true; chk.hidden = true;
          var ok = ex.answers.some(function (a) { return normalize(a) === normalize(inp.value); }); inp.classList.add(ok ? "right" : "wrong"); finish(ok, ex.answers[0]); } });
        inp.addEventListener("keydown", function (e) { if (e.key === "Enter") chk.click(); });
        body = h("div", { "class": "a-gap" }, [inp, chk]);
      }
      host.appendChild(h("div", { "class": "a-card" }, [h("p", { "class": "a-label", text: "Exercise " + (i + 1) + " of " + L.exercises.length }), h("p", { "class": "a-q", lang: "de", text: ex.prompt }), body, fb, next]));
      var f = host.querySelector("input"); if (f) f.focus();
    }
    show();
  }

  // ---------------- Cards: one 3D flip card (front: the German word; back: a live 3D association + meaning) ----------------
  var REDUCE = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var FINE = window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches;
  function flashCard(c, opts) {
    opts = opts || {};
    var objHost = h("div", { "class": "fc-obj", "aria-hidden": "true" });
    var front = h("div", { "class": "fc-face fc-front" }, [
      h("span", { "class": "fc-tag", text: opts.tag || "deutsch" }),
      h("p", { "class": "fc-word", lang: "de", text: c.front }),
      h("span", { "class": "fc-hint", text: opts.hint || "tap to flip" })]);
    var back = h("div", { "class": "fc-face fc-back" }, [objHost, h("div", { "class": "fc-meaning" }, [
      h("p", { "class": "fc-small", lang: "de", text: c.front }),
      h("p", { "class": "fc-ans", text: c.back }),
      c.example ? h("p", { "class": "fc-ex", lang: "de", text: c.example }) : null])]);
    var inner = h("div", { "class": "fc-inner" }, [front, back]);
    var el = h("div", { "class": "fc" + (opts.enter && !REDUCE ? " in" : "") }, [inner]);
    el.flipped = false;
    el.flip = function (on) {
      el.flipped = on === undefined ? !el.flipped : on;
      el.classList.toggle("flipped", el.flipped);
      if (el.flipped && !objHost.firstChild) {                     // the object scans in the moment the back turns up
        var pre = h("pre", { "class": "ascii", "data-shape": window.DKAssoc ? DKAssoc.name(c.front) : "wuerfel", "data-size": String(opts.size || 6), "data-speed": "0.8", "data-pitch": "0.35", "data-wobble": "0.2" });
        objHost.appendChild(pre);
        setTimeout(function () { if (window.DKAscii && pre.isConnected) DKAscii.mount(pre); }, REDUCE ? 0 : 250);
      }
    };
    if (FINE && !REDUCE) {
      var raf = 0, ev = null;
      el.addEventListener("pointermove", function (e) { ev = e; if (raf) return; raf = requestAnimationFrame(function () {
        raf = 0; var r = el.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
        el.style.setProperty("--ry", ((x - 0.5) * 10).toFixed(2) + "deg"); el.style.setProperty("--rx", ((0.5 - y) * 8).toFixed(2) + "deg"); }); });
      el.addEventListener("pointerleave", function () { el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); });
    }
    return el;
  }
  function leave(el, dir, done) {
    if (REDUCE) { el.remove(); return done(); }
    el.classList.remove("in"); el.classList.add(dir < 0 ? "out-l" : "out-r");
    setTimeout(function () { el.remove(); done(); }, 420);
  }

  // ---------------- Cards: home ----------------
  DKA.route(/^\/app\/cards$/, function (root) {
    return DKA.json("/content/decks.json").then(function (decks) {
      return (decks[0] ? DKA.json(decks[0].file) : Promise.resolve({ cards: [] })).then(function (first) {
        var c = DKA.state.cards, have = {}; c.decks.forEach(function (d) { have[d.deck] = d.n; });
        var stats = h("div", { "class": "d-stats fc-stats" }, [[c.due, "due now"], [c.total, "in your decks"], [10, "new per day"]].map(function (x) {
          return h("div", { "class": "d-stat" }, [h("b", { text: String(x[0]) }), h("span", { text: x[1] })]); }));
        // showcase: a stack whose top card flips by itself and walks through the deck
        var stage = h("div", { "class": "fc-stage fc-show" }, [h("div", { "class": "fc-ghost g2" }), h("div", { "class": "fc-ghost g1" })]);
        var words = (first.cards || []).slice(), wi = 0, cur = null, timer = 0;
        function nextShow() {
          if (!words.length || !stage.isConnected) return;
          var card = flashCard(words[wi % words.length], { enter: true, size: 5, tag: "preview", hint: "your deck" }); wi++;
          card.addEventListener("click", function () { card.flip(); });
          stage.appendChild(card); cur = card;
          if (REDUCE) return;
          timer = setTimeout(function () { card.flip(true);
            timer = setTimeout(function () { leave(card, -1, nextShow); }, 3600); }, 1600);
        }
        root.appendChild(h("div", { "class": "a-wrap" }, [
          h("div", { "class": "fc-home" }, [
            h("div", { "class": "fc-home-copy" }, [
              h("p", { "class": "eyebrow" }, [h("span", { "class": "mark mark-circle", "aria-hidden": "true" }), "Cards"]),
              h("h1", { "class": "a-h1", text: "Flip. Recall. Rate." }),
              h("p", { "class": "a-muted", text: "Every word has a 3D association on its back. FSRS brings each card back right before you would forget it." }),
              stats,
              c.due > 0 ? DKA.link("/app/cards/review", "Start review · " + c.due, "btn-solid fc-cta")
                : h("p", { "class": "a-muted a-small", text: c.total ? "Nothing is due right now — new cards are limited to 10 a day." : "Add a deck below to start." })]),
            stage]),
          h("h2", { "class": "a-h2", text: "Decks" }),
          h("div", { "class": "fc-decks" }, decks.map(function (d) {
            var n = have[d.id], btn = h("button", { type: "button", "class": n ? "btn-line" : "btn-solid", text: n ? "Added ✓" : "Add to my cards", disabled: !!n, onclick: function () {
              btn.disabled = true; btn.textContent = "Adding…";
              DKA.json(d.file).then(function (deck) { return DK.api("/api/app?a=cards.add", { deck: deck.id, source: "deck", cards: deck.cards }); }).then(function (r) {
                if (r.status === 200 && r.j.ok) { return DKA.refresh().then(function () { DK.toast(r.j.added + " cards added"); DKA.nav("/app/cards", true); }); }
                btn.disabled = false; btn.textContent = "Add to my cards"; DK.toast("Could not add — try again");
              }).catch(function () { btn.disabled = false; btn.textContent = "Add to my cards"; DK.toast("No connection"); }); } });
            return h("div", { "class": "fc-deck" }, [h("div", { "class": "fc-deck-pile", "aria-hidden": "true" }, [h("i"), h("i"), h("i", { text: d.level })]),
              h("div", null, [h("strong", { text: d.title }), h("span", { text: d.count + " cards · " + d.level + (n ? " · " + n + " in your cards" : "") })]), btn]);
          })),
          h("p", { "class": "a-muted a-small", text: "Words from lessons are added from the lesson page." })]));
        nextShow();
        window.addEventListener("popstate", function () { clearTimeout(timer); }, { once: true });
      });
    });
  });

  // ---------------- Cards: review ----------------
  DKA.route(/^\/app\/cards\/review$/, function (root) {
    return DK.api("/api/app?a=cards.due").then(function (res) {
      if (res.status !== 200 || !res.j.ok) throw new Error("due");
      var queue = res.j.queue.slice(), total = queue.length, answered = 0;
      var bar = h("div", { "class": "fc-prog" }, [h("i")]), count = h("span", { "class": "fc-count" });
      var stage = h("div", { "class": "fc-stage" }, [h("div", { "class": "fc-ghost g2" }), h("div", { "class": "fc-ghost g1" })]);
      var controls = h("div", { "class": "fc-controls" });
      var host = h("div", { "class": "a-wrap fc-review" }, [h("div", { "class": "fc-top" }, [DKA.link("/app/cards", "← Exit", "a-back"), bar, count]), stage, controls]);
      root.appendChild(host);
      var card = null, busy = false;
      function progress() {
        var done = total ? Math.min(1, answered / Math.max(total, answered + queue.length)) : 1;
        bar.firstChild.style.width = (done * 100).toFixed(1) + "%";
        count.textContent = answered + " / " + (answered + queue.length);
      }
      function endScreen() {
        detach(); stage.innerHTML = ""; controls.innerHTML = ""; progress();
        var shape = h("pre", { "class": "ascii", "data-shape": "ring", "data-size": "6", "data-speed": "1", "data-pitch": "0.9", "aria-hidden": "true" });
        stage.appendChild(h("div", { "class": "fc-done" }, [h("div", { "class": "fc-done-obj" }, [shape]),
          h("h1", { "class": "a-h1", text: total ? "Done for now." : "Nothing to review." }),
          h("p", { "class": "a-muted", text: total ? "You reviewed " + answered + " card" + (answered === 1 ? "" : "s") + ". Cards you are still learning come back when they are due." : "No cards are due. Add a deck, or come back later." }),
          DKA.link("/app", "Back to Today", "btn-solid")]));
        if (window.DKAscii) DKAscii.mount(shape);
        DKA.refresh();
      }
      function show() {
        progress();
        if (!queue.length) return endScreen();
        var c = queue[0];
        card = flashCard(c, { enter: true, tag: c.isNew ? "new word" : "review", hint: "tap or press space" });
        card.addEventListener("click", reveal);
        stage.appendChild(card);
        controls.innerHTML = "";
        controls.appendChild(h("button", { type: "button", "class": "btn-ghost fc-flip", onclick: reveal }, ["Show answer ", h("kbd", { text: "space" })]));
        busy = false;
      }
      function reveal() {
        if (!card || card.flipped || busy) return;
        card.flip(true);
        var c = queue[0];
        controls.innerHTML = "";
        controls.appendChild(h("div", { "class": "fc-rates" }, [[1, "Again"], [2, "Hard"], [3, "Good"], [4, "Easy"]].map(function (r, i) {
          return h("button", { type: "button", "class": "fc-rate r" + r[0], style: "--i:" + i, onclick: function () { rate(r[0]); } }, [h("strong", { text: r[1] }), h("span", { text: c.intervals[r[0]] }), h("kbd", { text: String(r[0]) })]); })));
      }
      function rate(r) {
        if (!card || !card.flipped || busy) return; busy = true;
        var c = queue[0];
        DK.api("/api/app?a=cards.review", { id: c.id, rating: r }).then(function (x) {
          if (x.status !== 200 || !x.j.ok) { busy = false; DK.toast("Could not save — try again"); return; }
          queue.shift(); answered++;
          if (new Date(x.j.due).getTime() - Date.now() < 2 * 60000) { c.intervals = x.j.intervals; c.isNew = false; queue.push(c); }  // only "Again" (about 1 min) repeats in this session
          controls.innerHTML = "";
          leave(card, r === 1 ? -1 : 1, show);
        }).catch(function () { busy = false; DK.toast("No connection — try again"); });
      }
      function onKey(e) {
        if (e.target.tagName === "INPUT" || e.metaKey || e.ctrlKey) return;
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); reveal(); } else if (/^[1-4]$/.test(e.key)) rate(Number(e.key));
      }
      function detach() { document.removeEventListener("keydown", onKey); }
      document.addEventListener("keydown", onKey);
      window.addEventListener("popstate", detach, { once: true });
      host.querySelector(".a-back").addEventListener("click", detach);
      show();
    });
  });
})();
