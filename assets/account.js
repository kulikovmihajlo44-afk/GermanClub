// Deutsch-Klub accounts — shared by the landing page and the portal. No dependencies.
(function () {
  "use strict";
  var DK = (window.DK = window.DK || {});
  var USER_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="12" cy="8.2" r="4"/><path d="M4.2 20.2c.9-4 4-6 7.8-6s6.9 2 7.8 6" stroke-linecap="round"/></svg>';

  // "this device is logged in" hint: lets the landing page jump straight to the portal before it paints.
  // The real login is the secure cookie; the portal always re-checks it with the server.
  DK.hint = {
    get: function () { try { return localStorage.getItem("dk_in") === "1"; } catch (e) { return false; } },
    set: function (on) { try { on ? localStorage.setItem("dk_in", "1") : localStorage.removeItem("dk_in"); } catch (e) {} }
  };

  DK.api = function (path, body) {
    var opts = { method: body === undefined ? "GET" : "POST", credentials: "same-origin", headers: {} };
    if (body !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    return fetch(path, opts).then(function (r) {
      return r.json().catch(function () { return { ok: false }; }).then(function (j) { return { status: r.status, j: j }; });
    });
  };

  // where to go after logging in: ?next=/app/... (only our own app/test pages), otherwise the dashboard
  DK.nextUrl = function () {
    var m = /[?&]next=([^&#]+)/.exec(location.search), n = m ? decodeURIComponent(m[1]) : "";
    return /^\/(app|test)(\/|\?|$)/.test(n) && n.indexOf("//") === -1 ? n : "/app";
  };

  DK.fmtId = function (digits) { return String(digits).replace(/\D/g, "").slice(0, 12).replace(/(\d{4})(?=\d)/g, "$1 "); };

  DK.copy = function (text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  };
  function legacyCopy(text) {
    try {
      var t = document.createElement("textarea");
      t.value = text; t.setAttribute("readonly", ""); t.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
      document.body.appendChild(t); t.select(); t.setSelectionRange(0, 99999);
      var ok = document.execCommand("copy"); document.body.removeChild(t); return ok;
    } catch (e) { return false; }
  }

  var toastTimer;
  DK.toast = function (msg) {
    var t = document.querySelector(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite"); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("show"); }, 3200);
  };

  // ---------- log in dialog ----------
  var dlg;
  DK.openLogin = function () {
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.className = "dk-dialog"; dlg.setAttribute("aria-labelledby", "dkLoginTitle");
      dlg.innerHTML =
        '<button type="button" class="x" aria-label="Close">&times;</button>' +
        '<p class="eyebrow"><span class="mark mark-circle" aria-hidden="true"></span>Welcome back</p>' +
        '<h2 id="dkLoginTitle">Log in</h2>' +
        '<p class="sub">Enter your 12-digit ID. It works on your phone and on your laptop.</p>' +
        '<form novalidate>' +
        '<label class="sr" for="dkId" style="position:absolute;left:-9999px">Your 12-digit ID</label>' +
        '<input class="id-input" id="dkId" inputmode="numeric" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="14" placeholder="0000 0000 0000">' +
        '<button class="btn-solid" type="submit" disabled>Log in</button>' +
        '<p class="err" role="alert"></p>' +
        '</form>' +
        '<div class="oauth-login" hidden><p class="or">or</p>' +
        '<a class="btn-oauth" data-p="google" href="#" hidden><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg><span>Log in with Google</span></a>' +
        '<a class="btn-oauth" data-p="microsoft" href="#" hidden><svg viewBox="0 0 23 23" aria-hidden="true"><path fill="#F35325" d="M1 1h10v10H1z"/><path fill="#81BC06" d="M12 1h10v10H12z"/><path fill="#05A6F0" d="M1 12h10v10H1z"/><path fill="#FFBA08" d="M12 12h10v10H12z"/></svg><span>Log in with Microsoft</span></a></div>' +
        '<p class="alt">New here? <button type="button" data-go="signup">Sign up</button><br>Lost your ID? <a href="mailto:MKULKOV@constructor.university?subject=Lost%20my%20Deutsch-Klub%20ID">Contact the club</a></p>';
      document.body.appendChild(dlg);
      var input = dlg.querySelector("#dkId"), btn = dlg.querySelector(".btn-solid"), err = dlg.querySelector(".err"), form = dlg.querySelector("form");
      dlg.querySelector(".x").addEventListener("click", function () { dlg.close(); });
      dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
      dlg.querySelector('[data-go="signup"]').addEventListener("click", function () { dlg.close(); DK.goSignup(); });
      // members whose e-mail is confirmed by Google / Microsoft can also log in that way (api/auth.js)
      fetch("/api/auth?a=providers").then(function (r) { return r.json(); }).then(function (p) {
        if (!p || !(p.google || p.microsoft)) return;
        dlg.querySelector(".oauth-login").hidden = false;
        Array.prototype.forEach.call(dlg.querySelectorAll(".oauth-login .btn-oauth"), function (b) {
          var pr = b.getAttribute("data-p"); if (!p[pr]) return; b.hidden = false;
          b.href = "/api/auth?a=start&p=" + pr + "&intent=login&next=" + encodeURIComponent(DK.nextUrl());
        });
      }).catch(function () {});
      input.addEventListener("input", function () {
        input.value = DK.fmtId(input.value);
        btn.disabled = input.value.replace(/\D/g, "").length !== 12; err.textContent = ""; input.removeAttribute("aria-invalid");
      });
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var digits = input.value.replace(/\D/g, "");
        if (digits.length !== 12) return;
        btn.disabled = true; btn.textContent = "Checking…"; err.textContent = "";
        DK.api("/api/login", { id: digits }).then(function (res) {
          if (res.status === 200 && res.j.ok) { DK.hint.set(true); location.href = DK.nextUrl(); return; }
          err.textContent = res.status === 503 ? "Accounts are being set up — please try again soon." : (res.j.error || "Something went wrong, please try again.");
          input.setAttribute("aria-invalid", "true");
          btn.textContent = "Log in"; btn.disabled = input.value.replace(/\D/g, "").length !== 12;
        }).catch(function () {
          err.textContent = "No connection — please try again."; btn.textContent = "Log in"; btn.disabled = false;
        });
      });
    }
    if (!dlg.open) dlg.showModal();
    setTimeout(function () { dlg.querySelector("#dkId").focus(); }, 30);
  };

  // ---------- sign up = go to the application form ----------
  DK.goSignup = function () {
    var f = document.getElementById("contact");
    if (!f) { location.href = "/?home=1#contact"; return; }
    f.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(function () { var n = document.getElementById("fullname"); if (n) n.focus({ preventScroll: true }); }, 600);
  };

  // ---------- the icon menu in the corner ----------
  // items: [{label, onClick, danger}]   header: optional small text (e.g. the user's name)
  DK.mountMenu = function (host, items, header) {
    host.innerHTML = '<button type="button" class="acct-btn" aria-haspopup="menu" aria-expanded="false" aria-label="Account">' + USER_SVG + '</button><div class="acct-menu" role="menu"></div>';
    var btn = host.querySelector(".acct-btn"), menu = host.querySelector(".acct-menu");
    if (header) { var h = document.createElement("div"); h.className = "who"; h.textContent = header; menu.appendChild(h); }
    items.forEach(function (it) {
      var b = document.createElement("button"); b.type = "button"; b.className = "item" + (it.danger ? " danger" : ""); b.setAttribute("role", "menuitem");
      b.textContent = it.label; b.addEventListener("click", function () { close(); it.onClick(); }); menu.appendChild(b);
    });
    function close() { menu.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); }
    btn.addEventListener("click", function (e) {
      e.stopPropagation(); var open = !menu.classList.contains("open");
      menu.classList.toggle("open", open); btn.setAttribute("aria-expanded", String(open));
      if (open) menu.querySelector(".item").focus();
    });
    document.addEventListener("click", function (e) { if (!host.contains(e.target)) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { close(); } });
  };

  DK.logout = function () {
    return DK.api("/api/logout", {}).then(function () { DK.hint.set(false); location.href = "/"; });
  };
})();
