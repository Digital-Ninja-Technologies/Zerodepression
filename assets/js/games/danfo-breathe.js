/* Danfo Breathe: a breathing-paced danfo drive through Lagos at sunset.
   Hold to breathe in (4s), release to breathe out (4s). 12 breaths. */
(function () {
  "use strict";

  var CYCLE = 8000, HALF = 4000, BREATHS = 12, GRACE = 450;
  var TOTAL = CYCLE * BREATHS;
  var C = { ink: "#10213f", inkSoft: "#3a4a68", cream: "#fffaf2", sand: "#fff0d2", amber: "#ffa500", amberDeep: "#e28f00", sage: "#2f8f7b", magenta: "#9b0057", blue: "#0071bb" };
  var LINES = [
    "Thank you o! You're doing better than you think.",
    "Small small, we go reach.",
    "Rest is not laziness.",
    "One breath at a time, my friend.",
    "You don't have to carry it alone.",
    "Today counts, even if it was hard.",
    "Ẹ ṣé! This ride is smooth.",
    "Your feelings are valid.",
    "Na gently we dey go.",
    "You deserve kindness too, even from yourself.",
  ];
  var END_QUOTES = [
    "Slow breathing tells your body it is safe. Come back any time you need a calm ride.",
    "Two quiet minutes for yourself. That counts.",
    "Whatever today looks like, you just did something kind for your mind.",
  ];
  var STOPS = [1, 3, 5, 7, 9, 11]; // breath index when a stop appears

  var stage = document.getElementById("db-stage");
  var canvas = document.getElementById("db-canvas");
  var ctx = canvas.getContext("2d");
  var ring = document.getElementById("db-ring");
  var cue = document.getElementById("db-cue");
  var countEl = document.getElementById("db-count");
  var passEl = document.getElementById("db-pass");
  var holdBtn = document.getElementById("db-hold");
  var startOv = document.getElementById("db-start");
  var endOv = document.getElementById("db-end");
  var goBtn = document.getElementById("db-go");
  var W = 0, H = 0, DPR = 1;

  var st;
  function reset() {
    st = {
      running: false, paused: false, t: 0, last: 0, holding: false,
      sync: 0, counted: 0, speed: 0.6, dist: 0, wheel: 0,
      riders: 0, stops: [], spawned: {}, bubble: null, lastPhase: "in", recent: [],
    };
  }
  reset();

  function resize() {
    var r = stage.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    draw();
  }
  window.addEventListener("resize", resize);

  function hash(n) { var x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }

  /* ---------- input ---------- */
  function press(v) {
    if (!st.running || st.paused) return;
    st.holding = v;
    holdBtn.classList.toggle("is-down", v);
    holdBtn.textContent = v ? "Breathing in… let go" : "Hold to breathe in";
  }
  holdBtn.addEventListener("pointerdown", function (e) { e.preventDefault(); holdBtn.setPointerCapture && holdBtn.setPointerCapture(e.pointerId); press(true); });
  holdBtn.addEventListener("pointerup", function () { press(false); });
  holdBtn.addEventListener("pointercancel", function () { press(false); });
  holdBtn.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  canvas.addEventListener("pointerdown", function (e) { e.preventDefault(); press(true); });
  window.addEventListener("pointerup", function () { press(false); });
  window.addEventListener("keydown", function (e) { if (e.code === "Space" && !e.repeat && st.running) { e.preventDefault(); press(true); } });
  window.addEventListener("keyup", function (e) { if (e.code === "Space") { e.preventDefault(); press(false); } });

  /* ---------- flow ---------- */
  function start() {
    reset();
    startOv.hidden = true; endOv.hidden = true;
    st.running = true; st.last = performance.now();
    passEl.textContent = "0 passengers";
    window.ZDPlay && ZDPlay.track("play_start", { game: "danfo-breathe" });
    requestAnimationFrame(loop);
  }
  goBtn.addEventListener("click", function () {
    if (st.paused) { st.paused = false; startOv.hidden = true; st.last = performance.now(); requestAnimationFrame(loop); return; }
    start();
  });
  document.getElementById("db-again").addEventListener("click", start);

  function pause() {
    if (!st.running || st.paused) return;
    st.paused = true; press(false);
    startOv.querySelector("h1").textContent = "Paused";
    goBtn.textContent = "Continue driving";
    startOv.hidden = false;
  }
  document.addEventListener("visibilitychange", function () { if (document.hidden) pause(); });
  document.addEventListener("zdplay:pause", pause);

  function finish() {
    st.running = false; press(false);
    var score = Math.round((st.sync / Math.max(1, st.counted)) * 100);
    document.getElementById("db-score").textContent = score + "%";
    document.getElementById("db-riders").textContent = st.riders;
    document.getElementById("db-quote").textContent = END_QUOTES[Math.floor(Math.random() * END_QUOTES.length)];
    document.getElementById("db-mood-reply").hidden = true;
    endOv.hidden = false;
    var best = (window.ZDPlay && ZDPlay.store.get("danfo-best", 0)) || 0;
    if (score > best && window.ZDPlay) ZDPlay.store.set("danfo-best", score);
    st.result = { score: score, riders: st.riders };
    window.ZDPlay && ZDPlay.track("play_complete", { game: "danfo-breathe", score: score });
  }

  document.getElementById("db-mood").addEventListener("click", function (e) {
    var b = e.target.closest("[data-mood]"); if (!b) return;
    var m = b.getAttribute("data-mood"), out = document.getElementById("db-mood-reply");
    out.hidden = false;
    out.innerHTML = m === "calmer" ? "Love that. Your breath is always with you, you can do this anywhere."
      : m === "same" ? "That's okay. Some days need more than a few breaths. Try another game, or just rest."
      : 'Thank you for being honest. You don\'t have to feel better alone: <a href="#" data-talk>talk to a counsellor</a>, it\'s free and anonymous.';
    window.ZDPlay && ZDPlay.track("play_mood", { game: "danfo-breathe", mood: m });
  });
  document.getElementById("db-share").addEventListener("click", function () {
    var r = st.result || { score: 0, riders: 0 };
    ZDPlay.share({
      title: "Danfo Breathe",
      text: "I just drove a danfo through Lagos on 12 slow breaths 🚌 Calm score " + r.score + "%, " + r.riders + " passengers. Try it:",
      url: ZDPlay.site + "/play/danfo-breathe/",
    });
  });

  /* ---------- loop ---------- */
  function loop(now) {
    if (!st.running || st.paused) return;
    var dt = Math.min(64, now - st.last); st.last = now;
    st.t += dt;
    var inCycle = st.t % CYCLE, phase = inCycle < HALF ? "in" : "out";
    var breath = Math.min(BREATHS, Math.floor(st.t / CYCLE) + 1);
    if (phase !== st.lastPhase) { st.lastPhase = phase; if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} } }

    var sinceSwitch = inCycle % HALF;
    var good = (st.holding && phase === "in") || (!st.holding && phase === "out") || sinceSwitch < GRACE;
    st.counted += dt; if (good) st.sync += dt;
    st.recent.push(good ? 1 : 0); if (st.recent.length > 180) st.recent.shift();

    var target = good ? 1 : 0.35;
    st.speed += (target - st.speed) * Math.min(1, dt / 500);
    var px = st.speed * dt * 0.16;
    st.dist += px; st.wheel += px / 14;

    // breath ring + text
    var p = phase === "in" ? sinceSwitch / HALF : 1 - sinceSwitch / HALF;
    var eased = 0.5 - Math.cos(Math.PI * p) / 2;
    ring.style.transform = "scale(" + (0.6 + 0.4 * eased).toFixed(3) + ")";
    ring.style.background = phase === "in" ? "rgba(255,210,122,.92)" : "rgba(255,250,242,.88)";
    cue.textContent = phase === "in" ? "Breathe in" : "Breathe out";
    countEl.textContent = "Breath " + breath + " of " + BREATHS;

    // bus stops
    var bi = Math.floor(st.t / CYCLE);
    if (STOPS.indexOf(bi) > -1 && !st.spawned[bi]) {
      st.spawned[bi] = true;
      st.stops.push({ x: st.dist + W * 0.95, color: [C.magenta, C.blue, C.sage, C.amberDeep][bi % 4], done: false });
    }
    var busX = W * 0.3;
    st.stops.forEach(function (s) {
      var sx = s.x - st.dist;
      if (!s.done && sx < busX + 40) {
        s.done = true;
        var ok = st.recent.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, st.recent.length) > 0.6;
        if (ok) {
          st.riders++; s.picked = true;
          passEl.textContent = st.riders + (st.riders === 1 ? " passenger" : " passengers");
          st.bubble = { text: LINES[(st.riders * 3 + bi) % LINES.length], until: st.t + 3600 };
        } else {
          st.bubble = { text: "No wahala, another bus stop is coming. Just follow the circle.", until: st.t + 3200 };
        }
      }
    });
    st.stops = st.stops.filter(function (s) { return s.x - st.dist > -80; });

    draw(phase, eased);
    if (st.t >= TOTAL) { finish(); return; }
    requestAnimationFrame(loop);
  }

  /* ---------- drawing ---------- */
  function rr(x, y, w, h, r, fill) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }

  function draw(phase, eased) {
    if (!W) return;
    eased = eased || 0;
    var roadY = H * 0.72;
    // sky
    var g = ctx.createLinearGradient(0, 0, 0, roadY);
    g.addColorStop(0, "#ffb347"); g.addColorStop(0.55, "#ffd27a"); g.addColorStop(1, "#fff0d2");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, roadY);
    // sun
    ctx.fillStyle = "rgba(255,165,0,.9)";
    ctx.beginPath(); ctx.arc(W * 0.78, roadY - H * 0.16, Math.min(W, H) * 0.11, 0, Math.PI * 2); ctx.fill();

    // far skyline
    var off = st.dist * 0.15, bw = 46;
    ctx.fillStyle = "rgba(226,143,0,.55)";
    for (var i = Math.floor(off / bw) - 1; i < Math.floor((off + W) / bw) + 2; i++) {
      var h = 40 + hash(i) * 110, x = i * bw - off;
      ctx.fillRect(x, roadY - 30 - h, bw - 6, h + 30);
    }
    // mid layer: low buildings and palms
    var off2 = st.dist * 0.45, mw = 120;
    for (var j = Math.floor(off2 / mw) - 1; j < Math.floor((off2 + W) / mw) + 2; j++) {
      var mx = j * mw - off2, r = hash(j + 99);
      if (r < 0.55) {
        var mh = 50 + r * 60;
        ctx.fillStyle = "rgba(58,74,104,.55)"; ctx.fillRect(mx, roadY - mh, 80, mh);
        ctx.fillStyle = "rgba(255,240,210,.6)";
        for (var wy = roadY - mh + 12; wy < roadY - 14; wy += 18) { ctx.fillRect(mx + 12, wy, 12, 8); ctx.fillRect(mx + 34, wy, 12, 8); ctx.fillRect(mx + 56, wy, 12, 8); }
      } else {
        ctx.strokeStyle = "rgba(16,33,63,.6)"; ctx.lineWidth = 5; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(mx + 40, roadY); ctx.quadraticCurveTo(mx + 46, roadY - 50, mx + 40, roadY - 90); ctx.stroke();
        ctx.fillStyle = "rgba(47,143,123,.85)";
        for (var k = 0; k < 5; k++) { ctx.save(); ctx.translate(mx + 40, roadY - 90); ctx.rotate(-1.6 + k * 0.8); ctx.beginPath(); ctx.ellipse(18, 0, 22, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
      }
    }
    // road
    ctx.fillStyle = C.inkSoft; ctx.fillRect(0, roadY, W, H - roadY);
    ctx.fillStyle = "#566783"; ctx.fillRect(0, roadY, W, 6);
    var dashOff = st.dist % 70;
    ctx.fillStyle = C.cream;
    var laneY = roadY + (H - roadY) * 0.55;
    for (var d = -dashOff; d < W; d += 70) rr(d, laneY, 36, 5, 2.5, C.cream);

    // bus stops
    st.stops.forEach(function (s) {
      var sx = s.x - st.dist;
      ctx.fillStyle = C.ink; ctx.fillRect(sx + 30, roadY - 74, 4, 74);
      rr(sx + 14, roadY - 92, 36, 22, 4, C.ink);
      ctx.fillStyle = C.amber; ctx.font = "700 8px 'Plus Jakarta Sans', sans-serif"; ctx.textAlign = "center"; ctx.fillText("BUS", sx + 32, roadY - 83); ctx.fillText("STOP", sx + 32, roadY - 74);
      if (!s.picked) {
        ctx.fillStyle = s.color; rr(sx, roadY - 38, 16, 30, 7, s.color);
        ctx.fillStyle = "#7a4a26"; ctx.beginPath(); ctx.arc(sx + 8, roadY - 46, 8, 0, Math.PI * 2); ctx.fill();
      }
    });

    // bus
    var bx = W * 0.3 - 90, bob = Math.sin(st.dist / 18) * 1.5 * st.speed, breathe = 1 + eased * 0.03;
    var by = roadY - 70 + bob, bwid = 180, bh = 62 * breathe;
    by -= bh - 62;
    rr(bx, by, bwid, bh, 14, C.amber);
    ctx.lineWidth = 3; ctx.strokeStyle = C.ink; ctx.stroke();
    ctx.fillStyle = C.ink; ctx.fillRect(bx, by + bh * 0.62, bwid, 5); ctx.fillRect(bx, by + bh * 0.76, bwid, 5);
    for (var wi = 0; wi < 4; wi++) {
      rr(bx + 10 + wi * 34, by + 9, 28, 22, 5, C.cream);
      if (wi < Math.min(st.riders, 4)) { ctx.fillStyle = ["#7a4a26", "#5a3418", "#8d5a33", "#6b3f1f"][wi]; ctx.beginPath(); ctx.arc(bx + 24 + wi * 34, by + 24, 7, 0, Math.PI * 2); ctx.fill(); }
    }
    rr(bx + bwid - 30, by + 9, 22, 30, 5, C.cream);
    ctx.fillStyle = "#7a4a26"; ctx.beginPath(); ctx.arc(bx + bwid - 19, by + 22, 7, 0, Math.PI * 2); ctx.fill();
    // wheels
    [bx + 38, bx + bwid - 38].forEach(function (wx) {
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(wx, roadY - 6, 15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#c9ced8"; ctx.beginPath(); ctx.arc(wx, roadY - 6, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#c9ced8"; ctx.lineWidth = 2;
      for (var s = 0; s < 3; s++) { var a = st.wheel + s * 2.09; ctx.beginPath(); ctx.moveTo(wx, roadY - 6); ctx.lineTo(wx + Math.cos(a) * 12, roadY - 6 + Math.sin(a) * 12); ctx.stroke(); }
    });

    // speech bubble
    if (st.bubble && st.t < st.bubble.until) {
      ctx.font = "600 15px 'Plus Jakarta Sans', sans-serif"; ctx.textAlign = "left";
      var maxW = Math.min(300, W - 32), words = st.bubble.text.split(" "), lines = [], line = "";
      words.forEach(function (w) { var test = line ? line + " " + w : w; if (ctx.measureText(test).width > maxW - 28) { lines.push(line); line = w; } else line = test; });
      lines.push(line);
      var bh2 = lines.length * 20 + 20, bw2 = Math.min(maxW, Math.max.apply(null, lines.map(function (l) { return ctx.measureText(l).width; })) + 28);
      var qx = Math.max(16, Math.min(W - bw2 - 16, bx + 60)), qy = by - bh2 - 22;
      rr(qx, qy, bw2, bh2, 14, C.cream);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = C.cream; ctx.beginPath(); ctx.moveTo(bx + 120, qy + bh2 - 1); ctx.lineTo(bx + 134, qy + bh2 + 14); ctx.lineTo(bx + 144, qy + bh2 - 1); ctx.fill();
      ctx.fillStyle = C.ink;
      lines.forEach(function (l, n) { ctx.fillText(l, qx + 14, qy + 26 + n * 20); });
    }
  }

  resize();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);
})();
