// Run with: npm run test:rules   (starts the Firestore emulator, runs this file, stops it)
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, query, where,
  writeBatch, serverTimestamp, increment, Timestamp,
} from 'firebase/firestore';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
async function t(name, fn) {
  try { await fn(); results.push(true); console.log('PASS ' + name); }
  catch (e) { results.push(false); console.log('FAIL ' + name + '\n     ' + String(e.message || e).split('\n')[0]); }
}

const env = await initializeTestEnvironment({
  projectId: 'demo-zd-rules',
  firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
});

const days = (n) => Timestamp.fromMillis(Date.now() + n * 86400000);
const anon = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const staff = (uid, email, verified = true) =>
  env.authenticatedContext(uid, { email, email_verified: verified, firebase: { sign_in_provider: 'password' } }).firestore();
const guest = () => env.unauthenticatedContext().firestore();

async function reset() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'counsellors/sarah@example.com'), { displayName: 'Sarah', active: true });
    await setDoc(doc(db, 'counsellors/tunde@example.com'), { displayName: 'Tunde', active: true });
    await setDoc(doc(db, 'counsellors/gone@example.com'), { displayName: 'Gone', active: false });
    await setDoc(doc(db, 'counsellors/boss@example.com'), { displayName: 'Boss', active: true, role: 'admin' });
  });
}

const newChat = (uid, over = {}) => ({
  visitorUid: uid, nickname: 'Ada', status: 'waiting', counsellorUid: null, counsellorName: null, crisis: false,
  preview: '', msgCount: 0, createdAt: serverTimestamp(), lastActivity: serverTimestamp(), visitorSeen: serverTimestamp(),
  lastUserMsgAt: serverTimestamp(), claimedAt: null, closedAt: null, closedBy: null, expireAt: days(7), ...over,
});

// batch: message + chat counter update, as the real client does it
async function send(db, uid, who, body, extraChat = {}, msgOver = {}) {
  const b = writeBatch(db);
  const m = doc(collection(db, 'chats', uid, 'messages'));
  b.set(m, { sender: who, body, createdAt: serverTimestamp(), expireAt: days(7), ...msgOver });
  b.update(doc(db, 'chats', uid), {
    msgCount: increment(1), lastActivity: serverTimestamp(),
    ...(who === 'user' ? { lastUserMsgAt: serverTimestamp(), visitorSeen: serverTimestamp(), expireAt: days(7) } : {}),
    ...extraChat,
  });
  return b.commit();
}

const newCounsellor = (by = 'boss@example.com', over = {}) => ({
  displayName: 'Ife', active: true, role: 'counsellor', addedBy: by, addedAt: serverTimestamp(), ...over,
});

const V = 'visitor-1', V2 = 'visitor-2';
const mkChat = async (uid = V) => assertSucceeds(setDoc(doc(anon(uid), 'chats', uid), newChat(uid)));
const claim = (db, uid = V, name = 'Sarah', cuid = 'c-sarah') =>
  updateDoc(doc(db, 'chats', uid), { status: 'active', counsellorUid: cuid, counsellorName: name, claimedAt: serverTimestamp(), lastActivity: serverTimestamp() });

