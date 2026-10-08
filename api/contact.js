// Contact-us form: emails what the visitor typed to the ZeroDepression inbox via Resend (the same sender the
// counsellor alerts use). Replying to the email replies to the visitor.
//
// Spam guards: a hidden "website" field bots fill in, length limits, and at most 5 messages per hour from one
// network address (stored only as a hash, in Firestore formLimits/).
const { app } = require('./_firebase');
const { getFirestore } = require('firebase-admin/firestore');
const underLimit = require('./_limit');

const TO = process.env.CONTACT_TO || 'officialzerodepression@gmail.com';
const PER_HOUR = 5;
const TOPICS = ['Become a counsellor', 'Volunteer as a team member', 'Sponsorship / partnership'];

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function clean(v, max) { return String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim().slice(0, max); }

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'POST only' }); }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  body = body || {};

  if (clean(body.website, 200)) return res.status(200).json({ ok: true });   // honeypot: quietly drop bots

  const name = clean(body.name, 100);
  const email = clean(body.email, 254).toLowerCase();
  const topic = TOPICS.includes(body.topic) ? body.topic : 'Just saying hello';
  const message = clean(body.message, 5000);
  if (!name || !message || !/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(email)) {
    return res.status(400).json({ error: 'invalid' });
  }
  if (!process.env.RESEND_API_KEY || !process.env.ALERT_FROM) return res.status(503).json({ error: 'not configured' });
  let db = null;
  try { app(); db = getFirestore(); } catch (e) { /* no Firestore: skip the limit rather than lose real messages */ }
  if (db && !(await underLimit(db, req, 'contact', PER_HOUR))) return res.status(429).json({ error: 'too-many-requests' });

  const from = process.env.ALERT_FROM.replace(/^[^<]*</, 'ZeroDepression website <');
  const html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1b2340">' +
    '<p style="margin:0 0 12px"><strong>New message from the ZeroDepression contact form</strong></p>' +
    '<table style="border-collapse:collapse;margin-bottom:14px">' +
    '<tr><td style="padding:4px 14px 4px 0;color:#5b6475">Name</td><td style="padding:4px 0">' + esc(name) + '</td></tr>' +
    '<tr><td style="padding:4px 14px 4px 0;color:#5b6475">Email</td><td style="padding:4px 0"><a href="mailto:' + esc(email) + '">' + esc(email) + '</a></td></tr>' +
    '<tr><td style="padding:4px 14px 4px 0;color:#5b6475">Topic</td><td style="padding:4px 0">' + esc(topic) + '</td></tr></table>' +
    '<div style="white-space:pre-wrap;padding:12px 14px;background:#fff7e6;border-radius:8px">' + esc(message) + '</div>' +
    '<p style="font-size:13px;color:#5b6475;margin-top:14px">Reply to this email to answer ' + esc(name) + ' directly.</p></div>';
  const text = 'New message from the ZeroDepression contact form\n\nName: ' + name + '\nEmail: ' + email + '\nTopic: ' + topic +
    '\n\n' + message + '\n\nReply to this email to answer ' + name + ' directly.';

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to: [TO], reply_to: email,
        subject: 'Contact form: ' + topic + ' from ' + name.replace(/[\r\n]+/g, ' '),
        html, text,
      }),
    });
    if (!r.ok) { console.error('contact: email failed', r.status, await r.text().catch(() => '')); return res.status(502).json({ error: 'email-failed' }); }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('contact: failed', e.message);
    return res.status(500).json({ error: 'failed' });
  }
};
