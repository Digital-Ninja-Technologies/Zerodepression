# Anonymous counselling chat (Firebase)

Visitors chat anonymously at `/chat/`. Volunteer counsellors answer from `/counsellor/`; admins manage them at `/admin-dashboard/`.
Runs on Firebase **Authentication + Cloud Firestore** only. No Cloud Functions, so the free **Spark** plan is enough.

## How it works

| Piece | What it does |
| --- | --- |
| **Visitors** | Sign in *anonymously* (no email, no account). The anonymous ID lives only in that browser tab. Each visitor gets exactly one chat document, `chats/{their uid}`. |
| **Counsellors** | Sign in with an **email link** (no password). They are let in only if their *verified* email has an active entry in the `counsellors` collection. |
| **Security** | [`firestore.rules`](firestore.rules) is the whole security model: visitors can only touch their own chat, only approved counsellors can see the queue, only one counsellor can take a chat, nothing can be deleted by a client, and messages can't be forged. 89 automated tests cover it. |
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
   - collection group **`contactRequests`**, timestamp field **`expireAt`**
   - collection group **`private`**, timestamp field **`expireAt`** (the visitors' phone numbers/emails; these are also
     deleted by the counsellor who marks the request followed up, so the TTL policy is the safety net)

   Without these the site's "messages are deleted after about 7 days" promise is not true.
6. **Create the first admin.** Firestore → *Start collection* **`counsellors`**. Add a document whose **Document ID is
   your email in lowercase** with fields `displayName` (string), `active` (boolean, `true`) and `role` (string, `admin`).
   After that, sign in at `/admin-dashboard/` to add, rename, deactivate and promote counsellors; no more console work.
   **Admin sign-in:** `/admin-dashboard/` accepts email + password (the *Email/Password* provider from step 2 covers it).
   A new admin signs in once with the emailed link, then uses *Set or reset my password* to choose a password; from then on
   they can sign in with email and password. Password accounts must have a verified email (the reset link verifies it),
   because the security rules only trust verified addresses.
   (Counsellors added there get `role: counsellor`. Older docs with no `role` are treated as plain counsellors.)
7. **Try it.** Open `/counsellor/` and sign in with a counsellor email (check that inbox for the link, open it
   on the same device). In another browser open `/chat/`, start a chat, and exchange messages.

## Contact requests ("Submit contact details")

On `/chat/`, visitors who would rather be contacted than wait can click **Submit contact details** (on the start screen or
while waiting). A pop-up form asks for a name, how to reach them (WhatsApp, phone call or email), the number or address, an
optional note and consent. It is stored as `contactRequests/{uid}` (name + method only) plus a private sub-document
`contactRequests/{uid}/private/details` (the number/email and note).

- Counsellors see the queue under **Contact requests** on `/counsellor/` (with a sound alert). The first one to click
  **Accept this request** wins (the security rules allow the write only while the status is still `new`) and can then see the
  details and a one-click WhatsApp/call/email link. Nobody else can read the details.
- **Mark as followed up** sets the status to `done` and deletes the details in the same batch; **Hand back** returns the request
  to the queue. Requests and details also expire after 7 days (TTL policies above).
- One request per anonymous browser identity, so repeat submissions from the same tab are refused.
- **Deploy order:** publish the new `firestore.rules` (and add the two TTL policies) before the new site goes live, otherwise the
  form will report an error until the rules are in place.

## Run the tests

```bash
cd backend
npm install
npm run test:rules    # 89 security-rule tests against the Firestore emulator (needs Java 11+)
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