// ============================================================ visitor: creating a chat
await reset();
await t('visitor can create their own chat (doc id = their uid)', () => mkChat());
await t('...but not twice (cannot overwrite/reset an existing chat)', () => assertFails(setDoc(doc(anon(V), 'chats', V), newChat(V))));
await t('visitor cannot create a chat under someone else\'s uid', () => assertFails(setDoc(doc(anon(V2), 'chats', 'someone-else'), newChat(V2))));
await t('visitor cannot spoof visitorUid', () => assertFails(setDoc(doc(anon('v3'), 'chats', 'v3'), newChat('v3', { visitorUid: 'other' }))));
await t('unauthenticated user cannot create a chat', () => assertFails(setDoc(doc(guest(), 'chats', 'x'), newChat('x'))));
await t('a signed-in counsellor (non-anonymous) cannot create a visitor chat', () => assertFails(setDoc(doc(staff('c-sarah', 'sarah@example.com'), 'chats', 'c-sarah'), newChat('c-sarah'))));
await t('cannot create a chat that is already active', () => assertFails(setDoc(doc(anon('v4'), 'chats', 'v4'), newChat('v4', { status: 'active' }))));
await t('cannot create a chat pre-assigned to a counsellor', () => assertFails(setDoc(doc(anon('v5'), 'chats', 'v5'), newChat('v5', { counsellorUid: 'c-sarah' }))));
await t('cannot create a chat pre-flagged or with a fake message count', async () => {
  await assertFails(setDoc(doc(anon('v6'), 'chats', 'v6'), newChat('v6', { crisis: true })));
  await assertFails(setDoc(doc(anon('v6'), 'chats', 'v6'), newChat('v6', { msgCount: 50 })));
});
await t('rejects a nickname over 24 chars, an empty one, or a non-string', async () => {
  await assertFails(setDoc(doc(anon('v7'), 'chats', 'v7'), newChat('v7', { nickname: 'x'.repeat(25) })));
  await assertFails(setDoc(doc(anon('v7'), 'chats', 'v7'), newChat('v7', { nickname: '' })));
  await assertFails(setDoc(doc(anon('v7'), 'chats', 'v7'), newChat('v7', { nickname: 42 })));
});
await t('rejects extra fields and forged timestamps', async () => {
  await assertFails(setDoc(doc(anon('v8'), 'chats', 'v8'), newChat('v8', { isAdmin: true })));
  await assertFails(setDoc(doc(anon('v8'), 'chats', 'v8'), newChat('v8', { createdAt: Timestamp.fromMillis(0) })));
});
await t('rejects an expiry beyond 8 days (cannot make data immortal)', () => assertFails(setDoc(doc(anon('v9'), 'chats', 'v9'), newChat('v9', { expireAt: days(400) }))));

// ============================================================ visitor: reading + messaging
await t('visitor can read their own chat', () => assertSucceeds(getDoc(doc(anon(V), 'chats', V))));
await t('another visitor cannot read it', () => assertFails(getDoc(doc(anon(V2), 'chats', V))));
await t('unauthenticated users cannot read it', () => assertFails(getDoc(doc(guest(), 'chats', V))));
await t('a visitor cannot list all chats', () => assertFails(getDocs(collection(anon(V), 'chats'))));
await sleep(750);
await t('visitor can send a message (batched with the counter)', () => assertSucceeds(send(anon(V), V, 'user', 'hello there', { preview: 'hello there' })));
await t('...and read it back', async () => { const s = await assertSucceeds(getDocs(collection(anon(V), 'chats', V, 'messages'))); if (s.size !== 1) throw new Error('expected 1 message, got ' + s.size); });
await t('another visitor cannot read the messages', () => assertFails(getDocs(collection(anon(V2), 'chats', V, 'messages'))));
await t('sending again immediately is throttled (<600ms)', () => assertFails(send(anon(V), V, 'user', 'too fast')));
await sleep(750);
await t('a message without bumping the counter is rejected', async () => {
  const db = anon(V);
  await assertFails(setDoc(doc(collection(db, 'chats', V, 'messages')), { sender: 'user', body: 'sneaky', createdAt: serverTimestamp(), expireAt: days(7) }));
});
await t('bumping the counter by 2 for one message is rejected', async () => {
  const db = anon(V); const b = writeBatch(db);
  b.set(doc(collection(db, 'chats', V, 'messages')), { sender: 'user', body: 'x', createdAt: serverTimestamp(), expireAt: days(7) });
  b.update(doc(db, 'chats', V), { msgCount: increment(2), lastActivity: serverTimestamp(), lastUserMsgAt: serverTimestamp(), visitorSeen: serverTimestamp(), expireAt: days(7) });
  await assertFails(b.commit());
});
await t('a visitor cannot forge a counsellor message', () => assertFails(send(anon(V), V, 'user', 'I am a counsellor', {}, { sender: 'counsellor' })));
await t('rejects empty and over-long bodies', async () => {
  await assertFails(send(anon(V), V, 'user', ''));
  await assertFails(send(anon(V), V, 'user', 'x'.repeat(2001)));
});
await t('rejects extra fields on a message', () => assertFails(send(anon(V), V, 'user', 'hi', {}, { isAdmin: true })));
await t('crisis flag can be raised by the visitor', async () => { await sleep(750); await assertSucceeds(send(anon(V), V, 'user', 'I want to die', { crisis: true })); });
await t('...but never lowered again', async () => { await sleep(750); await assertFails(send(anon(V), V, 'user', 'ok', { crisis: false })); });
await t('preview cannot be rewritten once set', async () => { await sleep(750); await assertFails(send(anon(V), V, 'user', 'x', { preview: 'rewritten' })); });
await t('visitor cannot take over their chat (status/counsellor fields)', async () => {
  const d = doc(anon(V), 'chats', V);
  await assertFails(updateDoc(d, { status: 'active' }));
  await assertFails(updateDoc(d, { counsellorUid: 'c-sarah', counsellorName: 'Sarah' }));
  await assertFails(updateDoc(d, { visitorUid: 'someone' }));
});
await t('visitor keep-alive works but cannot smuggle other fields', async () => {
  await assertSucceeds(updateDoc(doc(anon(V), 'chats', V), { visitorSeen: serverTimestamp() }));
  await assertFails(updateDoc(doc(anon(V), 'chats', V), { visitorSeen: serverTimestamp(), crisis: false }));
});
await t('nobody can delete a chat or a message', async () => {
  await assertFails(deleteDoc(doc(anon(V), 'chats', V)));
  await assertFails(deleteDoc(doc(staff('c-sarah', 'sarah@example.com'), 'chats', V)));
});

