# Anonymous counselling chat (Firebase)

Visitors chat anonymously at `/chat/`. Volunteer counsellors answer from `/counsellor/`; admins manage them at `/admin-dashboard/`.
Runs on Firebase **Authentication + Cloud Firestore** only. No Cloud Functions, so the free **Spark** plan is enough.

## How it works

| Piece | What it does |
| --- | --- |
| **Visitors** | Sign in *anonymously* (no email, no account). The anonymous ID lives only in that browser tab. Each visitor gets exactly one chat document, `chats/{their uid}`. |
| **Counsellors** | Sign in with an **email link** (no password). They are let in only if their *verified* email has an active entry in the `counsellors` collection. |
| **Security** | [`firestore.rules`](firestore.rules) is the whole security model: visitors can only touch their own chat, only approved counsellors can see the queue, only one counsellor can take a chat, nothing can be deleted by a client, and messages can't be forged. 72 automated tests cover it. |
| **Live updates** | Firestore pushes new messages instantly (no polling). |
| **Retention** | Every chat and message carries an `expireAt` date 7 days out; a Firestore TTL policy deletes them automatically. |
| **Frontend** | `assets/js/chat.js` (visitor), `counsellor.js` (inbox), `zd-config.js` (your project's public config), and `assets/js/vendor/zd-firebase.js` (the Firebase SDK, bundled from `src/zd-firebase.js` so the site loads nothing from Google's CDN). |

## One-time setup (about 10 minutes, in the Firebase console)

Until step 1 is done the chat pages show a safe "chat isn't available yet, please call" message.

1. **Add the web config.** Project settings → *Your apps* → add a **Web app** → copy the `firebaseConfig`
   values into [`assets/js/zd-config.js`](../assets/js/zd-config.js). (These values are public by design.)
2. **Authentication → Sign-in method**
   - Enable **Anonymous**.
   - Enable **Email/Password**, and inside it also turn on **Email link (passwordless sign-in)**.
   - **Settings → Authorized domains:** add every domain the site is served from (for example
     `zerodepression.vercel.app`, your custom domain, and any Vercel preview domain you test on). Email-link
     sign-in is refused on domains that aren't listed.
3. **Firestore Database → Create database** (production mode, the region closest to your users).
4. **Publish the rules.** Firestore → *Rules* → paste the whole of [`firestore.rules`](firestore.rules) → **Publish**.
   (Or, with the Firebase CLI: `firebase deploy --only firestore:rules` from this folder.)
5. **Turn on automatic deletion.** Firestore → *Time to live* (under *Indexes*) → create two TTL policies:
   - collection group **`chats`**, timestamp field **`expireAt`**
   - collection group **`messages`**, timestamp field **`expireAt`**

   Without these the site's "messages are deleted after about 7 days" promise is not true.
6. **Create the first admin.** Firestore → *Start collection* **`counsellors`**. Add a document whose **Document ID is
   your email in lowercase** with fields `displayName` (string), `active` (boolean, `true`) and `role` (string, `admin`).
   After that, sign in at `/admin-dashboard/` to add, rename, deactivate and promote counsellors; no more console work.
   (Counsellors added there get `role: counsellor`. Older docs with no `role` are treated as plain counsellors.)
7. **Try it.** Open `/counsellor/` and sign in with a counsellor email (check that inbox for the link, open it
   on the same device). In another browser open `/chat/`, start a chat, and exchange messages.

## Run the tests

```bash
cd backend
npm install
npm run test:rules    # 72 security-rule tests against the Firestore emulator (needs Java 11+)
npm run build:sdk     # rebuild assets/js/vendor/zd-firebase.js after editing src/zd-firebase.js
```

## What it does and doesn't do

- **Crisis keywords** (suicide, "want to die", self-harm...) flag a chat as *May be at risk*, move it to the
  top of the queue, and show the visitor 112 and the free line. This is a **keyword heuristic, not a
  classifier**: it runs in the visitor's browser, will miss things, and a human must read every chat.
- Counsellors only hear about new chats while their inbox tab is open (sound + optional desktop notification).
- The queue only shows visitors who are still on the page (they send a heartbeat every 25 seconds).
  Abandoned chats are hidden, not deleted, and are removed by the TTL policy.
- **Abuse limits are light.** Each visitor can have one chat per anonymous identity and can send one message per
  0.6 seconds, up to 400 per chat. Firebase throttles anonymous sign-ups per network. There is no server-side
  per-IP limit. If abuse appears, add Firebase **App Check**, or move to the Blaze plan and add Cloud Functions.
- Sending an email link to an address needs only that address, so someone could make Firebase email a
  counsellor a sign-in link. Only a verified, approved email can ever *use* one.
- There is no AI in the loop: every reply is written by a human volunteer.
- Nobody moderates counsellors' messages. Decide on a volunteer code of conduct and supervision.
