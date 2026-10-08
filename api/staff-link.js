// Emails a staff sign-in link from our own domain (via Resend), so counsellor and admin sign-in doesn't depend on
// Firebase's small daily allowance of sign-in emails on the free plan.
//
// The link is made with the Admin SDK (generateSignInWithEmailLink), which doesn't send anything itself; the page
// then finishes sign-in exactly as with a Firebase-sent link. Links are only sent to active counsellors/admins,
// at most one per address per minute, and the response is the same whether or not the address is on the list.
const { app } = require('./_firebase');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const SITE = 'https://www.zerodepression.org';
const PAGES = { counsellor: '/counsellor/', admin: '/admin-dashboard/' };
const GAP_MS = 60 * 1000;

function emailHtml(link, where) {
  return '<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#1b2340">' +
    '<p>Here is your sign-in link for the ZeroDepression ' + where + '.</p>' +
    '<p><a href="' + link + '" style="display:inline-block;background:#ffa500;color:#1b2340;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Sign in</a></p>' +
    '<p style="font-size:13px;color:#5b6475">Open it on the same device and browser where you asked for it. It works once and expires after a while. ' +
    'If you didn\'t ask to sign in, you can ignore this email.</p></div>';
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'POST only' }); }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const email = String((body && body.email) || '').trim().toLowerCase();
  const page = PAGES[body && body.page] ? body.page : 'counsellor';
  if (!/^[^@/\s]+@[^@/\s]+\.[^@/\s]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'invalid-email' });
  }
  if (!process.env.RESEND_API_KEY || !process.env.ALERT_FROM) return res.status(503).json({ error: 'not configured' });

  let db, auth;
  try { app(); db = getFirestore(); auth = getAuth(); } catch (e) {
    console.error('staff-link: not configured', e.message);
    return res.status(503).json({ error: 'not configured' });
  }

  try {
    const c = await db.doc('counsellors/' + email).get();
    if (!c.exists || c.data().active !== true) return res.status(200).json({ ok: true });   // same answer either way

    // At most one link per address per minute.
    const gate = db.doc('linkSends/' + email);
    const ok = await db.runTransaction(async (tx) => {
      const g = await tx.get(gate);
      const last = g.exists && g.data().at && g.data().at.toMillis ? g.data().at.toMillis() : 0;
      if (Date.now() - last < GAP_MS) return false;
      tx.set(gate, { at: Timestamp.now(), expireAt: Timestamp.fromMillis(Date.now() + 86400000) });
      return true;
    });
    if (!ok) return res.status(429).json({ error: 'too-many-requests' });

    const link = await auth.generateSignInWithEmailLink(email, { url: SITE + PAGES[page], handleCodeInApp: true });
    const where = page === 'admin' ? 'admin dashboard' : 'counsellor inbox';
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.ALERT_FROM, to: [email], subject: 'Your ZeroDepression sign-in link',
        html: emailHtml(link, where),
        text: 'Your sign-in link for the ZeroDepression ' + where + ':\n\n' + link + '\n\nOpen it on the same device and browser where you asked for it. If you didn\'t ask to sign in, ignore this email.',
      }),
    });
    if (!r.ok) { console.error('staff-link: email failed', r.status, await r.text().catch(() => '')); return res.status(502).json({ error: 'email-failed' }); }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('staff-link: failed', e.code || '', e.message);
    return res.status(500).json({ error: 'failed' });
  }
};