// ============================================================ counsellors: queue + claim
await t('counsellor can query the waiting queue', () => assertSucceeds(getDocs(query(collection(staff('c-sarah', 'sarah@example.com'), 'chats'), where('status', '==', 'waiting')))));
await t('...but cannot list every chat', () => assertFails(getDocs(collection(staff('c-sarah', 'sarah@example.com'), 'chats'))));
await t('a verified email NOT on the allow-list gets nothing', async () => {
  const d = staff('x1', 'stranger@example.com');
  await assertFails(getDocs(query(collection(d, 'chats'), where('status', '==', 'waiting'))));
  await assertFails(claim(d, V, 'Stranger', 'x1'));
});
await t('an UNVERIFIED email (even on the list) gets nothing', async () => {
  const d = staff('x2', 'sarah@example.com', false);
  await assertFails(getDocs(query(collection(d, 'chats'), where('status', '==', 'waiting'))));
  await assertFails(claim(d, V, 'Sarah', 'x2'));
});
await t('a deactivated counsellor gets nothing', async () => {
  const d = staff('x3', 'gone@example.com');
  await assertFails(getDocs(query(collection(d, 'chats'), where('status', '==', 'waiting'))));
});
await t('an anonymous visitor cannot act as a counsellor', async () => assertFails(claim(anon('v10'), V, 'Sarah', 'v10')));
await t('counsellor cannot claim with a made-up display name', () => assertFails(claim(staff('c-sarah', 'sarah@example.com'), V, 'The Pope', 'c-sarah')));
await t('counsellor cannot claim in someone else\'s name (uid mismatch)', () => assertFails(claim(staff('c-sarah', 'sarah@example.com'), V, 'Sarah', 'c-tunde')));
await t('counsellor claims a waiting chat with their real name', () => assertSucceeds(claim(staff('c-sarah', 'sarah@example.com'))));
await t('a second counsellor cannot claim the same chat (no double-booking)', () => assertFails(claim(staff('c-tunde', 'tunde@example.com'), V, 'Tunde', 'c-tunde')));
await t('the other counsellor cannot read the claimed chat or its messages', async () => {
  const d = staff('c-tunde', 'tunde@example.com');
  await assertFails(getDoc(doc(d, 'chats', V)));
  await assertFails(getDocs(collection(d, 'chats', V, 'messages')));
});
await t('the owning counsellor can read the chat and messages', async () => {
  const d = staff('c-sarah', 'sarah@example.com');
  await assertSucceeds(getDoc(doc(d, 'chats', V)));
  const s = await assertSucceeds(getDocs(collection(d, 'chats', V, 'messages')));
  if (s.size < 2) throw new Error('expected the visitor messages');
});
await t('owning counsellor can reply', () => assertSucceeds(send(staff('c-sarah', 'sarah@example.com'), V, 'counsellor', 'Hi Ada, I am here.')));
await t('the other counsellor cannot reply into it', () => assertFails(send(staff('c-tunde', 'tunde@example.com'), V, 'counsellor', 'hijack')));
await t('a counsellor cannot post as the visitor', () => assertFails(send(staff('c-sarah', 'sarah@example.com'), V, 'counsellor', 'x', {}, { sender: 'user' })));
await t('visitor sees the counsellor\'s reply', async () => { const s = await assertSucceeds(getDocs(collection(anon(V), 'chats', V, 'messages'))); if (!s.docs.some((d) => d.data().sender === 'counsellor')) throw new Error('reply not visible'); });
await t('owning counsellor can hand the chat back', () => assertSucceeds(updateDoc(doc(staff('c-sarah', 'sarah@example.com'), 'chats', V), { status: 'waiting', counsellorUid: null, counsellorName: null, claimedAt: null, lastActivity: serverTimestamp() })));
await t('after hand-back the old counsellor can no longer read messages', () => assertFails(getDocs(collection(staff('c-sarah', 'sarah@example.com'), 'chats', V, 'messages'))));
await t('a different counsellor can now take it', () => assertSucceeds(claim(staff('c-tunde', 'tunde@example.com'), V, 'Tunde', 'c-tunde')));
await t('counsellor cannot end a chat they do not own', () => assertFails(updateDoc(doc(staff('c-sarah', 'sarah@example.com'), 'chats', V), { status: 'closed', closedBy: 'counsellor', closedAt: serverTimestamp(), lastActivity: serverTimestamp(), expireAt: days(7) })));
await t('owning counsellor can end it (and must say so honestly)', async () => {
  const d = doc(staff('c-tunde', 'tunde@example.com'), 'chats', V);
  await assertFails(updateDoc(d, { status: 'closed', closedBy: 'user', closedAt: serverTimestamp(), lastActivity: serverTimestamp(), expireAt: days(7) }));
  await assertSucceeds(updateDoc(d, { status: 'closed', closedBy: 'counsellor', closedAt: serverTimestamp(), lastActivity: serverTimestamp(), expireAt: days(7) }));
});
await t('no one can message into a closed chat', async () => {
  await assertFails(send(staff('c-tunde', 'tunde@example.com'), V, 'counsellor', 'late'));
  await sleep(750);
  await assertFails(send(anon(V), V, 'user', 'late'));
});
await t('the visitor can still read the finished conversation', () => assertSucceeds(getDocs(collection(anon(V), 'chats', V, 'messages'))));

