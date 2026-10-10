// Deutsch-Klub member app — core: router, guard, dashboard, onboarding, club, account. No dependencies.
(function () {
  "use strict";
  var DKA = (window.DKA = { routes: [], state: null, club: null });
  var LEVELS = { A0: "Beginner", A1: "A1", A2: "A2", B1: "B1", B2: "B2", C1: "C1" };
  var GOALS = { goethe: "Goethe exam", career: "Career", interest: "Personal interest" };
  var SKILLS = { grammar: "Grammar", vocab: "Vocabulary", reading: "Reading" };
  var INTERESTS = ["music", "film", "travel", "science", "sport", "food", "tech", "history", "art", "business"];
  var MINUTES = [5, 10, 15, 20, 30, 45, 60];

  // ---------- tiny DOM helper (text only, never innerHTML for data) ----------
  function h(tag, a, kids) {
    var e = document.createElement(tag);
    if (a) Object.keys(a).forEach(function (k) {
      var v = a[k];
      if (k === "class") e.className = v; else if (k === "text") e.textContent = v;
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v);
    });
    (function add(list) {
      (list || []).forEach(function (c) {
        if (c == null || c === false) return;
        if (Array.isArray(c)) return add(c);
        e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      });
    })(kids);
    return e;
  }
  DKA.h = h;
  DKA.link = function (href, text, cls) { return h("a", { href: href, "data-link": "", "class": cls || "" , text: text }); };
  DKA.json = function (u) { return fetch(u, { credentials: "same-origin" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); };
  DKA.route = function (re, fn) { DKA.routes.push({ re: re, fn: fn }); };
  DKA.levelName = function (l) { return LEVELS[l] || l; };
  DKA.goalName = function (g) { return GOALS[g] || g; };
  DKA.skillName = function (s) { return SKILLS[s] || s; };

  DKA.fail = function (root, retry, msg) {
    root.innerHTML = "";
    root.appendChild(h("div", { "class": "a-wrap" }, [h("div", { "class": "a-card a-empty" }, [
      h("p", { text: msg || "Something went wrong while loading this page." }),
      h("button", { "class": "btn-line", type: "button", text: "Try again", onclick: retry })])]));
  };
  DKA.refresh = function () {
    return DK.api("/api/app?a=state").then(function (res) { if (res.status === 200 && res.j.ok) DKA.state = res.j; return DKA.state; });
  };
  DKA.nav = function (href, replace) {
    history[replace ? "replaceState" : "pushState"](null, "", href); render(); window.scrollTo(0, 0);
  };

  // ---------- club dates (from content/club.json; Berlin time) ----------
  DKA.loadClub = function () { return DKA.club ? Promise.resolve(DKA.club) : DKA.json("/content/club.json").then(function (c) { DKA.club = c; return c; }); };
  function berlinNow() {
    var o = {}; new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false })
      .formatToParts(new Date()).forEach(function (x) { o[x.type] = x.value; });
    return { date: o.year + "-" + o.month + "-" + o.day, hour: parseInt(o.hour, 10) % 24 };
  }
  DKA.upcoming = function (club, n) {
    var out = [], d = new Date(club.first + "T12:00:00Z"), end = new Date(club.last + "T12:00:00Z"), b = berlinNow(), endH = parseInt(club.end, 10);
    while (d <= end) { var s = d.toISOString().slice(0, 10); if (s > b.date || (s === b.date && b.hour < endH)) out.push(s); d = new Date(d.getTime() + 7 * 864e5); }
    return out.slice(0, n);
  };
  DKA.fmtDate = function (s) { return new Date(s + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }); };
  DKA.daysUntil = function (s) { return Math.round((new Date(s + "T12:00:00Z") - new Date(berlinNow().date + "T12:00:00Z")) / 864e5); };

  // ---------- router ----------
  function render() {
    var path = location.pathname.replace(/\/+$/, "") || "/app";
    var view = document.getElementById("view");
    for (var i = 0; i < DKA.routes.length; i++) {
      var m = DKA.routes[i].re.exec(path);
      if (m) {
        var root = h("div", { "class": "a-route" });
        view.innerHTML = ""; view.appendChild(root);
        markActive(path);
        try { Promise.resolve(DKA.routes[i].fn(root, m)).catch(function () { DKA.fail(root, render); }); } catch (e) { DKA.fail(root, render); }
        return;
      }
    }
    view.innerHTML = "";
    view.appendChild(h("div", { "class": "a-wrap" }, [h("div", { "class": "a-card a-empty" }, [h("h1", { "class": "a-h1", text: "Page not found" }),
      h("p", { "class": "a-muted", text: "This page does not exist (yet)." }), DKA.link("/app", "Back to my dashboard", "btn-solid")])]));
  }
  function markActive(path) {
    document.title = "Deutsch-Klub — " + (path.indexOf("/learn") > -1 ? "Learn" : path.indexOf("/cards") > -1 ? "Cards" : path.indexOf("/club") > -1 ? "Club" : path.indexOf("/account") > -1 ? "Account" : "My app");
    DK.renderHeaderActive && DK.renderHeaderActive(path);
    var all = document.querySelectorAll("#top .nav-link, #tabbar .tab[href]");
    for (var i = 0; i < all.length; i++) {
      var hr = all[i].getAttribute("href"), on = hr === "/app" ? (path === "/app" || path.indexOf("/app/onboarding") === 0) : (path === hr || path.indexOf(hr + "/") === 0);
      all[i].classList.toggle("on", on); if (on) all[i].setAttribute("aria-current", "page"); else all[i].removeAttribute("aria-current");
    }
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[data-link]");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault(); DKA.nav(a.getAttribute("href"));
  });
  window.addEventListener("popstate", render);

  // ---------- boot + route guard ----------
  DKA.boot = function () {
    var top = document.getElementById("top"), view = document.getElementById("view");
    DK.renderHeader(top, "member");
    DK.api("/api/app?a=state").then(function (res) {
      if (res.status === 401) { DK.hint.set(false); location.replace("/login?next=" + encodeURIComponent(location.pathname + location.search)); return; }
      if (res.status === 503) { view.innerHTML = ""; view.appendChild(h("div", { "class": "a-wrap" }, [h("div", { "class": "a-card a-empty" }, [h("p", { text: "Accounts are being set up — please try again in a few minutes." })])])); return; }
      if (res.status !== 200 || !res.j.ok) throw new Error("state");
      DKA.state = res.j; DK.hint.set(true);
      start();
    }).catch(function () {
      view.innerHTML = ""; view.appendChild(h("div", { "class": "a-wrap" }, [h("div", { "class": "a-card a-empty" }, [
        h("p", { text: "No connection. Your progress is safe — check your internet and try again." }),
        h("button", { "class": "btn-line", type: "button", text: "Try again", onclick: function () { location.reload(); } })])]));
    });
  };
  function start() {
    var s = DKA.state;
    DK.mountMenu(document.getElementById("acct"), [
      { label: "Account", onClick: function () { DKA.nav("/app/account"); } },
      { label: "Log out", danger: true, onClick: function () { DK.logout(); } }], s.user.full_name);
    DK.renderTabbar(document.getElementById("tabbar"), location.pathname, function () { DK.logout(); });
    var go = function () {
      var p = new URLSearchParams(location.search);
      render();
      if (p.get("welcome") === "1") { history.replaceState(null, "", location.pathname); welcome(); }
    };
    // a test taken as a guest before signing up: attach it to the new account
    var guest = null; try { guest = JSON.parse(localStorage.getItem("dk_guest_answers") || "null"); } catch (e) {}
    if (guest && !s.placement) {
      DK.api("/api/app?a=test.submit", { answers: guest }).then(function () { try { localStorage.removeItem("dk_guest_answers"); } catch (e) {} return DKA.refresh(); }).then(go, go);
    } else go();
  }

  // ---------- "your ID is ready" (right after sign-up) ----------
  function welcome() {
    var s = DKA.state, d = document.createElement("dialog"); d.className = "dk-dialog";
    var idEl = h("div", { "class": "idbig", translate: "no", text: s.user.id });
    var copy = h("button", { type: "button", "class": "btn-solid", text: "Copy my ID", onclick: function () {
      DK.copy(s.user.id.replace(/\s/g, "")).then(function (ok) { copy.textContent = ok ? "Copied ✓  Now save it somewhere safe" : "Select the number above and copy it"; }); } });
    d.appendChild(h("div", null, [
      h("p", { "class": "eyebrow" }, [h("span", { "class": "mark mark-circle", "aria-hidden": "true" }), "Account created"]),
      h("h2", { text: "Your ID is ready" }),
      h("p", { "class": "sub", text: "Copy it now and keep it safe. You will type this number to log in on any phone or laptop." }),
      idEl, copy,
      h("button", { type: "button", "class": "btn-line", style: "width:100%;margin-top:0.8rem", text: s.placement ? "Continue to my dashboard" : "Continue: take the placement test", onclick: function () { d.close(); if (!s.placement) DKA.nav("/test"); else DKA.nav("/app"); } }),
      h("p", { "class": "alt", text: "You can always find it again under Account after you log in." })]));
    document.body.appendChild(d); d.showModal();
  }

  // ---------- dashboard ----------
  DKA.route(/^\/app$/, function (root) {
    var s = DKA.state;
    if (!s.placement) {                                           // no test yet: ONE call to action
      root.appendChild(h("div", { "class": "a-wrap a-narrow" }, [h("div", { "class": "a-card a-hero" }, [
        h("p", { "class": "eyebrow" }, [h("span", { "class": "mark mark-circle", "aria-hidden": "true" }), "Welcome"]),
        h("h1", { "class": "a-h1", text: "Hello, " + s.user.full_name }),
        h("p", { "class": "a-muted", text: "Start with a short placement test. It takes about 5 minutes and shows us where to begin." }),
        DKA.link("/test", "Take the placement test", "btn-solid")])]));
      return;
    }
    if (!s.profile.onboarded) { DKA.nav("/app/onboarding", true); return; }
    return DKA.loadClub().then(function () { return DKA.json("/content/lessons.json"); }).then(function (lessons) {
      var done = {}; s.lessons.forEach(function (l) { done[l.topic] = l; });
      var nextLesson = lessons.filter(function (l) { return !done[l.id]; })[0];
      var ev = DKA.upcoming(DKA.club, 1)[0], today = [];
      if (s.cards.due > 0) today.push({ t: "Review " + s.cards.due + " card" + (s.cards.due === 1 ? "" : "s"), sub: "Spaced repetition: the cards that are due now", href: "/app/cards/review", cta: "Start" });
      if (nextLesson) today.push({ t: "Lesson: " + nextLesson.title, sub: nextLesson.level + " · about " + nextLesson.minutes + " min · grammar", href: "/app/learn/grammar/" + nextLesson.id, cta: "Open" });
      if (s.cards.total === 0) today.push({ t: "Add your first card deck", sub: "A1 starter — 30 core words", href: "/app/cards", cta: "Choose" });
      if (ev && DKA.daysUntil(ev) <= 7) today.push({ t: "Club: " + DKA.fmtDate(ev), sub: DKA.club.start + "–" + DKA.club.end + " · " + DKA.club.venue, href: "/app/club", cta: "Details" });
      today = today.slice(0, 3);
      var p = s.placement, pr = s.profile;
      var facts = [h("span", { "class": "a-badge", text: "Level " + p.level })];
      if (pr.goal) facts.push(h("span", { "class": "a-badge", text: DKA.goalName(pr.goal) }));
      if (pr.minutes) facts.push(h("span", { "class": "a-badge", text: pr.minutes + " min / day" }));
      if (pr.exam_date && DKA.daysUntil(pr.exam_date) >= 0) facts.push(h("span", { "class": "a-badge", text: "Exam in " + DKA.daysUntil(pr.exam_date) + " days" }));
      root.appendChild(h("div", { "class": "a-wrap" }, [
        h("p", { "class": "eyebrow" }, [h("span", { "class": "mark mark-circle", "aria-hidden": "true" }), "Dashboard"]),
        h("h1", { "class": "a-h1", text: "Welcome, " + s.user.full_name }),
        h("div", { "class": "a-badges" }, facts),
        h("p", { "class": "a-muted a-small", text: "Placement result: " + Object.keys(p.skills).map(function (k) { return DKA.skillName(k) + " " + p.skills[k]; }).join(" · ") + " (indicative, not an official certificate)." }),
        h("h2", { "class": "a-h2", text: "Today" }),
        today.length ? h("div", { "class": "a-today" }, today.map(function (it) {
          return h("a", { "class": "a-item", href: it.href, "data-link": "" }, [h("div", null, [h("strong", { text: it.t }), h("span", { text: it.sub })]), h("em", { text: it.cta + " →" })]);
        })) : h("div", { "class": "a-card" }, [h("p", { "class": "a-muted", text: "Nothing is due. You have finished every available lesson; new ones are on the way. Come back tomorrow for your cards." })]),
        ev ? h("div", { "class": "a-card a-next" }, [h("p", { "class": "eyebrow", text: "Next club session" }), h("p", { "class": "a-big", text: DKA.fmtDate(ev) }),
          h("p", { "class": "a-muted", text: DKA.club.start + "–" + DKA.club.end + " · " + DKA.club.venue }), DKA.link("/app/club", "Club details", "btn-line")]) : null]));
    });
  });

  // ---------- onboarding ----------
  DKA.route(/^\/app\/onboarding$/, function (root) {
    var s = DKA.state, pr = s.profile, q = new URLSearchParams(location.search);
    var stored = ""; try { stored = localStorage.getItem("dk_goal") || ""; } catch (e) {}
    var goal = pr.goal || (GOALS[q.get("goal")] ? q.get("goal") : (GOALS[stored] ? stored : ""));
    var picked = (pr.interests || []).slice(), minutes = pr.minutes || 0;
    var err = h("p", { "class": "err", role: "alert" });
    var examBox = h("div", { "class": "a-field" });
    function goalCards() {
      return Object.keys(GOALS).map(function (g) {
        var b = h("button", { type: "button", "class": "a-choice" + (goal === g ? " on" : ""), "aria-pressed": String(goal === g), onclick: function () { goal = g; paint(); } }, [
          h("strong", { text: GOALS[g] }), h("span", { text: g === "goethe" ? "Prepare for a Goethe-Zertifikat exam" : g === "career" ? "German for study, work and life in Germany" : "Because you enjoy the language" })]);
        return b;
      });
    }
    var goalHost = h("div", { "class": "a-choices" }), intHost = h("div", { "class": "a-chips" }), minHost = h("div", { "class": "a-chips" });
    var exam = h("input", { type: "date", id: "exam", value: pr.exam_date || "", min: new Date().toISOString().slice(0, 10) });
    function paint() {
      goalHost.innerHTML = ""; goalCards().forEach(function (c) { goalHost.appendChild(c); });
      intHost.innerHTML = ""; INTERESTS.forEach(function (i) { intHost.appendChild(h("button", { type: "button", "class": "a-chip" + (picked.indexOf(i) > -1 ? " on" : ""), "aria-pressed": String(picked.indexOf(i) > -1), text: i,
        onclick: function () { var k = picked.indexOf(i); if (k > -1) picked.splice(k, 1); else if (picked.length < 8) picked.push(i); paint(); } })); });
      minHost.innerHTML = ""; MINUTES.forEach(function (m) { minHost.appendChild(h("button", { type: "button", "class": "a-chip" + (minutes === m ? " on" : ""), "aria-pressed": String(minutes === m), text: m + " min", onclick: function () { minutes = m; paint(); } })); });
      examBox.hidden = goal !== "goethe";
    }
    examBox.appendChild(h("label", { "for": "exam", text: "Exam date (optional)" })); examBox.appendChild(exam);
    var save = h("button", { type: "button", "class": "btn-solid", text: pr.onboarded ? "Save" : "Continue to my dashboard", onclick: function () {
      err.textContent = "";
      if (!goal) { err.textContent = "Please choose a goal."; return; }
      if (!minutes) { err.textContent = "Please choose how many minutes per day."; return; }
      save.disabled = true;
      DK.api("/api/app?a=onboarding", { goal: goal, interests: picked, minutes: minutes, exam_date: goal === "goethe" ? exam.value : "" }).then(function (res) {
        if (res.status === 200 && res.j.ok) { try { localStorage.setItem("dk_goal", goal); } catch (e) {} return DKA.refresh().then(function () { DKA.nav("/app"); }); }
        err.textContent = res.j.error || "Something went wrong, please try again."; save.disabled = false;
      }).catch(function () { err.textContent = "No connection — please try again."; save.disabled = false; });
    } });
    root.appendChild(h("div", { "class": "a-wrap a-narrow" }, [
      h("p", { "class": "eyebrow" }, [h("span", { "class": "mark mark-circle", "aria-hidden": "true" }), pr.onboarded ? "Your plan" : "Last step"]),
      h("h1", { "class": "a-h1", text: pr.onboarded ? "Change your plan" : "Tell us what you need" }),
      s.placement ? h("p", { "class": "a-muted", text: "Your placement level: " + s.placement.level + ". Three quick questions so that “Today” fits your life." }) : null,
      h("h2", { "class": "a-h3", text: "1 · Your goal" }), goalHost, examBox,
      h("h2", { "class": "a-h3", text: "2 · Your interests (up to 8)" }), intHost,
      h("h2", { "class": "a-h3", text: "3 · Minutes per day" }), minHost, err, save]));
    paint();
  });

  // ---------- club ----------
  DKA.route(/^\/app\/club$/, function (root) {
    return DKA.loadClub().then(function (c) {
      var list = DKA.upcoming(c, 9);
      root.appendChild(h("div", { "class": "a-wrap" }, [
        h("p", { "class": "eyebrow" }, [h("span", { "class": "mark mark-circle", "aria-hidden": "true" }), "Club"]),
        h("h1", { "class": "a-h1", text: "Every Sunday, " + c.start + "–" + c.end }),
        h("p", { "class": "a-muted", text: c.venue + " · from " + DKA.fmtDate(c.first) + " until " + DKA.fmtDate(c.last) + "." }),
        h("h2", { "class": "a-h2", text: "Upcoming sessions" }),
        list.length ? h("ul", { "class": "a-dates" }, list.map(function (d, i) { return h("li", { "class": i === 0 ? "first" : "" }, [h("strong", { text: DKA.fmtDate(d) }), h("span", { text: c.start + "–" + c.end })]); }))
          : h("div", { "class": "a-card" }, [h("p", { "class": "a-muted", text: "This season has ended. The next dates will be announced here and in the channels below." })]),
        h("h2", { "class": "a-h2", text: "Stay informed" }),
        h("div", { "class": "a-grid2" }, [
          h("a", { "class": "a-card a-qr", href: c.telegram, target: "_blank", rel: "noopener" }, [h("img", { src: "/assets/qr-telegram.svg", alt: "QR code for the Telegram channel", width: "132", height: "132" }), h("div", null, [h("strong", { text: "Telegram" }), h("span", { text: "Main information about the club" })])]),
          h("a", { "class": "a-card a-qr", href: c.whatsapp, target: "_blank", rel: "noopener" }, [h("img", { src: "/assets/qr-whatsapp.svg", alt: "QR code for the WhatsApp channel", width: "132", height: "132" }), h("div", null, [h("strong", { text: "WhatsApp" }), h("span", { text: "Main information about the club" })])])]),
        h("p", { "class": "a-muted a-small" }, ["Questions? ", h("a", { href: "mailto:" + c.contact, text: c.contact })])]));
    });
  });

  // ---------- account ----------
  DKA.route(/^\/app\/account$/, function (root) {
    var s = DKA.state;
    return DK.api("/api/app?a=history").then(function (res) {
      if (res.status !== 200 || !res.j.ok) throw new Error("history");
      var hist = res.j, u = s.user, msg = h("p", { "class": "a-muted a-small", role: "status" });
      function setting(label, key, desc) {
        var cb = h("input", { type: "checkbox", id: "s_" + key }); cb.checked = !!u[key];
        cb.addEventListener("change", function () { var b = {}; b[key] = cb.checked; DK.api("/api/settings", b).then(function (r) { if (r.status === 200) { u[key] = cb.checked; DK.toast("Saved"); } else { cb.checked = !cb.checked; DK.toast("Could not save"); } }); });
        return h("label", { "class": "a-toggle", "for": "s_" + key }, [cb, h("span", null, [h("strong", { text: label }), h("em", { text: desc })])]);
      }
      var idCopy = h("button", { type: "button", "class": "copy-btn", "aria-label": "Copy my ID", text: "Copy", onclick: function () { DK.copy(u.id.replace(/\s/g, "")).then(function (ok) { DK.toast(ok ? "ID copied" : "Select the number and copy it"); }); } });
      var del = h("div", { "class": "a-danger" });
      var confirmBox = h("input", { type: "text", placeholder: "Type DELETE", autocomplete: "off", "aria-label": "Type DELETE to confirm" });
      var delBtn = h("button", { type: "button", "class": "btn-line danger", text: "Delete my account and all my data", disabled: true, onclick: function () {
        DK.api("/api/settings", { "delete": true }).then(function (r) { if (r.status === 200) { DK.hint.set(false); location.href = "/"; } else DK.toast("Could not delete — try again"); }); } });
      confirmBox.addEventListener("input", function () { delBtn.disabled = confirmBox.value.trim() !== "DELETE"; });
      del.appendChild(h("p", { "class": "a-muted a-small", text: "This removes your account, test results, lesson progress, cards and review history for good. It cannot be undone." }));
      del.appendChild(confirmBox); del.appendChild(delBtn);
      var pr = s.profile;
      root.appendChild(h("div", { "class": "a-wrap a-narrow" }, [
        h("p", { "class": "eyebrow" }, [h("span", { "class": "mark mark-circle", "aria-hidden": "true" }), "Account"]),
        h("h1", { "class": "a-h1", text: u.full_name }),
        h("div", { "class": "a-card" }, [h("p", { "class": "a-label", text: "Your ID — your login on any device" }), h("div", { "class": "a-id" }, [h("span", { translate: "no", text: u.id }), idCopy])]),
        h("h2", { "class": "a-h2", text: "My plan" }),
        h("div", { "class": "a-card" }, [
          h("p", null, [h("strong", { text: "Goal: " }), pr.goal ? DKA.goalName(pr.goal) : "not set"]),
          h("p", null, [h("strong", { text: "Interests: " }), (pr.interests || []).length ? pr.interests.join(", ") : "none chosen"]),
          h("p", null, [h("strong", { text: "Minutes per day: " }), pr.minutes ? String(pr.minutes) : "not set"]),
          pr.exam_date ? h("p", null, [h("strong", { text: "Exam date: " }), pr.exam_date]) : null,
          DKA.link("/app/onboarding", "Change my plan", "btn-line")]),
        h("h2", { "class": "a-h2", text: "Settings" }),
        h("div", { "class": "a-card" }, [setting("Club notifications", "want_notify", "Events and important information about the club"), setting("Placement-test reminders", "want_test", "Remind me to retake the placement test")]),
        h("h2", { "class": "a-h2", text: "My data" }),
        h("div", { "class": "a-card" }, [
          h("p", { "class": "a-muted a-small", text: "Everything we store about you is listed here." }),
          h("ul", { "class": "a-list" }, [
            h("li", { text: "Placement tests taken: " + hist.placements.length + (hist.placements[0] ? " (latest: level " + hist.placements[0].level + ", " + new Date(hist.placements[0].taken_at).toLocaleDateString("en-GB") + ")" : "") }),
            h("li", { text: "Lessons finished: " + hist.lessons.length }),
            h("li", { text: "Cards: " + hist.cards.total }),
            h("li", { text: "Card reviews: " + hist.reviews.n })]),
          h("button", { type: "button", "class": "btn-line", text: "Download my data (JSON)", onclick: function () {
            fetch("/api/app?a=export", { credentials: "same-origin" }).then(function (r) { return r.blob(); }).then(function (b) { var a = h("a", { href: URL.createObjectURL(b), download: "my-deutsch-klub-data.json" }); document.body.appendChild(a); a.click(); a.remove(); }); } })]),
        h("h2", { "class": "a-h2", text: "Delete" }), h("div", { "class": "a-card" }, [del]), msg]));
    });
  });
})();
