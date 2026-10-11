/* Admin dashboard: side navigation. Switches panels by URL hash (#analytics, #counsellors, #newsletter),
   turns into a slide-out drawer on small screens, and mirrors counts into the menu badges. */
(function () {
  "use strict";
  var side = document.getElementById("adm-side");
  if (!side) return;
  var links = Array.prototype.slice.call(side.querySelectorAll("[data-panel]"));
  var panels = Array.prototype.slice.call(document.querySelectorAll("[data-panel-body]"));
  var btn = document.getElementById("adm-menu-btn");
  var scrim = document.getElementById("adm-scrim");
  var current = document.getElementById("adm-current");
  var NAMES = { analytics: "Analytics", counsellors: "Counsellors", newsletter: "Newsletter" };
  var mq = window.matchMedia("(max-width: 899px)");

  function show(name, focus) {
    if (!NAMES[name]) name = "analytics";
    panels.forEach(function (p) { p.hidden = p.getAttribute("data-panel-body") !== name; });
    links.forEach(function (a) {
      if (a.getAttribute("data-panel") === name) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    current.textContent = NAMES[name];
    document.title = NAMES[name] + " | Admin | ZeroDepression";
    if (focus) {
      var h = document.querySelector('[data-panel-body="' + name + '"] h2');
      if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
      window.scrollTo(0, 0);
    }
  }

  function open(yes) {
    side.classList.toggle("is-open", yes);
    scrim.hidden = !yes;
    btn.setAttribute("aria-expanded", yes ? "true" : "false");
    document.body.classList.toggle("adm-lock", yes);
    if (yes) { var a = side.querySelector("[aria-current]") || side.querySelector("a"); if (a) a.focus(); }
  }

  links.forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      var name = a.getAttribute("data-panel");
      if (location.hash !== "#" + name) history.pushState(null, "", "#" + name);
      show(name, true);
      if (mq.matches) open(false);
    });
  });
  window.addEventListener("popstate", function () { show(location.hash.slice(1)); });
  btn.addEventListener("click", function () { open(!side.classList.contains("is-open")); });
  scrim.addEventListener("click", function () { open(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && side.classList.contains("is-open")) { open(false); btn.focus(); } });
  mq.addEventListener ? mq.addEventListener("change", function () { if (!mq.matches) open(false); }) : null;

  /* Mirror "(5 active)" / "(318)" from the panel headings into the menu badges, and the name into the avatar. */
  function mirror(id) {
    var src = document.getElementById(id), badge = side.querySelector('[data-badge="' + id + '"]');
    if (!src || !badge) return;
    var sync = function () { var m = /\d+/.exec(src.textContent || ""); badge.textContent = m ? m[0] : ""; badge.hidden = !m; };
    new MutationObserver(sync).observe(src, { childList: true, characterData: true, subtree: true });
    sync();
  }
  mirror("count");
  mirror("sub-count");
  var nameEl = document.getElementById("me-name"), avatar = document.getElementById("adm-avatar");
  if (nameEl && avatar) {
    var setA = function () { var t = (nameEl.textContent || "").trim(); avatar.textContent = t ? t.charAt(0).toUpperCase() : "A"; };
    new MutationObserver(setA).observe(nameEl, { childList: true, characterData: true, subtree: true });
    setA();
  }

  show(location.hash.slice(1));
})();
