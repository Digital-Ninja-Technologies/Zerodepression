// Sends push + email alerts to counsellors whose Online toggle is on when a visitor starts a chat or leaves
// contact details. Called by the visitor's browser right after it creates the chat / request (Vercel function).
//
// Abuse-safe by design: the caller only names a document; this function checks that the document really is
// a brand-new waiting chat or new contact request, sends at most one alert per document, and never includes
// anything the visitor typed in the alert.
//
// Environment variables (Vercel project settings):
//   FIREBASE_SERVICE_ACCOUNT  the Firebase service-account JSON (Project settings > Service accounts > Generate key)
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT   Web Push keys (subject: mailto:you@example.com)
//   RESEND_API_KEY, ALERT_FROM   email sending via Resend, e.g. ALERT_FROM="ZeroDepression <alerts@zerodepression.org>"
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const webpush = require('web-push');

const SITE = 'https://www.zerodepression.org';
const FRESH_MS = 10 * 60 * 1000;   // only alert for chats/requests created in the last 10 minutes
const INBOX_OPEN_MS = 2 * 60 * 1000;

// Accepts the service-account JSON however it was pasted into Vercel: whole file, without the outer braces,
// wrapped in quotes, prefixed with "FIREBASE_SERVICE_ACCOUNT=", or base64-encoded.
function readServiceAccount(raw) {
  let s = String(raw || '').trim();
  if (!s) return null;
  s = s.replace(/^FIREBASE_SERVICE_ACCOUNT\s*=\s*/, '').trim();
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('`') && s.endsWith('`'))) s = s.slice(1, -1).trim();
  const tries = [];
  if (!s.includes('{') && /^[A-Za-z0-9+/=\s]+$/.test(s)) {
    try { tries.push(Buffer.from(s, 'base64').toString('utf8').trim()); } catch (e) { /* not base64 */ }
  }
  tries.push(s);
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a !== -1 && b > a) tries.push(s.slice(a, b + 1));
  tries.push('{' + s.replace(/,\s*$/, '') + '}');
  // Not secret: the project's Firebase Admin SDK service account (Firebase console > Service accounts).
  const fallbackEmail = process.env.FIREBASE_CLIENT_EMAIL || 'firebase-adminsdk-fbsvc@zerodepression.iam.gserviceaccount.com';
  const fallbackProject = process.env.FIREBASE_PROJECT_ID || 'zerodepression';
  const finish = (v) => ({
    ...v,
    project_id: v.project_id || fallbackProject,
    client_email: v.client_email || fallbackEmail,
    private_key: String(v.private_key).replace(/\\n/g, '\n'),
  });
  for (const t of tries) {
    try {
      let v = JSON.parse(t);
      if (typeof v === 'string') {
        if (v.includes('BEGIN PRIVATE KEY')) return finish({ private_key: v });   // just the key, quoted
        v = JSON.parse(v);
      }
      if (v && v.private_key) return finish(v);   // whole file, or only part of it
    } catch (e) { /* try the next shape */ }
  }
  if (s.includes('BEGIN PRIVATE KEY') && !s.includes('{') && !s.includes('"')) return finish({ private_key: s });
  const shape = 'length ' + s.length + ', starts with ' + JSON.stringify(s.slice(0, 1)) + ', has client_email: ' + s.includes('client_email') + ', has private_key: ' + s.includes('private_key');
  throw new Error('FIREBASE_SERVICE_ACCOUNT is not a readable service-account JSON (' + shape + ')');
}

function app() {
  if (getApps().length) return getApps()[0];
  const sa = readServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
  return initializeApp({ credential: cert(sa) });
}

const MESSAGES = {
  chat: {
    title: 'New chat waiting',
    body: 'Someone would like to talk. Open your inbox to take the chat.',
    subject: 'Someone is waiting to chat on ZeroDepression',
  },
  contact: {
    title: 'New call-back request',
    body: 'Someone left their details for a counsellor to follow up.',
    subject: 'New call-back request on ZeroDepression',
  },
};

