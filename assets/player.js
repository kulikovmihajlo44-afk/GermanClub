// Deutsch-Klub — the intro video player (index.html #intro). Never autoplays: the video starts only when the visitor
// presses play. Play / pause, ±10 s, scrubbing with a time + chapter hint, chapters (data-chapters="sec:Title|…",
// shown as ticks on the scrubber), mute and full screen. Keyboard while the player has focus: space / k play, ← → 5 s,
// j / l 10 s, m mute, f full screen. The chapter in the window bar follows the playhead.
(function () {
  "use strict";
  var root = document.querySelector("[data-player]");
  if (!root) return;
  var v = root.querySelector("video"), q = function (s) { return root.querySelector(s); };
  var big = q("[data-big]"), bigLabel = q("[data-big-label]"), toggle = q("[data-toggle]"), range = q("[data-range]");
  var cur = q("[data-cur]"), dur = q("[data-dur]"), now = q("[data-now]"), tip = q("[data-tip]"), ticks = q("[data-ticks]");
  var chapters = (root.getAttribute("data-chapters") || "0:Intro").split("|").map(function (c, i) {
    var k = c.indexOf(":");
    return { t: parseFloat(c.slice(0, k)) || 0, n: i + 1, label: c.slice(k + 1).trim() };
  });
  var seeking = false, last = -1;

  function D() { return isFinite(v.duration) && v.duration > 0 ? v.duration : parseFloat(root.getAttribute("data-duration")) || 1; }
  function fmt(s) { s = Math.max(0, Math.floor(s)); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); }
  function chapterAt(t) { var c = chapters[0]; chapters.forEach(function (x) { if (t >= x.t - 0.01) c = x; }); return c; }
  function pad2(n) { return String(n).padStart(2, "0"); }

  function paint() {
    var t = v.currentTime, p = Math.min(1, t / D());
    root.style.setProperty("--p", p.toFixed(4));
    if (!seeking) range.value = Math.round(p * 1000);
    cur.textContent = fmt(t);
    var c = chapterAt(t);
    if (c && c.n !== last) {
      last = c.n;
      now.textContent = pad2(c.n) + "/" + pad2(chapters.length) + " · " + c.label.toLowerCase();
    }
  }
  function layoutTicks() {
    ticks.innerHTML = "";
    chapters.forEach(function (c) { if (!c.t) return; var i = document.createElement("i"); i.style.left = (c.t / D() * 100) + "%"; ticks.appendChild(i); });
    dur.textContent = fmt(D());
  }
  function play() {
    root.classList.add("is-started");
    var r = v.play(); if (r && r.catch) r.catch(function () {});
  }
  function playPause() { if (v.paused || v.ended) play(); else v.pause(); }
  function seekTo(t) { v.currentTime = Math.max(0, Math.min(D() - 0.05, t)); paint(); }

  big.addEventListener("click", function () { if (v.ended) v.currentTime = 0; play(); });
  toggle.addEventListener("click", playPause);
  v.addEventListener("click", playPause);
  root.querySelectorAll("[data-skip]").forEach(function (b) {
    b.addEventListener("click", function () { seekTo(v.currentTime + parseFloat(b.getAttribute("data-skip"))); });
  });
  q("[data-mute]").addEventListener("click", function () { v.muted = !v.muted; });
  q("[data-full]").addEventListener("click", function () {
    var fs = document.fullscreenElement || document.webkitFullscreenElement;
    if (fs) return (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    if (root.requestFullscreen) root.requestFullscreen(); else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
    else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();               // iPhone: only the video can go full screen
  });

  // scrubbing: the native range input stays on top (keyboard + screen readers), the styled track sits underneath
  range.addEventListener("input", function () { seeking = true; seekTo(range.value / 1000 * D()); seeking = false; });
  range.addEventListener("pointermove", function (e) {
    var r = range.getBoundingClientRect(), x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), t = x * D();
    tip.textContent = fmt(t) + " · " + chapterAt(t).label.toLowerCase();
    tip.style.left = (x * 100) + "%";
  });

  v.addEventListener("play", function () { root.classList.add("is-playing", "is-started"); root.classList.remove("is-ended"); toggle.setAttribute("aria-label", "Pause"); });
  v.addEventListener("pause", function () { root.classList.remove("is-playing"); toggle.setAttribute("aria-label", "Play"); });
  v.addEventListener("ended", function () { root.classList.add("is-ended"); bigLabel.textContent = "replay · " + fmt(D()); big.setAttribute("aria-label", "Play the video again"); });
  v.addEventListener("timeupdate", paint);
  v.addEventListener("seeked", paint);
  v.addEventListener("loadedmetadata", function () { layoutTicks(); paint(); });
  v.addEventListener("volumechange", function () { root.classList.toggle("is-muted", v.muted); });

  root.setAttribute("tabindex", "-1");
  root.addEventListener("keydown", function (e) {
    if (e.target === range && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return;   // the range handles its own arrows
    var k = e.key, step = { ArrowLeft: -5, ArrowRight: 5, j: -10, l: 10 }[k];
    if (k === " " && e.target.tagName === "BUTTON") return;                             // space on a button presses it
    if (k === " " || k === "k") { e.preventDefault(); playPause(); }
    else if (step) { e.preventDefault(); seekTo(v.currentTime + step); }
    else if (k === "m") v.muted = !v.muted;
    else if (k === "f") q("[data-full]").click();
  });

  layoutTicks();
  paint();
})();