// ============================================================ visitor ends their own chat
await reset();
await mkChat('v-end');
await t('visitor can end their own chat', () => assertSucceeds(updateDoc(doc(anon('v-end'), 'chats', 'v-end'), { status: 'closed', closedBy: 'user', closedAt: serverTimestamp(), lastActivity: serverTimestamp(), expireAt: days(7) })));
await t('...but not claim a counsellor ended it', async () => {
  await mkChat('v-end2');
  await assertFails(updateDoc(doc(anon('v-end2'), 'chats', 'v-end2'), { status: 'closed', closedBy: 'counsellor', closedAt: serverTimestamp(), lastActivity: serverTimestamp(), expireAt: days(7) }));
});

// ============================================================ allow-list + presence + everything else
await reset();
await t('counsellor can read only their own allow-list entry', async () => {
  const d = staff('c-sarah', 'sarah@example.com');
  const s = await assertSucceeds(getDoc(doc(d, 'counsellors', 'sarah@example.com')));
  if (s.data().displayName !== 'Sarah') throw new Error('wrong data');
  await assertFails(getDoc(doc(d, 'counsellors', 'tunde@example.com')));
});
await t('plain counsellors and visitors cannot list or edit the allow-list', async () => {
  const d = staff('c-sarah', 'sarah@example.com');
  await assertFails(getDocs(collection(d, 'counsellors')));
  await assertFails(setDoc(doc(d, 'counsellors', 'sarah@example.com'), { displayName: 'Boss', active: true, role: 'admin' }));
  await assertFails(updateDoc(doc(d, 'counsellors', 'sarah@example.com'), { role: 'admin' }));
  await assertFails(setDoc(doc(d, 'counsellors', 'new@example.com'), newCounsellor('sarah@example.com')));
  await assertFails(setDoc(doc(anon('v11'), 'counsellors', 'v11@example.com'), newCounsellor('v11@example.com')));
  await assertFails(getDocs(collection(guest(), 'counsellors')));
});

