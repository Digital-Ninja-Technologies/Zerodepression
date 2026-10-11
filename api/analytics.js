// Admin-only analytics for the admin dashboard (/admin-dashboard/, Analytics card).
//
//   GET /api/analytics?days=7|30|90   (Authorization: Bearer <Firebase ID token of an active admin>)
//   The daily job (api/analytics-snapshot.js, Vercel cron in vercel.json) saves recent days' totals.
//
// Privacy: this only ever returns COUNTS. It never reads or returns message text, nicknames, phone numbers or emails.
// Chats expire (and a returning visitor's chat doc is reused), so the daily job copies each day's totals into
// analyticsDaily/{YYYY-MM-DD} (numbers only) to keep long-term trends.
//
// Website traffic comes from Google Analytics 4 when GA_PROPERTY_ID is set in Vercel (the numeric property ID) and the
// Firebase service account has Viewer access to that property. Without it the dashboard shows how to switch it on.
const crypto = require('crypto');
const { app, readServiceAccount } = require('./_firebase');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const TZ_MS = 3600000;   // Lagos is UTC+1 all year (no daylight saving)
const DAY = 86400000;
const dayKey = (ms) => new Date(ms + TZ_MS).toISOString().slice(0, 10);
const hourOf = (ms) => new Date(ms + TZ_MS).getUTCHours();
const weekdayOf = (ms) => new Date(ms + TZ_MS).getUTCDay();   // 0 = Sunday
const toMs = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : (typeof t === 'number' ? t : null));

async function isAdmin(req, db) {
  const m = /^Bearer (.+)$/.exec(String(req.headers.authorization || ''));
  if (!m) return false;
  try {
    const t = await getAuth().verifyIdToken(m[1]);
    if (!t.email || t.email_verified !== true || (t.firebase && t.firebase.sign_in_provider === 'anonymous')) return false;
    const c = await db.doc('counsellors/' + String(t.email).toLowerCase()).get();
    return c.exists && c.data().active === true && c.data().role === 'admin';
  } catch (e) { return false; }
}

function emptyDay() {
  return { started: 0, answered: 0, missed: 0, crisis: 0, waitSumMin: 0, waitN: 0, waitUnder5: 0, byHour: new Array(24).fill(0), requests: 0, requestsDone: 0 };
}

// Totals per Lagos day from the live chats/contactRequests collections.
async function liveDays(db, sinceMs) {
  const since = Timestamp.fromMillis(sinceMs);
  const [chats, reqs] = await Promise.all([
    db.collection('chats').where('createdAt', '>=', since).get(),
    db.collection('contactRequests').where('createdAt', '>=', since).get(),
  ]);
  const days = {};
  const get = (k) => (days[k] = days[k] || emptyDay());
  chats.forEach((doc) => {
    const c = doc.data();
    const created = toMs(c.createdAt);
    if (!created) return;
    const d = get(dayKey(created));
    d.started++;
    d.byHour[hourOf(created)]++;
    if (c.crisis === true) d.crisis++;
    const claimed = toMs(c.claimedAt);
    const answered = !!claimed || !!c.counsellorUid || c.closedBy === 'counsellor';
    if (answered) d.answered++;
    else if (c.status === 'closed') d.missed++;   // visitor left before a counsellor took the chat
    if (claimed && claimed >= created) {
      const mins = (claimed - created) / 60000;
      d.waitSumMin += mins; d.waitN++;
      if (mins <= 5) d.waitUnder5++;
    }
  });
  reqs.forEach((doc) => {
    const r = doc.data();
    const created = toMs(r.createdAt);
    if (!created) return;
    const d = get(dayKey(created));
    d.requests++;
    if (r.status === 'done') d.requestsDone++;
  });
  return days;
}

// Keep the fuller record of a day: live data can shrink after chats expire or a visitor's chat doc is reused.
function better(a, b) {
  if (!a) return b; if (!b) return a;
  return (b.started + b.requests) > (a.started + a.requests) ? b : a;
}

