// Shared Firebase Admin set-up for the Vercel functions in api/ (files starting with _ are not routes).
const { initializeApp, cert, getApps } = require('firebase-admin/app');

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

module.exports = { app, readServiceAccount };
