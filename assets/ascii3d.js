// Deutsch-Klub — live ASCII 3D renderer for the landmarks ("an object generated in a console").
// Every bright pixel of a line drawing (assets/img/*.webp) becomes a 3D point on a front and a back face, so the
// object has real depth when it turns. Each frame the cloud is rotated, projected onto a grid of sub-cells
// (2 × 3 per character) and every character cell gets the glyph whose *shape* best matches its sub-cells —
// columns become |, cornices _ = -, diagonals / \ — which keeps the drawing crisp instead of noisy.
// Objects scan in line by line when they first appear, sway around their facade and can be dragged to any angle.
// Usage: <pre class="ascii" data-src="/assets/img/x.webp"> or data-shape="ring|kugel|wuerfel" (avatars; lit, spinning);
// optional data-: size (font px), res (sample width),
// speed (rad/s), yaw, pitch, floor ("1" adds a ring plaza), fps, shade ("1": a grey-scale photo cut-out is drawn as a
// lit relief — its brightness is the colour and the slopes of its brightness are the surface normals, so faces and
// folds catch the light as the object turns), fit ("x,y": how much of the box the object may fill; default "0.38,0.84"; above 1 the object is larger than its box
// and gets cropped), anchor ("top": the top of the object sits at the top of the box instead of the centre).
// No libraries; only on-screen objects are rendered;
// with reduced motion every object is drawn once, standing still.
(function () {
  "use strict";
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var lowPower = Math.min(innerWidth, innerHeight) < 700 || (navigator.hardwareConcurrency || 8) <= 4;
  var CAM = 4.2, DEPTH = 0.13, all = [], clouds = {}, raf = 0;
  var SCAN = "▓▒░/\\|_-=+", NOISE = "01", TONES = ".,-~:;=!*#$@";   // TONES: lit shapes, like donut.c

  // ---------- glyph shapes: coverage of [top-left, top-right, mid-left, mid-right, bottom-left, bottom-right] ----------
  var GLYPHS = [
    [" ", 0, 0, 0, 0, 0, 0],
    [".", 0, 0, 0, 0, 0.35, 0.35], [",", 0, 0, 0, 0, 0.45, 0.2], ["'", 0.35, 0.35, 0, 0, 0, 0], ["`", 0.45, 0.1, 0, 0, 0, 0],
    ["_", 0, 0, 0, 0, 0.9, 0.9], ["-", 0, 0, 0.75, 0.75, 0, 0], ["\"", 0.7, 0.7, 0, 0, 0, 0], ["~", 0.2, 0.2, 0.6, 0.6, 0, 0],
    ["=", 0, 0, 0.8, 0.8, 0.65, 0.65], ["^", 0.6, 0.6, 0.25, 0.25, 0, 0], [":", 0.1, 0.1, 0.4, 0.4, 0.4, 0.4],
    ["|", 0.55, 0.55, 0.55, 0.55, 0.55, 0.55], ["!", 0.45, 0.45, 0.45, 0.45, 0.2, 0.2],
    ["/", 0, 0.8, 0.45, 0.45, 0.8, 0], ["\\", 0.8, 0, 0.45, 0.45, 0, 0.8],
    ["(", 0.1, 0.6, 0.6, 0.1, 0.1, 0.6], [")", 0.6, 0.1, 0.1, 0.6, 0.6, 0.1],
    ["[", 0.8, 0.45, 0.8, 0, 0.8, 0.45], ["]", 0.45, 0.8, 0, 0.8, 0.45, 0.8],
    ["L", 0.7, 0, 0.7, 0, 0.9, 0.7], ["J", 0, 0.7, 0, 0.7, 0.7, 0.9], ["T", 0.9, 0.9, 0.35, 0.35, 0.35, 0.35], ["Y", 0.6, 0.6, 0.45, 0.45, 0.3, 0.3],
    ["+", 0.3, 0.3, 0.85, 0.85, 0.3, 0.3], ["*", 0.45, 0.45, 0.7, 0.7, 0.3, 0.3], ["x", 0, 0, 0.6, 0.6, 0.6, 0.6],
    ["%", 0.75, 0.35, 0.5, 0.5, 0.35, 0.75], ["#", 0.8, 0.8, 0.9, 0.9, 0.8, 0.8], ["H", 0.8, 0.8, 0.95, 0.95, 0.8, 0.8],
    ["M", 0.95, 0.95, 0.85, 0.85, 0.8, 0.8], ["@", 1, 1, 1, 1, 0.95, 0.95]
  ];
  var Q = 4, LUT = new Array(Math.pow(Q, 6));                // 4 levels per sub-cell -> 4096 precomputed answers
  (function () {
    for (var code = 0; code < LUT.length; code++) {
      var v = [], c = code;
      for (var i = 0; i < 6; i++) { v.push((c % Q) / (Q - 1)); c = (c / Q) | 0; }
      var best = " ", bd = 1e9;
      for (var g = 0; g < GLYPHS.length; g++) {
        var d = 0; for (i = 0; i < 6; i++) { var e = v[i] - GLYPHS[g][i + 1]; d += e * e; }
        if (d < bd) { bd = d; best = GLYPHS[g][0]; }
      }
      LUT[code] = best;
    }
  })();

  // ---------- image -> point cloud (x in [-1, 1], y scaled alike, centred) ----------
  function cloudFor(src, res, floor, shade) {
    var key = src + "|" + res + "|" + floor + "|" + (shade ? 1 : 0);
    if (clouds[key]) return clouds[key];
    clouds[key] = new Promise(function (resolve, reject) {
      var img = new Image(); img.decoding = "async"; img.onerror = reject;
      img.onload = function () {
        try {
          var SW = res, SH = Math.max(1, Math.round(SW * img.naturalHeight / img.naturalWidth));
          var cv = document.createElement("canvas"); cv.width = SW; cv.height = SH;
          var g = cv.getContext("2d"); g.drawImage(img, 0, 0, SW, SH);
          var d = g.getImageData(0, 0, SW, SH).data, cand = [], x0 = SW, x1 = 0, y0 = SH, y1 = 0;
          // high-pass: a pixel counts by how much brighter it is than its neighbourhood, so outlines survive and
          // evenly hatched areas (roof tiles, windows at this scale) fade instead of turning into solid blocks
          var L = new Float32Array(SW * SH), I = new Float64Array((SW + 1) * (SH + 1)), R = 3;
          for (var y = 0; y < SH; y++) for (var x = 0, row = 0; x < SW; x++) {
            var i = (y * SW + x) * 4, lum = (d[i + 3] / 255) * (d[i] + d[i + 1] + d[i + 2]) / 765;
            L[y * SW + x] = lum; row += lum; I[(y + 1) * (SW + 1) + x + 1] = I[y * (SW + 1) + x + 1] + row;
          }
          if (shade) return resolve(relief(L, I, SW, SH));
          for (y = 0; y < SH; y++) for (x = 0; x < SW; x++) {
            var ax = Math.max(0, x - R), ay = Math.max(0, y - R), bx = Math.min(SW, x + R + 1), by = Math.min(SH, y + R + 1);
            var mean = (I[by * (SW + 1) + bx] - I[ay * (SW + 1) + bx] - I[by * (SW + 1) + ax] + I[ay * (SW + 1) + ax]) / ((bx - ax) * (by - ay));
            var v = Math.min(1, (L[y * SW + x] - mean) * 2.6);
            if (v > 0.14) { cand.push(x, y, v); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
          }
          var m = cand.length / 3; if (!m) throw new Error("empty");
          var k = 2 / Math.max(1, x1 - x0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, half = (y1 - y0) * k / 2;
          var ringPts = floor ? 1400 : 0, total = m * 2 + ringPts, pts = new Float32Array(total * 4), o = 0;
          for (var j = 0; j < m; j++) {                     // front face: every pixel; back face: the same, dimmer
            var px = (cand[j * 3] - cx) * k, py = -(cand[j * 3 + 1] - cy) * k, w = cand[j * 3 + 2];
            pts[o++] = px; pts[o++] = py; pts[o++] = DEPTH; pts[o++] = w;
            pts[o++] = px; pts[o++] = py; pts[o++] = -DEPTH; pts[o++] = w * 0.6;
          }
          for (j = 0; j < ringPts; j++) {                   // ring plaza: dotted concentric ellipses on the ground
            var ring = 1 + (j % 4), a = (j / ringPts) * Math.PI * 2 * 4 + ring, rad = 0.4 * ring + 0.15;
            pts[o++] = Math.cos(a) * rad; pts[o++] = -half - 0.04; pts[o++] = Math.sin(a) * rad * 0.85; pts[o++] = 0.55 - ring * 0.08;
          }
          resolve({ pts: pts, count: total, h: half * 2, stride: 4, lit: false });
        } catch (e) { reject(e); }
      };
      img.src = src;
    });
    return clouds[key];
  }

  // ---------- grey-scale cut-out -> lit relief (the "shader" for photo models) ----------
  // Every pixel brighter than the black background becomes a point; its brightness is the albedo, a softened copy of
  // the brightness is a height field, and the height field's slopes give each point a normal. The draw loop then lights
  // it like the primitive models (z-buffer + diffuse light + tone ramp), so a face reads as a face, not as outlines.
  function relief(L, I, SW, SH) {
    var R = 3, H = new Float32Array(SW * SH), x, y, x0 = SW, x1 = 0, y0 = SH, y1 = 0, m = 0;
    for (y = 0; y < SH; y++) for (x = 0; x < SW; x++) {
      var ax = Math.max(0, x - R), ay = Math.max(0, y - R), bx = Math.min(SW, x + R + 1), by = Math.min(SH, y + R + 1);
      H[y * SW + x] = (I[by * (SW + 1) + bx] - I[ay * (SW + 1) + bx] - I[by * (SW + 1) + ax] + I[ay * (SW + 1) + ax]) / ((bx - ax) * (by - ay));
      if (L[y * SW + x] > 0.06) { m++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (!m) throw new Error("empty");
    var k = 2 / Math.max(1, x1 - x0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, BUMP = 3;
    var pts = new Float32Array(Math.ceil(m * 1.3) * 8), o = 0, n = 0;
    for (y = 0; y < SH; y++) for (x = 0; x < SW; x++) {
      var a = L[y * SW + x];
      if (a <= 0.06) continue;
      var hx = (H[y * SW + Math.min(SW - 1, x + 1)] - H[y * SW + Math.max(0, x - 1)]) * BUMP;
      var hy = (H[Math.max(0, y - 1) * SW + x] - H[Math.min(SH - 1, y + 1) * SW + x]) * BUMP;   // image y runs down
      var nl = Math.sqrt(hx * hx + hy * hy + 1), px = (x - cx) * k, py = -(y - cy) * k, h = H[y * SW + x];
      // front: the bright, raised side; back: a sparse, dimmer plate so a full turn never shows a hole
      pts[o++] = px; pts[o++] = py; pts[o++] = DEPTH * (0.4 + h); pts[o++] = Math.pow(a, 0.85);
      pts[o++] = -hx / nl; pts[o++] = -hy / nl; pts[o++] = 1 / nl; pts[o++] = 0; n++;
      if ((x & 1) || (y & 1)) continue;                 // the back plate only needs every fourth pixel
      pts[o++] = px; pts[o++] = py; pts[o++] = -DEPTH; pts[o++] = a * 0.45;
      pts[o++] = 0; pts[o++] = 0; pts[o++] = -1; pts[o++] = 0; n++;
    }
    return { pts: pts, count: n, h: (y1 - y0) * k, stride: 8, lit: true, amb: 0.55, tone: [0.06, 0.72] };   // the photo's own light leads; tones stretched to full range
  }

  // ---------- models built from primitives (box, sphere, frustum / cone / cylinder, torus) ----------
  // A part: { b: [w, h, d] } | { s: r } | { c: [rBottom, rTop, h], open } | { t: [R, r, arc] }, plus at: [x, y, z],
  // rot: [rx, ry, rz] (radians), w: brightness 0..1, bands: n (darker rings along y), grid: [lat, lon] (sphere lines).
  // Every sampled point keeps its surface normal, so models are lit and depth-tested like the avatars.
  var MODELS = {};
  function define(name, parts, density) { MODELS[name] = { parts: parts, d: density || 52 }; }
  function buildModel(parts, D) {
    var P = [], TAU = Math.PI * 2;                                 // D: points per unit of length (52 suits a card)
    function rot(v, r) {
      var x = v[0], y = v[1], z = v[2], c, s2, t;
      if (r[0]) { c = Math.cos(r[0]); s2 = Math.sin(r[0]); t = y * c - z * s2; z = y * s2 + z * c; y = t; }
      if (r[1]) { c = Math.cos(r[1]); s2 = Math.sin(r[1]); t = x * c + z * s2; z = -x * s2 + z * c; x = t; }
      if (r[2]) { c = Math.cos(r[2]); s2 = Math.sin(r[2]); t = x * c - y * s2; y = x * s2 + y * c; x = t; }
      return [x, y, z];
    }
    parts.forEach(function (pt) {
      var at = pt.at || [0, 0, 0], r = pt.rot || [0, 0, 0], w0 = pt.w === undefined ? 1 : pt.w;
      function put(x, y, z, nx, ny, nz, w) {
        var p = rot([x, y, z], r), n = rot([nx, ny, nz], r);
        P.push(p[0] + at[0], p[1] + at[1], p[2] + at[2], w0 * (w === undefined ? 1 : w), n[0], n[1], n[2], 0);
      }
      var i, j, a, b, n1, n2;
      if (pt.b) {
        var hw = pt.b[0] / 2, hh = pt.b[1] / 2, hd = pt.b[2] / 2;
        [[0, hw, 1, 2, hh, hd], [1, hh, 0, 2, hw, hd], [2, hd, 0, 1, hw, hh]].forEach(function (f) {
          n1 = Math.max(2, Math.ceil(f[4] * 2 * D)); n2 = Math.max(2, Math.ceil(f[5] * 2 * D));
          [-1, 1].forEach(function (sg) {
            for (i = 0; i <= n1; i++) for (j = 0; j <= n2; j++) {
              var v = [0, 0, 0], nn = [0, 0, 0];
              v[f[0]] = sg * f[1]; v[f[2]] = (i / n1 * 2 - 1) * f[4]; v[f[3]] = (j / n2 * 2 - 1) * f[5]; nn[f[0]] = sg;
              var edge = (i === 0 || i === n1) || (j === 0 || j === n2);
              put(v[0], v[1], v[2], nn[0], nn[1], nn[2], edge ? 1 : 0.88);
            }
          });
        });
      } else if (pt.s) {
        var R = pt.s, cnt = Math.ceil(4 * Math.PI * R * R * D * D * 0.9), ga = Math.PI * (3 - Math.sqrt(5)), g = pt.grid;
        for (i = 0; i < cnt; i++) {
          var yy = 1 - (i / (cnt - 1)) * 2, rr = Math.sqrt(1 - yy * yy), th = ga * i, x = Math.cos(th) * rr, z = Math.sin(th) * rr, w = 1;
          if (g) { var lat = Math.asin(yy) * 180 / Math.PI + 90, lon = Math.atan2(z, x) * 180 / Math.PI + 180;
            if (lat % (180 / g[0]) < 180 / g[0] * 0.12 || lon % (360 / g[1]) < 360 / g[1] * 0.12) w = 0.45; }
          put(x * R, yy * R, z * R, x, yy, z, w);
        }
      } else if (pt.c) {
        var r0 = pt.c[0], r1 = pt.c[1], hgt = pt.c[2], slope = (r0 - r1) / hgt, bands = pt.bands;
        n2 = Math.max(2, Math.ceil(Math.hypot(hgt, r0 - r1) * D));
        for (j = 0; j <= n2; j++) {
          var k = j / n2, ry = -hgt / 2 + k * hgt, rad = r0 + (r1 - r0) * k;
          n1 = Math.max(6, Math.ceil(TAU * Math.max(rad, 0.01) * D));
          var band = bands && (Math.floor(k * bands * 2) % 2 === 1) ? 0.55 : 1;
          for (i = 0; i < n1; i++) { a = i / n1 * TAU; var nl = Math.hypot(1, slope); put(Math.cos(a) * rad, ry, Math.sin(a) * rad, Math.cos(a) / nl, slope / nl, Math.sin(a) / nl, band); }
        }
        [[-hgt / 2, r0, -1], [hgt / 2, r1, 1]].forEach(function (cap) {
          if (cap[1] < 0.01 || (pt.open && cap[2] > 0)) return;
          n1 = Math.max(2, Math.ceil(cap[1] * D));
          for (j = 1; j <= n1; j++) { var cr = cap[1] * j / n1, m = Math.max(6, Math.ceil(TAU * cr * D)); for (i = 0; i < m; i++) { a = i / m * TAU; put(Math.cos(a) * cr, cap[0], Math.sin(a) * cr, 0, cap[2], 0, 0.95); } }
        });
      } else if (pt.t) {
        var TR = pt.t[0], tr = pt.t[1], arc = pt.t[2] || TAU;
        n1 = Math.ceil(arc * TR * D); n2 = Math.max(8, Math.ceil(TAU * tr * D));
        for (i = 0; i <= n1; i++) for (j = 0; j < n2; j++) {
          var u = i / n1 * arc, vv = j / n2 * TAU, cu = Math.cos(u), su = Math.sin(u), cv = Math.cos(vv), sv = Math.sin(vv);
          put((TR + tr * cv) * cu, tr * sv, (TR + tr * cv) * su, cv * cu, sv, cv * su);
        }
      }
    });
    // centre the model and scale its largest side to 1.9 units
    var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], q;
    for (q = 0; q < P.length; q += 8) for (var d = 0; d < 3; d++) { if (P[q + d] < lo[d]) lo[d] = P[q + d]; if (P[q + d] > hi[d]) hi[d] = P[q + d]; }
    var span = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1, sc = 1.9 / span;
    var mid = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    for (q = 0; q < P.length; q += 8) for (d = 0; d < 3; d++) P[q + d] = (P[q + d] - mid[d]) * sc;
    var pts = new Float32Array(P);
    return { pts: pts, count: pts.length / 8, h: (hi[1] - lo[1]) * sc, stride: 8, lit: true };
  }

  // Berliner Fernsehturm — proportions after the reference: 368 m in all, sphere Ø 32 m at about 200–207 m,
  // shaft tapering from 16 m to 9 m below the sphere, 118 m antenna on top (1 unit = 184 m, ground at y = -1)
  define("fernsehturm", [
    { c: [0.30, 0.20, 0.05], at: [0, -0.975, 0], w: 0.8 },                        // folded-roof pavilion around the foot
    { c: [0.0435, 0.0245, 1.12], at: [0, -0.44, 0], bands: 5 },                   // concrete shaft, five stages
    { s: 0.1, at: [0, 0.125, 0], grid: [6, 14] },                                  // the sphere and its facets (a touch larger, so it reads at small sizes)
    { c: [0.1025, 0.1025, 0.024], at: [0, 0.14, 0], open: true, w: 0.35 },        // window band of the panorama floor
    { c: [0.022, 0.018, 0.15], at: [0, 0.285, 0] },                               // upper shaft
    { c: [0.013, 0.006, 0.64], at: [0, 0.68, 0], bands: 7 }                       // antenna (red and white bands)
  ], 150);

  // ---------- procedural shapes for the avatars: points carry surface normals and are lit + depth-tested ----------
  function shapeCloud(name) {
    var key = "shape|" + name;
    if (clouds[key]) return clouds[key];
    if (MODELS[name]) { clouds[key] = Promise.resolve(buildModel(MODELS[name].parts, MODELS[name].d)); return clouds[key]; }
    var P = [], TAU = Math.PI * 2;
    function add(x, y, z, w, nx, ny, nz) { P.push(x, y, z, w, nx, ny, nz, 0); }
    if (name === "ring") {                                          // torus ("Ring"), a nod to donut.c
      var R = 0.6, r = 0.3;
      for (var i = 0; i < 160; i++) for (var j = 0; j < 56; j++) {
        var u = i / 160 * TAU, v = j / 56 * TAU, cu = Math.cos(u), su = Math.sin(u), cv = Math.cos(v), sv = Math.sin(v);
        add((R + r * cv) * cu, r * sv, (R + r * cv) * su, 1, cv * cu, sv, cv * su);
      }
    } else if (name === "kugel") {                                  // globe ("Kugel") with latitude / longitude lines
      var n = 5200, ga = Math.PI * (3 - Math.sqrt(5));
      for (i = 0; i < n; i++) {
        var yy = 1 - (i / (n - 1)) * 2, rr = Math.sqrt(1 - yy * yy), th = ga * i, x = Math.cos(th) * rr, z = Math.sin(th) * rr;
        var lat = Math.asin(yy) * 180 / Math.PI, lon = Math.atan2(z, x) * 180 / Math.PI + 180;
        var line = Math.abs(lat % 30) < 2.2 || Math.abs(lon % 30) < 2.2 || Math.abs(lon % 30) > 27.8;
        add(x * 0.85, yy * 0.85, z * 0.85, line ? 1 : 0.42, x, yy, z);
      }
    } else {                                                        // cube ("Würfel") with a 3 × 3 grid on every face
      var g = 40, hs = 0.58;
      var faces = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
      faces.forEach(function (f) {
        for (var a = 0; a <= g; a++) for (var b = 0; b <= g; b++) {
          var s1 = (a / g) * 2 - 1, s2 = (b / g) * 2 - 1, edge = Math.abs(s1) > 0.95 || Math.abs(s2) > 0.95;
          var grid = Math.abs(Math.abs(s1) - 1 / 3) < 0.03 || Math.abs(Math.abs(s2) - 1 / 3) < 0.03;
          var c = f[0] ? [f[0], s1, s2] : f[1] ? [s1, f[1], s2] : [s1, s2, f[2]];
          add(c[0] * hs, c[1] * hs, c[2] * hs, edge ? 1 : grid ? 0.8 : 0.4, f[0], f[1], f[2]);
        }
      });
    }
    var pts = new Float32Array(P);
    clouds[key] = Promise.resolve({ pts: pts, count: pts.length / 8, h: 1.75, stride: 8, lit: true });
    return clouds[key];
  }

  // ---------- one renderer per <pre> ----------
  function Inst(el) {
    var ds = el.dataset;
    this.el = el;
    this.size = parseFloat(ds.size) || 9;
    this.res = Math.round((parseFloat(ds.res) || 200) * (lowPower ? 0.8 : 1));
    this.speed = ds.speed !== undefined ? parseFloat(ds.speed) : 0.35;
    this.center = parseFloat(ds.yaw) || 0; this.phase = Math.random() * 6; this.yaw = this.center;   // sways around the facade
    this.pitch = ds.pitch !== undefined ? parseFloat(ds.pitch) : 0.1;
    this.fps = parseFloat(ds.fps) || (lowPower ? 20 : 30);
    this.floor = ds.floor === "1";
    this.visible = false; this.shown = 0; this.last = 0; this.frames = 0; this.fpsT = 0;
    this.anchorTop = ds.anchor === "top";
    this.shape = ds.shape || ""; this.basePitch = this.pitch; this.wobble = ds.wobble !== undefined ? parseFloat(ds.wobble) : 0.35;
    this.drag = null; this.cloud = null; this.vp = el.closest(".viewport, .lm, [data-stats]");
    var self = this;
    var fit = String(ds.fit || "").split(","); this.fitX = parseFloat(fit[0]) || 0.38; this.fitY = parseFloat(fit[1]) || 0.84;
    (this.shape ? shapeCloud(this.shape) : cloudFor(ds.src, this.res, this.floor, ds.shade === "1")).then(function (c) { self.cloud = c; self.measure(); self.draw(performance.now(), true); }, function () {});
    this.bindPointer();
  }
  Inst.prototype.measure = function () {
    var el = this.el, cs = getComputedStyle(el);
    el.style.fontSize = this.size + "px";
    var ctx = Inst.ctx || (Inst.ctx = document.createElement("canvas").getContext("2d"));
    ctx.font = cs.fontWeight + " " + this.size + "px " + cs.fontFamily;
    this.cw = ctx.measureText("MMMMMMMMMM").width / 10 || this.size * 0.6;
    this.lh = this.size;
    this.cols = Math.max(8, Math.floor(el.clientWidth / this.cw));
    this.rows = Math.max(6, Math.floor(el.clientHeight / this.lh));
    this.sub = new Float32Array(this.cols * 2 * this.rows * 3);
    this.zb = new Float32Array(this.sub.length);
    var aspect = this.cw / this.lh, h = this.cloud ? this.cloud.h + (this.floor ? 0.25 : 0) : 1.4;
    this.sx = Math.min(this.cols * this.fitX, (this.rows * this.fitY) / (h * aspect));   // character cells per unit (x)
    this.sy = this.sx * aspect;
  };
  Inst.prototype.bindPointer = function () {
    var self = this, el = this.el;
    el.addEventListener("pointerdown", function (e) { self.drag = { x: e.clientX, y: e.clientY, yaw: self.yaw, pitch: self.pitch }; self.phase = 0; if (el.setPointerCapture) el.setPointerCapture(e.pointerId); });
    el.addEventListener("pointermove", function (e) {
      if (!self.drag) return;
      self.yaw = self.center = self.drag.yaw + (e.clientX - self.drag.x) * 0.012;
      self.pitch = Math.max(-0.5, Math.min(0.7, self.drag.pitch + (e.clientY - self.drag.y) * 0.006));
      if (reduce) self.draw(performance.now(), true);
    });
    var end = function () { self.drag = null; };
    el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  };
  Inst.prototype.draw = function (now, force) {
    if (!this.cloud || !this.sub) return;
    if (!force && now - this.last < 1000 / this.fps) return;
    var dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    if (!reduce && !this.drag) {
      this.phase += Math.abs(this.speed) * dt;
      if (this.shape) { this.yaw += this.speed * dt; this.pitch = this.basePitch + Math.sin(this.phase * 0.7) * this.wobble; }   // avatars spin
      else this.yaw = this.center + Math.sin(this.phase) * 0.6 * (this.speed < 0 ? -1 : 1);                               // landmarks sway
    }
    if (!this.shown && this.visible) this.shown = now;

    var cols = this.cols, rows = this.rows, SWc = cols * 2, SHc = rows * 3, sub = this.sub, pts = this.cloud.pts, N = this.cloud.count, tone = this.cloud.tone;
    sub.fill(0);
    var lit = this.cloud.lit, st = this.cloud.stride || 4, zb = this.zb, amb = this.cloud.amb || 0.12;
    if (lit) zb.fill(-1e9);
    var cY = Math.cos(this.yaw), sY = Math.sin(this.yaw), cP = Math.cos(this.pitch), sP = Math.sin(this.pitch);
    var sx = this.sx * 2, sy = this.sy * 3, ox = cols, oy = this.anchorTop ? SHc * 0.04 + this.cloud.h / 2 * sy : rows * 1.5;
    for (var i = 0, o = 0; i < N; i++, o += st) {
      var x = pts[o], y = pts[o + 1], z = pts[o + 2];
      var x1 = x * cY + z * sY, z1 = -x * sY + z * cY;
      var y1 = y * cP - z1 * sP, z2 = y * sP + z1 * cP;
      var k = CAM / (CAM - z2);
      var ix = (ox + x1 * k * sx) | 0, iy = (oy - y1 * k * sy) | 0;
      if (ix < 0 || iy < 0 || ix >= SWc || iy >= SHc) continue;
      var idx = iy * SWc + ix, w;
      if (lit) {                               // shapes: nearest point wins, brightness from a light at the top left front
        if (z2 <= zb[idx]) continue;
        var nx = pts[o + 4], ny = pts[o + 5], nz = pts[o + 6];
        var nx1 = nx * cY + nz * sY, nz1 = -nx * sY + nz * cY, ny1 = ny * cP - nz1 * sP, nz2 = ny * sP + nz1 * cP;
        var dif = -0.45 * nx1 + 0.55 * ny1 + 0.7 * nz2;
        zb[idx] = z2; sub[idx] = pts[o + 3] * (amb + (1 - amb) * Math.max(0, dif));
      } else {
        w = pts[o + 3] * (0.6 + 0.4 * (z2 + 1.2) / 2.4);
        if (w > sub[idx]) sub[idx] = w;        // strongest point per sub-cell: crisp lines, no blobs where points pile up
      }
    }
    var inv = 1 / 1.1;
    var scan = reduce ? rows + 2 : this.shown ? Math.min(rows + 2, (now - this.shown) / 1300 * (rows + 4)) : -1;
    var out = new Array(rows), q3 = Q - 1;
    for (var r = 0; r < rows; r++) {
      if (r > scan) { out[r] = ""; continue; }
      var edge = scan - r < 2 && scan < rows + 1, line = "", b0 = r * 3 * SWc;
      for (var c = 0; c < cols; c++) {
        var a = b0 + c * 2;
        var s0 = sub[a], s1 = sub[a + 1], s2 = sub[a + SWc], s3 = sub[a + SWc + 1], s4 = sub[a + 2 * SWc], s5 = sub[a + 2 * SWc + 1];
        if (s0 + s1 + s2 + s3 + s4 + s5 < 0.02) { line += edge && Math.random() < 0.05 ? SCAN[(Math.random() * SCAN.length) | 0] : " "; continue; }
        if (edge) { line += SCAN[(Math.random() * SCAN.length) | 0]; continue; }
        var ch;
        if (lit) {                             // smooth lit surfaces read best as a tone ramp
          var avg = (s0 + s1 + s2 + s3 + s4 + s5) / 6;
          if (tone) avg = Math.max(0.02, (avg - tone[0]) / (tone[1] - tone[0]) / 1.15);
          ch = TONES[Math.min(TONES.length - 1, Math.round(Math.pow(Math.min(1, avg * 1.15), 0.85) * (TONES.length - 1)))];
        } else {                               // line drawings: the glyph whose shape matches the sub-cells
          ch = LUT[lv(s0 * inv) + Q * (lv(s1 * inv) + Q * (lv(s2 * inv) + Q * (lv(s3 * inv) + Q * (lv(s4 * inv) + Q * lv(s5 * inv)))))];
        }
        if (ch === " ") ch = ".";
        line += !reduce && Math.random() < 0.0015 ? NOISE[(Math.random() * 2) | 0] : ch;
      }
      out[r] = line;
    }
    this.el.textContent = out.join("\n");

    this.frames++;
    if (now - this.fpsT > 500) {
      var fps = Math.round(this.frames * 1000 / (now - this.fpsT || 1)); this.frames = 0; this.fpsT = now;
      if (this.vp) {
        var deg = ((this.yaw * 180 / Math.PI) % 360 + 360) % 360;
        set(this.vp, "fps", reduce ? "static" : fps + " fps");
        set(this.vp, "yaw", "yaw " + deg.toFixed(1) + "°");
        set(this.vp, "pts", N.toLocaleString("en-US").replace(/,/g, " ") + " pts");
        set(this.vp, "grid", cols + "×" + rows);
      }
    }
    function lv(v) { return v <= 0 ? 0 : v >= 1 ? q3 : Math.round(Math.pow(v, 0.8) * q3); }
  };
  function set(root, key, val) { var e = root.querySelector('[data-stat="' + key + '"]'); if (e && e.textContent !== val) e.textContent = val; }

  function loop(now) {
    raf = 0;
    var any = false;
    all = all.filter(function (x) { return x.el.isConnected; });
    for (var i = 0; i < all.length; i++) if (all[i].visible && !document.hidden) { all[i].draw(now); any = true; }
    if (any) raf = requestAnimationFrame(loop);
  }
  function kick() { if (!raf && !reduce) raf = requestAnimationFrame(loop); }

  var io = null, ro = null;
  function mount(el) {
    if (el._ascii) return el._ascii;
    var inst = new Inst(el); el._ascii = inst; all.push(inst);
    if (io) io.observe(el); else inst.visible = true;
    if (ro) ro.observe(el);
    kick();
    return inst;
  }
  window.DKAscii = { mount: mount, define: define, has: function (n) { return !!MODELS[n]; }, reduce: reduce };
  function init() {
    var els = document.querySelectorAll("pre.ascii[data-src], pre.ascii[data-shape]");
    io = "IntersectionObserver" in window ? new IntersectionObserver(function (en) {
      en.forEach(function (e) { var inst = e.target._ascii; if (!inst) return; inst.visible = e.isIntersecting; if (e.isIntersecting) { inst.last = 0; if (reduce) inst.draw(performance.now(), true); } });
      kick();
    }, { rootMargin: "60px" }) : null;
    ro = "ResizeObserver" in window ? new ResizeObserver(function (en) {
      en.forEach(function (e) { var inst = e.target._ascii; if (inst && inst.cloud) { inst.measure(); inst.draw(performance.now(), true); } });
    }) : null;
    Array.prototype.forEach.call(els, mount);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { all.forEach(function (x) { if (x.cloud) { x.measure(); x.draw(performance.now(), true); } }); });
    document.addEventListener("visibilitychange", kick);
    kick();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
