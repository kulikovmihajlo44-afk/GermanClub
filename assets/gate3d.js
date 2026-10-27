// Deutsch-Klub — the hero's 3D monument. The Brandenburg Gate line drawing (assets/img/hero.webp) is sampled into
// thousands of gold particles with real depth (front face, back face, sides) standing on a ring-shaped plaza.
// It assembles on load, turns with the pointer, sways on its own, and drifts apart as the hero scrolls away.
// Canvas 2D, no libraries. Without JS / with reduced motion the static drawing (.hero-fallback) stays visible.
(function () {
  "use strict";
  var hero = document.querySelector(".hero"), canvas = document.getElementById("gate3d");
  if (!hero || !canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var lowPower = Math.min(innerWidth, innerHeight) < 700 || (navigator.hardwareConcurrency || 8) <= 4;
  var COUNT = lowPower ? 6500 : 15000, FLOOR = lowPower ? 420 : 900, DUST = lowPower ? 90 : 220;
  var GATE_W = 2.8, DEPTH = 0.15, CAM = 4.4;
  // gold palette (light gold, gold, cream) as "r,g,b" for rgba() strings
  var COLORS = ["230,200,138", "201,164,92", "243,234,216"];
  var ALPHAS = [0.24, 0.45, 0.7, 0.95];

  var P = [];                 // particles: {tx,ty,tz, sx,sy,sz, dx,dy,dz, delay, c, base, ph}
  var W = 0, H = 0, dpr = 1, scale = 1, cx = 0, cy = 0;
  var t0 = 0, running = false, visible = true, raf = 0, firstFrame = true;
  var px = 0, py = 0, tpx = 0, tpy = 0, scrollP = 0;
  var buckets = [];
  for (var b = 0; b < COLORS.length * ALPHAS.length; b++) buckets.push([]);

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function easeOut(x) { return 1 - Math.pow(1 - x, 3); }

  function shell() {                         // random point on a sphere shell: where particles start
    var u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = rnd(3, 5.5), s = Math.sqrt(1 - u * u);
    return [r * s * Math.cos(th), r * u, r * s * Math.sin(th)];
  }

  function build(img) {
    var SW = lowPower ? 300 : 420, SH = Math.round(SW * img.naturalHeight / img.naturalWidth);
    var off = document.createElement("canvas"); off.width = SW; off.height = SH;
    var o = off.getContext("2d"); o.drawImage(img, 0, 0, SW, SH);
    var data = o.getImageData(0, 0, SW, SH).data, cand = [];
    for (var y = 0; y < SH; y++) for (var x = 0; x < SW; x++) {
      var i = (y * SW + x) * 4, v = (data[i + 3] / 255) * (data[i] + data[i + 1] + data[i + 2]) / 765;
      if (v > 0.22) cand.push(x, y, v);
    }
    if (!cand.length) throw new Error("empty");
    var n = cand.length / 3, k = GATE_W / SW;
    for (var j = 0; j < COUNT; j++) {
      var c = (Math.random() * n | 0) * 3, r = Math.random();
      var tx = (cand[c] + Math.random() * 0.6 - SW / 2) * k, ty = -(cand[c + 1] + Math.random() * 0.6 - SH / 2) * k;
      var tz = r < 0.55 ? DEPTH : r < 0.92 ? -DEPTH : rnd(-DEPTH, DEPTH);   // front face, back face, sides
      var s = shell();
      P.push({ tx: tx, ty: ty, tz: tz, sx: s[0], sy: s[1], sz: s[2],
        dx: tx * 0.6 + rnd(-0.6, 0.6), dy: rnd(0.2, 1.4), dz: rnd(-1, 1),
        delay: (1 - (ty / (SH * k) + 0.5)) * 0.15 + (ty + 1) * 0.45 + Math.random() * 0.35,
        c: Math.random() < 0.12 ? 2 : Math.random() < 0.5 ? 0 : 1, base: 0.55 + cand[c + 2] * 0.5 + (tz > 0 ? 0.2 : -0.1), ph: Math.random() * 6.28 });
    }
    var bottom = -(SH / 2) * k - 0.02;
    for (j = 0; j < FLOOR; j++) {             // the plaza: concentric rings, like the poster's background
      var ring = 1 + (Math.random() * 5 | 0), rad = 0.45 * ring + rnd(-0.015, 0.015), a = Math.random() * Math.PI * 2;
      var fx = Math.cos(a) * rad, fz = Math.sin(a) * rad * 0.9;
      P.push({ tx: fx, ty: bottom, tz: fz, sx: fx * 2.2, sy: bottom - rnd(1, 2.5), sz: fz * 2.2,
        dx: fx * 0.3, dy: rnd(-0.2, 0.1), dz: fz * 0.3, delay: 0.1 + ring * 0.12 + Math.random() * 0.3, c: 1, base: 0.5 - ring * 0.06, ph: a });
    }
    for (j = 0; j < DUST; j++) {              // slow floating dust around the monument
      var d = [rnd(-3, 3), rnd(-1.4, 2.2), rnd(-2.5, 2)];
      P.push({ tx: d[0], ty: d[1], tz: d[2], sx: d[0], sy: d[1], sz: d[2], dx: 0, dy: 0.4, dz: 0, delay: 0.6 + Math.random(), c: 0, base: 0.35, ph: Math.random() * 6.28, dust: 1 });
    }
  }

  function resize() {
    var r = hero.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2);
    W = Math.max(1, Math.round(r.width * dpr)); H = Math.max(1, Math.round(r.height * dpr));
    canvas.width = W; canvas.height = H;
    var narrow = W / H < 0.9;                  // phones: the monument sits under the title, desktop: behind it
    scale = narrow ? Math.min(W * 0.96 / GATE_W, H * 0.24) : Math.min(W * 0.9 / GATE_W, H * 0.4, 600 * dpr);
    cx = W / 2; cy = narrow ? H * 0.9 - 1.0 * scale : H * 0.57;
    if (!running) draw(performance.now());
  }

  function draw(now) {
    var t = (now - t0) / 1000, done = reduce ? 1 : 0;
    px += (tpx - px) * 0.05; py += (tpy - py) * 0.05;
    var yaw = (reduce ? 0.32 : Math.sin(t * 0.13) * 0.3 + 0.12) + px * 0.5;
    var pitch = 0.1 + py * 0.14 + scrollP * 0.5;
    var cY = Math.cos(yaw), sY = Math.sin(yaw), cX = Math.cos(pitch), sX = Math.sin(pitch);
    var spread = Math.pow(scrollP, 1.4) * 1.8, fade = 1 - scrollP * 0.85, size0 = 1.3 * dpr;
    var na = ALPHAS.length, i, p;
    for (i = 0; i < buckets.length; i++) buckets[i].length = 0;

    for (i = 0; i < P.length; i++) {
      p = P[i];
      var e = done || easeOut(Math.min(1, Math.max(0, (t - p.delay) / 1.7)));
      if (e <= 0) continue;
      var x = p.sx + (p.tx - p.sx) * e, y = p.sy + (p.ty - p.sy) * e, z = p.sz + (p.tz - p.sz) * e;
      if (!reduce) {
        var w = Math.sin(t * 1.1 + p.ph) * 0.006;
        if (p.dust) { y += Math.sin(t * 0.25 + p.ph) * 0.15; x += Math.cos(t * 0.2 + p.ph) * 0.1; }
        x += p.dx * spread + w; y += p.dy * spread + w; z += p.dz * spread;
      }
      var x1 = x * cY + z * sY, z1 = -x * sY + z * cY;
      var y1 = y * cX - z1 * sX, z2 = y * sX + z1 * cX;
      var k = CAM / (CAM - z2);
      if (k <= 0) continue;
      var a = p.base * fade * (0.55 + 0.45 * (z2 + 1.2) / 2.4) * (0.4 + 0.6 * e);
      if (!reduce) a *= 0.82 + 0.18 * Math.sin(t * 2 + p.ph * 3);
      var lvl = a > 0.62 ? 3 : a > 0.4 ? 2 : a > 0.2 ? 1 : 0;
      if (a < 0.05) continue;
      buckets[p.c * na + lvl].push(cx + x1 * k * scale, cy - y1 * k * scale, size0 * k * (p.dust ? 1.4 : 1));
    }

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    for (i = 0; i < buckets.length; i++) {
      var list = buckets[i]; if (!list.length) continue;
      ctx.fillStyle = "rgba(" + COLORS[(i / na) | 0] + "," + ALPHAS[i % na] + ")";
      for (var j = 0; j < list.length; j += 3) { var s = list[j + 2]; ctx.fillRect(list[j] - s / 2, list[j + 1] - s / 2, s, s); }
    }
    ctx.globalCompositeOperation = "source-over";
    if (firstFrame) { firstFrame = false; hero.classList.add("is-3d"); }
  }

  function loop(now) { draw(now); raf = running ? requestAnimationFrame(loop) : 0; }
  function setRunning(on) {
    on = on && !reduce && visible && !document.hidden;
    if (on === running) return;
    running = on;
    if (on) raf = requestAnimationFrame(loop); else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  function onScroll() {
    var h = hero.offsetHeight || 1;
    scrollP = Math.min(1, Math.max(0, window.scrollY / h));
    if (!running && !reduce && visible) draw(performance.now());
  }

  var img = new Image();
  img.decoding = "async";
  img.onload = function () {
    try { build(img); } catch (e) { return; }      // keep the static drawing if sampling is not possible
    t0 = performance.now();
    resize();
    window.addEventListener("resize", function () { resize(); });
    window.addEventListener("scroll", onScroll, { passive: true });
    if (!reduce) {
      window.addEventListener("pointermove", function (e) { tpx = e.clientX / innerWidth * 2 - 1; tpy = e.clientY / innerHeight * 2 - 1; }, { passive: true });
      document.addEventListener("visibilitychange", function () { setRunning(true); });
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (en) { visible = en[0].isIntersecting; setRunning(true); }).observe(hero);
      }
      setRunning(true);
    } else { draw(performance.now()); }
  };
  img.src = "/assets/img/hero.webp";
})();