// ============================================================ admin: managing counsellors
const admin = () => staff('c-boss', 'boss@example.com');
await reset();
await t('an admin can list the counsellors', async () => {
  const s = await assertSucceeds(getDocs(collection(admin(), 'counsellors')));
  if (s.size !== 4) throw new Error('expected 4, got ' + s.size);
});
await t('an admin can read any counsellor entry', () => assertSucceeds(getDoc(doc(admin(), 'counsellors', 'tunde@example.com'))));
await t('an admin can add a counsellor or another admin', async () => {
  await assertSucceeds(setDoc(doc(admin(), 'counsellors', 'ife@example.com'), newCounsellor()));
  await assertSucceeds(setDoc(doc(admin(), 'counsellors', 'ada@example.com'), newCounsellor('boss@example.com', { role: 'admin' })));
});
await t('the added counsellor can then use the inbox', async () => {
  await assertSucceeds(getDocs(query(collection(staff('c-ife', 'ife@example.com'), 'chats'), where('status', '==', 'waiting'))));
});
await t('add rejects bad emails, bad roles, bad names, forged addedBy, extra fields', async () => {
  const d = admin();
  await assertFails(setDoc(doc(d, 'counsellors', 'not-an-email'), newCounsellor()));
  await assertFails(setDoc(doc(d, 'counsellors', 'Mixed@Example.com'), newCounsellor()));
  await assertFails(setDoc(doc(d, 'counsellors', 'x@example.com'), newCounsellor('boss@example.com', { role: 'owner' })));
  await assertFails(setDoc(doc(d, 'counsellors', 'x@example.com'), newCounsellor('boss@example.com', { displayName: '' })));
  await assertFails(setDoc(doc(d, 'counsellors', 'x@example.com'), newCounsellor('boss@example.com', { displayName: 'x'.repeat(41) })));
  await assertFails(setDoc(doc(d, 'counsellors', 'x@example.com'), newCounsellor('someone@else.com')));
  await assertFails(setDoc(doc(d, 'counsellors', 'x@example.com'), newCounsellor('boss@example.com', { active: false })));
  await assertFails(setDoc(doc(d, 'counsellors', 'x@example.com'), newCounsellor('boss@example.com', { extra: 1 })));
});
await t('an admin can rename, deactivate, reactivate and promote others', async () => {
  const d = admin();
  await assertSucceeds(updateDoc(doc(d, 'counsellors', 'tunde@example.com'), { displayName: 'Tunde O.' }));
  await assertSucceeds(updateDoc(doc(d, 'counsellors', 'tunde@example.com'), { active: false }));
  await assertSucceeds(updateDoc(doc(d, 'counsellors', 'tunde@example.com'), { active: true }));
  await assertSucceeds(updateDoc(doc(d, 'counsellors', 'sarah@example.com'), { role: 'admin' }));
});
await t('a deactivated counsellor loses inbox access immediately', async () => {
  await assertSucceeds(updateDoc(doc(admin(), 'counsellors', 'tunde@example.com'), { active: false }));
  await assertFails(getDocs(query(collection(staff('c-tunde', 'tunde@example.com'), 'chats'), where('status', '==', 'waiting'))));
});
await t('an admin cannot deactivate or demote themselves, but can rename themselves', async () => {
  const d = admin();
  await assertFails(updateDoc(doc(d, 'counsellors', 'boss@example.com'), { active: false }));
  await assertFails(updateDoc(doc(d, 'counsellors', 'boss@example.com'), { role: 'counsellor' }));
  await assertSucceeds(updateDoc(doc(d, 'counsellors', 'boss@example.com'), { displayName: 'The Boss' }));
});
await t('update cannot touch addedBy/addedAt, set a bad role, or delete the doc', async () => {
  const d = admin();
  await assertFails(updateDoc(doc(d, 'counsellors', 'sarah@example.com'), { addedBy: 'x@y.com' }));
  await assertFails(updateDoc(doc(d, 'counsellors', 'sarah@example.com'), { role: 'owner' }));
  await assertFails(deleteDoc(doc(d, 'counsellors', 'sarah@example.com')));
});
await t('a deactivated or unverified admin has no admin powers', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => updateDoc(doc(ctx.firestore(), 'counsellors/boss@example.com'), { active: false }));
  await assertFails(getDocs(collection(admin(), 'counsellors')));
  await env.withSecurityRulesDisabled(async (ctx) => updateDoc(doc(ctx.firestore(), 'counsellors/boss@example.com'), { active: true }));
  await assertFails(getDocs(collection(staff('c-boss', 'boss@example.com', false), 'counsellors')));
});
await reset();
await t('visitors and the public can see who is online (timestamps only)', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), 'presence', 'c-sarah'), { lastSeen: Timestamp.now() }));
  await assertSucceeds(getDocs(collection(guest(), 'presence')));
});
await t('a counsellor can write their own presence, nobody else\'s', async () => {
  const d = staff('c-sarah', 'sarah@example.com');
  await assertSucceeds(setDoc(doc(d, 'presence', 'c-sarah'), { lastSeen: serverTimestamp() }));
  await assertFails(setDoc(doc(d, 'presence', 'c-tunde'), { lastSeen: serverTimestamp() }));
  await assertFails(setDoc(doc(d, 'presence', 'c-sarah'), { lastSeen: serverTimestamp(), name: 'Sarah' }));
});
await t('a visitor cannot fake counsellor presence', () => assertFails(setDoc(doc(anon('v12'), 'presence', 'v12'), { lastSeen: serverTimestamp() })));
await t('any other collection is closed', async () => {
  await assertFails(getDoc(doc(guest(), 'secrets', 'a')));
  await assertFails(setDoc(doc(staff('c-sarah', 'sarah@example.com'), 'secrets', 'a'), { x: 1 }));
});

