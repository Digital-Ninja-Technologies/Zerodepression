(function () {
  "use strict";

  function $(sel) { return document.querySelector(sel); }

  var CRISIS = /(suicid|kill myself|end my life|end it all|take my own life|want to die|wanna die|wan die|rather be dead|better off dead|dont want to (live|be alive)|don't want to (live|be alive)|no reason to live|hurt myself|harm myself|self.?harm|cut myself|overdose)/i;
  var MIN_GAP = 750;          // ms between messages (the server enforces 600)
  var HEARTBEAT = 25000;      // ms between "still here" pings
  var ONLINE_EVERY = 12000;   // ms between availability checks

  var el = {
    intro: $("#view-intro"), room: $("#view-room"), pill: $("#availability"),
    form: $("#start-form"), nick: $("#nick"), startBtn: $("#start-btn"), startErr: $("#start-error"),
    title: $("#room-title"), sub: $("#room-sub"),
    wait: $("#banner-wait"), waitText: $("#wait-text"), crisis: $("#banner-crisis"), conn: $("#banner-conn"),
    log: $("#log"), composer: $("#composer"), msg: $("#msg"), send: $("#send-btn"), count: $("#count"), meta: $("#composer-meta"),
    end: $("#end-btn"), ended: $("#ended"), again: $("#again-btn"), clear: $("#clear-btn"),
    quick: $("#quick-exit"), notice: $("#intro-notice"), live: $("#live"),
  };

  var cfg = window.ZD_FIREBASE_CONFIG;
  var configured = !!(cfg && cfg.apiKey && cfg.projectId && !/^REPLACE/.test(cfg.apiKey));
  var fb = configured ? window.ZDFB.init(cfg) : null;

  var s = { uid: null, status: null, counsellor: null, online: undefined, unsubs: [], nodes: {}, lastSent: 0, busy: false,
            hasPreview: false, hbTimer: null, onlineTimer: null, unread: 0, baseTitle: document.title, firstChat: true, booted: false };

  function announce(text) { el.live.textContent = ""; setTimeout(function () { el.live.textContent = text; }, 50); }

  /* ------------------------------------------------------------ views */
  function show(view) {
    el.intro.hidden = view !== "intro";
    el.room.hidden = view !== "room";
    document.title = s.baseTitle;
    if (view === "intro") checkOnline();
  }

  function unsubAll() { s.unsubs.forEach(function (u) { try { u(); } catch (e) { /* ignore */ } }); s.unsubs = []; }

  function resetRoom() {
    unsubAll();
    clearInterval(s.hbTimer);
    s.uid = s.status = s.counsellor = null; s.nodes = {}; s.unread = 0; s.hasPreview = false; s.firstChat = true;
    el.log.textContent = "";
    el.crisis.hidden = true; el.conn.hidden = true; el.ended.hidden = true;
    el.composer.hidden = false; el.meta.hidden = false; el.end.hidden = false;
    el.msg.disabled = false; el.msg.value = ""; updateCount();
  }

  /* ------------------------------------------------------------ availability */
  function renderPill() {
    if (!configured) { el.pill.dataset.state = "offline"; el.pill.textContent = "Chat isn't available yet. Please call us instead."; return; }
    if (s.online === undefined) { el.pill.dataset.state = ""; el.pill.textContent = "Checking availability…"; return; }
    el.pill.dataset.state = s.online > 0 ? "online" : "offline";
    el.pill.textContent = s.online > 0
      ? (s.online === 1 ? "1 counsellor online now" : s.online + " counsellors online now")
      : "No counsellor online right now. You can still join the queue, or call us.";
  }

  function checkOnline() {
    clearTimeout(s.onlineTimer);
    if (!configured) { renderPill(); return; }
    fb.visitor.online().then(function (n) { s.online = n; }, function () { /* keep last value */ }).then(function () {
      renderPill(); renderWait();
      s.onlineTimer = setTimeout(checkOnline, ONLINE_EVERY);
    });
  }

  /* ------------------------------------------------------------ starting */
  var START_ERRORS = {
    network: "We couldn't connect. Check your internet connection and try again, or call us on 0800 1100 2200 (free).",
    "auth/network-request-failed": "We couldn't connect. Check your internet connection and try again, or call us on 0800 1100 2200 (free).",
    "auth/too-many-requests": "Too many chats have been started from this connection recently. Please call us on 0800 1100 2200 (free), or try again later.",
    "permission-denied": "We couldn't start the chat just now. Please try again in a moment, or call us on 0800 1100 2200 (free).",
  };

  if (!configured) {
    el.startBtn.disabled = true;
    el.startErr.textContent = "Chat isn't switched on yet. Please call us free on 0800 1100 2200.";
    el.startErr.hidden = false;
  }

  el.form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!configured) return;
    el.startErr.hidden = true; el.startBtn.disabled = true;
    var label = el.startBtn.textContent; el.startBtn.textContent = "Connecting…";
    var nick = el.nick.value.replace(/[<>\r\n\t]/g, "").trim().slice(0, 24) || "Friend";
    resetRoom();
    fb.visitor.start(nick).then(function (uid) { enterRoom(uid); }, function (err) {
      var code = (err && (err.code || "")).toString();
      el.startErr.textContent = START_ERRORS[code] || START_ERRORS[code.replace(/^.*\//, "")] ||
        "Something went wrong. Please try again, or call us on 0800 1100 2200 (free).";
      el.startErr.hidden = false;
    }).then(function () { el.startBtn.disabled = false; el.startBtn.textContent = label; });
  });

  function enterRoom(uid) {
    resetRoom();
    s.uid = uid;
    s.lastSent = Date.now();                          // the server's throttle also counts from chat creation
    show("room");
    addNotice("You're connected anonymously. A volunteer counsellor will join you shortly. You can start typing now.");
    setStatus("waiting");
    s.unsubs.push(fb.visitor.watchChat(uid, onChat, onLost));
    s.unsubs.push(fb.visitor.watchMessages(uid, onMessages, onLost));
    s.hbTimer = setInterval(beat, HEARTBEAT);
    el.msg.focus();
  }

  function beat() {
    if (!s.uid || document.hidden || s.status === "closed") return;
    fb.visitor.heartbeat(s.uid).then(function () { el.conn.hidden = true; }, function () { /* offline handler shows banner */ });
  }

  function onLost() {
    // The chat is gone or no longer ours (e.g. deleted after 7 days).
    var had = s.uid;
    resetRoom();
    if (had) { fb.visitor.leave().catch(function () {}); }
    el.notice.textContent = "That chat is no longer available. You can start a new one any time.";
    el.notice.hidden = false;
    show("intro");
  }

  /* ------------------------------------------------------------ rendering */
  function fmt(ts) {
    var d = new Date(ts);
    return isNaN(d) ? "" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function addNotice(text) {
    var div = document.createElement("div");
    div.className = "bubble bubble--system";
    div.textContent = text;
    el.log.appendChild(div);
    scrollDown(true);
  }

  // The log mirrors the Firestore snapshot: new messages are added, and any that disappear (for example a
  // local write the server rejected) are removed. Unconfirmed messages are shown dimmed until they land.
  function buildBubble(m) {
    var div = document.createElement("div");
    div.className = "bubble bubble--" + (m.sender === "user" ? "me" : "them");
    var text = document.createElement("span");
    text.textContent = m.body;                       // never innerHTML: messages are untrusted
    div.appendChild(text);
    var t = document.createElement("time");
    t.textContent = (m.sender === "counsellor" && s.counsellor ? s.counsellor + " · " : "") + fmt(m.createdAt || Date.now());
    div.appendChild(t);
    return div;
  }

  function scrollDown(force) {
    var near = el.log.scrollHeight - el.log.scrollTop - el.log.clientHeight < 140;
    if (force || near) el.log.scrollTop = el.log.scrollHeight;
  }

  function onMessages(list) {
    var ids = {}, incoming = 0;
    list.forEach(function (m) { ids[m.id] = true; });
    Object.keys(s.nodes).forEach(function (id) { if (!ids[id]) { s.nodes[id].remove(); delete s.nodes[id]; } });
    list.forEach(function (m) {
      var node = s.nodes[m.id];
      if (!node) {
        node = buildBubble(m);
        s.nodes[m.id] = node;
        el.log.appendChild(node);
        if (m.sender === "counsellor" && !m.pending) incoming++;
      }
      node.style.opacity = m.pending ? "0.6" : "";
    });
    if (list.length) scrollDown(true);
    if (incoming && document.hidden) { s.unread += incoming; document.title = "(" + s.unread + ") New message · " + s.baseTitle; }
  }

  function renderWait() {
    if (s.status !== "waiting") return;
    el.waitText.textContent =
      (s.online === undefined ? "Connecting you with a counsellor." :
       s.online > 0 ? "A counsellor will be with you as soon as one is free." :
       "No counsellor is online at the moment, but you can wait here.") + " If you'd rather talk now, call us free:";
  }

  function setStatus(status) {
    s.status = status;
    if (status === "waiting") {
      el.title.textContent = "Waiting for a counsellor";
      el.sub.textContent = "Anonymous · free";
      el.wait.hidden = false; renderWait();
    } else if (status === "active") {
      el.title.textContent = "Chatting with " + (s.counsellor || "a counsellor");
      el.sub.textContent = "Volunteer counsellor · anonymous";
      el.wait.hidden = true;
    } else if (status === "closed") {
      el.title.textContent = "Chat ended";
      el.sub.textContent = "Take care of yourself";
      el.wait.hidden = true; el.composer.hidden = true; el.meta.hidden = true; el.end.hidden = true; el.ended.hidden = false;
    }
  }

  function onChat(chat) {
    if (!chat) { onLost(); return; }
    var prev = s.status, prevName = s.counsellor;
    if (chat.counsellorName) s.counsellor = chat.counsellorName;
    s.hasPreview = !!chat.preview;
    if (chat.crisis) el.crisis.hidden = false;
    var first = s.firstChat; s.firstChat = false;

    if (chat.status !== prev) {
      if (!first) {
        if (prev === "waiting" && chat.status === "active") {
          addNotice(chat.counsellorName + " has joined. You're talking with a volunteer counsellor, and this chat is anonymous.");
          announce(chat.counsellorName + " has joined the chat.");
        } else if (prev === "active" && chat.status === "waiting") {
          addNotice((prevName || "The counsellor") + " had to step away. We're finding another counsellor for you. Please stay on this page.");
        } else if (chat.status === "closed" && prev !== "closed") {
          addNotice(chat.closedBy === "counsellor"
            ? "The counsellor ended the chat. Thank you for reaching out. You are welcome back any time, and you can call 0800 1100 2200 (free) whenever you need to talk."
            : "You ended the chat. Take care of yourself. You are always welcome back.");
        }
      }
      setStatus(chat.status);
    } else if (chat.status === "active") { setStatus("active"); }
  }

  /* ------------------------------------------------------------ sending */
  function updateCount() {
    el.count.textContent = el.msg.value.length + " / 2000";
    el.send.disabled = !el.msg.value.trim() || s.busy;
  }
  el.msg.addEventListener("input", function () {
    updateCount(); el.msg.style.height = "auto"; el.msg.style.height = Math.min(el.msg.scrollHeight, 140) + "px";
  });
  el.msg.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); el.composer.requestSubmit(); }
  });

  // The box is cleared as soon as the message is submitted (so anything typed while it sends is kept).
  // If the send fails, the text is put back, unless the user has already started typing something else.
  function restore(body) {
    if (!el.msg.value) { el.msg.value = body; el.msg.style.height = "auto"; el.msg.style.height = Math.min(el.msg.scrollHeight, 140) + "px"; }
    updateCount();
  }

  function doSend(body, attempt) {
    var crisis = CRISIS.test(body);
    var opts = { crisis: crisis, preview: s.hasPreview ? null : body.slice(0, 140) };
    return fb.visitor.send(s.uid, body, opts).then(function () {
      s.lastSent = Date.now(); s.hasPreview = true; el.conn.hidden = true;
      if (crisis) el.crisis.hidden = false;
    }, function (err) {
      var code = (err && err.code) || "";
      if (code === "permission-denied" && attempt < 1) {            // most likely the 600ms throttle: retry once
        return new Promise(function (r) { setTimeout(r, 800); }).then(function () { return doSend(body, attempt + 1); });
      }
      restore(body);
      if (code === "permission-denied") { announce("That message couldn't be sent. The chat may have ended."); return; }
      el.conn.hidden = false;
    });
  }

  el.composer.addEventListener("submit", function (e) {
    e.preventDefault();
    var body = el.msg.value.trim();
    if (!body || !s.uid) return;
    if (s.busy) { s.queued = true; return; }          // Enter pressed mid-send: send it as soon as the last one lands
    el.msg.value = ""; el.msg.style.height = "auto";
    var wait = MIN_GAP - (Date.now() - s.lastSent);
    s.busy = true; updateCount();
    new Promise(function (r) { setTimeout(r, Math.max(0, wait)); })
      .then(function () { return doSend(body, 0); })
      .then(function () {
        s.busy = false; updateCount(); el.msg.focus();
        if (s.queued) { s.queued = false; if (el.msg.value.trim()) el.composer.requestSubmit(); }
      });
  });

  /* ------------------------------------------------------------ ending / clearing */
  el.end.addEventListener("click", function () {
    if (!s.uid || !window.confirm("End this chat? You can start a new one any time.")) return;
    fb.visitor.end(s.uid).catch(function () { el.conn.hidden = false; });
  });

  function backToIntro(message) {
    resetRoom();
    fb.visitor.leave().catch(function () {});
    el.notice.hidden = !message; el.notice.textContent = message || "";
    show("intro");
  }
  el.again.addEventListener("click", function () { backToIntro(""); el.nick.focus(); });
  el.clear.addEventListener("click", function () { backToIntro("This conversation has been cleared from this device."); });

  /* ------------------------------------------------------------ quick exit (button or Esc twice) */
  function quickExit() {
    unsubAll();
    try { sessionStorage.clear(); localStorage.removeItem("zd_staff_email"); } catch (e) { /* ignore */ }
    if (fb) { fb.visitor.leave().catch(function () {}); }
    window.location.replace("https://www.google.com/");
  }
  el.quick.addEventListener("click", quickExit);
  var lastEsc = 0;
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var now = Date.now();
    if (now - lastEsc < 800) quickExit();
    lastEsc = now;
  });

  /* ------------------------------------------------------------ connectivity + visibility */
  window.addEventListener("offline", function () { if (s.uid) el.conn.hidden = false; });
  window.addEventListener("online", function () { el.conn.hidden = true; beat(); });
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) { s.unread = 0; document.title = s.baseTitle; beat(); }
  });

  /* ------------------------------------------------------------ boot */
  updateCount();
  renderPill();
  if (!configured) { show("intro"); return; }
  fb.visitor.onAuth(function () {
    if (s.booted) return;
    s.booted = true;
    fb.visitor.existingChat().then(function (found) {
      if (found && found.chat.status !== undefined) {
        enterRoom(found.uid);
        if (found.chat.status === "closed") setStatus("closed");
      } else { show("intro"); }
    }, function () { show("intro"); });
  });
})();
