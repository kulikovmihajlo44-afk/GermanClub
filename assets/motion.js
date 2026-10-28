// Deutsch-Klub — motion design for the landing page: typed command line, staggered reveals, decoding labels,
// counting metrics, scroll progress and a live countdown to the next session (dates from Notion). No libraries; respects reduced motion.
(function () {
  "use strict";
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/<>_-=+*#";
  function each(sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); }

  // ---------- typed command line in the hero ----------
  each("[data-type]", function (el) {
    var text = el.getAttribute("data-type");
    if (reduce) { el.textContent = text; return; }
    var i = 0; el.textContent = "";
    (function step() { if (i <= text.length) { el.textContent = text.slice(0, i++); setTimeout(step, 28 + Math.random() * 40); } })();
  });

  // ---------- decode effect: random glyphs settle into the real text ----------
  function scramble(el) {
    var final = el.getAttribute("data-scramble") || el.textContent, start = performance.now(), dur = 700;
    el.setAttribute("data-scramble", final);
    if (reduce) { el.textContent = final; return; }
    (function frame(now) {
      var p = Math.min(1, (now - start) / dur), out = "";
      for (var i = 0; i < final.length; i++) {
        var ch = final[i];
        out += ch === " " || i / final.length < p ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = out;
      if (p < 1) requestAnimationFrame(frame);
    })(start);
  }

  // ---------- count up ----------
  function countUp(el) {
    var to = parseFloat(el.getAttribute("data-count")), suffix = el.getAttribute("data-suffix") || "", start = performance.now(), dur = 1300;
    if (reduce) { el.textContent = to + suffix; return; }
    (function frame(now) {
      var p = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(to * e) + suffix;
      if (p < 1) requestAnimationFrame(frame);
    })(start);
  }

  // ---------- reveal on scroll ----------
  each("[data-stagger]", function (g) {
    Array.prototype.forEach.call(g.children, function (el, i) { el.classList.add("reveal"); el.style.setProperty("--d", (i * 0.07).toFixed(2) + "s"); });
  });
  function onShow(el) {
    el.classList.add("in");
    if (el.hasAttribute("data-scramble")) scramble(el);
    Array.prototype.forEach.call(el.querySelectorAll("[data-scramble]"), scramble);
    Array.prototype.forEach.call(el.querySelectorAll("[data-count]"), countUp);
    if (el.hasAttribute("data-count")) countUp(el);
  }
  var targets = document.querySelectorAll(".reveal, [data-scramble], [data-count]");
  if (reduce || !("IntersectionObserver" in window)) {
    Array.prototype.forEach.call(targets, function (el) { el.classList.add("in"); });
    each("[data-count]", function (el) { el.textContent = el.getAttribute("data-count") + (el.getAttribute("data-suffix") || ""); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        if (e.target.classList.contains("reveal")) onShow(e.target);
        else if (!e.target.closest(".reveal")) { if (e.target.hasAttribute("data-count")) countUp(e.target); else scramble(e.target); }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -5% 0px" });
    Array.prototype.forEach.call(targets, function (el) { io.observe(el); });
  }

  // ---------- level scale: hover / click shows the level; it steps through on its own until someone interacts ----------
  each("[data-scale]", function (sc) {
    var btns = sc.querySelectorAll("button"), info = sc.querySelector(".scale-info"), cur = 0, timer = 0, touched = false;
    function pick(i) {
      cur = i;
      Array.prototype.forEach.call(btns, function (b, j) { b.classList.toggle("on", j === i); b.setAttribute("aria-selected", String(j === i)); });
      info.innerHTML = btns[i].getAttribute("data-desc");
    }
    Array.prototype.forEach.call(btns, function (b, i) {
      b.addEventListener("mouseenter", function () { touched = true; pick(i); });
      b.addEventListener("click", function () { touched = true; pick(i); });
      b.addEventListener("focus", function () { touched = true; pick(i); });
    });
    pick(0);
    if (!reduce && "IntersectionObserver" in window) {
      new IntersectionObserver(function (en) {
        clearInterval(timer);
        if (en[0].isIntersecting && !touched) timer = setInterval(function () { if (touched) return clearInterval(timer); pick((cur + 1) % btns.length); }, 2200);
      }, { threshold: 0.4 }).observe(sc);
    }
  });

  // ---------- scroll progress ----------
  var bar = document.querySelector(".progress"), ticking = false;
  function onScroll() {
    ticking = false;
    var max = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.setProperty("--p", max > 0 ? (window.scrollY / max).toFixed(4) : 0);
  }
  window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  // ---------- countdown to the next session (from the Notion "Sessions" table via /api/app?a=next-session) ----------
  // Without a planned session the widget says "unknown" rather than guessing a date.
  var cd = document.querySelector("[data-countdown]");
  if (cd) {
    var TZ = "Europe/Berlin", $ = function (s) { return cd.querySelector(s); };
    var label = $("[data-cd-label]"), place = $("[data-cd-place]"), level = $("[data-cd-level]"), state = $("[data-cd-state]");
    var cells = cd.querySelectorAll("[data-cd]"), session = null, timer = 0;
    var set = function (el, t) { if (el && el.textContent !== t) el.textContent = t; };
    function cellsTo(v) { Array.prototype.forEach.call(cells, function (c) { var k = c.getAttribute("data-cd"); set(c, v ? (v[k] < 10 ? "0" : "") + v[k] : "--"); }); }
    function hm(d) { return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ }); }
    function tick() {
      var now = Date.now(), s = new Date(session.start).getTime(), e = new Date(session.end).getTime();
      if (now >= e) { clearInterval(timer); return load(); }                 // over: ask for the next one
      if (now >= s) { set(label, "session is live now · until " + hm(new Date(e)) + " (Berlin)"); return cellsTo({ d: 0, h: 0, m: 0, s: 0 }); }
      var ms = s - now;
      cellsTo({ d: Math.floor(ms / 864e5), h: Math.floor(ms / 36e5) % 24, m: Math.floor(ms / 6e4) % 60, s: Math.floor(ms / 1e3) % 60 });
    }
    function show(x) {
      session = x;
      if (!x) { set(place, "unknown"); set(label, "unknown"); set(state, "no data"); cellsTo(null); return; }
      var st = new Date(x.start);
      set(place, x.place || "unknown");
      if (x.level) set(level, x.level);
      set(label, st.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }) + " · " + hm(st) + " (Berlin)");
      set(state, "synced");
      tick(); clearInterval(timer); timer = setInterval(tick, 1000);
    }
    function load() {
      fetch("/api/app?a=next-session").then(function (r) { return r.json(); })
        .then(function (j) { show(j && j.ok && j.session && j.session.start ? j.session : null); })
        .catch(function () { show(null); });
    }
    load();
  }
})();
