// Deutsch-Klub — motion design for the landing page: scroll progress, staggered reveals, 3D tilt cards,
// the rotating panorama ring of landmarks and a gentle hero parallax. No libraries; respects reduced motion.
(function () {
  "use strict";
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches;

  // ---------- reveal on scroll (children of [data-stagger] get increasing delays) ----------
  var groups = document.querySelectorAll("[data-stagger]");
  Array.prototype.forEach.call(groups, function (g) {
    Array.prototype.forEach.call(g.children, function (el, i) { el.classList.add("reveal"); el.style.setProperty("--d", (i * 0.09).toFixed(2) + "s"); });
  });
  var reveals = document.querySelectorAll(".reveal");
  if (reduce || !("IntersectionObserver" in window)) {
    Array.prototype.forEach.call(reveals, function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    Array.prototype.forEach.call(reveals, function (el) { io.observe(el); });
  }

  // ---------- 3D tilt (desktop pointers only) ----------
  if (!reduce && finePointer) {
    Array.prototype.forEach.call(document.querySelectorAll(".tilt"), function (el) {
      var max = parseFloat(el.getAttribute("data-tilt")) || 9, frame = 0, ev = null;
      function apply() {
        frame = 0; if (!ev) return;
        var r = el.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
        el.style.setProperty("--ry", ((x - 0.5) * 2 * max).toFixed(2) + "deg");
        el.style.setProperty("--rx", ((0.5 - y) * 2 * max).toFixed(2) + "deg");
        el.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
        el.style.setProperty("--my", (y * 100).toFixed(1) + "%");
      }
      el.addEventListener("pointerenter", function () { el.classList.add("is-tilting"); });
      el.addEventListener("pointermove", function (e) { ev = e; if (!frame) frame = requestAnimationFrame(apply); });
      el.addEventListener("pointerleave", function () {
        ev = null; el.classList.remove("is-tilting");
        el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg");
      });
    });
  }

  // ---------- panorama ring: landmarks on a slowly turning cylinder; scrolling turns it further ----------
  var scene = document.querySelector(".ring-scene"), ring = scene && scene.querySelector(".ring");
  if (ring) {
    var panels = ring.querySelectorAll(".ring-panel"), n = panels.length, ringVisible = true, angle = 0, last = 0, ringRaf = 0;
    var layout = function () {
      var pw = Math.max(130, Math.min(230, scene.clientWidth * 0.21));
      var r = (pw / 2) / Math.tan(Math.PI / n) * 1.04;
      ring.style.setProperty("--pw", pw + "px");
      Array.prototype.forEach.call(panels, function (p, i) {
        p.style.setProperty("--a", (i * 360 / n) + "deg"); p.style.setProperty("--r", r + "px");
      });
    };
    var spin = function (now) {
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
      angle -= dt * 7;                                         // 7 degrees per second
      var rect = scene.getBoundingClientRect(), sp = (rect.top + rect.height / 2 - innerHeight / 2) / innerHeight;
      ring.style.setProperty("--ring", (angle + sp * 60).toFixed(2) + "deg");
      ringRaf = ringVisible && !document.hidden ? requestAnimationFrame(spin) : 0;
    };
    layout();
    window.addEventListener("resize", layout);
    if (reduce) { ring.style.setProperty("--ring", "-12deg"); }
    else {
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (en) {
          ringVisible = en[0].isIntersecting;
          if (ringVisible && !ringRaf) { last = 0; ringRaf = requestAnimationFrame(spin); }
        }).observe(scene);
      } else { ringRaf = requestAnimationFrame(spin); }
      document.addEventListener("visibilitychange", function () { if (!document.hidden && ringVisible && !ringRaf) { last = 0; ringRaf = requestAnimationFrame(spin); } });
    }
  }

  // ---------- scroll progress bar + hero parallax ----------
  var bar = document.querySelector(".progress"), heroContent = document.querySelector(".hero-content"), hero = document.querySelector(".hero");
  var ticking = false;
  function onScroll() {
    ticking = false;
    var max = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.setProperty("--p", max > 0 ? (window.scrollY / max).toFixed(4) : 0);
    if (heroContent && hero && !reduce) {
      var p = Math.min(1, window.scrollY / (hero.offsetHeight || 1));
      heroContent.style.transform = "translateY(" + (p * -60).toFixed(1) + "px)";
      heroContent.style.opacity = (1 - p * 1.1).toFixed(3);
    }
  }
  window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();
})();
