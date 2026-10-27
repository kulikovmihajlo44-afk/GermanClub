// Deutsch-Klub — motion design for the landing page: typed command line, staggered reveals, decoding labels,
// counting metrics, scroll progress and a live countdown to the next session. No libraries; respects reduced motion.
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

  // ---------- countdown to the next Sunday session (dates from content/club.json, Berlin time) ----------
  var cd = document.querySelector("[data-countdown]");
  if (cd) {
    fetch("/content/club.json").then(function (r) { return r.json(); }).then(function (club) {
      function berlinOffsetMin(date) {            // minutes Berlin is ahead of UTC at that moment
        var p = {}; new Intl.DateTimeFormat("en-US", { timeZone: club.tz || "Europe/Berlin", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
          .formatToParts(date).forEach(function (x) { p[x.type] = x.value; });
        return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - date.getTime()) / 60000;
      }
      function sessionStart(day) {               // "YYYY-MM-DD" + club.start (Berlin) -> Date
        var hm = club.start.split(":"), guess = new Date(day + "T" + hm[0] + ":" + hm[1] + ":00Z");
        return new Date(guess.getTime() - berlinOffsetMin(guess) * 60000);
      }
      function next() {
        var d = new Date(club.first + "T12:00:00Z"), end = new Date(club.last + "T12:00:00Z"), now = Date.now();
        var dur = (parseInt(club.end, 10) - parseInt(club.start, 10)) * 3600000;
        while (d <= end) { var s = sessionStart(d.toISOString().slice(0, 10)); if (s.getTime() + dur > now) return { start: s, live: s.getTime() <= now }; d = new Date(d.getTime() + 7 * 864e5); }
        return null;
      }
      var label = cd.querySelector("[data-cd-label]"), cells = cd.querySelectorAll("[data-cd]");
      function tick() {
        var n = next();
        if (!n) { if (label) label.textContent = "season finished · new dates soon"; return; }
        if (label) label.textContent = n.live ? "session is live now" : n.start.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: club.tz || "Europe/Berlin" }) + " · " + club.start + " (Berlin)";
        var ms = Math.max(0, n.start.getTime() - Date.now()), v = { d: Math.floor(ms / 864e5), h: Math.floor(ms / 36e5) % 24, m: Math.floor(ms / 6e4) % 60, s: Math.floor(ms / 1e3) % 60 };
        Array.prototype.forEach.call(cells, function (c) { var k = c.getAttribute("data-cd"), t = (v[k] < 10 ? "0" : "") + v[k]; if (c.textContent !== t) c.textContent = t; });
      }
      tick(); setInterval(tick, 1000);
    }).catch(function () {});
  }
})();
