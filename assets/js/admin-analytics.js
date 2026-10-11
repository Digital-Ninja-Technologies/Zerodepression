/* Admin dashboard: Analytics card. Counts only, from /api/analytics (admin token required). */
(function () {
  "use strict";
  var root = document.getElementById("analytics");
  if (!root) return;
  var $ = function (s) { return root.querySelector(s); };
  var SVGNS = "http://www.w3.org/2000/svg";
  var C = { answered: "#1d6fb8", waiting: "#e28f00", hours: "#1d6fb8", web: "#1d6fb8", grid: "#eadfca", ink: "#10213f", muted: "#566783" };
  var state = { days: 30, data: null, loading: false };
  var tip = document.createElement("div");
  tip.className = "an-tip"; tip.hidden = true; tip.setAttribute("role", "status");
  document.body.appendChild(tip);

  function fmt(n) { return n == null ? "–" : Number(n).toLocaleString("en-NG"); }
  function pct(a, b) { return b ? Math.round((a / b) * 100) + "%" : "–"; }
  function shortDate(k) { var d = new Date(k + "T12:00:00Z"); return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }); }
  function hourLabel(h) { var s = function (x) { var hh = x % 12 || 12; return hh + (x < 12 ? "am" : "pm"); }; return s(h) + "–" + s((h + 1) % 24); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function svg(tag, attrs) { var n = document.createElementNS(SVGNS, tag); Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); }); return n; }

  /* ---------- tooltip ---------- */
  function showTip(ev, rows, title) {
    tip.innerHTML = "";
    if (title) tip.appendChild(el("div", "an-tip__title", title));
    rows.forEach(function (r) {
      var line = el("div", "an-tip__row");
      if (r.color) { var k = el("span", "an-tip__key"); k.style.background = r.color; line.appendChild(k); }
      line.appendChild(el("strong", null, r.value));
      line.appendChild(el("span", null, " " + r.label));
      tip.appendChild(line);
    });
    tip.hidden = false;
    var x = ev.clientX, y = ev.clientY;
    if (ev.type === "focus" && ev.target.getBoundingClientRect) { var b = ev.target.getBoundingClientRect(); x = b.left + b.width / 2; y = b.top; }
    var w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2)) + "px";
    tip.style.top = Math.max(8, y - h - 14) + "px";
  }
  function hideTip() { tip.hidden = true; }

  /* ---------- charts ---------- */
  function niceMax(v) { if (v <= 4) return 4; var p = Math.pow(10, Math.floor(Math.log10(v))); var n = v / p; return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }

  function axes(g, W, H, pad, max) {
    [0, 0.5, 1].forEach(function (f) {
      var y = pad.t + (H - pad.t - pad.b) * (1 - f);
      g.appendChild(svg("line", { x1: pad.l, x2: W - pad.r, y1: y, y2: y, stroke: C.grid, "stroke-width": 1 }));
      var t = svg("text", { x: pad.l - 8, y: y + 4, "text-anchor": "end", "font-size": 12, fill: C.muted });
      t.textContent = fmt(Math.round(max * f));
      g.appendChild(t);
    });
  }

  // Stacked bars: answered + not answered per day
  function chatsChart(host, byDay) {
    host.innerHTML = "";
    var W = 1000, H = 250, pad = { l: 40, r: 12, t: 10, b: 28 };
    var max = niceMax(Math.max.apply(null, byDay.map(function (d) { return d.started; }).concat([1])));
    var s = svg("svg", { viewBox: "0 0 " + W + " " + H, class: "an-chart", role: "img", "aria-label": "Chats started per day, split into answered and not answered" });
    axes(s, W, H, pad, max);
    var n = byDay.length, slot = (W - pad.l - pad.r) / n, bw = Math.max(3, Math.min(28, slot - 4));
    var ph = H - pad.t - pad.b;
    byDay.forEach(function (d, i) {
      var x = pad.l + slot * i + (slot - bw) / 2;
      var ans = d.answered, not = Math.max(0, d.started - d.answered);
      var hA = ph * ans / max, hN = ph * not / max, base = pad.t + ph;
      if (ans) s.appendChild(svg("rect", { x: x, y: base - hA, width: bw, height: Math.max(0, hA), fill: C.answered, rx: Math.min(4, bw / 2) }));
      if (not) s.appendChild(svg("rect", { x: x, y: base - hA - hN - (ans ? 2 : 0), width: bw, height: Math.max(0, hN), fill: C.waiting, rx: Math.min(4, bw / 2) }));
      var hit = svg("rect", { x: pad.l + slot * i, y: pad.t, width: slot, height: ph, fill: "transparent", tabindex: 0, class: "an-hit" });
      var rows = [
        { value: fmt(d.started), label: "started" },
        { value: fmt(ans), label: "answered", color: C.answered },
        { value: fmt(not), label: "not answered", color: C.waiting },
      ];
      if (d.crisis) rows.push({ value: fmt(d.crisis), label: "flagged may be at risk" });
      if (d.requests) rows.push({ value: fmt(d.requests), label: "call-back requests" });
      ["pointermove", "focus"].forEach(function (e) { hit.addEventListener(e, function (ev) { showTip(ev, rows, shortDate(d.d)); }); });
      ["pointerleave", "blur"].forEach(function (e) { hit.addEventListener(e, hideTip); });
      s.appendChild(hit);
      var every = n <= 7 ? 1 : n <= 31 ? 5 : 15;
      if (i % every === 0 || i === n - 1) {
        var t = svg("text", { x: pad.l + slot * i + slot / 2, y: H - 8, "text-anchor": "middle", "font-size": 12, fill: C.muted });
        t.textContent = shortDate(d.d);
        s.appendChild(t);
      }
    });
    host.appendChild(s);
  }

  function hoursChart(host, byHour) {
    host.innerHTML = "";
    var W = 1000, H = 210, pad = { l: 40, r: 12, t: 10, b: 28 };
    var max = niceMax(Math.max.apply(null, byHour.concat([1])));
    var s = svg("svg", { viewBox: "0 0 " + W + " " + H, class: "an-chart", role: "img", "aria-label": "Chats started by hour of day, Lagos time" });
    axes(s, W, H, pad, max);
    var slot = (W - pad.l - pad.r) / 24, bw = slot - 4, ph = H - pad.t - pad.b;
    byHour.forEach(function (v, h) {
      var x = pad.l + slot * h + 2, hh = ph * v / max;
      if (v) s.appendChild(svg("rect", { x: x, y: pad.t + ph - hh, width: bw, height: hh, fill: C.hours, rx: 4 }));
      var hit = svg("rect", { x: pad.l + slot * h, y: pad.t, width: slot, height: ph, fill: "transparent", tabindex: 0, class: "an-hit" });
      ["pointermove", "focus"].forEach(function (e) { hit.addEventListener(e, function (ev) { showTip(ev, [{ value: fmt(v), label: v === 1 ? "chat" : "chats" }], hourLabel(h)); }); });
      ["pointerleave", "blur"].forEach(function (e) { hit.addEventListener(e, hideTip); });
      s.appendChild(hit);
      if (h % 3 === 0) {
        var t = svg("text", { x: pad.l + slot * h + slot / 2, y: H - 8, "text-anchor": "middle", "font-size": 12, fill: C.muted });
        t.textContent = hourLabel(h).split("–")[0];
        s.appendChild(t);
      }
    });
    host.appendChild(s);
  }

  function visitorsChart(host, byDay) {
    host.innerHTML = "";
    var W = 1000, H = 230, pad = { l: 48, r: 32, t: 10, b: 28 };
    var max = niceMax(Math.max.apply(null, byDay.map(function (d) { return d.visitors; }).concat([1])));
    var s = svg("svg", { viewBox: "0 0 " + W + " " + H, class: "an-chart", role: "img", "aria-label": "Website visitors per day" });
    axes(s, W, H, pad, max);
    var ph = H - pad.t - pad.b, n = byDay.length;
    var X = function (i) { return pad.l + (n === 1 ? (W - pad.l - pad.r) / 2 : (W - pad.l - pad.r) * i / (n - 1)); };
    var Y = function (v) { return pad.t + ph * (1 - v / max); };
    var d = byDay.map(function (p, i) { return (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(p.visitors).toFixed(1); }).join(" ");
    s.appendChild(svg("path", { d: d, fill: "none", stroke: C.web, "stroke-width": 2, "stroke-linejoin": "round" }));
    var cross = svg("line", { y1: pad.t, y2: pad.t + ph, stroke: C.ink, "stroke-width": 1, opacity: 0 });
    var dot = svg("circle", { r: 5, fill: C.web, stroke: "#fff", "stroke-width": 2, opacity: 0 });
    s.appendChild(cross); s.appendChild(dot);
    var hit = svg("rect", { x: pad.l, y: pad.t, width: W - pad.l - pad.r, height: ph, fill: "transparent", class: "an-hit" });
    hit.addEventListener("pointermove", function (ev) {
      var r = s.getBoundingClientRect(), px = (ev.clientX - r.left) * (W / r.width);
      var i = Math.max(0, Math.min(n - 1, Math.round((px - pad.l) / ((W - pad.l - pad.r) / Math.max(1, n - 1)))));
      var p = byDay[i];
      cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i)); cross.setAttribute("opacity", 0.3);
      dot.setAttribute("cx", X(i)); dot.setAttribute("cy", Y(p.visitors)); dot.setAttribute("opacity", 1);
      showTip(ev, [{ value: fmt(p.visitors), label: "visitors", color: C.web }, { value: fmt(p.pageViews), label: "page views" }], shortDate(p.d));
    });
    hit.addEventListener("pointerleave", function () { hideTip(); cross.setAttribute("opacity", 0); dot.setAttribute("opacity", 0); });
    s.appendChild(hit);
    var every = n <= 7 ? 1 : n <= 31 ? 5 : 15;
    byDay.forEach(function (p, i) {
      if (i % every === 0 || i === n - 1) {
        var t = svg("text", { x: X(i), y: H - 8, "text-anchor": i === n - 1 ? "end" : i === 0 ? "start" : "middle", "font-size": 12, fill: C.muted });
        t.textContent = shortDate(p.d);
        s.appendChild(t);
      }
    });
    host.appendChild(s);
  }

  /* ---------- tiles & tables ---------- */
  function tiles(host, list) {
    host.innerHTML = "";
    list.forEach(function (t) {
      var d = el("div", "an-tile");
      d.appendChild(el("span", "an-tile__value", t.value));
      d.appendChild(el("span", "an-tile__label", t.label));
      if (t.note) d.appendChild(el("span", "an-tile__note", t.note));
      host.appendChild(d);
    });
  }

  function table(host, head, rows, empty) {
    host.innerHTML = "";
    if (!rows.length) { host.appendChild(el("p", "fine", empty || "Nothing yet for this period.")); return; }
    var tb = el("table", "sub-table an-table"), th = el("thead"), tr = el("tr");
    head.forEach(function (h, i) { var c = el("th", i ? "num" : null, h); c.scope = "col"; tr.appendChild(c); });
    th.appendChild(tr); tb.appendChild(th);
    var body = el("tbody");
    rows.forEach(function (r) { var row = el("tr"); r.forEach(function (v, i) { row.appendChild(el("td", i ? "num" : null, i ? fmt(v) : v)); }); body.appendChild(row); });
    tb.appendChild(body);
    host.appendChild(tb);
  }

  var GAME_NAMES = { "danfo-breathe": "Danfo Breathe", "oja-ero": "Ọjà Èrò", "irorun-garden": "Ìrọ̀rùn Garden", "lantern-walk": "Lantern Walk", hub: "Games page" };

  function render(d) {
    var c = d.chats;
    $("#an-range-label").textContent = shortDate(d.range.from) + " to " + shortDate(d.range.to) + " (Lagos time)";
    tiles($("#an-live"), [
      { value: fmt(c.waitingNow), label: "waiting for a counsellor now" },
      { value: fmt(c.activeNow), label: "chats in progress now" },
      { value: fmt(d.counsellors.onlineNow), label: "counsellors online now", note: "of " + fmt(d.counsellors.active) + " active" },
    ]);
    tiles($("#an-tiles"), [
      { value: fmt(c.started), label: "chats started" },
      { value: pct(c.answered, c.started), label: "answered by a counsellor", note: fmt(c.answered) + " chats" },
      { value: c.avgWaitMin == null ? "–" : c.avgWaitMin + " min", label: "average wait before a counsellor took the chat", note: c.answeredWithin5 == null ? "" : c.answeredWithin5 + "% taken within 5 minutes" },
      { value: fmt(c.missed), label: "left before anyone answered" },
      { value: fmt(c.crisis), label: "flagged “may be at risk”" },
      { value: fmt(d.requests.total), label: "call-back requests", note: fmt(d.requests.done) + " followed up" },
      { value: fmt(d.newsletter.inRange), label: "newsletter sign-ups", note: fmt(d.newsletter.total) + " in total" },
      { value: fmt(d.lanterns.inRange), label: "lanterns lit in Lantern Walk", note: fmt(d.lanterns.total) + " all time" },
    ]);
    chatsChart($("#an-chats"), c.byDay);
    hoursChart($("#an-hours"), c.byHour);
    var busiest = c.byHour.indexOf(Math.max.apply(null, c.byHour));
    $("#an-hours-note").textContent = c.started ? "Busiest hour: " + hourLabel(busiest) + ". Plan counsellor cover around it." : "";
    table($("#an-chat-table"), ["Day", "Started", "Answered", "Not answered", "Flagged", "Call-backs"],
      c.byDay.slice().reverse().map(function (x) { return [shortDate(x.d), x.started, x.answered, Math.max(0, x.started - x.answered), x.crisis, x.requests]; }));

    var w = d.web || {};
    $("#an-web-setup").hidden = w.configured !== false;
    $("#an-web-error").hidden = !w.error;
    if (w.error) $("#an-web-error").textContent = "Google Analytics didn't answer: " + w.error;
    $("#an-web-body").hidden = !(w.configured && !w.error);
    if (w.configured && !w.error) {
      tiles($("#an-web-tiles"), [
        { value: fmt(w.totals.visitors), label: "visitors" },
        { value: fmt(w.totals.newVisitors), label: "new visitors" },
        { value: fmt(w.totals.sessions), label: "visits" },
        { value: fmt(w.totals.pageViews), label: "page views" },
      ]);
      visitorsChart($("#an-visitors"), w.byDay);
      table($("#an-pages"), ["Page", "Views", "Visitors"], w.pages.map(function (p) { return [p.path, p.views, p.visitors]; }));
      table($("#an-sources"), ["Where visits came from", "Visits"], w.sources.map(function (p) { return [p.source, p.sessions]; }));
      table($("#an-cities"), ["City", "Visitors"], w.cities.map(function (p) { return [p.city, p.visitors]; }));
      table($("#an-games"), ["Game", "Plays", "Finished", "Shares", "Opened help"],
        Object.keys(w.games).map(function (k) { var g = w.games[k]; return [GAME_NAMES[k] || k, g.starts, g.finishes, g.shares, g.help]; }),
        "No game plays recorded yet for this period.");
    }
  }

  function load() {
    if (state.loading || !window.zdAdminIdToken) return;
    state.loading = true;
    root.classList.add("is-loading");
    $("#an-error").hidden = true;
    window.zdAdminIdToken().then(function (t) {
      return fetch("/api/analytics?days=" + state.days, { headers: { Authorization: "Bearer " + t } });
    }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) { state.data = d; $("#an-body").hidden = false; render(d); },
        function () { $("#an-error").hidden = false; })
      .then(function () { state.loading = false; root.classList.remove("is-loading"); });
  }

  Array.prototype.forEach.call(root.querySelectorAll("[data-days]"), function (b) {
    b.addEventListener("click", function () {
      state.days = Number(b.getAttribute("data-days"));
      Array.prototype.forEach.call(root.querySelectorAll("[data-days]"), function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      load();
    });
  });
  $("#an-refresh").addEventListener("click", load);
  window.addEventListener("scroll", hideTip, { passive: true });
  window.zdAnalyticsLoad = load;
})();
