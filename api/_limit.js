// Simple per-network rate limit for public forms, stored in Firestore as a hash of the address (never the address).
const crypto = require('crypto');
const { Timestamp } = require('firebase-admin/firestore');

module.exports = async function underLimit(db, req, bucket, perHour) {
  const ip = String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '').split(',')[0].trim();
  const key = crypto.createHash('sha256').update('zd-' + bucket + ':' + ip).digest('hex').slice(0, 40);
  const ref = db.doc('formLimits/' + bucket + '_' + key);
  const now = Date.now();
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const recent = ((snap.exists && snap.data().at) || []).map((t) => (t.toMillis ? t.toMillis() : 0)).filter((t) => now - t < 3600000);
      if (recent.length >= perHour) return false;
      recent.push(now);
      tx.set(ref, { at: recent.map((t) => Timestamp.fromMillis(t)), expireAt: Timestamp.fromMillis(now + 86400000) });
      return true;
    });
  } catch (e) {
    console.error('rate limit check failed', e.message);
    return true;   // never block real people because the check itself failed
  }
};
