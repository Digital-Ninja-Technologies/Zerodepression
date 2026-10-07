(function () {
  "use strict";

  var STORE = "zd_chat_v1";
  var POLL_WAITING = 2500;
  var POLL_ACTIVE = 1800;
  var POLL_HIDDEN = 7000;

  function $(sel) { return document.querySelector(sel); }

  var el = {
    intro: $("#view-intro"),
    room: $("#view-room"),
    pill: $("#availability"),
    form: $("#start-form"),
    nick: $("#nick"),
    startBtn: $("#start-btn"),
    startErr: $("#start-error"),
    title: $("#room-title"),
    sub: $("#room-sub"),
    wait: $("#banner-wait"),
    waitText: $("#wait-text"),
    crisis: $("#banner-crisis"),
    conn: $("#banner-conn"),
    log: $("#log"),
    composer: $("#composer"),
    msg: $("#msg"),
    send: $("#send-btn"),
    count: $("#count"),
    meta: $("#composer-meta"),
    end: $("#end-btn"),
    ended: $("#ended"),
    again: $("#again-btn"),
    clear: $("#clear-btn"),
    quick: $("#quick-exit"),
    notice: $("#intro-notice"),
  };

  var s = { chat: null, token: null, last: 0, status: null, counsellor: null, timer: null,
            errors: 0, busy: false, unread: 0, baseTitle: document.title, seen: {} };

  /* ------------------------------------------------------------ storage (session only) */
  function save() {
    try { sessionStorage.setItem(STORE, JSON.stringify({ chat: s.chat, token: s.token, last: s.last, crisis: !el.crisis.hidden })); } catch (e) { /* private mode */ }
  }
  function load() {
    try { return JSON.parse(sessionStorage.getItem(STORE) || "null"); } catch (e) { return null; }
  }
  function wipe() {
    try { sessionStorage.removeItem(STORE); } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------ views */
  function show(view) {
    el.intro.hidden = view !== "intro";
    el.room.hidden = view !== "room";
    document.title = s.baseTitle;
    if (view === "intro") { refreshAvailability(); }
  }

  function resetState() {
    clearTimeout(s.timer);
    s.chat = s.token = s.status = s.counsellor = null;
    s.last = 0; s.errors = 0; s.unread = 0; s.seen = {};
    el.log.textContent = "";
    el.crisis.hidden = true;
    el.conn.hidden = true;
    el.ended.hidden = true;
    el.composer.hidden = false;
    el.meta.hidden = false;
    el.end.hidden = false;
    el.msg.disabled = false;
    el.msg.value = "";
    updateCount();
  }

  /* ------------------------------------------------------------ availability */
  var availTimer;
  function refreshAvailability() {
    clearTimeout(availTimer);
    if (el.intro.hidden) return;
    ZD.call("zd_chat_availability").then(function (a) {
      var online = Number(a.online) || 0;
      el.pill.dataset.state = online > 0 ? "online" : "offline";
      el.pill.textContent = online > 0
        ? (online === 1 ? "1 counsellor online now" : online + " counsellors online now")
        : "No counsellor online right now. You can still join the queue, or call us.";
    }, function () {
      el.pill.dataset.state = "";
      el.pill.textContent = "Checking availability…";
    }).then(function () { availTimer = setTimeout(refreshAvailability, 20000); });
  }

  /* ------------------------------------------------------------ starting a chat */
  var START_ERRORS = {
    busy: "Our queue is full right now. Please call us on 0800 1100 2200 (free), or try again in a few minutes.",
    rate_limited: "Too many chats have been started from this connection recently. Please call us on 0800 1100 2200 (free), or try again later.",
    network: "We couldn't connect. Check your internet connection and try again, or call us on 0800 1100 2200 (free).",
  };

  el.form.addEventListener("submit", function (e) {
    e.preventDefault();
    el.startErr.hidden = true;
    el.startBtn.disabled = true;
    var label = el.startBtn.textContent;
    el.startBtn.textContent = "Connecting…";
    ZD.call("zd_chat_create", { p_nickname: el.nick.value }).then(function (res) {
      resetState();
      s.chat = res.chat_id; s.token = res.token;
      save();
      enterRoom();
    }, function (err) {
      el.startErr.textContent = START_ERRORS[ZD.errorKey(err)] || "Something went wrong. Please try again, or call us on 0800 1100 2200 (free).";
      el.startErr.hidden = false;
    }).then(function () {
      el.startBtn.disabled = false;
      el.startBtn.textContent = label;
    });
  });

  function enterRoom() {
    show("room");
    setStatus("waiting");
    poll();
    el.msg.focus();
  }

  /* ------------------------------------------------------------ rendering */
  function fmt(ts) {
    var d = new Date(ts);
    return isNaN(d) ? "" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function addMessage(m) {
    if (s.seen[m.id]) return;
    s.seen[m.id] = true;
    var div = document.createElement("div");
    div.className = "bubble bubble--" + (m.sender === "user" ? "me" : m.sender === "counsellor" ? "them" : "system");
    var text = document.createElement("span");
    text.textContent = m.body;            // never innerHTML: messages are untrusted
    div.appendChild(text);
    if (m.sender !== "system") {
      var t = document.createElement("time");
      t.textContent = (m.sender === "counsellor" && s.counsellor ? s.counsellor + " · " : "") + fmt(m.at);
      t.dateTime = m.at;
      div.appendChild(t);
    }
    el.log.appendChild(div);
  }

  function scrollDown(force) {
    var nearBottom = el.log.scrollHeight - el.log.scrollTop - el.log.clientHeight < 140;
    if (force || nearBottom) el.log.scrollTop = el.log.scrollHeight;
  }

  function setStatus(status, ahead, online) {
    var prev = s.status;
    s.status = status;
    if (status === "waiting") {
      el.title.textContent = "Waiting for a counsellor";
      el.sub.textContent = "Anonymous · free";
      el.wait.hidden = false;
      var n = Number(ahead) || 0;
      el.waitText.textContent =
        (online === undefined ? "Connecting you with a counsellor." :
         online > 0 ? "A counsellor will be with you as soon as one is free." : "No counsellor is online at the moment, but you can wait here.") +
        (n > 0 ? " " + n + (n === 1 ? " person is" : " people are") + " ahead of you." : "") +
        " If you'd rather talk now, call us free:";
    } else if (status === "active") {
      el.title.textContent = "Chatting with " + (s.counsellor || "a counsellor");
      el.sub.textContent = "Volunteer counsellor · anonymous";
      el.wait.hidden = true;
      if (prev === "waiting") { announce((s.counsellor || "A counsellor") + " has joined the chat."); }
    } else if (status === "closed") {
      el.title.textContent = "Chat ended";
      el.sub.textContent = "Take care of yourself";
      el.wait.hidden = true;
      el.composer.hidden = true;
      el.meta.hidden = true;
      el.end.hidden = true;
      el.ended.hidden = false;
    }
  }

  var live = $("#live");
  function announce(text) { live.textContent = ""; setTimeout(function () { live.textContent = text; }, 50); }

  /* ------------------------------------------------------------ polling */
  function schedule() {
    clearTimeout(s.timer);
    if (!s.chat || s.status === "closed") return;
    var base = document.hidden ? POLL_HIDDEN : (s.status === "active" ? POLL_ACTIVE : POLL_WAITING);
    var delay = s.errors ? Math.min(15000, 2000 * Math.pow(2, s.errors - 1)) : base;
    s.timer = setTimeout(poll, delay);
  }

  function poll() {
    clearTimeout(s.timer);
    if (!s.chat) return;
    ZD.call("zd_chat_poll", { p_chat: s.chat, p_token: s.token, p_after: s.last }).then(function (r) {
      s.errors = 0;
      el.conn.hidden = true;
      if (r.counsellor) s.counsellor = r.counsellor;
      var incoming = 0;
      (r.messages || []).forEach(function (m) {
        addMessage(m);
        if (m.id > s.last) s.last = m.id;
        if (m.sender === "counsellor") incoming++;
      });
      setStatus(r.status, r.ahead, r.online);
      if (r.messages && r.messages.length) {
        scrollDown(true);
        save();
        if (incoming && document.hidden) {
          s.unread += incoming;
          document.title = "(" + s.unread + ") New message · " + s.baseTitle;
        }
      }
      schedule();
    }, function (err) {
      var key = ZD.errorKey(err);
      if (key === "not_found") {
        wipe(); resetState();
        el.notice.textContent = "That chat is no longer available. You can start a new one any time.";
        el.notice.hidden = false;
        show("intro");
        return;
      }
      s.errors++;
      el.conn.hidden = false;
      schedule();
    });
  }

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) { s.unread = 0; document.title = s.baseTitle; if (s.chat) poll(); }
  });

  /* ------------------------------------------------------------ sending */
  function updateCount() {
    var n = el.msg.value.length;
    el.count.textContent = n + " / 2000";
    el.send.disabled = !el.msg.value.trim() || s.busy;
  }
  el.msg.addEventListener("input", function () {
    updateCount();
    el.msg.style.height = "auto";
    el.msg.style.height = Math.min(el.msg.scrollHeight, 140) + "px";
  });
  el.msg.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); el.composer.requestSubmit(); }
  });

  el.composer.addEventListener("submit", function (e) {
    e.preventDefault();
    var body = el.msg.value.trim();
    if (!body || s.busy || !s.chat) return;
    s.busy = true; updateCount();
    ZD.call("zd_chat_send", { p_chat: s.chat, p_token: s.token, p_body: body }).then(function (res) {
      el.msg.value = ""; el.msg.style.height = "auto";
      if (res && res.crisis) { el.crisis.hidden = false; }
      save();
      poll();
    }, function (err) {
      var key = ZD.errorKey(err);
      if (key === "slow_down") { announce("Please wait a moment before sending another message."); return; }
      if (key === "closed" || key === "not_found") { poll(); return; }
      if (key === "too_long") { announce("That message is too long."); return; }
      el.conn.hidden = false;
    }).then(function () {
      s.busy = false; updateCount(); el.msg.focus();
    });
  });

  /* ------------------------------------------------------------ ending / clearing */
  el.end.addEventListener("click", function () {
    if (!s.chat || !window.confirm("End this chat? You can start a new one any time.")) return;
    ZD.call("zd_chat_end", { p_chat: s.chat, p_token: s.token }).then(poll, poll);
  });

  el.again.addEventListener("click", function () {
    wipe(); resetState(); el.notice.hidden = true; show("intro"); el.nick.focus();
  });

  el.clear.addEventListener("click", function () {
    wipe(); resetState(); el.notice.hidden = true; show("intro");
    el.notice.textContent = "This conversation has been cleared from this device.";
    el.notice.hidden = false;
  });

  /* ------------------------------------------------------------ quick exit (button or Esc twice) */
  function quickExit() {
    wipe();
    try { sessionStorage.clear(); } catch (e) { /* ignore */ }
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

  /* ------------------------------------------------------------ boot */
  var saved = load();
  if (saved && saved.chat && saved.token) {
    // Messages aren't kept in the browser, so a resumed chat re-fetches its whole history.
    s.chat = saved.chat; s.token = saved.token; s.last = 0;
    el.crisis.hidden = !saved.crisis;
    enterRoom();
  } else {
    show("intro");
  }
  updateCount();
})();
