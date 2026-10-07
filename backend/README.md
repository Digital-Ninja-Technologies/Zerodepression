# Anonymous counselling chat

Visitors chat anonymously at `/chat/`. Volunteer counsellors answer from `/counsellor/`.

## How it works

- **Backend:** Postgres functions in the Supabase project **ona** (`knffcabxyazookxchruq`), defined in
  [`zd_chat.sql`](zd_chat.sql). All data is in a private `zd_chat` schema that the REST API cannot read;
  the site only calls the 13 `public.zd_*` functions, each of which checks a secret.
- **Visitors** get a random per-chat secret when they start (kept in `sessionStorage`, stored hashed).
  No account, cookie, or analytics on the chat pages.
- **Counsellors** sign in with their email plus a personal access code (stored hashed, sessions last
  12 hours, 8 wrong attempts locks that email for 15 minutes).
- **Transport:** the browsers poll every ~2 seconds. No websockets, so it works on weak connections.
- **Frontend:** `assets/js/zd-api.js` (client), `chat.js` (visitor), `counsellor.js` (inbox),
  `assets/css/chat.css`. The key in `zd-api.js` is the project's public anon key, which is meant to
  be public.

## Add or remove a counsellor

Run in the Supabase SQL editor for the project (the `zd_chat` schema is not reachable from the API):

```sql
-- Add (or reset the code of) a counsellor. Prints their one-time access code: send it to them privately.
select zd_chat.create_counsellor('name@example.com', 'Name shown to visitors');

-- Remove access
update zd_chat.counsellors set active = false where email = 'name@example.com';
```

Counsellors sign in at `/counsellor/` with that email and code. Resetting a code signs out their old session.

## Go-live checklist

1. Add at least one counsellor (above). With nobody signed in, visitors can still queue and see the call button.
2. Install the 7-day purge. The chat tells visitors that finished chats are deleted after 7 days,
   so this **must** be in place before launch. It contains `DELETE` statements, so Supabase's SQL
   tooling asks for confirmation. Run `zd_chat._purge()` from `zd_chat.sql` in the SQL editor
   (it is already in that file). The housekeeping job calls it automatically once it exists.
   Check with: `select to_regprocedure('zd_chat._purge()');` (should not be null).
3. Do a live test: open `/chat/` in one browser and `/counsellor/` in another and exchange messages.
4. Tell counsellors to keep `/counsellor/` open and click **Turn on alerts** (sound plus desktop notification).

## What it does and doesn't do

- Crisis keywords (suicide, "want to die", self-harm...) flag a chat as **May be at risk**, move it to the
  top of the queue, and show the visitor 112 and the free line. This is a **keyword heuristic, not a
  classifier**: it will miss things, and a human must read every chat.
- Chats are deleted 7 days after they end. Abandoned and idle chats close automatically.
- A salted hash of the visitor's IP is kept for up to 2 hours purely to limit abuse (6 new chats per hour).
- Counsellors only hear about new chats while their inbox tab is open. There is no push when it is closed.
- There is no AI in the loop: every reply is written by a human volunteer.
- Nobody moderates counsellors' messages. Decide on a volunteer code of conduct and supervision.

## Operating notes

- Supabase free-tier projects pause after a week of inactivity. Keep ona active, or upgrade.
- The chat shares ona's database. Its tables and functions are prefixed `zd_` / live in `zd_chat`,
  and nothing in ona's own tables or settings was changed.
- To rotate the public key or move to another project, change `BASE` and `KEY` in `assets/js/zd-api.js`.

## Installing the purge on ona (one-off)

Run this in the Supabase SQL editor for ona (the app's database tooling blocks `DELETE`-containing SQL
without an interactive confirmation, so it has to be run by a person):

```sql
create or replace function zd_chat._purge() returns void
language plpgsql security definer set search_path = ''
as $fn$
begin
  delete from zd_chat.chats where status = 'closed' and closed_at < now() - interval '7 days';
  delete from zd_chat.sessions where expires_at < now() - interval '1 day';
  delete from zd_chat.rate where at < now() - interval '2 hours';
  delete from zd_chat.attempts where at < now() - interval '1 day';
end
$fn$;

revoke all on function zd_chat._purge() from public, anon, authenticated;
```
