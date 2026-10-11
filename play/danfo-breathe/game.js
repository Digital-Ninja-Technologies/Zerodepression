/* Danfo Breathe: hold to breathe in, let go to breathe out. Calm breathing keeps the danfo moving. */
(function () {
  "use strict";
  var P = window.ZDPlay;
  var $ = function (s) { return document.querySelector(s); };

  var screens = { intro: $("#intro"), play: $("#play"), end: $("#end") };
  var canvas = $("#road");
  var ctx = canvas.getContext("2d");
  var cue = $("#cue");
  var cueCount = $("#cue-count");
  var bar = $("#progress");
  var holdBtn = $("#hold");
  var bubble = $("#bubble");

  var RHYTHMS = {
    calm: { name: "Calm", phases: [["in", 4], ["out", 4]] },
    relax: { name: "Relax", phases: [["in", 4], ["out", 6]] },
    box: { name: "Box", phases: [["in", 4], ["hold", 4], ["out", 4], ["rest", 4]] },
  };
  var LINES = [
    "Thank you, driver! Your calm don rub on me.",
    "Breathe in, breathe out. Lagos no dey run away.",
    "Slow and steady na im dey reach.",
    "Today go better. I feel am.",
    "Small breath, big peace.",
    "No rush, driver. We go reach.",
    "Ọ̀la á dára. Tomorrow will be good.",
    "You dey do well. Keep am like that.",
    "This bus get better energy than my office.",
    "Owambe for my mind. Everything calm.",
    "One breath at a time, one stop at a time.",
    "Even traffic no fit spoil this vibe.",
  ];
  var LABEL = { in: "Breathe in", out: "Breathe out", hold: "Hold", rest: "Rest" };
  var HOLDING = { in: true, hold: true, out: false, rest: false };

  var cfg = { minutes: 2, rhythm: "calm", moodBefore: 0, moodAfter: 0 };
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- intro choices ---------------- */
  function pickGroup(sel, key, parse) {
    Array.prototype.forEach.call(document.querySelectorAll(sel + " button"), function (b) {
      b.addEventListener("click", function () {
        Array.prototype.forEach.call(document.querySelectorAll(sel + " button"), function (x) { x.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", "true");
        cfg[key] = parse(b.value);
      });
    });
  }
  pickGroup("#len", "minutes", Number);
  pickGroup("#rhythm", "rhythm", String);
  P.moodPicker($("#mood-before"), function (v) { cfg.moodBefore = v; });
  P.moodPicker($("#mood-after"), function (v) { cfg.moodAfter = v; showResult(); });

  function show(name) {
    Object.keys(screens).forEach(function (k) { screens[k].hidden = k !== name; });
    window.scrollTo(0, 0);
  }

  /* ---------------- game state ---------------- */
  var S;
  function reset() {
    S = {
      t: 0, total: cfg.minutes * 60, phaseIdx: 0, phaseT: 0, held: false,
      sync: 0, syncTime: 0, ema: 0.6, speed: 90, x: 0, nextStop: 700,
      breathSync: 0, breathTime: 0, calmBreaths: 0, breaths: 0, riders: 0,
      bubbleT: 0, running: true, last: 0, lineIdx: Math.floor(Math.random() * LINES.length),
    };
  }

  function rhythm() { return RHYTHMS[cfg.rhythm]; }
  function phase() { return rhythm().phases[S.phaseIdx]; }

  /* ---------------- input ---------------- */
  function down(ev) { if (ev) ev.preventDefault(); S && (S.held = true); holdBtn.classList.add("is-held"); }
  function up(ev) { if (ev) ev.preventDefault(); S && (S.held = false); holdBtn.classList.remove("is-held"); }
  [canvas, holdBtn].forEach(function (n) {
    n.addEventListener("pointerdown", down);
    n.addEventListener("pointerup", up);
    n.addEventListener("pointercancel", up);
    n.addEventListener("pointerleave", up);
  });
  window.addEventListener("keydown", function (e) { if ((e.code === "Space" || e.key === " ") && !screens.play.hidden) { down(e); } });
  window.addEventListener("keyup", function (e) { if ((e.code === "Space" || e.key === " ") && !screens.play.hidden) { up(e); } });

  /* ---------------- canvas sizing ---------------- */
  var W = 0, H = 0, DPR = 1;
  function resize() {
    var r = canvas.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", function () { if (!screens.play.hidden) resize(); });

  /* ---------------- scenery (deterministic per x so it scrolls smoothly) ---------------- */
  function rand(n) { var s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }

  function drawSky() {
    var g = ctx.createLinearGradient(0, 0, 0, H * 0.75);
    g.addColorStop(0, "#5a1a5e");
    g.addColorStop(0.45, "#c2456a");
    g.addColorStop(0.8, "#ff8c42");
    g.addColorStop(1, "#ffb347");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,226,150,0.9)";
    ctx.beginPath(); ctx.arc(W * 0.78, H * 0.52, Math.min(W, H) * 0.12, 0, Math.PI * 2); ctx.fill();
  }

  function drawLayer(par, base, minH, maxH, color, windows) {
    var off = (S.x * par) % 60;
    var startIdx = Math.floor((S.x * par) / 60);
    ctx.fillStyle = color;
    for (var i = -1; i < W / 60 + 2; i++) {
      var idx = startIdx + i;
      var h = minH + rand(idx * 3.1 + par) * (maxH - minH);
      var w = 40 + rand(idx * 7.7 + par) * 30;
      var x = i * 60 - off;
      ctx.fillRect(x, base - h, w, h);
      if (windows) {
        ctx.fillStyle = "rgba(255,210,122,0.75)";
        for (var wy = base - h + 10; wy < base - 12; wy += 16) {
          for (var wx = x + 7; wx < x + w - 10; wx += 13) {
            if (rand(idx * 13 + wx * 0.7 + wy) > 0.55) ctx.fillRect(wx, wy, 5, 7);
          }
        }
        ctx.fillStyle = color;
      }
    }
  }

  function drawBridge(roadY) {
    // Third Mainland-style long bridge in the distance
    var par = 0.35, span = 90, y = roadY - H * 0.16;
    var off = (S.x * par) % span;
    ctx.strokeStyle = "rgba(16,33,63,0.55)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    for (var i = -1; i < W / span + 2; i++) {
      var x = i * span - off;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + H * 0.08); ctx.stroke();
    }
  }

  function drawRoad(roadY) {
    ctx.fillStyle = "#2c3a57"; ctx.fillRect(0, roadY, W, H - roadY);
    ctx.fillStyle = "#3a4a68"; ctx.fillRect(0, roadY, W, 6);
    ctx.fillStyle = "#fffaf2";
    var dash = 70, off = S.x % dash, ly = roadY + (H - roadY) * 0.55;
    for (var x = -off; x < W; x += dash) ctx.fillRect(x, ly, 36, 5);
  }

  function drawStop(roadY) {
    var sx = S.nextStop - S.x + W * 0.28;
    if (sx < -80 || sx > W + 80) return;
    ctx.fillStyle = "#10213f"; ctx.fillRect(sx, roadY - 70, 5, 70);
    ctx.fillStyle = "#ffa500"; ctx.fillRect(sx - 14, roadY - 84, 34, 18);
    ctx.fillStyle = "#10213f"; ctx.font = "700 11px 'Plus Jakarta Sans', sans-serif"; ctx.fillText("BUS", sx - 9, roadY - 71);
    // waiting passenger
    var px = sx + 22;
    ctx.fillStyle = "#9b0057"; ctx.fillRect(px - 7, roadY - 40, 14, 28);
    ctx.fillStyle = "#6b3b1f"; ctx.beginPath(); ctx.arc(px, roadY - 48, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#10213f"; ctx.fillRect(px - 6, roadY - 12, 4, 12); ctx.fillRect(px + 2, roadY - 12, 4, 12);
  }

  function drawBus(roadY) {
    var bw = Math.min(190, W * 0.42), bh = bw * 0.42;
    var bx = W * 0.28 - bw / 2;
    var bob = reduce ? 0 : Math.sin(S.t * 9) * Math.min(2, S.speed / 80);
    var by = roadY - bh - 10 + bob;
    ctx.fillStyle = "#ffc21a";
    roundRect(bx, by, bw, bh, 12); ctx.fill();
    ctx.fillStyle = "#10213f";
    ctx.fillRect(bx, by + bh * 0.62, bw, bh * 0.08);
    ctx.fillRect(bx, by + bh * 0.76, bw, bh * 0.08);
    ctx.fillStyle = "#fffaf2";
    var ww = bw * 0.15, gap = bw * 0.035;
    for (var i = 0; i < 4; i++) { roundRect(bx + gap + i * (ww + gap), by + bh * 0.14, ww, bh * 0.34, 4); ctx.fill(); }
    roundRect(bx + bw * 0.8, by + bh * 0.14, bw * 0.16, bh * 0.44, 4); ctx.fill();
    ctx.fillStyle = "#10213f";
    var wr = bh * 0.2;
    [bx + bw * 0.22, bx + bw * 0.78].forEach(function (cx) {
      ctx.beginPath(); ctx.arc(cx, by + bh + 2, wr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#c9cfd9"; ctx.beginPath(); ctx.arc(cx, by + bh + 2, wr * 0.45, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#10213f";
    });
    return { x: bx, y: by, w: bw, h: bh };
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawGuide() {
    var ph = phase(), p = Math.min(1, S.phaseT / ph[1]);
    var minR = Math.min(W, H) * 0.05, maxR = Math.min(W, H) * 0.13;
    var r;
    if (ph[0] === "in") r = minR + (maxR - minR) * p;
    else if (ph[0] === "hold") r = maxR;
    else if (ph[0] === "out") r = maxR - (maxR - minR) * p;
    else r = minR;
    var cx = W / 2, cy = H * 0.2;
    ctx.strokeStyle = "rgba(255,250,242,0.6)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, maxR, 0, Math.PI * 2); ctx.stroke();
    var good = isSync();
    ctx.fillStyle = good ? "rgba(47,143,123,0.85)" : "rgba(255,250,242,0.35)";
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }

  function isSync() {
    var ph = phase();
    if (S.phaseT < 0.5) return true; // reaction time
    return S.held === HOLDING[ph[0]];
  }

  /* ---------------- loop ---------------- */
  function step(now) {
    if (!S.running) return;
    var dt = S.last ? Math.min(0.05, (now - S.last) / 1000) : 0;
    S.last = now;
    S.t += dt; S.phaseT += dt;

    var good = isSync();
    if (good) { S.syncTime += dt; S.breathSync += dt; }
    S.breathTime += dt;
    S.ema += ((good ? 1 : 0) - S.ema) * Math.min(1, dt * 0.8);

    var ph = phase();
    if (S.phaseT >= ph[1]) {
      S.phaseT -= ph[1];
      S.phaseIdx = (S.phaseIdx + 1) % rhythm().phases.length;
      if (S.phaseIdx === 0) {
        S.breaths++;
        if (S.breathSync / S.breathTime >= 0.7) S.calmBreaths++;
        S.breathSync = 0; S.breathTime = 0;
      }
      var np = phase();
      cue.textContent = LABEL[np[0]];
      screens.play.dataset.phase = np[0];
    }
    cueCount.textContent = String(Math.max(1, Math.ceil(phase()[1] - S.phaseT)));

    var target = 40 + 180 * S.ema;
    S.speed += (target - S.speed) * Math.min(1, dt * 1.5);
    S.x += S.speed * dt * (reduce ? 0.6 : 1);

    if (S.x >= S.nextStop) {
      if (S.ema >= 0.55) {
        S.riders++;
        bubble.textContent = LINES[S.lineIdx++ % LINES.length];
        bubble.hidden = false; S.bubbleT = 3.2;
      }
      S.nextStop += 900 + rand(S.nextStop) * 500;
    }
    if (S.bubbleT > 0) { S.bubbleT -= dt; if (S.bubbleT <= 0) bubble.hidden = true; }

    bar.style.width = Math.min(100, (S.t / S.total) * 100) + "%";

    var roadY = H * 0.74;
    drawSky();
    drawLayer(0.15, roadY - H * 0.06, H * 0.12, H * 0.3, "rgba(58,26,74,0.7)", false);
    drawBridge(roadY);
    drawLayer(0.45, roadY, H * 0.1, H * 0.26, "#2a1f3d", true);
    drawRoad(roadY);
    drawStop(roadY);
    drawBus(roadY);
    drawGuide();

    if (S.t >= S.total) return finish();
    requestAnimationFrame(step);
  }

  function start() {
    reset();
    show("play");
    resize();
    screens.play.dataset.phase = "in";
    cue.textContent = LABEL.in;
    bubble.hidden = true;
    P.track("game_start", { game: "danfo-breathe", minutes: cfg.minutes, rhythm: cfg.rhythm });
    requestAnimationFrame(step);
  }

  function finish() {
    S.running = false;
    up();
    S.sync = S.total ? S.syncTime / S.t : 0;
    var best = P.store.get("danfo-best", 0);
    if (S.calmBreaths > best) P.store.set("danfo-best", S.calmBreaths);
    P.store.set("danfo-plays", P.store.get("danfo-plays", 0) + 1);
    P.track("game_finish", { game: "danfo-breathe", calm_breaths: S.calmBreaths, riders: S.riders });
    $("#result").hidden = true;
    $("#after-wrap").hidden = false;
    show("end");
  }

  function showResult() {
    $("#after-wrap").hidden = true;
    $("#result").hidden = false;
    $("#r-breaths").textContent = S.calmBreaths;
    $("#r-riders").textContent = S.riders;
    $("#r-sync").textContent = Math.round(S.sync * 100) + "%";
    $("#r-mins").textContent = cfg.minutes;
    var moodLine = $("#r-mood");
    if (cfg.moodBefore && cfg.moodAfter) {
      var diff = cfg.moodAfter - cfg.moodBefore;
      moodLine.textContent = "You went from " + P.moodEmoji(cfg.moodBefore) + " to " + P.moodEmoji(cfg.moodAfter) + ". " +
        (diff > 0 ? "That's a real shift. Your breath did that." : diff === 0 ? "Steady is good too. Come back whenever you need a breather." : "Some days are heavier. Thank you for taking this time for yourself.");
    } else {
      moodLine.textContent = "Thank you for taking this time for yourself.";
    }
    var low = (cfg.moodAfter && cfg.moodAfter <= 2);
    $("#low-note").hidden = !low;
    var text = "I took " + S.calmBreaths + " calm breaths and picked up " + S.riders + " passengers on Danfo Breathe 🚌 A 2-minute breathing game from ZeroDepression. Try it:";
    $("#share-btn").setAttribute("data-play-share", text);
  }

  $("#start").addEventListener("click", start);
  $("#again").addEventListener("click", function () { cfg.moodAfter = 0; P.moodPicker($("#mood-after"), function (v) { cfg.moodAfter = v; showResult(); }); start(); });
  $("#end-early").addEventListener("click", function () { if (S && S.running) { S.total = S.t; } });
  $("#skip-mood").addEventListener("click", function () { cfg.moodAfter = 0; showResult(); });
  document.addEventListener("visibilitychange", function () { if (document.hidden && S) { up(); } });

  var best = P.store.get("danfo-best", 0);
  if (best) { $("#best").hidden = false; $("#best-n").textContent = best; }
})();
