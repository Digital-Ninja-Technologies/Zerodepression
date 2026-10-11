/* Lantern Walk: read lanterns of encouragement left by other players, then light one for a stranger.
   Players only ever choose from pre-written messages, so nothing harmful can reach anyone. */
(function () {
  "use strict";
  var P = window.ZDPlay;
  var $ = function (s) { return document.querySelector(s); };

  // Keep in this order: the server stores only the index (api/lanterns.js, MESSAGE_COUNT = 24).
  var MESSAGES = [
    "You are not alone in this.",
    "It's okay to rest. You don't have to earn it.",
    "Someone out there is glad you exist.",
    "Small steps still count.",
    "This feeling is heavy, but it won't last forever.",
    "You've survived every hard day so far.",
    "Asking for help is strength, not weakness.",
    "Be gentle with yourself today.",
    "Your story isn't over.",
    "You matter more than you know.",
    "Drink some water. Take a breath. You're doing okay.",
    "Even slow progress is progress.",
    "You don't have to have it all figured out.",
    "One day at a time. One breath at a time.",
    "It's okay to not be okay.",
    "You deserve kindness, including from yourself.",
    "Tomorrow is a new page.",
    "Your feelings are valid.",
    "Small small. You go dey alright.",
    "Ọ̀la á dára. Tomorrow will be good.",
    "Someone would love to hear from you today.",
    "You are more than your worst day.",
    "Rest is not giving up.",
    "Keep going. We're rooting for you.",
  ];
  var COLOURS = [
    { name: "Amber", glow: "#ffa500", body: "#ffb733" },
    { name: "Rose", glow: "#ff5a8a", body: "#ff7aa0" },
    { name: "Mint", glow: "#3fc9a5", body: "#6fdcbe" },
    { name: "Sky", glow: "#4aa8ff", body: "#7cc0ff" },
  ];
  var TEAM = [0, 9, 6, 13, 3, 19, 14, 8]; // lanterns from the ZeroDepression team, shown when few players have lit one yet

  var canvas = $("#sky"), ctx = canvas.getContext("2d");
  var card = $("#card"), cardFrom = $("#card-from"), cardMsg = $("#card-msg");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var W = 0, H = 0, DPR = 1, t = 0, last = 0;
  var lanterns = [], stars = [], read = {}, readCount = 0, total = null;

  function resize() {
    var r = canvas.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    stars = [];
    for (var i = 0; i < 70; i++) stars.push({ x: Math.random() * W, y: Math.random() * H * 0.6, r: Math.random() * 1.4 + 0.3, p: Math.random() * 6 });
  }
  window.addEventListener("resize", resize);

  function addLantern(m, c, team, fromBottom) {
    var l = {
      m: m, c: c % COLOURS.length, team: team,
      x: W * (0.1 + Math.random() * 0.8),
      y: fromBottom ? H + 30 : H * (0.12 + Math.random() * 0.5),
      vy: -(4 + Math.random() * 5), sway: Math.random() * 6, size: 16 + Math.random() * 6, id: Math.random(),
    };
    lanterns.push(l);
    return l;
  }

  function seed(list) {
    lanterns = [];
    list.forEach(function (x) { addLantern(x.m, x.c, false, false); });
    var i = 0;
    while (lanterns.length < 8 && i < TEAM.length) { addLantern(TEAM[i], i, true, false); i++; }
  }

  function loadLanterns() {
    fetch("/api/lanterns", { headers: { Accept: "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) {
        total = d.total || 0;
        seed((d.lanterns || []).filter(function (x) { return x.m >= 0 && x.m < MESSAGES.length; }).slice(0, 14));
        showTotal();
      })
      .catch(function () { seed([]); total = null; showTotal(); });
  }

  function showTotal() {
    $("#total").textContent = total == null ? "Lanterns float here from people all over Nigeria." :
      total === 0 ? "Be the first person to light a lantern here." :
      total.toLocaleString() + (total === 1 ? " lantern has" : " lanterns have") + " been lit by people across Nigeria.";
  }

  /* ---------- drawing ---------- */
  function draw(now) {
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now; t += dt;
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0a1630"); g.addColorStop(0.7, "#10213f"); g.addColorStop(1, "#1b2d50");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    stars.forEach(function (s) {
      ctx.globalAlpha = reduce ? 0.8 : 0.45 + 0.45 * Math.sin(t * 1.3 + s.p);
      ctx.fillStyle = "#fffaf2"; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
    // moon
    ctx.fillStyle = "rgba(255,240,210,0.9)"; ctx.beginPath(); ctx.arc(W * 0.82, H * 0.14, Math.min(W, H) * 0.06, 0, Math.PI * 2); ctx.fill();
    // hills and village
    ctx.fillStyle = "#0b1830";
    ctx.beginPath(); ctx.moveTo(0, H * 0.8); ctx.quadraticCurveTo(W * 0.3, H * 0.68, W * 0.55, H * 0.78); ctx.quadraticCurveTo(W * 0.8, H * 0.86, W, H * 0.74); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
    [[0.12, 0.8], [0.3, 0.76], [0.62, 0.8], [0.84, 0.77]].forEach(function (h) {
      var hx = W * h[0], hy = H * h[1], hw = Math.max(34, W * 0.07);
      ctx.fillStyle = "#16284a"; ctx.fillRect(hx, hy - hw * 0.6, hw, hw * 0.6);
      ctx.beginPath(); ctx.moveTo(hx - 6, hy - hw * 0.58); ctx.lineTo(hx + hw / 2, hy - hw * 1.05); ctx.lineTo(hx + hw + 6, hy - hw * 0.58); ctx.fill();
      ctx.fillStyle = "rgba(255,190,90,0.85)"; ctx.fillRect(hx + hw * 0.38, hy - hw * 0.4, hw * 0.24, hw * 0.24);
    });
    // lanterns
    lanterns.forEach(function (l) {
      if (!reduce) { l.y += l.vy * dt; l.x += Math.sin(t * 0.6 + l.sway) * 0.15; }
      if (l.y < -40) { l.y = H + 30; l.x = W * (0.1 + Math.random() * 0.8); }
      var col = COLOURS[l.c], s = l.size, flick = reduce ? 1 : 0.9 + 0.1 * Math.sin(t * 6 + l.sway * 3);
      var grd = ctx.createRadialGradient(l.x, l.y, 2, l.x, l.y, s * 2.6);
      grd.addColorStop(0, col.glow); grd.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 0.45 * flick; ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(l.x, l.y, s * 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = read[l.id] ? 0.65 : 1;
      ctx.fillStyle = col.body;
      roundRect(l.x - s * 0.55, l.y - s * 0.7, s * 1.1, s * 1.4, s * 0.35); ctx.fill();
      ctx.fillStyle = "rgba(255,250,242,0.85)"; ctx.fillRect(l.x - s * 0.18, l.y - s * 0.1, s * 0.36, s * 0.45);
      ctx.globalAlpha = 1;
    });
    requestAnimationFrame(draw);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  /* ---------- reading lanterns ---------- */
  canvas.addEventListener("click", function (ev) {
    var r = canvas.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    var best = null, bd = 1e9;
    lanterns.forEach(function (l) { var d = Math.hypot(l.x - x, l.y - y); if (d < bd) { bd = d; best = l; } });
    if (best && bd < 48) openLantern(best);
  });

  function openLantern(l) {
    if (!read[l.id]) { read[l.id] = true; readCount++; $("#read-n").textContent = readCount; }
    cardFrom.textContent = l.team ? "A lantern from the ZeroDepression team" : "A lantern from someone, somewhere in Nigeria";
    cardMsg.textContent = MESSAGES[l.m];
    card.style.setProperty("--lc", COLOURS[l.c].glow);
    card.hidden = false;
    P.track("lantern_read", {});
  }
  $("#card-close").addEventListener("click", function () { card.hidden = true; });

  // keyboard / screen-reader path: read the next lantern without aiming
  $("#next-lantern").addEventListener("click", function () {
    var unread = lanterns.filter(function (l) { return !read[l.id]; });
    var pick = unread.length ? unread[0] : lanterns[Math.floor(Math.random() * lanterns.length)];
    if (pick) { canvas.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }); openLantern(pick); }
  });

  /* ---------- lighting a lantern ---------- */
  var chosenM = -1, chosenC = 0;
  var list = $("#msg-list");
  MESSAGES.forEach(function (m, i) {
    var lab = document.createElement("label");
    lab.className = "lw-msg";
    var inp = document.createElement("input");
    inp.type = "radio"; inp.name = "msg"; inp.value = String(i);
    inp.addEventListener("change", function () { chosenM = i; $("#release").disabled = false; });
    var span = document.createElement("span"); span.textContent = m;
    lab.appendChild(inp); lab.appendChild(span);
    list.appendChild(lab);
  });
  var sw = $("#colours");
  COLOURS.forEach(function (c, i) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "lw-swatch"; b.style.background = c.body;
    b.setAttribute("aria-label", c.name); b.setAttribute("aria-pressed", i === 0 ? "true" : "false");
    b.addEventListener("click", function () {
      chosenC = i;
      Array.prototype.forEach.call(sw.children, function (x) { x.setAttribute("aria-pressed", "false"); });
      b.setAttribute("aria-pressed", "true");
    });
    sw.appendChild(b);
  });

  $("#open-light").addEventListener("click", function () {
    $("#light").hidden = false;
    $("#light").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  });

  $("#release").addEventListener("click", function () {
    if (chosenM < 0) return;
    var btn = $("#release");
    btn.disabled = true; btn.textContent = "Releasing...";
    var l = addLantern(chosenM, chosenC, false, true);
    l.vy = -26; l.x = W / 2;
    setTimeout(function () { l.vy = -(4 + Math.random() * 5); }, 6000);
    window.scrollTo({ top: canvas.getBoundingClientRect().top + window.scrollY - 70, behavior: reduce ? "auto" : "smooth" });
    var mine = P.store.get("lanterns-lit", 0) + 1;
    P.store.set("lanterns-lit", mine);
    fetch("/api/lanterns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ m: chosenM, c: chosenC }) })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (d) { total = d.total; showTotal(); done(true); })
      .catch(function (e) { done(false, e); });
    P.track("lantern_lit", { message: chosenM });
  });

  function done(ok, err) {
    var btn = $("#release");
    btn.textContent = "Release my lantern";
    $("#light").hidden = true;
    var msg = $("#lit-msg");
    msg.hidden = false;
    msg.textContent = ok ? "Your lantern is floating up. Someone who needs those words will find it." :
      err === 429 ? "You've lit a lot of lanterns this hour. Thank you! Try again a little later." :
      "Your lantern is floating here, but we couldn't send it to others right now. Please try again later.";
    $("#after-light").hidden = false;
    chosenM = -1;
    Array.prototype.forEach.call(list.querySelectorAll("input"), function (i) { i.checked = false; });
  }

  resize();
  loadLanterns();
  P.track("game_start", { game: "lantern-walk" });
  requestAnimationFrame(draw);
})();
