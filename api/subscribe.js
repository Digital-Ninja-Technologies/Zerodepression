// Newsletter sign-up: saves the first name + email to Firestore (newsletter/{email}). Admins download the list as
// an Excel file from the admin dashboard (api/subscribers.js). Signing up again with the same email doesn't
// duplicate it.
const { app } = require('./_firebase');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const underLimit = require('./_limit');

function clean(v, max) { return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max); }

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'POST only' }); }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  body = body || {};
  if (clean(body.website, 200)) return res.status(200).json({ ok: true });   // honeypot

  const name = clean(body.name, 60);
  const email = clean(body.email, 254).toLowerCase();
  if (!name || !/^[^@\s<>/]+@[^@\s<>/]+\.[^@\s<>/]+$/.test(email)) return res.status(400).json({ error: 'invalid' });

  let db;
  try { app(); db = getFirestore(); } catch (e) { console.error('subscribe: not configured', e.message); return res.status(503).json({ error: 'not configured' }); }
  if (!(await underLimit(db, req, 'newsletter', 10))) return res.status(429).json({ error: 'too-many-requests' });

  try {
    const ref = db.doc('newsletter/' + email);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) tx.update(ref, { firstName: name, lastSignupAt: FieldValue.serverTimestamp(), signups: FieldValue.increment(1) });
      else tx.set(ref, { firstName: name, email, page: clean(body.page, 200), subscribedAt: FieldValue.serverTimestamp(), lastSignupAt: FieldValue.serverTimestamp(), signups: 1 });
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('subscribe: failed', e.message);
    return res.status(500).json({ error: 'failed' });
  }
};