// ============================================================ contact requests
const cReq = (uid, over = {}) => ({
  visitorUid: uid, name: 'Ada', method: 'whatsapp', status: 'new', claimedBy: null, claimedByName: null,
  createdAt: serverTimestamp(), claimedAt: null, doneAt: null, expireAt: days(7), ...over,
});
const cDet = (over = {}) => ({ contact: '+2348012345678', note: 'Evenings are best', expireAt: days(7), ...over });
const reqRef = (db, uid) => doc(db, 'contactRequests', uid);
const detRef = (db, uid) => doc(db, 'contactRequests', uid, 'private', 'details');
function submitContact(db, uid, reqOver = {}, detOver = {}) {
  const b = writeBatch(db);
  b.set(reqRef(db, uid), cReq(uid, reqOver));
  b.set(detRef(db, uid), cDet(detOver));
  return b.commit();
}
const sarah = () => staff('c-sarah', 'sarah@example.com');
const tunde = () => staff('c-tunde', 'tunde@example.com');
const acceptReq = (db, uid, cuid = 'c-sarah', name = 'Sarah') =>
  updateDoc(reqRef(db, uid), { status: 'accepted', claimedBy: cuid, claimedByName: name, claimedAt: serverTimestamp() });
const finishReq = (db, uid) => {
  const b = writeBatch(db);
  b.update(reqRef(db, uid), { status: 'done', doneAt: serverTimestamp() });
  b.delete(detRef(db, uid));
  return b.commit();
};
const CV = 'contact-v1';