function emailHtml(m) {
  const url = SITE + '/counsellor/';
  return '<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#1b2340">' +
    '<p><strong>' + m.title + '.</strong> ' + m.body + '</p>' +
    '<p><a href="' + url + '" style="display:inline-block;background:#ffa500;color:#1b2340;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Open the counsellor inbox</a></p>' +
    '<p style="font-size:13px;color:#5b6475">You get this because your Online toggle is on. It switches off by itself after 8 hours, or you can turn it off in the inbox. ' +
    'For privacy, this email never includes anything the visitor wrote.</p></div>';
}

async function sendEmail(to, m) {
  if (!process.env.RESEND_API_KEY || !process.env.ALERT_FROM) return false;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.ALERT_FROM, to: [to], subject: m.subject, html: emailHtml(m),
      text: m.title + '. ' + m.body + '\n\nOpen the counsellor inbox: ' + SITE + '/counsellor/',
    }),
  });
  return r.ok;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'POST only' }); }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const kind = body && body.kind;
  const id = body && body.id;
  if (!MESSAGES[kind] || typeof id !== 'string' || !/^[A-Za-z0-9]{10,64}$/.test(id)) {
    return res.status(400).json({ error: 'bad request' });
  }

  let db, auth;
  try { app(); db = getFirestore(); auth = getAuth(); } catch (e) {
    console.error('notify: not configured', e.message);
    return res.status(503).json({ error: 'alerts not configured' });
  }

  try {
    // 1. The document must be a genuine, brand-new waiting chat / new request.
    const snap = await db.doc((kind === 'chat' ? 'chats/' : 'contactRequests/') + id).get();
    if (!snap.exists) return res.status(404).json({ error: 'not found' });
    const d = snap.data();
    const created = d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : 0;
    const wanted = kind === 'chat' ? 'waiting' : 'new';
    if (d.status !== wanted || Date.now() - created > FRESH_MS) return res.status(200).json({ skipped: 'not new' });

    // 2. At most one alert per chat/request, even if this is called repeatedly.
    try {
      await db.doc('notifications/' + kind + '_' + id).create({
        sentAt: FieldValue.serverTimestamp(), expireAt: Timestamp.fromMillis(Date.now() + 7 * 86400000),
      });
    } catch (e) {
      return res.status(200).json({ skipped: 'already sent' });
    }

    // 3. Everyone whose Online toggle is on and who is still an active counsellor.
    const now = Date.now();
    const online = await db.collection('presence').where('onlineUntil', '>', Timestamp.fromMillis(now)).get();
    const m = MESSAGES[kind];
    const payload = JSON.stringify({ title: m.title, body: m.body, url: '/counsellor/', tag: 'zd-' + kind });
    const pushReady = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
    if (pushReady) {
      webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:alerts@zerodepression.org',
        process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    }

    let pushed = 0, emailed = 0, people = 0;
    await Promise.all(online.docs.map(async (p) => {
      const uid = p.id;
      let email;
      try { email = ((await auth.getUser(uid)).email || '').toLowerCase(); } catch (e) { return; }
      if (!email) return;
      const c = await db.doc('counsellors/' + email).get();
      if (!c.exists || c.data().active !== true) return;
      people++;

      if (pushReady) {
        const devices = await db.collection('pushSubs/' + uid + '/devices').get();
        await Promise.all(devices.docs.map(async (dev) => {
          const s = dev.data();
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload,
              { TTL: 600, urgency: 'high', topic: 'zd-' + kind });
            pushed++;
          } catch (e) {
            if (e.statusCode === 404 || e.statusCode === 410) await dev.ref.delete().catch(() => {});   // expired subscription
            else console.error('notify: push failed', e.statusCode || e.message);
          }
        }));
      }

      // Email only those whose inbox isn't open right now (an open inbox already rings).
      const lastSeen = p.data().lastSeen && p.data().lastSeen.toMillis ? p.data().lastSeen.toMillis() : 0;
      if (now - lastSeen > INBOX_OPEN_MS) {
        try { if (await sendEmail(email, m)) emailed++; } catch (e) { console.error('notify: email failed', e.message); }
      }
    }));

    return res.status(200).json({ online: people, pushed, emailed });
  } catch (e) {
    console.error('notify: failed', e);
    return res.status(500).json({ error: 'failed' });
  }
};
