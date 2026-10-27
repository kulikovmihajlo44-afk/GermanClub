// Deutsch-Klub member app — the 3D member card: name, ID, level, goal, daily minutes and interests, with a live
// ASCII avatar (assets/ascii3d.js: Ring / Kugel / Würfel). After sign-up, the placement test and the onboarding
// questions the card flies in once and the member picks an avatar; afterwards it lives on the dashboard and tilts
// with the pointer. Text only — never innerHTML for member data.
(function () {
  "use strict";
  var DKA = window.DKA, h = DKA.h;
  var AVATARS = [["ring", "Ring"], ["kugel", "Kugel"], ["wuerfel", "Würfel"]];
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches;

  function avatarPre(shape, size, cls) {
    var pre = h("pre", { "class": "ascii " + (cls || ""), "data-shape": shape, "data-size": String(size), "data-speed": "0.9", "data-pitch": shape === "ring" ? "0.95" : "0.35", "aria-hidden": "true" });
    setTimeout(function () { if (window.DKAscii && pre.isConnected) DKAscii.mount(pre); }, 0);
    return pre;
  }
  // a barcode drawn from the member ID: every digit picks a bar width
  function barcode(id) {
    var bars = "▏▎▍▌▋▊", out = "";
    String(id).replace(/\D/g, "").split("").forEach(function (d) { out += bars[+d % bars.length] + " "; });
    return out.trim();
  }
  function tilt(card) {
    if (reduce || !fine) return;
    var raf = 0, ev = null;
    card.addEventListener("pointermove", function (e) {
      ev = e; if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0; var r = card.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
        card.style.setProperty("--ry", ((x - 0.5) * 18).toFixed(2) + "deg"); card.style.setProperty("--rx", ((0.5 - y) * 14).toFixed(2) + "deg");
        card.style.setProperty("--mx", (x * 100).toFixed(1) + "%"); card.style.setProperty("--my", (y * 100).toFixed(1) + "%");
      });
    });
    card.addEventListener("pointerleave", function () { card.style.setProperty("--rx", "0deg"); card.style.setProperty("--ry", "0deg"); });
  }

  // ---------- the card ----------
  DKA.memberCard = function (s, opts) {
    opts = opts || {};
    var pr = s.profile || {}, p = s.placement || {}, avatar = opts.avatar || pr.avatar || "ring";
    var since = s.user.created_at ? new Date(s.user.created_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "";
    var avHost = h("div", { "class": "mc-avatar" }, [avatarPre(avatar, 6)]);
    var nameEl = h("p", { "class": "mc-name", text: s.user.full_name });
    var goalEl = h("b", { text: pr.goal ? DKA.goalName(pr.goal) : "—" }), minEl = h("b", { text: pr.minutes ? pr.minutes + " min" : "—" });
    var tagsEl = h("div", { "class": "mc-tags" });
    function paintTags(list) { tagsEl.innerHTML = ""; (list.length ? list : [null]).forEach(function (i) { tagsEl.appendChild(i ? h("span", { text: i }) : h("span", { "class": "off", text: "no interests yet" })); }); }
    paintTags(pr.interests || []);
    var front = h("div", { "class": "mc-face mc-front" }, [
      h("div", { "class": "mc-top" }, [h("span", { "class": "logo-mark", "aria-hidden": "true" }), h("span", { text: "deutsch-klub" }), h("span", { "class": "mc-kind", text: "member" })]),
      avHost,
      nameEl,
      h("p", { "class": "mc-id", translate: "no", text: s.user.id }),
      h("div", { "class": "mc-grid" }, [
        h("div", null, [h("span", { text: "level" }), h("b", { text: p.level || "—" })]),
        h("div", null, [h("span", { text: "goal" }), goalEl]),
        h("div", null, [h("span", { text: "daily" }), minEl])]),
      tagsEl,
      h("div", { "class": "mc-foot" }, [h("span", { "class": "mc-bar", "aria-hidden": "true", text: barcode(s.user.id) }), h("span", { text: since ? "since " + since : "" })])]);
    var back = h("div", { "class": "mc-face mc-back", "aria-hidden": "true" }, [h("span", { "class": "logo-mark" }), h("p", { text: "learn · practice · experience · connect" })]);
    var card = h("div", { "class": "mcard", role: "img", "aria-label": "Member card of " + s.user.full_name + ", level " + (p.level || "not set") }, [front, back]);
    var scene = h("div", { "class": "mc-scene" + (opts.intro ? " intro" : "") + (opts.enter ? " enter" : "") }, [card]);
    tilt(card);
    scene.setAvatar = function (shape) { avHost.innerHTML = ""; avHost.appendChild(avatarPre(shape, 6)); };
    scene.update = function (f) {                                   // live preview while the member edits
      if (f.name !== undefined) nameEl.textContent = f.name || "—";
      if (f.goal !== undefined) goalEl.textContent = f.goal ? DKA.goalName(f.goal) : "—";
      if (f.minutes !== undefined) minEl.textContent = f.minutes ? f.minutes + " min" : "—";
      if (f.interests) paintTags(f.interests);
    };
    if (opts.href) {                                                // on the dashboard the card opens its own page
      card.setAttribute("role", "link"); card.setAttribute("tabindex", "0"); card.setAttribute("aria-label", "Open my member card");
      card.classList.add("is-link");
      card.addEventListener("click", function () { DKA.nav(opts.href); });
      card.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); DKA.nav(opts.href); } });
    }
    return scene;
  };

  // ---------- /app/card: the card large, with everything on it editable ----------
  var GOALS = ["goethe", "career", "interest"], INTERESTS = ["music", "film", "travel", "science", "sport", "food", "tech", "history", "art", "business"], MINUTES = [5, 10, 15, 20, 30, 45, 60];
  DKA.route(/^\/app\/card$/, function (root) {
    var s = DKA.state, pr = s.profile;
    var f = { name: s.user.full_name, avatar: pr.avatar || "ring", goal: pr.goal || "", interests: (pr.interests || []).slice(), minutes: pr.minutes || 0, exam: pr.exam_date || "" };
    var scene = DKA.memberCard(s, { enter: !reduce, avatar: f.avatar });
    var err = h("p", { "class": "err", role: "alert" });
    function chipRow(items, isOn, onPick, label) {
      var row = h("div", { "class": "a-chips" });
      function paint() { row.innerHTML = ""; items.forEach(function (it) { var v = it[0];
        row.appendChild(h("button", { type: "button", "class": "a-chip" + (isOn(v) ? " on" : ""), "aria-pressed": String(isOn(v)), text: it[1], onclick: function () { onPick(v); paint(); } })); }); }
      paint(); row.setAttribute("aria-label", label); return row;
    }
    var avatars = h("div", { "class": "av-opts" }, AVATARS.map(function (a) {
      var b = h("button", { type: "button", "class": "av-opt" + (a[0] === f.avatar ? " on" : ""), role: "radio", "aria-checked": String(a[0] === f.avatar), onclick: function () {
        f.avatar = a[0]; scene.setAvatar(f.avatar);
        Array.prototype.forEach.call(avatars.children, function (c) { var on = c === b; c.classList.toggle("on", on); c.setAttribute("aria-checked", String(on)); });
      } }, [avatarPre(a[0], 4), h("span", { text: a[1] })]);
      return b;
    }));
    avatars.setAttribute("role", "radiogroup"); avatars.setAttribute("aria-label", "Avatar");
    var nameIn = h("input", { type: "text", id: "mcName", value: f.name, maxlength: "120", autocomplete: "name" });
    var nameMsg = h("p", { "class": "field-msg", id: "mcNameMsg", "aria-live": "polite" });
    nameIn.setAttribute("aria-describedby", "mcNameMsg");
    function checkName(final) {                                     // same rules as the join form and the server (assets/validate.js)
      if (!window.DKValidate) return true;
      var r = DKValidate.name(nameIn.value);
      nameMsg.className = "field-msg" + (r.ok ? (final && r.changed ? " ok" : "") : " err");
      nameMsg.textContent = r.ok ? (final && r.changed ? "✓ Written as " + r.value : "") : r.error;
      if (r.ok) nameIn.removeAttribute("aria-invalid"); else nameIn.setAttribute("aria-invalid", "true");
      if (r.ok && final && r.changed) { nameIn.value = f.name = r.value; scene.update({ name: r.value }); }
      return r.ok;
    }
    var tName = 0;
    nameIn.addEventListener("input", function () { f.name = nameIn.value; scene.update({ name: f.name.trim() }); clearTimeout(tName); tName = setTimeout(function () { checkName(false); }, 500); });
    nameIn.addEventListener("blur", function () { checkName(true); });
    var examIn = h("input", { type: "date", id: "mcExam", value: f.exam, min: new Date().toISOString().slice(0, 10) });
    var examBox = h("div", { "class": "a-field" }, [h("label", { "for": "mcExam", text: "Goethe exam date (optional)" }), examIn]);
    function syncExam() { examBox.hidden = f.goal !== "goethe"; }
    var save = h("button", { type: "button", "class": "btn-solid", text: "Save card", onclick: function () {
      err.textContent = "";
      if (!checkName(true)) { nameIn.focus(); return; }
      if (!f.goal) { err.textContent = "Please choose a goal."; return; }
      if (!f.minutes) { err.textContent = "Please choose your minutes per day."; return; }
      save.disabled = true;
      var jobs = [];
      if (f.name.trim() !== s.user.full_name) jobs.push(DK.api("/api/app?a=name", { name: f.name }));
      if (f.avatar !== (pr.avatar || "")) jobs.push(DK.api("/api/app?a=avatar", { avatar: f.avatar }));
      jobs.push(DK.api("/api/app?a=onboarding", { goal: f.goal, interests: f.interests, minutes: f.minutes, exam_date: f.goal === "goethe" ? examIn.value : "" }));
      Promise.all(jobs).then(function (rs) {
        var bad = rs.filter(function (r) { return r.status !== 200 || !r.j.ok; })[0];
        if (bad) { err.textContent = (bad.j && bad.j.error) || "Could not save — try again."; save.disabled = false; return; }
        return DKA.refresh().then(function () { save.disabled = false; DK.toast("Card saved"); s = DKA.state; pr = s.profile; });
      }).catch(function () { err.textContent = "No connection — try again."; save.disabled = false; });
    } });
    root.appendChild(h("div", { "class": "a-wrap mc-page" }, [
      h("div", { "class": "mc-page-card" }, [scene, h("p", { "class": "a-muted a-small", text: "Tilt it with your pointer — the avatar is rendered live." })]),
      h("div", { "class": "mc-page-form" }, [
        h("p", { "class": "eyebrow" }, [h("span", { "class": "mark mark-circle", "aria-hidden": "true" }), "Member card"]),
        h("h1", { "class": "a-h1", text: "Your card" }),
        h("h2", { "class": "a-h3", text: "Avatar" }), avatars,
        h("div", { "class": "a-field" }, [h("label", { "for": "mcName", text: "Name" }), nameIn, nameMsg]),
        h("h2", { "class": "a-h3", text: "Goal" }),
        chipRow(GOALS.map(function (g) { return [g, DKA.goalName(g)]; }), function (v) { return f.goal === v; }, function (v) { f.goal = v; syncExam(); scene.update({ goal: v }); }, "Goal"),
        examBox,
        h("h2", { "class": "a-h3", text: "Interests (up to 8)" }),
        chipRow(INTERESTS.map(function (i) { return [i, i]; }), function (v) { return f.interests.indexOf(v) > -1; },
          function (v) { var k = f.interests.indexOf(v); if (k > -1) f.interests.splice(k, 1); else if (f.interests.length < 8) f.interests.push(v); scene.update({ interests: f.interests }); }, "Interests"),
        h("h2", { "class": "a-h3", text: "Minutes per day" }),
        chipRow(MINUTES.map(function (m) { return [m, m + " min"]; }), function (v) { return f.minutes === v; }, function (v) { f.minutes = v; scene.update({ minutes: v }); }, "Minutes per day"),
        err,
        h("div", { "class": "mc-actions" }, [save, DKA.link("/app/account", "Details →", "btn-ghost")])])]));
    syncExam();
  });

  // ---------- reveal + avatar picker (a dialog) ----------
  DKA.cardReveal = function (opts) {
    opts = opts || {};
    var s = DKA.state, chosen = s.profile.avatar || "ring";
    var d = document.createElement("dialog"); d.className = "dk-dialog mc-dialog";
    var scene = DKA.memberCard(s, { intro: !opts.picker && !reduce, avatar: chosen });
    var err = h("p", { "class": "err", role: "alert" });
    var opts3 = h("div", { "class": "av-opts", role: "radiogroup", "aria-label": "Choose your avatar" }, AVATARS.map(function (a) {
      var b = h("button", { type: "button", "class": "av-opt" + (a[0] === chosen ? " on" : ""), role: "radio", "aria-checked": String(a[0] === chosen), onclick: function () {
        chosen = a[0]; scene.setAvatar(chosen);
        Array.prototype.forEach.call(opts3.children, function (c) { var on = c === b; c.classList.toggle("on", on); c.setAttribute("aria-checked", String(on)); });
      } }, [avatarPre(a[0], 4), h("span", { text: a[1] })]);
      return b;
    }));
    var save = h("button", { type: "button", "class": "btn-solid", text: opts.picker ? "Save avatar" : "Save and open my dashboard", onclick: function () {
      save.disabled = true; err.textContent = "";
      DK.api("/api/app?a=avatar", { avatar: chosen }).then(function (r) {
        if (r.status === 200 && r.j.ok) { s.profile = r.j.profile; close(); if (opts.onDone) opts.onDone(); return; }
        err.textContent = (r.j && r.j.error) || "Could not save — try again."; save.disabled = false;
      }).catch(function () { err.textContent = "No connection — try again."; save.disabled = false; });
    } });
    function close() { try { sessionStorage.setItem("dk_card_later", "1"); } catch (e) {} d.close(); d.remove(); }
    d.appendChild(h("div", { "class": "mc-dialog-in" }, [
      h("button", { type: "button", "class": "x", "aria-label": "Close", text: "×", onclick: close }),
      h("p", { "class": "eyebrow" }, [h("span", { "class": "mark mark-circle", "aria-hidden": "true" }), opts.picker ? "Avatar" : "Profile complete"]),
      h("h2", { text: opts.picker ? "Choose your avatar" : "Your member card is ready" }),
      scene,
      h("p", { "class": "sub", text: "Pick an avatar — each one is rendered live, like the landmarks." }),
      opts3, err, save]));
    document.body.appendChild(d); d.showModal();
  };
})();
