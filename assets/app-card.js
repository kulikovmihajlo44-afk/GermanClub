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
    var front = h("div", { "class": "mc-face mc-front" }, [
      h("div", { "class": "mc-top" }, [h("span", { "class": "logo-mark", "aria-hidden": "true" }), h("span", { text: "deutsch-klub" }), h("span", { "class": "mc-kind", text: "member" })]),
      avHost,
      h("p", { "class": "mc-name", text: s.user.full_name }),
      h("p", { "class": "mc-id", translate: "no", text: s.user.id }),
      h("div", { "class": "mc-grid" }, [
        h("div", null, [h("span", { text: "level" }), h("b", { text: p.level || "—" })]),
        h("div", null, [h("span", { text: "goal" }), h("b", { text: pr.goal ? DKA.goalName(pr.goal) : "—" })]),
        h("div", null, [h("span", { text: "daily" }), h("b", { text: pr.minutes ? pr.minutes + " min" : "—" })])]),
      h("div", { "class": "mc-tags" }, (pr.interests || []).length ? pr.interests.map(function (i) { return h("span", { text: i }); }) : [h("span", { "class": "off", text: "no interests yet" })]),
      h("div", { "class": "mc-foot" }, [h("span", { "class": "mc-bar", "aria-hidden": "true", text: barcode(s.user.id) }), h("span", { text: since ? "since " + since : "" })])]);
    var back = h("div", { "class": "mc-face mc-back", "aria-hidden": "true" }, [h("span", { "class": "logo-mark" }), h("p", { text: "learn · practice · experience · connect" })]);
    var card = h("div", { "class": "mcard", role: "img", "aria-label": "Member card of " + s.user.full_name + ", level " + (p.level || "not set") }, [front, back]);
    var scene = h("div", { "class": "mc-scene" + (opts.intro ? " intro" : "") }, [card]);
    tilt(card);
    scene.setAvatar = function (shape) { avHost.innerHTML = ""; avHost.appendChild(avatarPre(shape, 6)); };
    return scene;
  };

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
