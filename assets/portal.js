// Deutsch-Klub portal: checks the session, shows the welcome page, settings, banner, events and channels.
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var user = null;
  var params = new URLSearchParams(location.search);

  DK.api("/api/me").then(function (res) {
    if (res.status === 200 && res.j.ok) { user = res.j.user; DK.hint.set(true); start(); return; }
    if (res.status === 401) {                             // really not logged in (or the session expired): back to the start page
      DK.hint.set(false);
      location.replace("/?login=1");
      return;
    }
    // 503 = accounts not set up yet; anything else = a temporary problem. Never log the visitor out because of those.
    $("#loading").textContent = res.status === 503
      ? "Accounts are being set up — please check back soon."
      : "Temporary problem — please reload the page in a moment.";
  }).catch(function () { $("#loading").textContent = "No connection — please reload the page."; });

  function start() {
    mountHeader();
    $("#loading").classList.add("p-hidden");
    $("#app").classList.remove("p-hidden");
    render();
    loadEvents();
    if (params.get("welcome")) history.replaceState(null, "", "/portal");
  }

  function mountHeader() {
    DK.mountMenu($("#acct"), [
      { label: "Settings", onClick: openSettings },
      { label: "Club website", onClick: function () { location.href = "/?home=1"; } },
      { label: "Log out", onClick: DK.logout, danger: true }
    ], user.full_name);
    $("#settingsBtn").addEventListener("click", openSettings);
  }

  function save(patch, okMsg) {
    return DK.api("/api/settings", patch).then(function (res) {
      if (res.status === 200 && res.j.ok) { user = res.j.user; render(); if (okMsg) DK.toast(okMsg); return true; }
      if (res.status === 401) { DK.hint.set(false); location.replace("/?login=1"); return false; }
      DK.toast(res.j.error || "Could not save — please try again."); return false;
    }).catch(function () { DK.toast("No connection — please try again."); return false; });
  }

  // ---------- main page ----------
  function render() {
    $("#hello").textContent = "Welcome, " + user.full_name;
    var isNew = params.get("welcome") === "1";
    $("#welcomeNote").classList.toggle("p-hidden", !isNew);
    var card = $("#idcard"); card.classList.toggle("is-new", isNew);
    $("#idnum").textContent = user.id;

    // banner: take the test, or stay with notifications only (dismissible)
    var ban = $("#banner");
    ban.classList.toggle("p-hidden", !!user.banner_dismissed);
    $("#bannerLevel").textContent = user.level;
    $("#bannerTest").textContent = "Take the " + user.level + " level test";

    // notifications: events + club channels
    $("#notifyOn").classList.toggle("p-hidden", !user.want_notify);
    $("#notifyOff").classList.toggle("p-hidden", !!user.want_notify);
    // level test card
    $("#testOn").classList.toggle("p-hidden", !user.want_test);
    $("#testOff").classList.toggle("p-hidden", !!user.want_test);
    $("#testLevel").textContent = user.level;
    syncSettings();
  }

  $("#copyId").addEventListener("click", function () {
    DK.copy(user.id.replace(/\s/g, "")).then(function (ok) {
      var b = $("#copyId"); var lab = b.querySelector("span");
      DK.toast(ok ? "ID copied: " + user.id : "Could not copy — select the number and copy it manually.");
      if (ok) { lab.textContent = "Copied ✓"; setTimeout(function () { lab.textContent = "Copy"; }, 1800); }
    });
  });

  $("#bannerTest").addEventListener("click", function () {
    save({ want_test: true, banner_dismissed: true }, "Level test is on. It's coming soon — you'll find it here the moment it's ready.");
  });
  $("#bannerNotify").addEventListener("click", function () {
    save({ want_test: false, want_notify: true, banner_dismissed: true }, "Done — you'll get event notifications only.");
  });
  $("#bannerClose").addEventListener("click", function () { save({ banner_dismissed: true }); });
  document.querySelectorAll("[data-open-settings]").forEach(function (b) { b.addEventListener("click", openSettings); });

  // ---------- events (assets/events.json — edit that file to change what is shown) ----------
  function loadEvents() {
    fetch("/assets/events.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (d) {
      $("#eventsTitle").textContent = d.title || "Schedule";
      $("#eventsSub").textContent = d.subtitle || "";
      var host = $("#events"); host.innerHTML = "";
      (d.events || []).forEach(function (e) {
        var row = document.createElement("div"); row.className = "p-card p-event";
        var day = document.createElement("p"); day.className = "day"; day.textContent = e.day;
        var mid = document.createElement("div"); var h = document.createElement("h3"); h.textContent = e.title; mid.appendChild(h);
        if (e.note) { var p = document.createElement("p"); p.textContent = e.note; mid.appendChild(p); }
        var meta = document.createElement("p"); meta.className = "meta"; meta.textContent = e.meta;
        row.appendChild(day); row.appendChild(mid); row.appendChild(meta); host.appendChild(row);
      });
    }).catch(function () { $("#events").textContent = "Events could not be loaded."; });
  }

  // ---------- settings dialog ----------
  var sd = $("#settings");
  function openSettings() { syncSettings(); if (!sd.open) sd.showModal(); }
  function syncSettings() {
    $("#setTest").checked = !!user.want_test; $("#setNotify").checked = !!user.want_notify; $("#setLevel").value = user.level;
    $("#setName").textContent = user.full_name; $("#setId").textContent = user.id;
  }
  $("#settingsClose").addEventListener("click", function () { sd.close(); });
  sd.addEventListener("click", function (e) { if (e.target === sd) sd.close(); });
  $("#setTest").addEventListener("change", function (e) { save({ want_test: e.target.checked }, e.target.checked ? "Level test turned on." : "Level test turned off."); });
  $("#setNotify").addEventListener("change", function (e) { save({ want_notify: e.target.checked }, e.target.checked ? "Club notifications turned on." : "Club notifications turned off."); });
  $("#setLevel").addEventListener("change", function (e) { save({ level: e.target.value }, "Level changed to " + e.target.value + "."); });
  $("#setBanner").addEventListener("click", function () { save({ banner_dismissed: false }, "The welcome banner is back on your page."); sd.close(); });
  $("#setLogout").addEventListener("click", DK.logout);
  $("#setDelete").addEventListener("click", function () {
    if (!confirm("Delete your account and all your data? This cannot be undone, and your ID will stop working.")) return;
    DK.api("/api/settings", { delete: true }).then(function (res) {
      if (res.status === 200 && res.j.ok) { DK.hint.set(false); location.href = "/"; } else { DK.toast("Could not delete — please try again."); }
    });
  });
})();
