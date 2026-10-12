// Deutsch-Klub member app — admin window (/app/admin). Only accounts listed in ADMIN_IDS can use it; the server re-checks every request.
// Shows a card per member, lets the admin search by name / ID / e-mail and delete a member. Text only, never innerHTML for data.
(function () {
  "use strict";
  var DKA = window.DKA, h = DKA.h;

  function day(s) { return s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""; }
  function examDay(s) { return new Date(s + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); }
  function digits(s) { return String(s).replace(/\D/g, ""); }
  function notFound(root) {
    root.appendChild(h("div", { "class": "a-wrap" }, [h("div", { "class": "a-card a-empty" }, [h("h1", { "class": "a-h1", text: "Page not found" }),
      h("p", { "class": "a-muted", text: "There is no page at /app/admin (yet)." }), DKA.link("/app", "Back to my dashboard", "btn-solid")])]));
  }

  DKA.route(/^\/app\/admin$/, function (root) {
    var me = DKA.state.user;
    if (!me.is_admin) return notFound(root);
    return DK.api("/api/app?a=admin.users").then(function (res) {
      if (res.status === 403) return notFound(root);
      if (res.status !== 200 || !res.j.ok) throw new Error("admin");
      var users = res.j.users, query = "";
      var stats = h("p", { "class": "ad-stats", "aria-live": "polite" }), grid = h("div", { "class": "ad-grid" });
      var search = h("input", { type: "search", id: "adSearch", placeholder: "Search by name, ID or e-mail", autocomplete: "off", "aria-label": "Search members by name, ID or e-mail" });

      function matches(u) {
        if (!query) return true;
        var q = query.toLowerCase(), d = digits(query);
        return u.full_name.toLowerCase().indexOf(q) > -1 || u.email.toLowerCase().indexOf(q) > -1 || (d.length > 0 && digits(u.id).indexOf(d) > -1);
      }
      function paint() {
        var shown = users.filter(matches), tested = users.filter(function (u) { return u.placement; }).length;
        stats.textContent = users.length + " member" + (users.length === 1 ? "" : "s") + " · " + tested + " took the placement test · " + (users.length - tested) + " not yet" + (query ? " · showing " + shown.length : "");
        grid.innerHTML = "";
        if (!shown.length) grid.appendChild(h("div", { "class": "a-card a-empty" }, [h("p", { "class": "a-muted", text: users.length ? "Nobody matches “" + query + "”." : "Nobody has signed up yet." })]));
        shown.forEach(function (u) { grid.appendChild(card(u)); });
      }

      function card(u) {
        var p = u.placement, status = p
          ? [h("span", { "class": "a-badge", text: "Level " + p.level }), h("span", { "class": "ad-tag ok", text: "Test taken ✓" }), h("span", { "class": "a-muted a-small", text: p.score + "/" + p.total + " correct · " + day(p.taken_at) })]
          : [h("span", { "class": "ad-tag no", text: "Test not taken" })];
        var goal = !u.goal ? "not set yet" : DKA.goalName(u.goal) + (u.goal === "goethe" ? " · exam " + (u.exam_date ? examDay(u.exam_date) : "date not set") : "");
        var interests = u.interests.length ? h("div", { "class": "ad-ints" }, u.interests.map(function (i) { return h("span", { "class": "ad-int", text: i }); })) : h("span", { "class": "a-muted a-small", text: "not set yet" });
        var actions;
        if (u.is_me || u.is_admin) actions = h("span", { "class": "ad-tag", text: u.is_me ? "Admin · you" : "Admin" });
        else actions = h("button", { type: "button", "class": "btn-line danger ad-del", text: "Delete user", onclick: function () { confirmDelete(u); } });
        return h("article", { "class": "a-card ad-card" }, [
          h("div", { "class": "ad-head" }, [h("h3", { "class": "ad-name", text: u.full_name }), actions]),
          h("p", { "class": "ad-id", translate: "no", text: "ID " + u.id }),
          h("p", { "class": "ad-mail", text: u.email }),
          h("div", { "class": "ad-status" }, status),
          h("p", null, [h("strong", { text: "Goal: " }), goal]),
          h("p", null, [h("strong", { text: "Interests: " }), interests]),
          h("p", { "class": "a-muted a-small", text: "Signed up " + day(u.created_at) })]);
      }

      function confirmDelete(u) {
        var d = document.createElement("dialog"); d.className = "dk-dialog";
        var err = h("p", { "class": "err", role: "alert" });
        var go = h("button", { type: "button", "class": "btn-line danger", style: "width:100%;margin-top:0.8rem", text: "Delete permanently", onclick: function () {
          go.disabled = true; err.textContent = "";
          DK.api("/api/app?a=admin.delete", { id: u.id.replace(/\s/g, "") }).then(function (r) {
            if (r.status === 200 && r.j.ok) { users = users.filter(function (x) { return x.id !== u.id; }); d.close(); d.remove(); paint(); DK.toast("User deleted"); return; }
            err.textContent = (r.j && r.j.error) || "Could not delete — try again."; go.disabled = false;
          }).catch(function () { err.textContent = "No connection — please try again."; go.disabled = false; });
        } });
        d.appendChild(h("div", null, [
          h("h2", { text: "Delete this user?" }),
          h("p", { "class": "sub", text: u.full_name + " · " + u.email }), h("div", { "class": "idbig", translate: "no", text: u.id }),
          h("p", { "class": "a-muted a-small", text: "This removes the account, test results, lesson progress, cards and review history for good. It cannot be undone." }),
          err, go,
          h("button", { type: "button", "class": "btn-line", style: "width:100%;margin-top:0.6rem", text: "Cancel", onclick: function () { d.close(); d.remove(); } })]));
        document.body.appendChild(d); d.showModal();
      }

      search.addEventListener("input", function () { query = search.value.trim(); paint(); });
      root.appendChild(h("div", { "class": "a-wrap" }, [
        h("p", { "class": "eyebrow" }, [h("span", { "class": "mark mark-circle", "aria-hidden": "true" }), "Admin"]),
        h("h1", { "class": "a-h1", text: "Members" }),
        h("p", { "class": "a-muted a-small", text: "Only visible to admin accounts. Level = result of the server-checked placement test." }),
        h("div", { "class": "ad-bar" }, [search]), stats, grid]));
      paint();
    });
  });
})();