await reset();
await t('a visitor can submit contact details (request + private details in one batch)', () => assertSucceeds(submitContact(anon(CV), CV)));
await t('...but only once per identity', () => assertFails(submitContact(anon(CV), CV)));
await t('the request cannot be written without its details', () => assertFails(setDoc(reqRef(anon('contact-v2'), 'contact-v2'), cReq('contact-v2'))));
await t('details cannot be added later to an existing request', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), 'contactRequests/contact-v3'), {
    visitorUid: 'contact-v3', name: 'Z', method: 'call', status: 'new', claimedBy: null, claimedByName: null,
    createdAt: Timestamp.now(), claimedAt: null, doneAt: null, expireAt: days(7) }));
  await assertFails(setDoc(detRef(anon('contact-v3'), 'contact-v3'), cDet()));
});
await t('a visitor cannot submit for someone else, and signed-out or staff users cannot submit', async () => {
  await assertFails(submitContact(anon('contact-v4'), 'someone-else'));
  await assertFails(submitContact(guest(), 'contact-v5'));
  await assertFails(submitContact(sarah(), 'c-sarah'));
});
await t('request validation: name, method, status, claim fields, timestamps and extra fields are enforced', async () => {
  const d = anon('contact-v6');
  await assertFails(submitContact(d, 'contact-v6', { name: '' }));
  await assertFails(submitContact(d, 'contact-v6', { name: 'x'.repeat(41) }));
  await assertFails(submitContact(d, 'contact-v6', { method: 'carrier-pigeon' }));
  await assertFails(submitContact(d, 'contact-v6', { status: 'accepted' }));
  await assertFails(submitContact(d, 'contact-v6', { claimedBy: 'c-sarah' }));
  await assertFails(submitContact(d, 'contact-v6', { visitorUid: 'other' }));
  await assertFails(submitContact(d, 'contact-v6', { createdAt: days(-1) }));
  await assertFails(submitContact(d, 'contact-v6', { expireAt: days(30) }));
  await assertFails(submitContact(d, 'contact-v6', { extra: 1 }));
});
await t('details validation: contact length, note length, extra fields and expiry are enforced', async () => {
  const d = anon('contact-v7');
  await assertFails(submitContact(d, 'contact-v7', {}, { contact: 'ab' }));
  await assertFails(submitContact(d, 'contact-v7', {}, { contact: 'x'.repeat(121) }));
  await assertFails(submitContact(d, 'contact-v7', {}, { note: 'x'.repeat(501) }));
  await assertFails(submitContact(d, 'contact-v7', {}, { expireAt: days(30) }));
  await assertFails(submitContact(d, 'contact-v7', {}, { extra: 1 }));
  await assertSucceeds(submitContact(d, 'contact-v7', {}, { note: '' }));
});
await t('the visitor can read their own request but not the private details, and cannot edit it', async () => {
  const d = anon(CV);
  await assertSucceeds(getDoc(reqRef(d, CV)));
  await assertFails(getDoc(detRef(d, CV)));
  await assertFails(updateDoc(reqRef(d, CV), { name: 'Changed' }));
  await assertFails(acceptReq(d, CV, CV, 'Ada'));
  await assertFails(getDoc(reqRef(anon('someone'), CV)));
});
await t('counsellors can list new requests but cannot see the details before accepting', async () => {
  const d = sarah();
  const q = await assertSucceeds(getDocs(query(collection(d, 'contactRequests'), where('status', '==', 'new'))));
  if (q.size < 1) throw new Error('expected at least one request');
  await assertFails(getDoc(detRef(d, CV)));
  await assertFails(getDocs(collection(d, 'contactRequests')));
});
await t('visitors, signed-out users and inactive counsellors cannot list the queue', async () => {
  await assertFails(getDocs(query(collection(anon('nosy'), 'contactRequests'), where('status', '==', 'new'))));
  await assertFails(getDocs(query(collection(guest(), 'contactRequests'), where('status', '==', 'new'))));
  await assertFails(getDocs(query(collection(staff('c-gone', 'gone@example.com'), 'contactRequests'), where('status', '==', 'new'))));
});

