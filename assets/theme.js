// Deutsch-Klub — light / dark theme. Loaded in <head> (not deferred) so the right theme is set before the first paint.
// The visitor's choice is remembered on this device; without a choice the phone's / computer's system setting is used.
(function () {
  "use strict";
  var KEY = "dk_theme", root = document.documentElement;
  var media = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function current() { var s = stored(); return s === "light" || s === "dark" ? s : media && media.matches ? "dark" : "light"; }
  function apply(theme) {
    root.setAttribute("data-theme", theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#0a0a0a" : "#fafafa");
    document.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
      b.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    });
  }
  apply(current());
  if (media && media.addEventListener) media.addEventListener("change", function () { if (!stored()) apply(current()); });

  // any element with data-theme-toggle switches the theme; the View Transitions API (where supported) reveals the new
  // theme as a circle growing from the button
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("[data-theme-toggle]");
    if (!btn) return;
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    try { localStorage.setItem(KEY, next); } catch (err) {}
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || reduce) { apply(next); return; }
    var r = btn.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    var end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    var vt = document.startViewTransition(function () { apply(next); });
    vt.ready.then(function () {
      root.animate({ clipPath: ["circle(0px at " + x + "px " + y + "px)", "circle(" + end + "px at " + x + "px " + y + "px)"] },
        { duration: 650, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" });
    }).catch(function () {});
  });
  document.addEventListener("DOMContentLoaded", function () { apply(root.getAttribute("data-theme") || current()); });

  window.DK = window.DK || {};
  DK.THEME_BTN = '<button type="button" class="theme-btn" data-theme-toggle aria-label="Toggle dark mode">' +
    '<svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" stroke-linecap="round"/></svg>' +
    '<svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" stroke-linejoin="round"/></svg></button>';
})();
