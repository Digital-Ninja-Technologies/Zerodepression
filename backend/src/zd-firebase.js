// Thin wrapper over the Firebase SDK for the anonymous chat. Bundled by `npm run build:sdk` into
// assets/js/vendor/zd-firebase.js so the site never loads scripts from Google's CDN.
import { initializeApp } from 'firebase/app';
import {
  initializeAuth, browserSessionPersistence, connectAuthEmulator, signInAnonymously, signOut,
  onAuthStateChanged, isSignInWithEmailLink, sendSignInLinkToEmail, signInWithEmailLink,
  signInWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification,
} from 'firebase/auth';
import {
  initializeFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, collection, query, where,
  orderBy, onSnapshot, getDocs, writeBatch, serverTimestamp, increment, Timestamp, deleteDoc,
} from 'firebase/firestore';

const KEEP_DAYS = 7;
const inDays = (n) => Timestamp.fromMillis(Date.now() + n * 86400000);

function init(config) {
  const app = initializeApp(config);
  // Session persistence: the anonymous identity lives only in this tab and disappears when it closes.
  const auth = initializeAuth(app, { persistence: browserSessionPersistence });
  // Long-polling auto-detect keeps the chat working behind proxies and on poor mobile networks.
  const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  if (config.emulator) {
    connectAuthEmulator(auth, config.emulator.auth, { disableWarnings: true });
    connectFirestoreEmulator(db, config.emulator.firestore[0], config.emulator.firestore[1]);
  }

  const ms = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : typeof v === 'number' ? v : null);
  const plain = (snap) => {
    const d = snap.data({ serverTimestamps: 'estimate' });
    const out = { id: snap.id, pending: snap.metadata.hasPendingWrites };
    for (const k of Object.keys(d)) out[k] = d[k] && typeof d[k].toMillis === 'function' ? d[k].toMillis() : d[k];
    return out;
  };

  // ------------------------------------------------------------------ shared
  const chatRef = (uid) => doc(db, 'chats', uid);

  async function sendMessage(uid, who, body, extra = {}) {
    const b = writeBatch(db);
    b.set(doc(collection(db, 'chats', uid, 'messages')), {
      sender: who, body, createdAt: serverTimestamp(), expireAt: inDays(KEEP_DAYS),
    });
    b.update(chatRef(uid), {
      msgCount: increment(1), lastActivity: serverTimestamp(),
      ...(who === 'user' ? { lastUserMsgAt: serverTimestamp(), visitorSeen: serverTimestamp(), expireAt: inDays(KEEP_DAYS) } : {}),
      ...extra,
    });
    await b.commit();
  }

  function watchMessages(uid, onList, onError) {
    return onSnapshot(
      query(collection(db, 'chats', uid, 'messages'), orderBy('createdAt')),
      (snap) => onList(snap.docs.map(plain)),
      onError
    );
  }

  const watchChat = (uid, cb, onError) =>
    onSnapshot(chatRef(uid), (s) => cb(s.exists() ? plain(s) : null), onError);

  // ------------------------------------------------------------------ visitor
  const visitor = {
    onAuth: (cb) => onAuthStateChanged(auth, (u) => cb(u && u.isAnonymous ? { uid: u.uid } : null)),

    async existingChat() {
      const u = auth.currentUser;
      if (!u || !u.isAnonymous) return null;
      const s = await getDoc(chatRef(u.uid));
      return s.exists() ? { uid: u.uid, chat: plain(s) } : null;
    },

    async start(nickname) {
      const cred = auth.currentUser && auth.currentUser.isAnonymous ? { user: auth.currentUser } : await signInAnonymously(auth);
      const uid = cred.user.uid;
      await setDoc(chatRef(uid), {
        visitorUid: uid, nickname, status: 'waiting', counsellorUid: null, counsellorName: null, crisis: false,
        preview: '', msgCount: 0, createdAt: serverTimestamp(), lastActivity: serverTimestamp(),
        visitorSeen: serverTimestamp(), lastUserMsgAt: serverTimestamp(), claimedAt: null, closedAt: null,
        closedBy: null, expireAt: inDays(KEEP_DAYS),
      });
      return uid;
    },

    watchChat, watchMessages,

    send: (uid, body, { crisis, preview } = {}) => {
      const extra = {};
      if (crisis) extra.crisis = true;
      if (preview) extra.preview = preview;
      return sendMessage(uid, 'user', body, extra);
    },

    heartbeat: (uid) => updateDoc(chatRef(uid), { visitorSeen: serverTimestamp() }),

    end: (uid) => updateDoc(chatRef(uid), {
      status: 'closed', closedBy: 'user', closedAt: serverTimestamp(), lastActivity: serverTimestamp(), expireAt: inDays(KEEP_DAYS),
    }),

    leave: () => signOut(auth),

    // Leave contact details for a counsellor to follow up. The request (name + preferred method) and the private
    // details (phone/email + note) are written together; only the counsellor who accepts can read the details.
    async submitContact({ name, method, contact, note }) {
      const cred = auth.currentUser && auth.currentUser.isAnonymous ? { user: auth.currentUser } : await signInAnonymously(auth);
      const uid = cred.user.uid;
      const b = writeBatch(db);
      b.set(doc(db, 'contactRequests', uid), {
        visitorUid: uid, name, method, status: 'new', claimedBy: null, claimedByName: null,
        createdAt: serverTimestamp(), claimedAt: null, doneAt: null, expireAt: inDays(KEEP_DAYS),
      });
      b.set(doc(db, 'contactRequests', uid, 'private', 'details'), { contact, note, expireAt: inDays(KEEP_DAYS) });
      await b.commit();
      return uid;
    },

    // Number of counsellors online: inbox open in the last 2 minutes, or Online toggle switched on. Public read.
    async online() {
      const now = Date.now();
      const [recent, toggled] = await Promise.all([
        getDocs(query(collection(db, 'presence'), where('lastSeen', '>', Timestamp.fromMillis(now - 120000)))),
        getDocs(query(collection(db, 'presence'), where('onlineUntil', '>', Timestamp.fromMillis(now)))),
      ]);
      const ids = new Set();
      recent.forEach((d) => ids.add(d.id));
      toggled.forEach((d) => ids.add(d.id));
      return ids.size;
    },
  };

  // ------------------------------------------------------------------ counsellor
  const staff = {
    onAuth: (cb) => onAuthStateChanged(auth, (u) => cb(u && !u.isAnonymous ? { uid: u.uid, email: (u.email || '').toLowerCase(), emailVerified: u.emailVerified } : null)),

    signInPassword: (email, password) => signInWithEmailAndPassword(auth, email, password),
    // Also how an account first gets a password: the reset link proves the person owns the email address.
    resetPassword: (email) => sendPasswordResetEmail(auth, email),
    sendVerification: () => (auth.currentUser ? sendEmailVerification(auth.currentUser) : Promise.resolve()),
    sendLink: (email, url) => sendSignInLinkToEmail(auth, email, { url, handleCodeInApp: true }),
    isLink: (href) => isSignInWithEmailLink(auth, href),
    completeLink: (email, href) => signInWithEmailLink(auth, email, href),
    signOut: () => signOut(auth),

    // Returns {displayName} for an approved counsellor, or null.
    async profile(email) {
      try {
        const s = await getDoc(doc(db, 'counsellors', email));
        return s.exists() && s.data().active === true
          ? { displayName: s.data().displayName, role: s.data().role === 'admin' ? 'admin' : 'counsellor' } : null;
      } catch (e) { return null; }
    },

    // merge keeps the Online toggle (onlineUntil) as it is
    heartbeat: (uid) => setDoc(doc(db, 'presence', uid), { lastSeen: serverTimestamp() }, { merge: true }),

    // ---- Online toggle: stay "online" (and get push/email alerts) until untilMs, or go offline with null
    setOnline: (uid, untilMs) => setDoc(doc(db, 'presence', uid), {
      lastSeen: serverTimestamp(), onlineUntil: untilMs ? Timestamp.fromMillis(untilMs) : null,
    }, { merge: true }),
    watchPresence: (uid, cb, onError) => onSnapshot(doc(db, 'presence', uid), (s) => {
      const d = s.exists() ? s.data() : {};
      cb({ onlineUntil: d.onlineUntil && typeof d.onlineUntil.toMillis === 'function' ? d.onlineUntil.toMillis() : null });
    }, onError),
    savePushDevice: (uid, deviceId, sub) => setDoc(doc(db, 'pushSubs', uid, 'devices', deviceId), {
      endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, updatedAt: serverTimestamp(),
    }),
    removePushDevice: (uid, deviceId) => deleteDoc(doc(db, 'pushSubs', uid, 'devices', deviceId)),

    watchWaiting: (cb, onError) => onSnapshot(query(collection(db, 'chats'), where('status', '==', 'waiting')), (s) => cb(s.docs.map(plain)), onError),
    watchMine: (uid, cb, onError) => onSnapshot(
      query(collection(db, 'chats'), where('counsellorUid', '==', uid), where('status', '==', 'active')),
      (s) => cb(s.docs.map(plain)), onError),

    watchChat, watchMessages,

    // ---- contact requests (people who left their details instead of chatting)
    watchNewContacts: (cb, onError) => onSnapshot(query(collection(db, 'contactRequests'), where('status', '==', 'new')), (s) => cb(s.docs.map(plain)), onError),
    watchMyContacts: (uid, cb, onError) => onSnapshot(
      query(collection(db, 'contactRequests'), where('claimedBy', '==', uid), where('status', '==', 'accepted')),
      (s) => cb(s.docs.map(plain)), onError),
    // Only the first counsellor to accept succeeds; everyone else is refused by the security rules.
    claimContact: (id, uid, name) => updateDoc(doc(db, 'contactRequests', id), {
      status: 'accepted', claimedBy: uid, claimedByName: name, claimedAt: serverTimestamp(),
    }),
    releaseContact: (id) => updateDoc(doc(db, 'contactRequests', id), {
      status: 'new', claimedBy: null, claimedByName: null, claimedAt: null,
    }),
    // Marks the request followed up and deletes the visitor's private details in the same batch.
    async finishContact(id) {
      const b = writeBatch(db);
      b.update(doc(db, 'contactRequests', id), { status: 'done', doneAt: serverTimestamp() });
      b.delete(doc(db, 'contactRequests', id, 'private', 'details'));
      await b.commit();
    },
    async contactDetails(id) {
      const s = await getDoc(doc(db, 'contactRequests', id, 'private', 'details'));
      return s.exists() ? { contact: s.data().contact, note: s.data().note } : null;
    },

    claim: (chatId, uid, name) => updateDoc(chatRef(chatId), {
      status: 'active', counsellorUid: uid, counsellorName: name, claimedAt: serverTimestamp(), lastActivity: serverTimestamp(),
    }),
    reply: (chatId, body) => sendMessage(chatId, 'counsellor', body),
    release: (chatId) => updateDoc(chatRef(chatId), {
      status: 'waiting', counsellorUid: null, counsellorName: null, claimedAt: null, lastActivity: serverTimestamp(),
    }),
    close: (chatId) => updateDoc(chatRef(chatId), {
      status: 'closed', closedBy: 'counsellor', closedAt: serverTimestamp(), lastActivity: serverTimestamp(), expireAt: inDays(KEEP_DAYS),
    }),
  };

  // ------------------------------------------------------------------ admin (role 'admin' in /counsellors)
  const admin = {
    watchCounsellors: (cb, onError) => onSnapshot(collection(db, 'counsellors'), (s) => cb(s.docs.map(plain)), onError),
    add: (email, displayName, role, byEmail) => setDoc(doc(db, 'counsellors', email), {
      displayName, active: true, role, addedBy: byEmail, addedAt: serverTimestamp(),
    }),
    update: (email, fields) => updateDoc(doc(db, 'counsellors', email), fields),
  };

  return { visitor, staff, admin, ms };
}

window.ZDFB = { init };