await reset();
await submitContact(anon(CV), CV);
await t('the first counsellor to accept wins; the second is refused', async () => {
  await assertSucceeds(acceptReq(sarah(), CV));
  await assertFails(acceptReq(tunde(), CV, 'c-tunde', 'Tunde'));
});
await t('only the counsellor who accepted can read the details or the request', async () => {
  const d = await assertSucceeds(getDoc(detRef(sarah(), CV)));
  if (d.data().contact !== '+2348012345678') throw new Error('wrong details');
  await assertFails(getDoc(detRef(tunde(), CV)));
  await assertFails(getDoc(reqRef(tunde(), CV)));
  await assertSucceeds(getDoc(reqRef(sarah(), CV)));
  const mine = await assertSucceeds(getDocs(query(collection(sarah(), 'contactRequests'), where('claimedBy', '==', 'c-sarah'), where('status', '==', 'accepted'))));
  if (mine.size !== 1) throw new Error('expected 1 follow-up');
});
await t('the visitor still cannot read their details back once accepted', () => assertFails(getDoc(detRef(anon(CV), CV))));

await reset();
await submitContact(anon('contact-v8'), 'contact-v8');
await t('accept validation: name must match, claimedBy must be the caller, nothing else may change', async () => {
  const d = sarah();
  await assertFails(acceptReq(d, 'contact-v8', 'c-sarah', 'Someone Else'));
  await assertFails(acceptReq(d, 'contact-v8', 'c-tunde', 'Sarah'));
  await assertFails(updateDoc(reqRef(d, 'contact-v8'), { status: 'accepted', claimedBy: 'c-sarah', claimedByName: 'Sarah', claimedAt: serverTimestamp(), name: 'Renamed' }));
  await assertFails(updateDoc(reqRef(d, 'contact-v8'), { status: 'done', doneAt: serverTimestamp() }));
  await assertSucceeds(acceptReq(d, 'contact-v8'));
});
await t('only the counsellor who accepted can hand the request back; then anyone can accept it', async () => {
  const back = (db) => updateDoc(reqRef(db, 'contact-v8'), { status: 'new', claimedBy: null, claimedByName: null, claimedAt: null });
  await assertFails(back(tunde()));
  await assertSucceeds(back(sarah()));
  await assertFails(getDoc(detRef(sarah(), 'contact-v8')));
  await assertSucceeds(acceptReq(tunde(), 'contact-v8', 'c-tunde', 'Tunde'));
  await assertSucceeds(getDoc(detRef(tunde(), 'contact-v8')));
});
await t('marking done must delete the private details in the same batch', async () => {
  await assertFails(updateDoc(reqRef(tunde(), 'contact-v8'), { status: 'done', doneAt: serverTimestamp() }));
  await assertFails(finishReq(sarah(), 'contact-v8'));
  await assertSucceeds(finishReq(tunde(), 'contact-v8'));
  await assertFails(getDoc(detRef(tunde(), 'contact-v8')));
});
await t('details cannot be deleted on their own, and nobody can delete a request', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'contactRequests/contact-v10'), { visitorUid: 'contact-v10', name: 'Z', method: 'call', status: 'accepted', claimedBy: 'c-sarah', claimedByName: 'Sarah', createdAt: Timestamp.now(), claimedAt: Timestamp.now(), doneAt: null, expireAt: days(7) });
    await setDoc(doc(ctx.firestore(), 'contactRequests/contact-v10/private/details'), cDet());
  });
  await assertFails(deleteDoc(detRef(sarah(), 'contact-v10')));
  await assertFails(deleteDoc(reqRef(sarah(), 'contact-v10')));
  await assertFails(deleteDoc(reqRef(admin(), 'contact-v10')));
  await assertFails(deleteDoc(reqRef(anon('contact-v10'), 'contact-v10')));
});


await env.cleanup();
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