async function snapshot(db) {
  const now = Date.now();
  const sinceMs = Date.parse(dayKey(now - 7 * DAY) + 'T00:00:00Z') - TZ_MS;
  const live = await liveDays(db, sinceMs);
  const today = dayKey(now);
  const keys = Object.keys(live).filter((k) => k < today);   // only finished days
  const refs = keys.map((k) => db.doc('analyticsDaily/' + k));
  const existing = refs.length ? await db.getAll(...refs) : [];
  const batch = db.batch();
  let written = 0;
  keys.forEach((k, i) => {
    const prev = existing[i] && existing[i].exists ? existing[i].data() : null;
    const keep = better(prev, live[k]);
    if (keep === live[k]) { batch.set(refs[i], Object.assign({}, live[k], { savedAt: Timestamp.now() })); written++; }
  });
  if (written) await batch.commit();
  return { saved: written, days: keys.length };
}

/* ---------------- Google Analytics 4 (optional) ---------------- */
function b64url(x) { return Buffer.from(x).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }

async function gaToken() {
  const sa = readServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/analytics.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = crypto.createSign('RSA-SHA256').update(head + '.' + body).sign(sa.private_key);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + head + '.' + body + '.' + b64url(sig),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('token: ' + (j.error_description || j.error || r.status));
  return j.access_token;
}

async function webStats(days) {
  const id = String(process.env.GA_PROPERTY_ID || '').replace(/\D/g, '');
  if (!id) return { configured: false };
  const range = [{ startDate: (days - 1) + 'daysAgo', endDate: 'today' }];
  const token = await gaToken();
  const r = await fetch('https://analyticsdata.googleapis.com/v1beta/properties/' + id + ':batchRunReports', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [
      { dateRanges: range, dimensions: [{ name: 'date' }], metrics: [{ name: 'activeUsers' }, { name: 'newUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }], orderBys: [{ dimension: { dimensionName: 'date' } }] },
      { dateRanges: range, dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }], orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 12 },
      { dateRanges: range, dimensions: [{ name: 'sessionSource' }], metrics: [{ name: 'sessions' }], orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 8 },
      { dateRanges: range, dimensions: [{ name: 'city' }], metrics: [{ name: 'activeUsers' }], orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }], limit: 8 },
      { dateRanges: range, dimensions: [{ name: 'eventName' }, { name: 'pagePath' }], metrics: [{ name: 'eventCount' }],
        dimensionFilter: { andGroup: { expressions: [
          { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: '/play/' } } },
          { filter: { fieldName: 'eventName', inListFilter: { values: ['game_start', 'game_finish', 'share', 'help_open', 'lantern_lit', 'garden_care'] } } },
        ] } }, limit: 100 },
    ] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + r.status));
  const rows = (rep) => (rep.rows || []).map((x) => ({ d: x.dimensionValues.map((v) => v.value), m: x.metricValues.map((v) => Number(v.value)) }));
  const [daily, pages, sources, cities, events] = j.reports.map(rows);
  const games = {};
  events.forEach((e) => {
    const slug = (e.d[1].split('/')[2] || 'hub') || 'hub';
    const g = games[slug] = games[slug] || { starts: 0, finishes: 0, shares: 0, help: 0, lanterns: 0, care: 0 };
    const n = e.m[0];
    if (e.d[0] === 'game_start') g.starts += n;
    else if (e.d[0] === 'game_finish') g.finishes += n;
    else if (e.d[0] === 'share') g.shares += n;
    else if (e.d[0] === 'help_open') g.help += n;
    else if (e.d[0] === 'lantern_lit') g.lanterns += n;
    else if (e.d[0] === 'garden_care') g.care += n;
  });
  const sum = (i) => daily.reduce((a, x) => a + x.m[i], 0);
  return {
    configured: true,
    totals: { visitors: sum(0), newVisitors: sum(1), sessions: sum(2), pageViews: sum(3) },
    byDay: daily.map((x) => ({ d: x.d[0].slice(0, 4) + '-' + x.d[0].slice(4, 6) + '-' + x.d[0].slice(6, 8), visitors: x.m[0], pageViews: x.m[3] })),
    pages: pages.map((x) => ({ path: x.d[0], views: x.m[0], visitors: x.m[1] })),
    sources: sources.map((x) => ({ source: x.d[0], sessions: x.m[0] })),
    cities: cities.map((x) => ({ city: x.d[0], visitors: x.m[0] })),
    games,
  };
}

