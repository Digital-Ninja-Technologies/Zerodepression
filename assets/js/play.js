/* ZeroDepression Play: helpers shared by every game page.
   - "Talk to someone" sheet (call, chat, 112), always one tap away
   - share() with the native share sheet, falling back to WhatsApp / copy link
   - tiny storage wrapper that never throws (private mode, blocked storage)
   - analytics events through gtag when it is present */
(function () {
  "use strict";

  var SITE = "https://www.zerodepression.org";

  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (html != null) n.innerHTML = html;
    return n;
  }

  /* ---------- storage ---------- */
  var store = {
    get: function (key, fallback) {
      try {
        var v = window.localStorage.getItem("zdplay:" + key);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { window.localStorage.setItem("zdplay:" + key, JSON.stringify(value)); } catch (e) { /* ignore */ }
    },
  };

  /* ---------- analytics ---------- */
  function track(name, params) {
    try { if (typeof window.gtag === "function") window.gtag("event", name, params || {}); } catch (e) { /* ignore */ }
  }

  /* ---------- toast ---------- */
  var toastEl, toastTimer;
  function toast(msg) {
    if (!toastEl) {
      toastEl = el("div", { class: "g-toast", role: "status", "aria-live": "polite" });
      toastEl.hidden = true;
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2600);
  }

  /* ---------- talk sheet ---------- */
  var sheet;
  function buildSheet() {
    sheet = el("div", { class: "talk-sheet", role: "dialog", "aria-modal": "true", "aria-labelledby": "talk-title" });
    sheet.hidden = true;
    sheet.innerHTML =
      '<div class="talk-sheet__card">' +
      '<h2 id="talk-title">Need to talk?</h2>' +
      "<p>Our volunteer counsellors are free, anonymous and judgement-free. You don't need to give your name.</p>" +
      '<div class="talk-sheet__list">' +
      '<a href="tel:+23480011002200"><span>Call 0800 1100 2200<small>Toll-free, always free</small></span><span aria-hidden="true">&rarr;</span></a>' +
      '<a href="/chat/"><span>Chat with a counsellor<small>Anonymous online chat</small></span><span aria-hidden="true">&rarr;</span></a>' +
      '<a class="is-urgent" href="tel:112"><span>In immediate danger? Call 112<small>Or go to the nearest hospital</small></span><span aria-hidden="true">&rarr;</span></a>' +
      "</div>" +
      '<button type="button" class="g-btn g-btn--ghost talk-sheet__close">Back to the game</button>' +
      "</div>";
    document.body.appendChild(sheet);
    sheet.addEventListener("click", function (e) {
      if (e.target === sheet || e.target.closest(".talk-sheet__close")) closeSheet();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !sheet.hidden) closeSheet();
    });
  }
  var lastFocus;
  function openSheet() {
    if (!sheet) buildSheet();
    lastFocus = document.activeElement;
    sheet.hidden = false;
    var first = sheet.querySelector("a");
    if (first) first.focus();
    document.dispatchEvent(new CustomEvent("zdplay:pause"));
    track("play_talk_open", { game: document.body.getAttribute("data-game") || "hub" });
  }
  function closeSheet() {
    sheet.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---------- share ---------- */
  function share(opts) {
    var url = opts.url || SITE + "/play/";
    var text = opts.text || "";
    var title = opts.title || "ZeroDepression Play";
    track("play_share", { game: document.body.getAttribute("data-game") || "hub" });
    if (navigator.share) {
      navigator.share({ title: title, text: text, url: url }).catch(function () { /* user closed it */ });
      return;
    }
    var wa = "https://wa.me/?text=" + encodeURIComponent(text + " " + url);
    var win = window.open(wa, "_blank", "noopener");
    if (!win && navigator.clipboard) {
      navigator.clipboard.writeText(text + " " + url).then(function () { toast("Link copied. Paste it anywhere to share."); });
    }
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-talk]");
    if (t) { e.preventDefault(); openSheet(); }
  });

  window.ZDPlay = { store: store, track: track, toast: toast, share: share, openTalk: openSheet, site: SITE };
})();
