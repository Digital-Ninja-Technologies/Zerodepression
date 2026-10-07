(function () {
  "use strict";

  var EMAIL_KEY = "zd_staff_email";

  function $(sel) { return document.querySelector(sel); }

  var el = {
    login: $("#view-login"), admin: $("#view-admin"),
    form: $("#login-form"), email: $("#a-email"), loginBtn: $("#login-btn"), loginErr: $("#login-error"), loginInfo: $("#login-info"),
    name: $("#me-name"), logout: $("#logout-btn"), conn: $("#banner-conn-top"),
    add: $("#add-form"), nName: $("#n-name"), nEmail: $("#n-email"), nRole: $("#n-role"), addBtn: $("#add-btn"),
    addErr: $("#add-error"), addInfo: $("#add-info"), list: $("#clist"), count: $("#count"),
  };

  var cfg = window.ZD_FIREBASE_CONFIG;
  var configured = !!(cfg && cfg.apiKey && cfg.projectId && !/^REPLACE/.test(cfg.apiKey));
  var fb = configured ? window.ZDFB.init(cfg) : null;
  var s = { me: null, people: [], unsub: null };
  var completing = false;

  function msg(errEl, infoEl, kind, text) {
    errEl.hidden = kind !== "error"; infoEl.hidden = kind !== "info";
    (kind === "error" ? errEl : infoEl).textContent = text || "";
  }
  function loginMessage(kind, text) { msg(el.loginErr, el.loginInfo, kind, text); }
  function showView(v) { el.login.hidden = v !== "login"; el.admin.hidden = v !== "admin"; }

  /* ------------------------------------------------------------ sign-in (email link, same as the inbox) */
  var LOGIN_ERRORS = {
    "auth/invalid-email": "That doesn't look like a valid email address.",
    "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
    "auth/network-request-failed": "We couldn't connect. Check your internet connection and try again.",
    "auth/invalid-action-code": "That sign-in link has expired or was already used. Request a new one.",
    "auth/expired-action-code": "That sign-in link has expired. Request a new one.",
    "auth/unauthorized-continue-uri": "This website isn't authorised for sign-in yet. Add it under Authentication > Settings > Authorized domains in Firebase.",
  };
  function errText(err) { return LOGIN_ERRORS[err && err.code] || "Something went wrong. Please try again."; }

  function finishLink(email) {
    completing = true; el.loginBtn.disabled = true;
    loginMessage("info", "Signing you in…");
    return fb.staff.completeLink(email, location.href).then(function () {
      try { localStorage.removeItem(EMAIL_KEY); } catch (e) { /* ignore */ }
      history.replaceState(null, "", location.pathname);
    }, function (err) { loginMessage("error", errText(err)); }).then(function () { completing = false; el.loginBtn.disabled = false; });
  }

  el.form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!configured) return;
    var email = el.email.value.trim().toLowerCase();
    if (!email) { loginMessage("error", "Please enter your email address."); return; }
    if (fb.staff.isLink(location.href)) { finishLink(email); return; }
    loginMessage("", ""); el.loginBtn.disabled = true;
    fb.staff.sendLink(email, location.origin + "/counsellor-admin/").then(function () {
      try { localStorage.setItem(EMAIL_KEY, email); } catch (e2) { /* ignore */ }
      loginMessage("info", "Check your email for a sign-in link, then open it on this device. It can take a minute.");
    }, function (err) { loginMessage("error", errText(err)); }).then(function () { el.loginBtn.disabled = false; });
  });

  el.logout.addEventListener("click", function () { signOutNow(""); });

  function stop() { if (s.unsub) { try { s.unsub(); } catch (e) { /* ignore */ } s.unsub = null; } s.people = []; }
  function signOutNow(message) {
    stop(); s.me = null;
    if (fb) fb.staff.signOut().catch(function () {});
    showView("login"); loginMessage(message ? "info" : "", message || "");
  }

  /* ------------------------------------------------------------ the list */
  function enter(user, profile) {
    s.me = { email: user.email, name: profile.displayName };
    el.name.textContent = profile.displayName;
    showView("admin");
    s.unsub = fb.admin.watchCounsellors(function (list) { s.people = list; el.conn.hidden = true; render(); }, function (err) {
      if (err && err.code === "permission-denied") { signOutNow("This account isn't allowed to manage counsellors."); return; }
      el.conn.hidden = false;
    });
  }

  function act(label, fn) {
    return function (btn) {
      btn.disabled = true;
      fn().then(function () { el.conn.hidden = true; }, function () { el.conn.hidden = false; btn.disabled = false; });
    };
  }

  function actionBtn(text, handler, danger) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "btn-quiet" + (danger ? " btn-danger" : ""); b.textContent = text;
    b.addEventListener("click", function () { handler(b); });
    return b;
  }

  function render() {
    var people = s.people.slice().sort(function (a, b) {
      return (b.active === true) - (a.active === true) || String(a.displayName).localeCompare(String(b.displayName));
    });
    el.count.textContent = "(" + people.filter(function (p) { return p.active; }).length + " active)";
    el.list.textContent = "";
    if (!people.length) {
      var li0 = document.createElement("li"), p0 = document.createElement("p");
      p0.className = "empty"; p0.textContent = "No counsellors yet."; li0.appendChild(p0); el.list.appendChild(li0); return;
    }
    people.forEach(function (p) {
      var self = p.id === s.me.email, isAdmin = p.role === "admin";
      var li = document.createElement("li");
      li.className = "qitem"; li.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px";
      var info = document.createElement("div");
      var strong = document.createElement("strong"), nm = document.createElement("span");
      nm.textContent = p.displayName; strong.appendChild(nm);
      if (isAdmin) { var t = document.createElement("span"); t.className = "tag"; t.textContent = "Admin"; strong.appendChild(t); }
      if (!p.active) { var t2 = document.createElement("span"); t2.className = "tag"; t2.textContent = "Deactivated"; strong.appendChild(t2); }
      var small = document.createElement("small");
      small.textContent = p.id + (p.addedBy ? " · added by " + p.addedBy : "");
      info.appendChild(strong); info.appendChild(small);
      var actions = document.createElement("div"); actions.className = "room-actions";
      actions.appendChild(actionBtn("Rename", function (b) {
        var n = window.prompt("Name visitors will see:", p.displayName);
        if (n === null) return; n = n.trim();
        if (!n || n.length > 40) { window.alert("Please enter a name of 1 to 40 characters."); return; }
        act("rename", function () { return fb.admin.update(p.id, { displayName: n }); })(b);
      }));
      if (!self) {
        actions.appendChild(actionBtn(isAdmin ? "Make counsellor" : "Make admin", function (b) {
          if (!window.confirm(isAdmin ? "Remove admin access for " + p.displayName + "?" : "Give " + p.displayName + " admin access? They will be able to add and remove counsellors.")) return;
          act("role", function () { return fb.admin.update(p.id, { role: isAdmin ? "counsellor" : "admin" }); })(b);
        }));
        actions.appendChild(actionBtn(p.active ? "Deactivate" : "Reactivate", function (b) {
          if (p.active && !window.confirm("Deactivate " + p.displayName + "? They lose access to the inbox immediately.")) return;
          act("active", function () { return fb.admin.update(p.id, { active: !p.active }); })(b);
        }, p.active));
      }
      li.appendChild(info); li.appendChild(actions); el.list.appendChild(li);
    });
  }

  /* ------------------------------------------------------------ adding */
  el.add.addEventListener("submit", function (e) {
    e.preventDefault();
    var name = el.nName.value.trim(), email = el.nEmail.value.trim().toLowerCase(), role = el.nRole.value;
    msg(el.addErr, el.addInfo, "", "");
    if (!name || name.length > 40) { msg(el.addErr, el.addInfo, "error", "Enter a name of 1 to 40 characters."); return; }
    if (!/^[^@\/\s]+@[^@\/\s]+\.[^@\/\s]+$/.test(email)) { msg(el.addErr, el.addInfo, "error", "Enter a valid email address."); return; }
    if (s.people.some(function (p) { return p.id === email; })) { msg(el.addErr, el.addInfo, "error", "That email is already on the list. Reactivate or edit them below."); return; }
    el.addBtn.disabled = true;
    fb.admin.add(email, name, role, s.me.email).then(function () {
      el.add.reset();
      msg(el.addErr, el.addInfo, "info", name + " was added. Ask them to sign in at /counsellor/ with " + email + ".");
    }, function () { msg(el.addErr, el.addInfo, "error", "We couldn't add them. Check your connection and try again."); })
      .then(function () { el.addBtn.disabled = false; });
  });

  /* ------------------------------------------------------------ boot */
  if (!configured) {
    showView("login"); el.loginBtn.disabled = true;
    loginMessage("error", "The chat backend isn't configured yet (see backend/README.md).");
    return;
  }
  var stored = null;
  try { stored = localStorage.getItem(EMAIL_KEY); } catch (e) { /* ignore */ }
  showView("login");
  if (fb.staff.isLink(location.href)) {
    if (stored) finishLink(stored);
    else { loginMessage("info", "To finish signing in, please confirm your email address below."); el.email.focus(); el.loginBtn.textContent = "Finish signing in"; }
  }

  fb.staff.onAuth(function (user) {
    if (!user) { if (!completing && s.me) { stop(); s.me = null; showView("login"); } return; }
    fb.staff.profile(user.email).then(function (profile) {
      if (!profile || profile.role !== "admin") {
        fb.staff.signOut().catch(function () {});
        showView("login");
        loginMessage("error", profile ? "This account isn't an admin. Counsellors sign in at /counsellor/." : "This email isn't on the counsellor list.");
        return;
      }
      loginMessage("", "");
      enter(user, profile);
    });
  });
})();
