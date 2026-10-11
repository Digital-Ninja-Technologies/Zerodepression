// Daily job (Vercel cron, see vercel.json): copies each recent day's chat and call-back totals (numbers only) into
// analyticsDaily/{YYYY-MM-DD}, so the admin Analytics card keeps long-term trends after chats expire.
// If CRON_SECRET is set in Vercel, only calls carrying it are accepted. The job only re-counts and keeps the larger
// totals, so an extra run does no harm.
const { app } = require('./_firebase');
const { getFirestore } = require('firebase-admin/firestore');
const { snapshot } = require('./analytics');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.CRON_SECRET && req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET) return res.status(401).json({ error: 'unauthorised' });
  let db;
  try { app(); db = getFirestore(); } catch (e) { return res.status(503).json({ error: 'not configured' }); }
  try { return res.status(200).json(await snapshot(db)); } catch (e) { console.error('analytics snapshot failed', e.message); return res.status(500).json({ error: 'failed' }); }
};
