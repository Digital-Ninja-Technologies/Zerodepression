(function () {
  "use strict";

  var EMAIL_KEY = "zd_staff_email";
  var BEAT = 45000;            // presence heartbeat
  var STALE_WAITING = 3 * 60000; // hide waiting chats whose visitor has gone quiet
  var MAX_ACTIVE = 3;

  function $(sel) { return document.querySelector(sel); }

  var el = {
    login: $("#view-login"), inbox: $("#view-inbox"),
    form: $("#login-form"), email: $("#c-email"), loginBtn: $("#login-btn"), loginErr: $("#login-error"), loginInfo: $("#login-info"),
    name: $("#me-name"), logout: $("#logout-btn"), alerts: $("#alerts-btn"), conn: $("#banner-conn-top"),
    waiting: $("#list-waiting"), mine: $("#list-mine"),
    empty: $("#pane-empty"), preview: $("#pane-preview"), room: $("#pane-room"),
    pvName: $("#pv-name"), pvCrisis: $("#pv-crisis"), pvText: $("#pv-text"), take: $("#take-btn"), pvErr: $("#pv-error"),
    title: $("#room-title"), sub: $("#room-sub"), crisis: $("#banner-crisis"),
    log: $("#log"), composer: $("#composer"), msg: $("#msg"), send: $("#send-btn"), meta: $("#composer-meta"),
    release: $("#release-btn"), close: $("#close-btn"), ended: $("#ended"),
  };

  var cfg = window.ZD_FIREBASE_CONFIG;
  var configured = !!(cfg && cfg.apiKey && cfg.projectId && !/^REPLACE/.test(cfg.apiKey));
  var fb = configured ? window.ZDFB.init(cfg) : null;

  var s = { user: null, name: null, waiting: [], mine: [], sel: null, chatUnsubs: [], unsubs: [], nodes: {}, known: null,
            knownCrisis: {}, beatTimer: null, renderTimer: null, busy: false, baseTitle: document.title, audio: null,
            lastChat: null };

  /* ------------------------------------------------------------ views */
  function showView(v) {
    el.login.hidden = v !== "login";
    el.inbox.hidden = v !== "inbox";
    if (v === "login") document.title = s.baseTitle;
  }
  function loginMessage(kind, text) {
    el.loginErr.hidden = kind !== "error"; el.loginInfo.hidden = kind !== "info";
    (kind === "error" ? el.loginErr : el.loginInfo).textContent = text || "";
  }

  /* ------------------------------------------------------------ sign-in (email link) */
  var LOGIN_ERRORS = {
    "auth/invalid-email": "That doesn't look like a valid email address.",
    "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
    "auth/network-request-failed": "We couldn't connect. Check your internet connection and try again.",
    "auth/invalid-action-code": "That sign-in link has expired or was already used. Request a new one.",
    "auth/expired-action-code": "That sign-in link has expired. Request a new one.",
    "auth/unauthorized-continue-uri": "This website isn't authorised for sign-in yet. Ask the admin to add it in Firebase Authentication settings.",
  };
  function errText(err) { return LOGIN_ERRORS[err && err.code] || "Something went wrong. Please try again."; }

  var completing = false;
  function finishLink(email) {
    completing = true;
    loginMessage("info", "Signing you in…");
    el.loginBtn.disabled = true;
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
    if (fb.staff.isLink(location.href)) { finishLink(email); return; }   // opened a link on another device
    loginMessage("", ""); el.loginBtn.disabled = true;
    fb.staff.sendLink(email, location.origin + "/counsellor/").then(function () {
      try { localStorage.setItem(EMAIL_KEY, email); } catch (e2) { /* ignore */ }
      loginMessage("info", "Check your email for a sign-in link, then open it on this device. It can take a minute.");
    }, function (err) { loginMessage("error", errText(err)); }).then(function () { el.loginBtn.disabled = false; });
  });

  el.logout.addEventListener("click", function () { signOutNow("You've been signed out."); });

  function signOutNow(message) {
    teardown();
    s.user = null; s.name = null;
    if (fb) fb.staff.signOut().catch(function () {});      // immediate; the "online" marker expires by itself in 2 minutes
    showView("login"); loginMessage(message ? "info" : "", message || "");
    el.email.focus();
  }

  function teardown() {
    s.unsubs.concat(s.chatUnsubs).forEach(function (u) { try { u(); } catch (e) { /* ignore */ } });
    s.unsubs = []; s.chatUnsubs = [];
    clearInterval(s.beatTimer); clearInterval(s.renderTimer);
    s.sel = null; s.known = null; s.knownCrisis = {}; s.waiting = []; s.mine = [];
    showPane("empty");
    document.title = s.baseTitle;
  }

  /* ------------------------------------------------------------ inbox */
  function enter(user, profile) {
    s.user = user; s.name = profile.displayName;
    el.name.textContent = s.name;
    showView("inbox");
    var beat = function () { if (!document.hidden) fb.staff.heartbeat(user.uid).then(function () { el.conn.hidden = true; }, function () { el.conn.hidden = false; }); };
    beat(); s.beatTimer = setInterval(beat, BEAT);
    s.renderTimer = setInterval(renderLists, 15000);
    s.unsubs.push(fb.staff.watchWaiting(function (list) { s.waiting = list; el.conn.hidden = true; onQueue(); }, onQueueError));
    s.unsubs.push(fb.staff.watchMine(user.uid, function (list) { s.mine = list; renderLists(); }, onQueueError));
  }

  function onQueueError(err) {
    if (err && err.code === "permission-denied") { signOutNow("This account isn't allowed to use the inbox."); return; }
    el.conn.hidden = false;
  }

  function liveWaiting() {
    var now = Date.now();
    return s.waiting.filter(function (c) { return now - (c.visitorSeen || c.createdAt || now) < STALE_WAITING; })
      .sort(function (a, b) { return (b.crisis ? 1 : 0) - (a.crisis ? 1 : 0) || (a.createdAt || 0) - (b.createdAt || 0); });
  }

  function onQueue() {
    var list = liveWaiting();
    var ids = {}; list.forEach(function (c) { ids[c.id] = c; });
    if (s.known) {
      var fresh = list.filter(function (c) { return !s.known[c.id] || (c.crisis && !s.knownCrisis[c.id]); });
      if (fresh.length) notifyNew(fresh);
    }
    s.known = ids;
    list.forEach(function (c) { if (c.crisis) s.knownCrisis[c.id] = true; });
    renderLists();
    // a previewed chat that someone else took disappears from the queue
    if (s.sel && s.sel.kind === "waiting" && !ids[s.sel.id]) { s.sel = null; showPane("empty"); }
  }

  function ago(ts) {
    var m = Math.max(0, Math.round((Date.now() - (ts || Date.now())) / 60000));
    return m < 1 ? "just now" : m + " min ago";
  }

  function renderList(listEl, items, kind) {
    listEl.textContent = "";
    if (!items.length) {
      var li0 = document.createElement("li"), p = document.createElement("p");
      p.className = "empty";
      p.textContent = kind === "waiting" ? "No one is waiting. You'll be alerted when someone arrives." : "You have no active chats.";
      li0.appendChild(p); listEl.appendChild(li0); return;
    }
    items.forEach(function (c) {
      var li = document.createElement("li"), b = document.createElement("button");
      b.type = "button";
      b.className = "qitem" + (c.crisis ? " qitem--crisis" : "");
      if (s.sel && s.sel.id === c.id) b.setAttribute("aria-current", "true");
      var strong = document.createElement("strong"), nm = document.createElement("span");
      nm.textContent = c.nickname; strong.appendChild(nm);
      if (c.crisis) { var t = document.createElement("span"); t.className = "tag"; t.textContent = "May be at risk"; strong.appendChild(t); }
      var small = document.createElement("small");
      small.textContent = kind === "waiting" ? (c.preview || "(no message yet)") + " · " + ago(c.createdAt) : "Active " + ago(c.lastActivity);
      b.appendChild(strong); b.appendChild(small);
      b.addEventListener("click", function () { select(kind, c); });
      li.appendChild(b); listEl.appendChild(li);
    });
  }

  function renderLists() {
    var w = liveWaiting();
    renderList(el.waiting, w, "waiting");
    renderList(el.mine, s.mine.slice().sort(function (a, b) { return (b.lastActivity || 0) - (a.lastActivity || 0); }), "mine");
    document.title = (w.length ? "(" + w.length + " waiting) " : "") + s.baseTitle;
  }

  /* ------------------------------------------------------------ alerts */
  function beep(times) {
    try {
      s.audio = s.audio || new (window.AudioContext || window.webkitAudioContext)();
      var ctx = s.audio;
      for (var i = 0; i < times; i++) {
        var o = ctx.createOscillator(), g = ctx.createGain(), at = ctx.currentTime + i * 0.28;
        o.type = "sine"; o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
        o.connect(g); g.connect(ctx.destination); o.start(at); o.stop(at + 0.22);
      }
    } catch (e) { /* audio is blocked until a user gesture */ }
  }

  el.alerts.addEventListener("click", function () {
    beep(1);
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    el.alerts.textContent = "Alerts on";
    el.alerts.setAttribute("aria-pressed", "true");
  });

  function notifyNew(fresh) {
    var crisis = fresh.some(function (c) { return c.crisis; });
    beep(crisis ? 3 : 1);
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
      try {
        new Notification(crisis ? "A visitor may be in crisis" : "New anonymous chat waiting", {
          body: fresh.length === 1 ? "Someone would like to talk." : fresh.length + " people would like to talk.", tag: "zd-waiting",
        });
      } catch (e) { /* ignore */ }
    }
  }

  /* ------------------------------------------------------------ panes + selecting */
  function showPane(which) {
    el.empty.hidden = which !== "empty";
    el.preview.hidden = which !== "preview";
    el.room.hidden = which !== "room";
  }

  function unwatchChat() { s.chatUnsubs.forEach(function (u) { try { u(); } catch (e) { /* ignore */ } }); s.chatUnsubs = []; }

  function select(kind, c) {
    unwatchChat();
    s.sel = { kind: kind, id: c.id };
    renderLists();
    if (kind === "waiting") {
      el.pvName.textContent = c.nickname;
      el.pvCrisis.hidden = !c.crisis;
      el.pvText.textContent = c.preview ? "“" + c.preview + "”" : "They haven't written anything yet.";
      el.pvErr.hidden = true; el.take.disabled = false;
      showPane("preview"); el.take.focus();
    } else { openRoom(c); }
  }

  el.take.addEventListener("click", function () {
    if (!s.sel || !s.user) return;
    if (s.mine.length >= MAX_ACTIVE) { el.pvErr.textContent = "You already have " + MAX_ACTIVE + " active chats. Finish or hand one back before taking another."; el.pvErr.hidden = false; return; }
    var id = s.sel.id, nick = el.pvName.textContent, crisis = !el.pvCrisis.hidden;
    el.take.disabled = true; el.pvErr.hidden = true;
    fb.staff.claim(id, s.user.uid, s.name).then(function () {
      s.sel = { kind: "mine", id: id };
      openRoom({ id: id, nickname: nick, crisis: crisis });
    }, function (err) {
      el.pvErr.textContent = err && err.code === "permission-denied"
        ? "Another counsellor has just taken this chat." : "We couldn't take this chat. Please try again.";
      el.pvErr.hidden = false; el.take.disabled = false;
      if (err && err.code === "permission-denied") { s.sel = null; }
    });
  });

  /* ------------------------------------------------------------ the open chat */
  function fmt(ts) { var d = new Date(ts); return isNaN(d) ? "" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }

  function openRoom(c) {
    unwatchChat();
    s.nodes = {}; s.lastChat = null;
    el.log.textContent = "";
    el.title.textContent = c.nickname;
    el.sub.textContent = "Anonymous visitor";
    el.crisis.hidden = !c.crisis;
    el.ended.hidden = true; el.composer.hidden = false; el.meta.hidden = false;
    el.release.hidden = false; el.close.hidden = false;
    el.msg.value = ""; el.msg.disabled = false;
    showPane("room");
    var id = c.id;
    s.chatUnsubs.push(fb.staff.watchChat(id, function (chat) {
      if (!chat || (chat.status !== "closed" && chat.counsellorUid !== s.user.uid)) { s.sel = null; showPane("empty"); unwatchChat(); return; }
      if (chat.crisis) el.crisis.hidden = false;
      if (chat.status === "closed") {
        el.ended.hidden = false; el.composer.hidden = true; el.meta.hidden = true;
        el.release.hidden = true; el.close.hidden = true; el.sub.textContent = "Chat ended";
      }
    }, function () { s.sel = null; showPane("empty"); }));
    s.chatUnsubs.push(fb.staff.watchMessages(id, function (list) {
      var ids = {}, gotUser = false;
      list.forEach(function (m) { ids[m.id] = true; });
      Object.keys(s.nodes).forEach(function (k) { if (!ids[k]) { s.nodes[k].remove(); delete s.nodes[k]; } });
      list.forEach(function (m) {
        var node = s.nodes[m.id];
        if (!node) {
          if (m.sender === "user") gotUser = true;
          node = document.createElement("div");
          node.className = "bubble bubble--" + (m.sender === "counsellor" ? "me" : "them");
          var t = document.createElement("span"); t.textContent = m.body; node.appendChild(t);
          var tm = document.createElement("time"); tm.textContent = fmt(m.createdAt || Date.now()); node.appendChild(tm);
          s.nodes[m.id] = node; el.log.appendChild(node);
        }
        node.style.opacity = m.pending ? "0.6" : "";
      });
      if (list.length) el.log.scrollTop = el.log.scrollHeight;
      if (gotUser && document.hidden) beep(1);
    }, function () { el.conn.hidden = false; }));
    el.msg.focus();
  }

  /* ------------------------------------------------------------ replying + actions */
  function updateSend() { el.send.disabled = !el.msg.value.trim() || s.busy; }
  el.msg.addEventListener("input", function () {
    updateSend(); el.msg.style.height = "auto"; el.msg.style.height = Math.min(el.msg.scrollHeight, 140) + "px";
  });
  el.msg.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); el.composer.requestSubmit(); }
  });
  // Clear the box on submit so anything typed while sending is kept; put the text back only if the send fails.
  el.composer.addEventListener("submit", function (e) {
    e.preventDefault();
    var body = el.msg.value.trim();
    if (!body || !s.sel) return;
    if (s.busy) { s.queued = true; return; }
    el.msg.value = ""; el.msg.style.height = "auto";
    s.busy = true; updateSend();
    fb.staff.reply(s.sel.id, body).then(function () { el.conn.hidden = true; }, function () {
      if (!el.msg.value) el.msg.value = body;
      el.conn.hidden = false;
    }).then(function () {
      s.busy = false; updateSend(); el.msg.focus();
      if (s.queued) { s.queued = false; if (el.msg.value.trim()) el.composer.requestSubmit(); }
    });
  });

  el.release.addEventListener("click", function () {
    if (!s.sel || !window.confirm("Hand this chat back to the queue? The visitor will be told you had to step away.")) return;
    fb.staff.release(s.sel.id).then(function () { unwatchChat(); s.sel = null; showPane("empty"); }, function () { el.conn.hidden = false; });
  });
  el.close.addEventListener("click", function () {
    if (!s.sel || !window.confirm("End this chat? The visitor will be shown a closing message.")) return;
    fb.staff.close(s.sel.id).catch(function () { el.conn.hidden = false; });
  });
  $("#done-btn").addEventListener("click", function () { unwatchChat(); s.sel = null; showPane("empty"); });

  window.addEventListener("offline", function () { if (s.user) el.conn.hidden = false; });
  window.addEventListener("online", function () { el.conn.hidden = true; });

  /* ------------------------------------------------------------ boot */
  updateSend();
  if (!configured) {
    showView("login");
    el.loginBtn.disabled = true;
    loginMessage("error", "The chat backend isn't configured yet (see backend/README.md).");
    return;
  }

  var pendingLink = fb.staff.isLink(location.href);
  var stored = null;
  try { stored = localStorage.getItem(EMAIL_KEY); } catch (e) { /* ignore */ }
  showView("login");
  if (pendingLink) {
    if (stored) { finishLink(stored); }
    else { loginMessage("info", "To finish signing in, please confirm your email address below."); el.email.focus(); el.loginBtn.textContent = "Finish signing in"; }
  }

  fb.staff.onAuth(function (user) {
    if (!user) { if (!completing && s.user) { teardown(); s.user = null; showView("login"); } return; }
    fb.staff.profile(user.email).then(function (profile) {
      if (!profile) {
        fb.staff.signOut().catch(function () {});
        showView("login");
        loginMessage("error", "This email isn't on the counsellor list. Ask an admin to add it.");
        return;
      }
      loginMessage("", "");
      enter(user, profile);
    });
  });
})();
