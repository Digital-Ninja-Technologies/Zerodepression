(function () {
  "use strict";

  var EMAIL_KEY = "zd_staff_email";
  var BEAT = 45000;            // presence heartbeat
  var STALE_WAITING = 3 * 60000; // hide waiting chats whose visitor has gone quiet
  var ONLINE_MS = 8 * 3600000;  // Online toggle switches itself off after 8 hours
  var DEVICE_KEY = "zd_push_device";

  function $(sel) { return document.querySelector(sel); }

  var el = {
    login: $("#view-login"), inbox: $("#view-inbox"),
    form: $("#login-form"), email: $("#c-email"), loginBtn: $("#login-btn"), loginErr: $("#login-error"), loginInfo: $("#login-info"),
    name: $("#me-name"), logout: $("#logout-btn"), conn: $("#banner-conn-top"),
    onlineBtn: $("#online-toggle"), onlineStatus: $("#online-status"), onlineHint: $("#online-hint"),
    waiting: $("#list-waiting"), mine: $("#list-mine"), contacts: $("#list-contacts"), followups: $("#list-followups"),
    pane: $("#pane-contact"), ctName: $("#ct-name"), ctMeta: $("#ct-meta"), ctDetails: $("#ct-details"), ctKind: $("#ct-contact-kind"),
    ctLink: $("#ct-contact-link"), ctNote: $("#ct-note"), ctHint: $("#ct-hint"), ctErr: $("#ct-error"),
    ctAccept: $("#ct-accept"), ctDone: $("#ct-done"), ctRelease: $("#ct-release"),
    empty: $("#pane-empty"), preview: $("#pane-preview"), room: $("#pane-room"),
    pvName: $("#pv-name"), pvCrisis: $("#pv-crisis"), pvText: $("#pv-text"), take: $("#take-btn"), pvErr: $("#pv-error"),
    title: $("#room-title"), sub: $("#room-sub"), crisis: $("#banner-crisis"),
    log: $("#log"), composer: $("#composer"), msg: $("#msg"), send: $("#send-btn"), meta: $("#composer-meta"),
    adminLink: $("#admin-link"), release: $("#release-btn"), close: $("#close-btn"), ended: $("#ended"),
  };

  var cfg = window.ZD_FIREBASE_CONFIG;
  var configured = !!(cfg && cfg.apiKey && cfg.projectId && !/^REPLACE/.test(cfg.apiKey));
  var fb = configured ? window.ZDFB.init(cfg) : null;

  var s = { user: null, name: null, waiting: [], mine: [], contacts: [], followups: [], knownContacts: null, claiming: null, sel: null, chatUnsubs: [], unsubs: [], nodes: {}, known: null,
            knownCrisis: {}, beatTimer: null, renderTimer: null, busy: false, baseTitle: document.title, audio: null,
            lastChat: null, onlineUntil: null, onlineTimer: null, pushState: null };

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
    "auth/quota-exceeded": "Firebase's daily limit for sign-in emails has been reached. Try again tomorrow, or an admin can sign in with email and password at /admin-dashboard/.",
    "auth/operation-not-allowed": "Email-link sign-in isn't turned on in Firebase (Authentication > Sign-in method > Email/Password > Email link).",
    "auth/missing-continue-uri": "This website isn't set up for sign-in links yet. Ask the admin to check Firebase Authentication settings.",
    "auth/invalid-continue-uri": "This website isn't set up for sign-in links yet. Ask the admin to check Firebase Authentication settings.",
    "auth/missing-email": "Please enter your email address.",
    "auth/user-disabled": "This account has been disabled. Ask an admin for help.",
    "auth/invalid-email": "That doesn't look like a valid email address.",
    "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
    "auth/network-request-failed": "We couldn't connect. Check your internet connection and try again.",
    "auth/invalid-action-code": "That sign-in link has expired or was already used. Request a new one.",
    "auth/expired-action-code": "That sign-in link has expired. Request a new one.",
    "auth/unauthorized-continue-uri": "This website isn't authorised for sign-in yet. Ask the admin to add it in Firebase Authentication settings.",
  };
  function errText(err) {
    var code = err && err.code ? String(err.code) : "";
    return LOGIN_ERRORS[code] || ("Something went wrong" + (code ? " (" + code.replace(/^auth\//, "") + ")" : "") + ". Please try again, and if it keeps happening tell an admin this message.");
  }

  // Sends the sign-in email from our own domain (api/staff-link.js), so staff sign-in isn't capped by Firebase's
  // small daily email allowance. Falls back to Firebase's own email if our sender is unavailable.
  function sendStaffLink(email, page, continueUrl) {
    function fail(code) { var e = new Error(code); e.code = code; throw e; }
    return fetch("/api/staff-link", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, page: page }) }).then(function (r) {
      if (r.ok) return;
      if (r.status === 400) fail("auth/invalid-email");
      if (r.status === 429) fail("auth/too-many-requests");
      return fb.staff.sendLink(email, continueUrl);
    }, function () { return fb.staff.sendLink(email, continueUrl); });
  }

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
    sendStaffLink(email, "counsellor", location.origin + "/counsellor/").then(function () {
      try { localStorage.setItem(EMAIL_KEY, email); } catch (e2) { /* ignore */ }
      loginMessage("info", "Check your email for a sign-in link, then open it on this device. It can take a minute.");
    }, function (err) { loginMessage("error", errText(err)); }).then(function () { el.loginBtn.disabled = false; });
  });

  el.logout.addEventListener("click", function () { signOutNow("You've been signed out."); });

  function signOutNow(message) {
    if (message && s.onlineUntil && s.onlineUntil > Date.now()) {
      message += " You're still online and will get alerts until " + clock(s.onlineUntil) + ". Sign in and switch Online off to stop them.";
    }
    teardown();
    s.user = null; s.name = null;
    if (fb) fb.staff.signOut().catch(function () {});      // immediate; the "online" marker expires by itself in 2 minutes
    showView("login"); loginMessage(message ? "info" : "", message || "");
    el.email.focus();
  }

  function teardown() {
    s.unsubs.concat(s.chatUnsubs).forEach(function (u) { try { u(); } catch (e) { /* ignore */ } });
    s.unsubs = []; s.chatUnsubs = [];
    clearInterval(s.beatTimer); clearInterval(s.renderTimer); clearTimeout(s.onlineTimer);
    s.onlineUntil = null; renderOnline();
    s.sel = null; s.known = null; s.knownCrisis = {}; s.waiting = []; s.mine = []; s.contacts = []; s.followups = []; s.knownContacts = null;
    showPane("empty");
    document.title = s.baseTitle;
  }

  /* ------------------------------------------------------------ inbox */
  function enter(user, profile) {
    s.user = user; s.name = profile.displayName;
    el.name.textContent = s.name;
    el.adminLink.hidden = profile.role !== "admin";
    showView("inbox");
    var beat = function () { if (!document.hidden) fb.staff.heartbeat(user.uid).then(function () { el.conn.hidden = true; }, function () { el.conn.hidden = false; }); };
    beat(); s.beatTimer = setInterval(beat, BEAT);
    s.renderTimer = setInterval(renderLists, 15000);
    s.unsubs.push(fb.staff.watchWaiting(function (list) { s.waiting = list; el.conn.hidden = true; onQueue(); }, onQueueError));
    s.unsubs.push(fb.staff.watchMine(user.uid, function (list) { var before = s.mine; s.mine = list; renderLists(); checkGone(before, list); }, onQueueError));
    s.unsubs.push(fb.staff.watchNewContacts(function (list) { s.contacts = list; onContacts(); }, onQueueError));
    s.unsubs.push(fb.staff.watchMyContacts(user.uid, function (list) { s.followups = list; renderContacts(); }, onQueueError));
    s.unsubs.push(fb.staff.watchPresence(user.uid, function (p) { s.onlineUntil = p.onlineUntil; renderOnline(); }, function () {}));
    refreshPushState();
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

  /* ------------------------------------------------------------ contact requests (people who left their details) */
  var HOW = { whatsapp: "a WhatsApp message", call: "a phone call", email: "an email" };
  var KIND = { whatsapp: "WhatsApp:", call: "Phone:", email: "Email:" };

  function onContacts() {
    var ids = {}; s.contacts.forEach(function (c) { ids[c.id] = true; });
    if (s.knownContacts) {
      var fresh = s.contacts.filter(function (c) { return !s.knownContacts[c.id]; });
      if (fresh.length) beep(1);
    }
    s.knownContacts = ids;
    renderContacts();
    // a request someone else accepted disappears from the queue
    if (s.sel && s.sel.kind === "contact-new" && !ids[s.sel.id] && s.claiming !== s.sel.id) { s.sel = null; showPane("empty"); }
  }

  function renderContactList(listEl, items, kind) {
    listEl.textContent = "";
    if (!items.length) {
      var li0 = document.createElement("li"), p = document.createElement("p");
      p.className = "empty";
      p.textContent = kind === "contact-new" ? "No contact requests right now." : "You have no follow-ups.";
      li0.appendChild(p); listEl.appendChild(li0); return;
    }
    items.forEach(function (c) {
      var li = document.createElement("li"), b = document.createElement("button");
      b.type = "button"; b.className = "qitem";
      if (s.sel && s.sel.kind === kind && s.sel.id === c.id) b.setAttribute("aria-current", "true");
      var strong = document.createElement("strong"), nm = document.createElement("span");
      nm.textContent = c.name; strong.appendChild(nm);
      var small = document.createElement("small");
      small.textContent = "Wants " + (HOW[c.method] || "a reply") + " · " + ago(kind === "contact-new" ? c.createdAt : c.claimedAt);
      b.appendChild(strong); b.appendChild(small);
      b.addEventListener("click", function () { selectContact(kind, c); });
      li.appendChild(b); listEl.appendChild(li);
    });
  }

  function renderContacts() {
    renderContactList(el.contacts, s.contacts.slice().sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); }), "contact-new");
    renderContactList(el.followups, s.followups.slice().sort(function (a, b) { return (a.claimedAt || 0) - (b.claimedAt || 0); }), "contact-mine");
  }

  function contactLink(method, value) {
    var digits = value.replace(/\D/g, "");
    if (method === "email") return "mailto:" + encodeURIComponent(value);
    if (method === "whatsapp") return "https://wa.me/" + (digits.charAt(0) === "0" ? "234" + digits.slice(1) : digits);
    return "tel:" + (value.trim().charAt(0) === "+" ? "+" : "") + digits;
  }

  function contactErr(text) { el.ctErr.textContent = text || ""; el.ctErr.hidden = !text; }

  function selectContact(kind, c) {
    unwatchChat();
    s.sel = { kind: kind, id: c.id, method: c.method, name: c.name };
    renderLists(); renderContacts();
    contactErr("");
    el.ctName.textContent = c.name;
    el.ctMeta.textContent = "Would like " + (HOW[c.method] || "a reply") + " · sent " + ago(c.createdAt);
    el.ctDetails.hidden = true; el.ctLink.textContent = ""; el.ctNote.textContent = "";
    var isNew = kind === "contact-new";
    el.ctAccept.hidden = !isNew; el.ctAccept.disabled = false;
    el.ctDone.hidden = isNew; el.ctRelease.hidden = isNew;
    el.ctHint.textContent = isNew
      ? "Accept this request to see their contact details. The first counsellor to accept follows up, and the request disappears for everyone else."
      : "Loading their details…";
    showPane("contact");
    revealPane(el.pane, isNew ? el.ctAccept : null);
    if (isNew) return;
    showContactDetails(c);
  }

  function showContactDetails(c) {
    fb.staff.contactDetails(c.id).then(function (d) {
      if (!s.sel || s.sel.id !== c.id) return;
      if (!d) { el.ctHint.textContent = "The details are no longer available."; return; }
      el.ctKind.textContent = KIND[c.method] || "Contact:";
      el.ctLink.textContent = d.contact;
      el.ctLink.href = contactLink(c.method, d.contact);
      if (c.method === "whatsapp") { el.ctLink.target = "_blank"; } else { el.ctLink.removeAttribute("target"); }
      el.ctNote.textContent = d.note ? "Note: " + d.note : "";
      el.ctDetails.hidden = false;
      el.ctHint.textContent = "Follow up with them, then mark this as followed up. Their details are deleted when you do.";
    }, function () { el.ctHint.textContent = ""; contactErr("We couldn't load their details. Please try again."); });
  }

  el.ctAccept.addEventListener("click", function () {
    if (!s.sel || s.sel.kind !== "contact-new" || !s.user) return;
    var sel = s.sel;
    el.ctAccept.disabled = true; contactErr("");
    s.claiming = sel.id;   // the queue snapshot drops the request the moment we claim it; don't treat that as "taken"
    fb.staff.claimContact(sel.id, s.user.uid, s.name).then(function () {
      s.claiming = null;
      var c = { id: sel.id, name: sel.name, method: sel.method, createdAt: Date.now() };
      s.sel = { kind: "contact-mine", id: sel.id, method: sel.method, name: sel.name };
      showPane("contact"); renderContacts();
      el.ctAccept.hidden = true; el.ctDone.hidden = false; el.ctRelease.hidden = false;
      el.ctHint.textContent = "Loading their details…";
      showContactDetails(c);
    }, function (err) {
      s.claiming = null;
      var taken = err && err.code === "permission-denied";
      contactErr(taken ? "Another counsellor has just accepted this request." : "We couldn't accept this request. Please try again.");
      el.ctAccept.disabled = false;
      if (taken) s.sel = null;
    });
  });

  el.ctDone.addEventListener("click", function () {
    if (!s.sel || s.sel.kind !== "contact-mine") return;
    if (!window.confirm("Mark this request as followed up? Their contact details will be deleted.")) return;
    var id = s.sel.id;
    fb.staff.finishContact(id).then(function () { s.sel = null; showPane("empty"); renderContacts(); }, function () { contactErr("We couldn't update this request. Please try again."); });
  });

  el.ctRelease.addEventListener("click", function () {
    if (!s.sel || s.sel.kind !== "contact-mine") return;
    if (!window.confirm("Hand this request back to the queue? Another counsellor will be able to accept it.")) return;
    fb.staff.releaseContact(s.sel.id).then(function () { s.sel = null; showPane("empty"); renderContacts(); }, function () { contactErr("We couldn't hand this back. Please try again."); });
  });


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

  /* ------------------------------------------------------------ Online toggle + push alerts */
  var PUSH_KEY = window.ZD_PUSH_PUBLIC_KEY || "";

  function clock(ms) {
    try { return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; }
  }
  function isOnline() { return !!(s.onlineUntil && s.onlineUntil > Date.now()); }
  function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
  function isStandalone() { return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true; }
  function pushSupported() { return !!(PUSH_KEY && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window); }

  function renderOnline() {
    if (!el.onlineBtn) return;
    var on = isOnline();
    el.onlineBtn.setAttribute("aria-checked", on ? "true" : "false");
    el.onlineStatus.dataset.state = on ? "on" : "off";
    var how = s.pushState === "on" ? "push on this device and email"
      : s.pushState === "denied" ? "email only (notifications are blocked for this site in your browser settings)"
      : s.pushState === "unsupported" ? "email only (this browser can't receive push alerts)"
      : "email";
    el.onlineStatus.textContent = on
      ? "Online until " + clock(s.onlineUntil) + ". Alerts: " + how + ", even when this page is closed."
      : "Offline. Switch on to stay online for up to 8 hours and get alerts even when this page is closed.";
    var hint = "";
    if (on && isIOS() && !isStandalone()) hint = "On iPhone or iPad, push alerts only work from the Home Screen: tap Share, then Add to Home Screen, open the inbox from there and switch Online on again.";
    el.onlineHint.textContent = hint; el.onlineHint.hidden = !hint;
    clearTimeout(s.onlineTimer);
    if (on) s.onlineTimer = setTimeout(renderOnline, Math.min(s.onlineUntil - Date.now() + 1000, 2147483000));
  }

  function b64ToBytes(b64) {
    var pad = "=".repeat((4 - (b64.length % 4)) % 4);
    var raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function deviceIdFor(endpoint) {
    var enc = new TextEncoder().encode(endpoint);
    return crypto.subtle.digest("SHA-256", enc).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("").slice(0, 40);
    });
  }

  // What push can do on this device right now, without prompting.
  function refreshPushState() {
    if (!pushSupported()) { s.pushState = "unsupported"; renderOnline(); return; }
    if (Notification.permission === "denied") { s.pushState = "denied"; renderOnline(); return; }
    navigator.serviceWorker.getRegistration("/counsellor/").then(function (reg) {
      return reg ? reg.pushManager.getSubscription() : null;
    }).then(function (sub) { s.pushState = sub && Notification.permission === "granted" ? "on" : null; renderOnline(); },
      function () { s.pushState = null; renderOnline(); });
  }

  // Asks for permission (must run from a click), subscribes this device and saves the subscription.
  function enablePush() {
    if (!pushSupported()) return Promise.resolve("unsupported");
    return Notification.requestPermission().then(function (perm) {
      if (perm !== "granted") return perm === "denied" ? "denied" : null;
      return navigator.serviceWorker.register("/counsellor/sw.js", { scope: "/counsellor/" }).then(function () {
        return navigator.serviceWorker.ready;
      }).then(function (reg) {
        return reg.pushManager.getSubscription().then(function (sub) {
          return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(PUSH_KEY) });
        });
      }).then(function (sub) {
        var j = sub.toJSON();
        return deviceIdFor(sub.endpoint).then(function (id) {
          try { localStorage.setItem(DEVICE_KEY, id); } catch (e) { /* ignore */ }
          return fb.staff.savePushDevice(s.user.uid, id, { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
        });
      }).then(function () { return "on"; });
    }).catch(function () { return null; });
  }

  if (el.onlineBtn) el.onlineBtn.addEventListener("click", function () {
    if (!s.user) return;
    beep(1);   // unlocks sound for in-page alerts (browsers need a click first)
    el.onlineBtn.disabled = true;
    var wasOn = isOnline();
    var work = wasOn
      ? fb.staff.setOnline(s.user.uid, null)
      : enablePush().then(function (state) {
          s.pushState = state;
          return fb.staff.setOnline(s.user.uid, Date.now() + ONLINE_MS);
        });
    work.then(function () { el.conn.hidden = true; }, function () {
      el.onlineStatus.textContent = "Couldn't change your status. Check your connection and try again.";
    }).then(function () { el.onlineBtn.disabled = false; });
  });

  function notifyNew(fresh) {
    var crisis = fresh.some(function (c) { return c.crisis; });
    beep(crisis ? 3 : 1);
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
      try {
        new Notification(crisis ? "A visitor may be in crisis" : "New anonymous chat waiting", {
          body: fresh.length === 1 ? "Someone would like to talk." : fresh.length + " people would like to talk.", tag: "zd-chat",
        });
      } catch (e) { /* ignore */ }
    }
  }

  /* ------------------------------------------------------------ "visitor ended the chat" popup */
  // A chat drops out of "my chats" when it's closed or handed back. Look it up once; if the visitor closed it, tell
  // the counsellor with a popup (plus a sound, and a system notification when the tab is in the background).
  var endedDialog = $("#ended-dialog"), endedQueue = [], endedShowing = null;
  function checkGone(before, now) {
    if (!s.user) return;
    var still = {};
    now.forEach(function (c) { still[c.id] = true; });
    before.forEach(function (c) {
      if (still[c.id]) return;
      var done = false, unsub = null;
      unsub = fb.staff.watchChat(c.id, function (chat) {
        if (done) return; done = true;
        setTimeout(function () { if (unsub) unsub(); }, 0);
        if (chat && chat.status === "closed" && chat.closedBy === "user") visitorEnded(c);
      }, function () { done = true; });
    });
  }
  function visitorEnded(c) {
    beep(2);
    var name = c.nickname || "The visitor";
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
      try { new Notification("Chat ended", { body: name + " has ended the chat.", tag: "zd-ended-" + c.id }); } catch (e) { /* ignore */ }
    }
    endedQueue.push(c);
    if (!endedShowing) showNextEnded();
  }
  function showNextEnded() {
    var c = endedQueue.shift();
    endedShowing = c || null;
    if (!c) return;
    var name = c.nickname || "The visitor";
    if (!endedDialog || typeof endedDialog.showModal !== "function") {
      window.alert(name + " has ended the chat."); endedShowing = null; showNextEnded(); return;
    }
    $("#ended-text").textContent = name + " has ended the chat. You don't need to do anything else. The chat has been moved out of your active list.";
    $("#ended-view").hidden = !!(s.sel && s.sel.id === c.id);
    if (!endedDialog.open) endedDialog.showModal();
    $("#ended-ok").focus();
  }
  if (endedDialog) {
    endedDialog.addEventListener("close", function () { setTimeout(showNextEnded, 150); });
    $("#ended-view").addEventListener("click", function () {
      var c = endedShowing;
      endedQueue = endedQueue.filter(function (x) { return !c || x.id !== c.id; });
      endedDialog.close();
      if (c) select("ended", c);
    });
  }

  /* ------------------------------------------------------------ panes + selecting */
  function showPane(which) {
    el.empty.hidden = which !== "empty";
    el.preview.hidden = which !== "preview";
    el.room.hidden = which !== "room";
    el.pane.hidden = which !== "contact";
  }

  // Phones and tablets stack the lists above the panel, so after tapping an item bring its panel into view
  // (below the sticky header). Focus first without scrolling so the jump doesn't fight the smooth scroll.
  function revealPane(pane, focusEl) {
    if (focusEl) { try { focusEl.focus({ preventScroll: true }); } catch (e) { focusEl.focus(); } }
    if (!pane || !(window.matchMedia && window.matchMedia("(max-width: 900px)").matches)) return;
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(function () {
      try { pane.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" }); } catch (e) { pane.scrollIntoView(); }
    });
  }

  function unwatchChat() {
    if (s.voice) s.voice.detach();
    s.chatUnsubs.forEach(function (u) { try { u(); } catch (e) { /* ignore */ } }); s.chatUnsubs = [];
  }

  function roomNotice(text) {
    var div = document.createElement("div");
    div.className = "bubble bubble--system";
    div.textContent = text;
    el.log.appendChild(div);
    el.log.scrollTop = el.log.scrollHeight;
  }

  function select(kind, c) {
    unwatchChat();
    s.sel = { kind: kind, id: c.id };
    renderLists();
    if (kind === "waiting") {
      el.pvName.textContent = c.nickname;
      el.pvCrisis.hidden = !c.crisis;
      el.pvText.textContent = c.preview ? "“" + c.preview + "”" : "They haven't written anything yet.";
      el.pvErr.hidden = true; el.take.disabled = false;
      showPane("preview"); revealPane(el.preview, el.take);
    } else { openRoom(c); }
  }

  el.take.addEventListener("click", function () {
    if (!s.sel || !s.user) return;
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
    revealPane(el.room);
    var id = c.id;
    if (!s.voice && window.ZDCall) {
      s.voice = window.ZDCall({ fb: fb, role: "counsellor", actions: $("#pane-room .room-actions"), bar: el.log, notice: roomNotice,
        otherName: function () { return el.title.textContent || "The visitor"; } });
    }
    if (s.voice) { s.voice.attach(id); s.voice.setAvailable(false); }
    s.chatUnsubs.push(fb.staff.watchChat(id, function (chat) {
      if (!chat || (chat.status !== "closed" && chat.counsellorUid !== s.user.uid)) { s.sel = null; showPane("empty"); unwatchChat(); return; }
      if (chat.crisis) el.crisis.hidden = false;
      if (s.voice) s.voice.setAvailable(chat.status === "active" && chat.counsellorUid === s.user.uid);
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
    // On a phone, opening the keyboard straight away would cover the conversation; let them tap the box.
    if (!(window.matchMedia && window.matchMedia("(max-width: 900px)").matches)) el.msg.focus();
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
      if (typeof profile.displayName !== "string" || !profile.displayName.trim()) {
        // Taking a chat or a contact request records the counsellor's display name, and the security rules
        // refuse it when the profile has none, so stop here with a clear fix instead of failing later.
        fb.staff.signOut().catch(function () {});
        showView("login");
        loginMessage("error", "Your counsellor profile has no display name, so you can't take chats yet. An admin can set it in the admin dashboard (or in Firestore: counsellors > " + String(user.email || "").toLowerCase() + " > add displayName as a string). Then sign in again.");
        return;
      }
      loginMessage("", "");
      enter(user, profile);
    });
  });
})();
