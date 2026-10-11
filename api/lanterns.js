// Lantern Walk (/play/lantern-walk/): shared lanterns of encouragement.
//
// Safety by design: players never type free text. A lantern stores only the NUMBER of a pre-written message and a
// colour number, so nothing harmful, personal or spammy can ever be shown to another player. No names, no IP addresses
// (the rate limit stores only a hash, see _limit.js).
//
//   GET  /api/lanterns            -> { total, lanterns: [{ m, c, at }] }   most recent lanterns (newest first)
//   POST /api/lanterns {m, c}     -> { ok, total }                         light a lantern
//
// Uses the same FIREBASE_SERVICE_ACCOUNT as the other functions. Clients can't touch these collections directly
// (firestore.rules denies everything not listed), only this function can.
const { app } = require('./_firebase');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const underLimit = require('./_limit');

const MESSAGE_COUNT = 24;   // must match MESSAGES in play/lantern-walk/game.js
const COLOUR_COUNT = 4;
const SHOW = 30;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  let db;
  try { app(); db = getFirestore(); } catch (e) { console.error('lanterns: not configured', e.message); return res.status(503).json({ error: 'not configured' }); }
  const stats = db.doc('lanternStats/all');

  if (req.method === 'GET') {
    try {
      const [snap, s] = await Promise.all([
        db.collection('lanterns').orderBy('at', 'desc').limit(SHOW).get(),
        stats.get(),
      ]);
      const lanterns = snap.docs.map((d) => {
        const v = d.data();
        return { m: v.m, c: v.c, at: v.at && v.at.toMillis ? v.at.toMillis() : 0 };
      });
      return res.status(200).json({ total: (s.exists && s.data().total) || 0, lanterns });
    } catch (e) {
      console.error('lanterns: read failed', e.message);
      return res.status(500).json({ error: 'failed' });
    }
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
    body = body || {};
    const m = Number(body.m), c = Number(body.c);
    if (!Number.isInteger(m) || m < 0 || m >= MESSAGE_COUNT || !Number.isInteger(c) || c < 0 || c >= COLOUR_COUNT) {
      return res.status(400).json({ error: 'invalid' });
    }
    if (!(await underLimit(db, req, 'lanterns', 12))) return res.status(429).json({ error: 'too-many-requests' });
    try {
      const batch = db.batch();
      batch.set(db.collection('lanterns').doc(), { m, c, at: FieldValue.serverTimestamp(), expireAt: Timestamp.fromMillis(Date.now() + 30 * 86400000) });
      batch.set(stats, { total: FieldValue.increment(1) }, { merge: true });
      await batch.commit();
      const s = await stats.get();
      return res.status(200).json({ ok: true, total: (s.exists && s.data().total) || 0 });
    } catch (e) {
      console.error('lanterns: write failed', e.message);
      return res.status(500).json({ error: 'failed' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'GET or POST only' });
};
