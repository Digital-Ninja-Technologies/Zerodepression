// Admin-only: the newsletter list. GET ?count=1 returns {count}; plain GET returns an Excel (.xlsx) file.
// The caller sends their Firebase ID token (Authorization: Bearer ...) and must be an active admin.
const { app } = require('./_firebase');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const ExcelJS = require('exceljs');

async function isAdmin(req, db) {
  const m = /^Bearer (.+)$/.exec(String(req.headers.authorization || ''));
  if (!m) return false;
  try {
    const t = await getAuth().verifyIdToken(m[1]);
    if (!t.email || t.firebase?.sign_in_provider === 'anonymous') return false;
    const c = await db.doc('counsellors/' + String(t.email).toLowerCase()).get();
    return c.exists && c.data().active === true && c.data().role === 'admin';
  } catch (e) { return false; }
}

const lagos = (ts) => (ts && ts.toDate ? new Date(ts.toDate().getTime() + 3600000) : null);   // WAT, shown as a plain date-time

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'GET only' }); }
  let db;
  try { app(); db = getFirestore(); } catch (e) { return res.status(503).json({ error: 'not configured' }); }
  if (!(await isAdmin(req, db))) return res.status(403).json({ error: 'admins only' });

  try {
    if (req.query && req.query.count) {
      const c = await db.collection('newsletter').count().get();
      return res.status(200).json({ count: c.data().count });
    }
    const snap = await db.collection('newsletter').orderBy('subscribedAt', 'desc').get();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'ZeroDepression'; wb.created = new Date();
    const ws = wb.addWorksheet('Subscribers', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { header: 'First name', key: 'firstName', width: 22 },
      { header: 'Email', key: 'email', width: 34 },
      { header: 'Subscribed (Lagos time)', key: 'subscribedAt', width: 24, style: { numFmt: 'dd mmm yyyy, hh:mm' } },
      { header: 'Last sign-up (Lagos time)', key: 'lastSignupAt', width: 24, style: { numFmt: 'dd mmm yyyy, hh:mm' } },
      { header: 'Times signed up', key: 'signups', width: 16 },
      { header: 'Signed up on page', key: 'page', width: 26 },
    ];
    snap.docs.forEach((d) => {
      const x = d.data();
      ws.addRow({ firstName: x.firstName || '', email: x.email || d.id, subscribedAt: lagos(x.subscribedAt),
        lastSignupAt: lagos(x.lastSignupAt), signups: x.signups || 1, page: x.page || '' });
    });
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FF1B2340' } };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE3A8' } };
    head.alignment = { vertical: 'middle' };
    head.height = 20;
    ws.autoFilter = { from: 'A1', to: 'F1' };

    const buf = await wb.xlsx.writeBuffer();
    const day = new Date(Date.now() + 3600000).toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="zerodepression-subscribers-' + day + '.xlsx"');
    return res.status(200).send(Buffer.from(buf));
  } catch (e) {
    console.error('subscribers: failed', e.message);
    return res.status(500).json({ error: 'failed' });
  }
};
