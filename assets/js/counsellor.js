(function () {
  "use strict";

  var STORE = "zd_counsellor_v1";
  function $(sel) { return document.querySelector(sel); }

  var el = {
    login: $("#view-login"), inbox: $("#view-inbox"),
    form: $("#login-form"), email: $("#c-email"), code: $("#c-code"), loginBtn: $("#login-btn"), loginErr: $("#login-error"),
    name: $("#me-name"), logout: $("#logout-btn"), alerts: $("#alerts-btn"),
    waiting: $("#list-waiting"), mine: $("#list-mine"),
    empty: $("#pane-empty"), preview: $("#pane-preview"), room: $("#pane-room"),
    pvName: $("#pv-name"), pvCrisis: $("#pv-crisis"), pvText: $("#pv-text"), take: $("#take-btn"), pvErr: $("#pv-error"),
    title: $("#room-title"), sub: $("#room-sub"), crisis: $("#banner-crisis"), conn: $("#banner-conn-top"),
    log: $("#log"), composer: $("#composer"), msg: $("#msg"), send: $("#send-btn"), meta: $("#composer-meta"),
    release: $("#release-btn"), close: $("#close-btn"), ended: $("#ended"),
  };

  var s = { token: null, name: null, sel: null, last: 0, seen: {}, known: null, knownCrisis: {},
            queue: { waiting: [], mine: [] }, qTimer: null, rTimer: null, qErr: 0, rErr: 0, busy: false,
            baseTitle: document.title, audio: null };

  /* ------------------------------------------------------------ session */
  function save() { try { sessionStorage.setItem(STORE, JSON.stringify({ token: s.token, name: s.name })); } catch (e) { /* ignore */ } }
  function wipe() { try { sessionStorage.removeItem(STORE); } catch (e) { /* ignore */ } }

  function showView(v) {
    el.login.hidden = v !== "login";
    el.inbox.hidden = v !== "inbox";
    if (v === "login") document.title = s.baseTitle;
  }

  function signedOut(message) {
    clearTimeout(s.qTimer); clearTimeout(s.rTimer);
    wipe();
    s.token = s.name = s.sel = null; s.known = null; s.knownCrisis = {};
    showPane("empty");
    showView("login");
    el.loginErr.textContent = message || "";
    el.loginErr.hidden = !message;
    el.email.focus();
  }

  var LOGIN_ERRORS = {
    bad_login: "That email and code don't match. Check them and try again.",
    locked: "Too many attempts. This account is locked for 15 minutes.",
    network: "We couldn't connect. Check your internet connection and try again.",
  };

  el.form.addEventListener("submit", function (e) {
    e.preventDefault();
    el.loginErr.hidden = true;
    el.loginBtn.disabled = true;
    ZD.call("zd_counsellor_login", { p_email: el.email.value, p_code: el.code.value }).then(function (r) {
      if (r && r.token) {
        s.token = r.token; s.name = r.name; save();
        el.code.value = "";
        enter();
      } else {
        el.loginErr.textContent = LOGIN_ERRORS[(r && r.error) || "bad_login"] || LOGIN_ERRORS.bad_login;
        el.loginErr.hidden = false;
      }
    }, function (err) {
      el.loginErr.textContent = LOGIN_ERRORS[ZD.errorKey(err)] || "Something went wrong. Please try again.";
      el.loginErr.hidden = false;
    }).then(function () { el.loginBtn.disabled = false; });
  });

  el.logout.addEventListener("click", function () {
    var t = s.token;
    signedOut("You've been signed out.");
    if (t) ZD.call("zd_counsellor_logout", { p_token: t }).catch(function () {});
  });

  function enter() {
    el.name.textContent = s.name;
    showView("inbox");
    pollQueue();
  }

  /* ------------------------------------------------------------ alerts */
  function beep(times) {
    try {
      s.audio = s.audio || new (window.AudioContext || window.webkitAudioContext)();
      var ctx = s.audio;
      for (var i = 0; i < times; i++) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.28);
        g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.28 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.28 + 0.2);
        o.connect(g); g.connect(ctx.destination);
        o.start(ctx.currentTime + i * 0.28); o.stop(ctx.currentTime + i * 0.28 + 0.22);
      }
    } catch (e) { /* audio blocked until a user gesture */ }
  }

  el.alerts.addEventListener("click", function () {
    beep(1);   // a click unlocks audio for later alerts
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().then(function () { syncAlertButton(); });
    }
    el.alerts.textContent = "Alerts on";
    el.alerts.setAttribute("aria-pressed", "true");
  });
  function syncAlertButton() {
    if ("Notification" in window && Notification.permission === "denied") el.alerts.title = "Desktop notifications are blocked in your browser; sound alerts still work.";
  }

  function notifyNew(newOnes) {
    var crisis = newOnes.some(function (c) { return c.crisis; });
    beep(crisis ? 3 : 1);
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
      try {
        new Notification(crisis ? "A visitor may be in crisis" : "New anonymous chat waiting", {
          body: newOnes.length === 1 ? "Someone would like to talk." : newOnes.length + " people would like to talk.",
          tag: "zd-waiting",
        });
      } catch (e) { /* ignore */ }
    }
  }

  /* ------------------------------------------------------------ queue */
  function ago(ts) {
    var m = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
    return m < 1 ? "just now" : m + " min ago";
  }

  function renderList(listEl, items, kind) {
    listEl.textContent = "";
    if (!items.length) {
      var li = document.createElement("li");
      var p = document.createElement("p");
      p.className = "empty";
      p.textContent = kind === "waiting" ? "No one is waiting. You'll be alerted when someone arrives." : "You have no active chats.";
      li.appendChild(p); listEl.appendChild(li);
      return;
    }
    items.forEach(function (c) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      b.className = "qitem" + (c.crisis ? " qitem--crisis" : "");
      if (s.sel && s.sel.id === c.id) b.setAttribute("aria-current", "true");
      var strong = document.createElement("strong");
      var nm = document.createElement("span"); nm.textContent = c.nickname;
      strong.appendChild(nm);
      if (c.crisis) { var t = document.createElement("span"); t.className = "tag"; t.textContent = "May be at risk"; strong.appendChild(t); }
      else if (kind === "mine" && c.last_sender === "user") { var n = document.createElement("span"); n.className = "tag tag--new"; n.textContent = "Reply"; strong.appendChild(n); }
      var small = document.createElement("small");
      small.textContent = kind === "waiting" ? (c.preview || "(no message yet)") + " · " + ago(c.created_at) : "Active " + ago(c.last_activity);
      b.appendChild(strong); b.appendChild(small);
      b.addEventListener("click", function () { select(kind, c); });
      li.appendChild(b); listEl.appendChild(li);
    });
  }

  function pollQueue() {
    clearTimeout(s.qTimer);
    if (!s.token) return;
    ZD.call("zd_counsellor_queue", { p_token: s.token }).then(function (q) {
      s.qErr = 0; el.conn.hidden = true;
      s.queue = q;
      // alerts for chats we haven't seen before
      var ids = {}; q.waiting.forEach(function (c) { ids[c.id] = c; });
      if (s.known) {
        var fresh = q.waiting.filter(function (c) { return !s.known[c.id] || (c.crisis && !s.knownCrisis[c.id]); });
        if (fresh.length) notifyNew(fresh);
      }
      s.known = ids;
      q.waiting.forEach(function (c) { if (c.crisis) s.knownCrisis[c.id] = true; });
      renderList(el.waiting, q.waiting, "waiting");
      renderList(el.mine, q.mine, "mine");
      document.title = (q.waiting.length ? "(" + q.waiting.length + " waiting) " : "") + s.baseTitle;
      // if the previewed chat was taken by someone else, close the preview
      if (s.sel && s.sel.kind === "waiting" && !ids[s.sel.id]) { s.sel = null; showPane("empty"); }
      schedQueue();
    }, function (err) {
      if (ZD.errorKey(err) === "unauthorised") { signedOut("Your session has ended. Please sign in again."); return; }
      s.qErr++; el.conn.hidden = false; schedQueue();
    });
  }
  function schedQueue() {
    clearTimeout(s.qTimer);
    var base = document.hidden ? 8000 : 3000;
    s.qTimer = setTimeout(pollQueue, s.qErr ? Math.min(20000, 3000 * Math.pow(2, s.qErr)) : base);
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden && s.token) { pollQueue(); if (s.sel && s.sel.kind === "mine") pollRoom(); } });

  /* ------------------------------------------------------------ selecting / claiming */
  function showPane(which) {
    el.empty.hidden = which !== "empty";
    el.preview.hidden = which !== "preview";
    el.room.hidden = which !== "room";
  }

  function select(kind, c) {
    clearTimeout(s.rTimer);
    s.sel = { kind: kind, id: c.id };
    renderList(el.waiting, s.queue.waiting, "waiting");
    renderList(el.mine, s.queue.mine, "mine");
    if (kind === "waiting") {
      el.pvName.textContent = c.nickname;
      el.pvCrisis.hidden = !c.crisis;
      el.pvText.textContent = c.preview ? "“" + c.preview + "”" : "They haven't written anything yet.";
      el.pvErr.hidden = true;
      el.take.disabled = false;
      showPane("preview");
      el.take.focus();
    } else {
      openRoom(c);
    }
  }

  var CLAIM_ERRORS = {
    too_many: "You already have 3 active chats. Finish or hand one back before taking another.",
    network: "We couldn't connect. Please try again.",
  };
  el.take.addEventListener("click", function () {
    if (!s.sel) return;
    var id = s.sel.id;
    el.take.disabled = true; el.pvErr.hidden = true;
    ZD.call("zd_counsellor_claim", { p_token: s.token, p_chat: id }).then(function (ok) {
      if (ok) { s.sel = { kind: "mine", id: id }; openRoom({ id: id, nickname: el.pvName.textContent, crisis: !el.pvCrisis.hidden }); pollQueue(); }
      else { el.pvErr.textContent = "Another counsellor has just taken this chat."; el.pvErr.hidden = false; s.sel = null; pollQueue(); }
    }, function (err) {
      el.pvErr.textContent = CLAIM_ERRORS[ZD.errorKey(err)] || "Something went wrong. Please try again.";
      el.pvErr.hidden = false; el.take.disabled = false;
    });
  });

  /* ------------------------------------------------------------ the open chat */
  function openRoom(c) {
    s.last = 0; s.seen = {}; s.rErr = 0;
    el.log.textContent = "";
    el.title.textContent = c.nickname;
    el.sub.textContent = "Anonymous visitor";
    el.crisis.hidden = !c.crisis;
    el.ended.hidden = true; el.composer.hidden = false; el.meta.hidden = false;
    el.release.hidden = false; el.close.hidden = false;
    el.msg.value = ""; el.msg.disabled = false;
    showPane("room");
    pollRoom();
    el.msg.focus();
  }

  function fmt(ts) { var d = new Date(ts); return isNaN(d) ? "" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }

  function addMessage(m) {
    if (s.seen[m.id]) return;
    s.seen[m.id] = true;
    var div = document.createElement("div");
    div.className = "bubble bubble--" + (m.sender === "counsellor" ? "me" : m.sender === "user" ? "them" : "system");
    var t = document.createElement("span"); t.textContent = m.body; div.appendChild(t);
    if (m.sender !== "system") { var tm = document.createElement("time"); tm.textContent = fmt(m.at); tm.dateTime = m.at; div.appendChild(tm); }
    el.log.appendChild(div);
  }

  function pollRoom() {
    clearTimeout(s.rTimer);
    if (!s.sel || s.sel.kind !== "mine") return;
    var id = s.sel.id;
    ZD.call("zd_counsellor_poll", { p_token: s.token, p_chat: id, p_after: s.last }).then(function (r) {
      if (!s.sel || s.sel.id !== id) return;
      s.rErr = 0; el.conn.hidden = true;
      var gotUser = false;
      (r.messages || []).forEach(function (m) { addMessage(m); if (m.id > s.last) s.last = m.id; if (m.sender === "user") gotUser = true; });
      if (r.crisis) el.crisis.hidden = false;
      if (r.messages && r.messages.length) {
        el.log.scrollTop = el.log.scrollHeight;
        if (gotUser && document.hidden) beep(1);
      }
      if (r.status === "closed") {
        el.ended.hidden = false; el.composer.hidden = true; el.meta.hidden = true;
        el.release.hidden = true; el.close.hidden = true;
        el.sub.textContent = "Chat ended";
        return;
      }
      s.rTimer = setTimeout(pollRoom, document.hidden ? 6000 : 1800);
    }, function (err) {
      var key = ZD.errorKey(err);
      if (key === "unauthorised") { signedOut("Your session has ended. Please sign in again."); return; }
      if (key === "not_found") { s.sel = null; showPane("empty"); pollQueue(); return; }
      s.rErr++; el.conn.hidden = false;
      s.rTimer = setTimeout(pollRoom, Math.min(15000, 2000 * Math.pow(2, s.rErr)));
    });
  }

  /* ------------------------------------------------------------ replying */
  function updateSend() { el.send.disabled = !el.msg.value.trim() || s.busy; }
  el.msg.addEventListener("input", function () {
    updateSend(); el.msg.style.height = "auto"; el.msg.style.height = Math.min(el.msg.scrollHeight, 140) + "px";
  });
  el.msg.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); el.composer.requestSubmit(); }
  });
  el.composer.addEventListener("submit", function (e) {
    e.preventDefault();
    var body = el.msg.value.trim();
    if (!body || s.busy || !s.sel) return;
    s.busy = true; updateSend();
    ZD.call("zd_counsellor_send", { p_token: s.token, p_chat: s.sel.id, p_body: body }).then(function () {
      el.msg.value = ""; el.msg.style.height = "auto"; pollRoom();
    }, function (err) {
      if (ZD.errorKey(err) === "unauthorised") signedOut("Your session has ended. Please sign in again.");
      else el.conn.hidden = false;
    }).then(function () { s.busy = false; updateSend(); el.msg.focus(); });
  });

  el.release.addEventListener("click", function () {
    if (!s.sel || !window.confirm("Hand this chat back to the queue? The visitor will be told you had to step away.")) return;
    ZD.call("zd_counsellor_release", { p_token: s.token, p_chat: s.sel.id }).then(function () { s.sel = null; showPane("empty"); pollQueue(); }, function () { el.conn.hidden = false; });
  });
  el.close.addEventListener("click", function () {
    if (!s.sel || !window.confirm("End this chat? The visitor will be shown a closing message.")) return;
    ZD.call("zd_counsellor_close", { p_token: s.token, p_chat: s.sel.id }).then(function () { pollRoom(); pollQueue(); }, function () { el.conn.hidden = false; });
  });
  $("#done-btn").addEventListener("click", function () { s.sel = null; showPane("empty"); pollQueue(); });

  /* ------------------------------------------------------------ boot */
  try {
    var saved = JSON.parse(sessionStorage.getItem(STORE) || "null");
    if (saved && saved.token) { s.token = saved.token; s.name = saved.name; enter(); }
    else showView("login");
  } catch (e) { showView("login"); }
  syncAlertButton();
  updateSend();
})();
