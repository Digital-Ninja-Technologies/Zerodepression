/* ZeroDepression games: shared helpers (help sheet, sharing, on-device saving, mood picker, analytics). */
(function () {
  "use strict";

  var MOODS = [
    { v: 1, e: "😞", t: "Heavy" },
    { v: 2, e: "😟", t: "Low" },
    { v: 3, e: "😐", t: "Okay" },
    { v: 4, e: "🙂", t: "Good" },
    { v: 5, e: "😊", t: "Light" },
  ];

  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (html != null) n.innerHTML = html;
    return n;
  }

  /* ---------- on-device saving (never required to play) ---------- */
  var store = {
    get: function (key, fallback) {
      try {
        var raw = window.localStorage.getItem("zd-play:" + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { window.localStorage.setItem("zd-play:" + key, JSON.stringify(value)); } catch (e) { /* private mode: fine */ }
    },
  };

  /* ---------- analytics (uses the site's existing Google Analytics tag if present) ---------- */
  function track(name, params) {
    try { if (typeof window.gtag === "function") window.gtag("event", name, params || {}); } catch (e) {}
  }

  /* ---------- help sheet: a counsellor is always one tap away ---------- */
  var help = el("dialog", { class: "play-sheet", id: "play-help", "aria-labelledby": "play-help-title" },
    '<div class="play-sheet__body">' +
    '<button class="play-sheet__close" type="button" data-close>Close</button>' +
    '<h2 id="play-help-title">Want to talk to someone?</h2>' +
    "<p>ZeroDepression counsellors are free, anonymous and kind. You don't need to give your name.</p>" +
    '<div class="play-sheet__actions">' +
    '<a class="btn btn-dark" href="/chat/">Chat with a counsellor</a>' +
    '<a class="btn btn-primary" href="tel:+23480011002200">Call 0800 1100 2200 (free)</a>' +
    "</div>" +
    '<p class="play-sheet__note">If you are in danger or thinking about harming yourself, call <a href="tel:112">112</a> or go to the nearest hospital now.</p>' +
    "</div>");

  var shareSheet = el("dialog", { class: "play-sheet", id: "play-share", "aria-labelledby": "play-share-title" },
    '<div class="play-sheet__body">' +
    '<button class="play-sheet__close" type="button" data-close>Close</button>' +
    '<h2 id="play-share-title">Share with a friend</h2>' +
    '<p data-share-text></p>' +
    '<div class="share-grid">' +
    '<a class="share-wa" data-share-wa target="_blank" rel="noopener">WhatsApp</a>' +
    '<a data-share-x target="_blank" rel="noopener">X (Twitter)</a>' +
    '<a data-share-fb target="_blank" rel="noopener">Facebook</a>' +
    '<button type="button" data-share-copy>Copy link</button>' +
    "</div></div>");

  function wireDialog(d) {
    d.addEventListener("click", function (ev) {
      if (ev.target === d || (ev.target.closest && ev.target.closest("[data-close]"))) d.close();
    });
  }

  function openDialog(d) {
    if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
  }

  function share(text, path, game) {
    var url = "https://www.zerodepression.org" + (path || "/play/");
    track("share", { game: game || "hub" });
    if (navigator.share) {
      navigator.share({ title: "ZeroDepression games", text: text, url: url }).catch(function () {});
      return;
    }
    shareSheet.querySelector("[data-share-text]").textContent = text;
    var full = encodeURIComponent(text + " " + url);
    shareSheet.querySelector("[data-share-wa]").href = "https://wa.me/?text=" + full;
    shareSheet.querySelector("[data-share-x]").href = "https://twitter.com/intent/tweet?text=" + full;
    shareSheet.querySelector("[data-share-fb]").href = "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url);
    var copy = shareSheet.querySelector("[data-share-copy]");
    copy.textContent = "Copy link";
    copy.onclick = function () {
      var done = function () { copy.textContent = "Link copied"; };
      if (navigator.clipboard) navigator.clipboard.writeText(text + " " + url).then(done, done); else done();
    };
    openDialog(shareSheet);
  }

  /* mood picker: renders five buttons into `host`, calls onPick(value) */
  function moodPicker(host, onPick) {
    host.classList.add("mood-row");
    host.innerHTML = "";
    MOODS.forEach(function (m) {
      var b = el("button", { type: "button", "aria-pressed": "false" }, "<span aria-hidden=\"true\">" + m.e + "</span>" + m.t);
      b.addEventListener("click", function () {
        Array.prototype.forEach.call(host.querySelectorAll("button"), function (x) { x.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", "true");
        onPick(m.v);
      });
      host.appendChild(b);
    });
  }

  function moodEmoji(v) { var m = MOODS[(v || 3) - 1]; return m ? m.e : ""; }

  document.addEventListener("DOMContentLoaded", function () {
    document.body.appendChild(help);
    document.body.appendChild(shareSheet);
    wireDialog(help);
    wireDialog(shareSheet);
    Array.prototype.forEach.call(document.querySelectorAll("[data-open-help]"), function (b) {
      b.addEventListener("click", function () { track("help_open", { game: document.body.dataset.game || "hub" }); openDialog(help); });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-play-share]"), function (b) {
      b.addEventListener("click", function () { share(b.getAttribute("data-play-share"), b.getAttribute("data-play-share-path"), document.body.dataset.game); });
    });
  });

  window.ZDPlay = { store: store, share: share, track: track, moodPicker: moodPicker, moodEmoji: moodEmoji, openHelp: function () { openDialog(help); } };
})();
