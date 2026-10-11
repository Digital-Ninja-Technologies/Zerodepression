/* Ìrọ̀rùn Garden: small real-life acts of care help the garden grow. Saved only on this device. No punishing streaks. */
(function () {
  "use strict";
  var P = window.ZDPlay;
  var $ = function (s) { return document.querySelector(s); };
  var NEED = [5, 8, 10, 10, 12, 12]; // the first flower comes quickly; later ones take a little longer
  function need(i) { return NEED[Math.min(i, NEED.length - 1)]; }

  var PLANTS = [
    { id: "hibiscus", name: "Hibiscus", petal: "#c8102e", centre: "#ffc21a", petals: 5 },
    { id: "ixora", name: "Ixora", petal: "#ff5a36", centre: "#ffd27a", petals: 4 },
    { id: "sunflower", name: "Sunflower", petal: "#ffc21a", centre: "#6b3b1f", petals: 12 },
    { id: "bougainvillea", name: "Bougainvillea", petal: "#d1287a", centre: "#fffaf2", petals: 3 },
    { id: "marigold", name: "Marigold", petal: "#ff8c00", centre: "#b86f00", petals: 9 },
    { id: "periwinkle", name: "Periwinkle", petal: "#8a6cd8", centre: "#fffaf2", petals: 5 },
  ];

  var ACTIONS = [
    { id: "water", label: "Drink a glass of water", grow: 1, gift: "water" },
    { id: "outside", label: "Step outside for 5 minutes", grow: 2, gift: "sunlight" },
    { id: "text", label: "Send a kind message to someone you trust", grow: 2, gift: "sunlight" },
    { id: "grateful", label: "Write one thing you're grateful for", grow: 2, gift: "water", kind: "note" },
    { id: "breathe", label: "Take five slow breaths", grow: 1, gift: "fresh air", kind: "breathe" },
    { id: "stretch", label: "Stretch your body for one minute", grow: 1, gift: "fresh air" },
    { id: "eat", label: "Eat something nourishing", grow: 1, gift: "water" },
    { id: "rest", label: "Rest your eyes away from screens for a minute", grow: 1, gift: "shade" },
  ];

  function today() { var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }

  var G = P.store.get("garden", null);
  var fresh = !G;
  if (!G) G = { plants: [{ type: 0, growth: 0 }], day: today(), done: {}, care: 0, notes: [], visits: 0 };
  var welcome = $("#welcome");
  if (fresh) welcome.textContent = "Welcome to your garden. Every small act of care below helps your first hibiscus grow.";
  else if (G.day !== today()) welcome.textContent = "Welcome back. Your garden waited for you, just as you left it. Every day is a fresh start.";
  else welcome.textContent = "Good to see you again today.";
  if (G.day !== today()) { G.day = today(); G.done = {}; }
  G.visits++;
  save();

  function save() { P.store.set("garden", G); }

  /* ---------- drawing ---------- */
  function plantSVG(p, x, groundY, BLOOM) {
    var spec = PLANTS[p.type % PLANTS.length];
    var g = Math.min(BLOOM, p.growth), f = g / BLOOM;
    var out = "";
    if (g === 0) {
      return '<ellipse cx="' + x + '" cy="' + (groundY - 3) + '" rx="7" ry="4" fill="#6b3b1f"/>';
    }
    var h = 20 + f * 70, top = groundY - h;
    out += '<path d="M' + x + " " + groundY + " Q" + (x - 4) + " " + (groundY - h / 2) + " " + x + " " + top + '" stroke="#2f8f7b" stroke-width="5" fill="none" stroke-linecap="round"/>';
    var leaves = Math.min(4, 1 + Math.floor(g / 2.5));
    for (var i = 0; i < leaves; i++) {
      var ly = groundY - 12 - i * (h / (leaves + 1));
      var side = i % 2 ? 1 : -1;
      out += '<ellipse cx="' + (x + side * 13) + '" cy="' + ly + '" rx="13" ry="6" fill="#2f8f7b" transform="rotate(' + (side * -25) + " " + (x + side * 13) + " " + ly + ')"/>';
    }
    if (g >= BLOOM) {
      var r = 15;
      for (var k = 0; k < spec.petals; k++) {
        var a = (k / spec.petals) * Math.PI * 2;
        var px = x + Math.cos(a) * r * 0.75, py = top + Math.sin(a) * r * 0.75;
        out += '<ellipse cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" rx="' + (spec.petals > 8 ? 5 : 9) + '" ry="' + (spec.petals > 8 ? 10 : 11) + '" fill="' + spec.petal + '" transform="rotate(' + (a * 180 / Math.PI + 90).toFixed(0) + " " + px.toFixed(1) + " " + py.toFixed(1) + ')"/>';
      }
      out += '<circle cx="' + x + '" cy="' + top + '" r="6" fill="' + spec.centre + '"/>';
    } else if (g >= BLOOM * 0.7) {
      out += '<ellipse cx="' + x + '" cy="' + (top - 4) + '" rx="6" ry="9" fill="' + spec.petal + '" opacity=".85"/>';
    }
    return out;
  }

  function render() {
    var W = 360, groundY = 170, n = 6, gap = W / n;
    var svg = '<rect width="360" height="220" fill="#e6f2ec"/>' +
      '<circle cx="315" cy="40" r="22" fill="#ffa500"/>' +
      '<rect y="' + groundY + '" width="360" height="50" fill="#8f5400"/>' +
      '<rect y="' + groundY + '" width="360" height="6" fill="#6b3b1f"/>';
    for (var i = 0; i < n; i++) {
      var x = gap * i + gap / 2;
      var p = G.plants[i];
      if (p) svg += plantSVG(p, x, groundY, need(i));
      else svg += '<ellipse cx="' + x + '" cy="' + (groundY + 14) + '" rx="16" ry="5" fill="#6b3b1f" opacity=".5"/>';
    }
    $("#garden").innerHTML = svg;
    var ci = G.plants.length - 1, cur = G.plants[ci], BLOOM = need(ci);
    var spec = PLANTS[cur.type % PLANTS.length];
    var blooms = G.plants.filter(function (p, i) { return p.growth >= need(i); }).length;
    $("#g-blooms").textContent = blooms;
    $("#g-blooms-l").textContent = blooms === 1 ? "flower in bloom" : "flowers in bloom";
    $("#g-care").textContent = G.care;
    $("#g-care-l").textContent = G.care === 1 ? "act of care" : "acts of care";
    var left = Math.max(0, BLOOM - cur.growth);
    $("#growing").textContent = cur.growth >= BLOOM ? "Your garden is in full bloom. Every plot has flowered." :
      "Growing now: " + spec.name + ". " + (left === BLOOM ? "Just planted." : left + " more care to bloom.");
    $("#g-bar").style.width = Math.min(100, (cur.growth / BLOOM) * 100) + "%";
    $("#garden").setAttribute("aria-label", "Your garden: " + blooms + " " + (blooms === 1 ? "flower" : "flowers") + " in bloom. Growing now: " + spec.name + ".");
    renderActions();
    renderNotes();
    $("#share-btn").setAttribute("data-play-share", "My Ìrọ̀rùn garden has " + blooms + " " + (blooms === 1 ? "flower" : "flowers") + " 🌺 grown with small acts of self-care. Start yours, it's free:");
  }

  function renderActions() {
    var list = $("#actions");
    list.innerHTML = "";
    ACTIONS.forEach(function (a) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      b.className = "ig-action" + (G.done[a.id] ? " is-done" : "");
      b.disabled = !!G.done[a.id];
      var t = document.createElement("span"); t.className = "ig-action__label"; t.textContent = a.label;
      var s = document.createElement("span"); s.className = "ig-action__state";
      s.textContent = G.done[a.id] ? "Done today" : "+" + a.grow + " " + a.gift;
      b.appendChild(t); b.appendChild(s);
      b.addEventListener("click", function () { doAction(a); });
      li.appendChild(b);
      list.appendChild(li);
    });
    var doneCount = Object.keys(G.done).length;
    $("#done-note").textContent = doneCount === 0 ? "Pick any one. There's no wrong order and no pressure to do them all." :
      doneCount === ACTIONS.length ? "You did every act of care today. That's a lot of kindness to yourself." :
      "You've done " + doneCount + " today. Even one is enough.";
  }

  function grow(a) {
    G.done[a.id] = true;
    G.care++;
    var ci = G.plants.length - 1, cur = G.plants[ci], BLOOM = need(ci);
    var before = cur.growth;
    cur.growth = Math.min(BLOOM, cur.growth + a.grow);
    var msg = "Your " + PLANTS[cur.type % PLANTS.length].name.toLowerCase() + " got some " + a.gift + ".";
    if (before < BLOOM && cur.growth >= BLOOM) {
      msg = "Your " + PLANTS[cur.type % PLANTS.length].name.toLowerCase() + " is blooming!";
      if (G.plants.length < 6) {
        var nextType = G.plants.length % PLANTS.length;
        G.plants.push({ type: nextType, growth: 0 });
        msg += " A new " + PLANTS[nextType].name.toLowerCase() + " seed appeared in the next plot.";
      }
      P.track("garden_bloom", { blooms: G.plants.filter(function (p, i) { return p.growth >= need(i); }).length });
    }
    save();
    toast(msg);
    render();
    P.track("garden_care", { action: a.id });
  }

  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 4200);
  }

  /* ---------- special actions ---------- */
  function doAction(a) {
    if (a.kind === "note") return openNote(a);
    if (a.kind === "breathe") return openBreathe(a);
    grow(a);
  }

  function openNote(a) {
    var box = $("#note-box");
    box.hidden = false;
    var input = $("#note-input");
    input.value = "";
    input.focus();
    $("#note-save").onclick = function () {
      var v = input.value.trim().slice(0, 200);
      if (!v) { input.focus(); return; }
      G.notes.unshift({ t: v, d: today() });
      G.notes = G.notes.slice(0, 60);
      box.hidden = true;
      grow(a);
    };
    $("#note-cancel").onclick = function () { box.hidden = true; };
  }

  function openBreathe(a) {
    var box = $("#breathe-box"), ring = $("#breathe-ring"), label = $("#breathe-label");
    box.hidden = false;
    var n = 0, phase = "in";
    label.textContent = "Breathe in";
    ring.className = "ig-ring is-in";
    clearInterval(openBreathe._i);
    openBreathe._i = setInterval(function () {
      if (phase === "in") { phase = "out"; label.textContent = "Breathe out"; ring.className = "ig-ring is-out"; }
      else {
        n++;
        if (n >= 5) { clearInterval(openBreathe._i); box.hidden = true; grow(a); return; }
        phase = "in"; label.textContent = "Breathe in (" + (n + 1) + " of 5)"; ring.className = "ig-ring is-in";
      }
    }, 4000);
    $("#breathe-stop").onclick = function () { clearInterval(openBreathe._i); box.hidden = true; };
  }

  function renderNotes() {
    var list = $("#notes");
    list.innerHTML = "";
    $("#jar-empty").hidden = G.notes.length > 0;
    G.notes.forEach(function (n) {
      var li = document.createElement("li");
      li.textContent = n.t;
      list.appendChild(li);
    });
  }

  /* ---------- reset (two taps, no pop-up) ---------- */
  var resetBtn = $("#reset"), armed = false;
  resetBtn.addEventListener("click", function () {
    if (!armed) { armed = true; resetBtn.textContent = "Tap again to start a new garden"; setTimeout(function () { armed = false; resetBtn.textContent = "Start a new garden"; }, 4000); return; }
    G = { plants: [{ type: 0, growth: 0 }], day: today(), done: {}, care: 0, notes: G.notes, visits: G.visits };
    save(); armed = false; resetBtn.textContent = "Start a new garden";
    toast("A fresh hibiscus seed is planted. Your gratitude notes are kept.");
    render();
  });

  P.track("game_start", { game: "irorun-garden", returning: !fresh });
  render();
})();
