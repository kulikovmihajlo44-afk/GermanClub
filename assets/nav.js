// Navigation for the new pages (/test, /start, /app/*). One menu array; only items with ready:true are rendered.
// To launch a section later, flip its `ready` flag — nothing else to change.
(function () {
  "use strict";
  var DK = (window.DK = window.DK || {});

  DK.MENU = [
    // public
    { id: "method",  area: "public", label: "Method",       href: "/method",       ready: false },
    { id: "how",     area: "public", label: "How it works", href: "/how-it-works", ready: false },
    { id: "pclub",   area: "public", label: "Club",         href: "/club",         ready: false },
    { id: "pricing", area: "public", label: "Pricing",      href: "/pricing",      ready: false },
    // member
    { id: "dash",    area: "member", label: "Dashboard",    href: "/app",          ready: true,  tab: "Home" },
    { id: "learn",   area: "member", label: "Learn",        href: "/app/learn",    ready: true,  tab: "Learn" },
    { id: "cards",   area: "member", label: "Cards",        href: "/app/cards",    ready: true,  tab: "Cards" },
    { id: "club",    area: "member", label: "Club",         href: "/app/club",     ready: true },
    { id: "account", area: "member", label: "Account",      href: "/app/account",  ready: true },
    // later (hidden until ready)
    { id: "goethe",  area: "member", label: "Goethe",       href: "/app/learn/goethe", ready: false },
    { id: "watch",   area: "member", label: "Watch",        href: "/app/watch",    ready: false },
    { id: "progress",area: "member", label: "Progress",     href: "/app/progress", ready: false },
    { id: "write",   area: "member", label: "Write",        href: "/app/write",    ready: false },
    { id: "bot",     area: "member", label: "Bot",          href: "/app/bot",      ready: false }
  ];
  DK.CTA = { label: "Take placement test", href: "/test" };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function items(area) { return DK.MENU.filter(function (m) { return m.area === area && m.ready; }); }
  function isActive(href, path) { return href === "/app" ? path === "/app" || path === "/app/" || path.indexOf("/app/onboarding") === 0 : path === href || path.indexOf(href + "/") === 0; }

  var LOGO = '<a class="logo" href="/?home=1" aria-label="Deutsch-Klub — club website"><span class="logo-mark" aria-hidden="true"></span><span class="logo-text">Deutsch-Klub</span></a>';

  // area: "public" | "member"
  DK.renderHeader = function (host, area, path) {
    path = path || location.pathname;
    var links = items(area).map(function (m) {
      return '<a class="nav-link' + (isActive(m.href, path) ? " on" : "") + '" href="' + m.href + '"' + (area === "member" ? " data-link" : "") + (isActive(m.href, path) ? ' aria-current="page"' : "") + ">" + esc(m.label) + "</a>";
    }).join("");
    var right;
    if (area === "member") right = '<div class="acct" id="acct"></div>';
    else {
      var inApp = DK.hint && DK.hint.get();
      right = '<a class="btn-pill" href="' + DK.CTA.href + '">' + esc(DK.CTA.label) + "</a>" +
        (inApp ? '<a class="nav-link" href="/app">Open my app</a>' : '<a class="nav-link" href="/login" id="navLogin">Log in</a>');
    }
    host.className = "nav scrolled " + area;
    host.innerHTML = '<div class="nav-inner">' + LOGO + '<nav class="nav-links" aria-label="Main">' + links + right + "</nav></div>";
    var lg = host.querySelector("#navLogin");
    if (lg) lg.addEventListener("click", function (e) { e.preventDefault(); DK.openLogin(); });
  };

  // mobile bottom bar (member area): Home / Learn / Cards / More
  DK.renderTabbar = function (host, path, onLogout) {
    path = path || location.pathname;
    var tabs = items("member").filter(function (m) { return m.tab; });
    var rest = items("member").filter(function (m) { return !m.tab; });
    host.className = "tabbar";
    host.setAttribute("aria-label", "Main");
    host.innerHTML = tabs.map(function (m) {
      return '<a href="' + m.href + '" data-link class="tab' + (isActive(m.href, path) ? " on" : "") + '"' + (isActive(m.href, path) ? ' aria-current="page"' : "") + "><i></i>" + esc(m.tab) + "</a>";
    }).join("") + '<button type="button" class="tab" id="tabMore" aria-haspopup="true" aria-expanded="false"><i></i>More</button>' +
      '<div class="more-sheet" id="moreSheet" hidden>' + rest.map(function (m) { return '<a href="' + m.href + '" data-link>' + esc(m.label) + "</a>"; }).join("") +
      '<button type="button" id="moreOut">Log out</button></div>';
    var more = host.querySelector("#tabMore"), sheet = host.querySelector("#moreSheet");
    more.addEventListener("click", function (e) { e.stopPropagation(); sheet.hidden = !sheet.hidden; more.setAttribute("aria-expanded", String(!sheet.hidden)); });
    document.addEventListener("click", function (e) { if (!host.contains(e.target)) { sheet.hidden = true; more.setAttribute("aria-expanded", "false"); } });
    sheet.addEventListener("click", function (e) { if (e.target.closest("a")) sheet.hidden = true; });
    host.querySelector("#moreOut").addEventListener("click", onLogout);
  };

  DK.isReady = function (id) { return items("member").concat(items("public")).some(function (m) { return m.id === id; }); };
})();