/* ---------------- handler ---------------- */
async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'GET only' }); }
  let db;
  try { app(); db = getFirestore(); } catch (e) { return res.status(503).json({ error: 'not configured' }); }

  if (!(await isAdmin(req, db))) return res.status(403).json({ error: 'admins only' });
  const days = [7, 30, 90].includes(Number(req.query && req.query.days)) ? Number(req.query.days) : 30;
  const now = Date.now();
  const todayKey = dayKey(now);
  const sinceMs = Date.parse(dayKey(now - (days - 1) * DAY) + 'T00:00:00Z') - TZ_MS;
  const keys = [];
  for (let i = days - 1; i >= 0; i--) keys.push(dayKey(now - i * DAY));

  try {
    const webPromise = webStats(days).catch((e) => ({ configured: true, error: e.message }));
    const [live, snaps, counsellors, presence, waitingNow, activeNow, newsletterAll, newsletterRange, lanternStats, lanternsRange] = await Promise.all([
      liveDays(db, sinceMs),
      db.collection('analyticsDaily').where('__name__', '>=', db.doc('analyticsDaily/' + keys[0])).where('__name__', '<=', db.doc('analyticsDaily/' + todayKey)).get(),
      db.collection('counsellors').get(),
      db.collection('presence').where('onlineUntil', '>', Timestamp.fromMillis(now)).get(),
      db.collection('chats').where('status', '==', 'waiting').get(),
      db.collection('chats').where('status', '==', 'active').count().get(),
      db.collection('newsletter').count().get(),
      db.collection('newsletter').where('subscribedAt', '>=', Timestamp.fromMillis(sinceMs)).count().get(),
      db.doc('lanternStats/all').get(),
      db.collection('lanterns').where('at', '>=', Timestamp.fromMillis(sinceMs)).count().get(),
    ]);
    const snapMap = {};
    snaps.forEach((d) => { snapMap[d.id] = d.data(); });

    const byHour = new Array(24).fill(0), byWeekday = new Array(7).fill(0);
    const t = { started: 0, answered: 0, missed: 0, crisis: 0, waitSumMin: 0, waitN: 0, waitUnder5: 0, requests: 0, requestsDone: 0 };
    const byDay = keys.map((k) => {
      const d = better(snapMap[k], live[k]) || emptyDay();
      Object.keys(t).forEach((f) => { t[f] += Number(d[f] || 0); });
      (d.byHour || []).forEach((n, h) => { byHour[h] += Number(n || 0); });
      byWeekday[new Date(k + 'T12:00:00Z').getUTCDay()] += Number(d.started || 0);
      return { d: k, started: d.started || 0, answered: d.answered || 0, missed: d.missed || 0, crisis: d.crisis || 0, requests: d.requests || 0 };
    });

    let active = 0, admins = 0;
    counsellors.forEach((c) => { const v = c.data(); if (v.active === true) { active++; if (v.role === 'admin') admins++; } });

    return res.status(200).json({
      range: { days, from: keys[0], to: todayKey },
      chats: {
        byDay, byHour, byWeekday,
        started: t.started, answered: t.answered, missed: t.missed, crisis: t.crisis,
        avgWaitMin: t.waitN ? Math.round((t.waitSumMin / t.waitN) * 10) / 10 : null,
        answeredWithin5: t.waitN ? Math.round((t.waitUnder5 / t.waitN) * 100) : null,
        // waiting chats whose visitor is still on the page (same 3-minute rule the counsellor inbox uses)
        waitingNow: waitingNow.docs.filter((d) => { const seen = toMs(d.data().visitorSeen); return seen && now - seen < 3 * 60000; }).length,
        activeNow: activeNow.data().count,
      },
      requests: { total: t.requests, done: t.requestsDone },
      counsellors: { active, admins, onlineNow: presence.size },
      newsletter: { total: newsletterAll.data().count, inRange: newsletterRange.data().count },
      lanterns: { total: (lanternStats.exists && lanternStats.data().total) || 0, inRange: lanternsRange.data().count },
      web: await webPromise,
      generatedAt: now,
    });
  } catch (e) {
    console.error('analytics failed', e.message);
    return res.status(500).json({ error: 'failed' });
  }
}

module.exports = handler;
module.exports.snapshot = snapshot;
