-- ZeroDepression anonymous counselling chat: database schema and API.
--
-- Design
--   * All data lives in the private `zd_chat` schema: RLS on, no policies, no grants to
--     anon/authenticated. Nothing can read or write these tables through the REST API.
--   * The website talks only to the `public.zd_*` SECURITY DEFINER functions below. Visitors
--     authenticate with a random per-chat secret (stored hashed); counsellors with a session
--     token obtained from an invite-only access code (also stored hashed).
--   * No Supabase Auth users are involved, so this can share a project with other apps.
--
-- Deployed to the Supabase project "ona" (knffcabxyazookxchruq). Idempotent: safe to re-run.
-- Requires: pgcrypto in the `extensions` schema (Supabase default).
--
-- Add a counsellor (SQL editor only; prints their one-time access code):
--     select zd_chat.create_counsellor('name@example.com', 'Display Name');
-- Deactivate one:
--     update zd_chat.counsellors set active = false where email = 'name@example.com';

create schema if not exists zd_chat;
revoke all on schema zd_chat from public;
revoke all on schema zd_chat from anon, authenticated;

create table if not exists zd_chat.config (key text primary key, value text not null);
insert into zd_chat.config (key, value)
values ('rate_salt', encode(extensions.gen_random_bytes(16), 'hex'))
on conflict (key) do nothing;

create table if not exists zd_chat.counsellors (
  id           uuid primary key default gen_random_uuid(),
  email        text not null unique,
  display_name text not null check (char_length(display_name) between 1 and 40),
  code_hash    text not null,
  active       boolean not null default true,
  last_seen    timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists zd_chat.sessions (
  token_hash    text primary key,
  counsellor_id uuid not null references zd_chat.counsellors(id) on delete cascade,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);

create table if not exists zd_chat.chats (
  id            uuid primary key default gen_random_uuid(),
  secret_hash   text not null,
  nickname      text not null default 'Friend',
  status        text not null default 'waiting' check (status in ('waiting','active','closed')),
  counsellor_id uuid references zd_chat.counsellors(id) on delete set null,
  crisis        boolean not null default false,
  created_at    timestamptz not null default now(),
  claimed_at    timestamptz,
  closed_at     timestamptz,
  closed_by     text,
  last_activity timestamptz not null default now(),
  user_seen     timestamptz not null default now()
);
create index if not exists chats_status_created_idx on zd_chat.chats (status, created_at);
create index if not exists chats_counsellor_idx on zd_chat.chats (counsellor_id) where status = 'active';

create table if not exists zd_chat.messages (
  id         bigint generated always as identity primary key,
  chat_id    uuid not null references zd_chat.chats(id) on delete cascade,
  sender     text not null check (sender in ('user','counsellor','system')),
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists messages_chat_id_idx on zd_chat.messages (chat_id, id);

-- Salted hash of the caller's IP, kept at most 2 hours, used only to rate-limit abuse.
create table if not exists zd_chat.rate (key text not null, at timestamptz not null default now());
create index if not exists rate_key_at_idx on zd_chat.rate (key, at);

create table if not exists zd_chat.attempts (email text not null, at timestamptz not null default now());
create index if not exists attempts_email_at_idx on zd_chat.attempts (email, at);

alter table zd_chat.config      enable row level security;
alter table zd_chat.counsellors enable row level security;
alter table zd_chat.sessions    enable row level security;
alter table zd_chat.chats       enable row level security;
alter table zd_chat.messages    enable row level security;
alter table zd_chat.rate        enable row level security;
alter table zd_chat.attempts    enable row level security;
revoke all on all tables in schema zd_chat from anon, authenticated;

-- ------------------------------------------------------------------ internal helpers
create or replace function zd_chat.h(p text) returns text
language sql immutable set search_path = ''
as $fn$ select encode(extensions.digest(p, 'sha256'), 'hex') $fn$;

create or replace function zd_chat._auth(p_token text) returns uuid
language plpgsql security definer set search_path = ''
as $fn$
declare v uuid;
begin
  select s.counsellor_id into v
    from zd_chat.sessions s
    join zd_chat.counsellors c on c.id = s.counsellor_id
   where s.token_hash = zd_chat.h(coalesce(p_token, ''))
     and s.expires_at > now()
     and c.active;
  if v is null then
    raise exception 'zd:unauthorised' using errcode = '28000';
  end if;
  return v;
end
$fn$;

create or replace function zd_chat._msgs(p_chat uuid, p_after bigint) returns jsonb
language sql security definer set search_path = ''
as $fn$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'sender', m.sender, 'body', m.body, 'at', m.created_at) order by m.id), '[]'::jsonb)
    from (select * from zd_chat.messages
           where chat_id = p_chat and id > coalesce(p_after, 0)
           order by id limit 200) m
$fn$;

-- Closes abandoned/expired/idle chats. Called opportunistically by the API.
create or replace function zd_chat._housekeeping() returns void
language plpgsql security definer set search_path = ''
as $fn$
begin
  update zd_chat.chats
     set status = 'closed', closed_at = now(), closed_by = 'abandoned'
   where status = 'waiting' and user_seen < now() - interval '3 minutes';

  with e as (
    update zd_chat.chats
       set status = 'closed', closed_at = now(), closed_by = 'expired'
     where status = 'waiting' and created_at < now() - interval '3 hours'
     returning id)
  insert into zd_chat.messages (chat_id, sender, body)
  select id, 'system',
         'No counsellor was available in time. You can call our toll-free line on 0800 1100 2200 (free), or start a new chat.'
    from e;

  with e as (
    update zd_chat.chats
       set status = 'closed', closed_at = now(), closed_by = 'abandoned'
     where status = 'active' and user_seen < now() - interval '10 minutes'
     returning id)
  insert into zd_chat.messages (chat_id, sender, body)
  select id, 'system', 'The visitor has left the chat.' from e;

  with e as (
    update zd_chat.chats
       set status = 'closed', closed_at = now(), closed_by = 'idle'
     where status = 'active' and last_activity < now() - interval '45 minutes'
     returning id)
  insert into zd_chat.messages (chat_id, sender, body)
  select id, 'system', 'This chat was closed after a period of inactivity.' from e;

  -- Retention: occasionally purge old data (see zd_chat._purge below).
  if random() < 0.05 and to_regprocedure('zd_chat._purge()') is not null then
    perform zd_chat._purge();
  end if;
end
$fn$;

-- Data retention: closed conversations are deleted 7 days after they end (messages cascade).
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

-- Admin helper: callable only from the SQL editor (schema is not exposed to the API).
create or replace function zd_chat.create_counsellor(p_email text, p_name text) returns text
language plpgsql security definer set search_path = ''
as $fn$
declare v_raw text; v_code text; v_id uuid;
begin
  v_raw := encode(extensions.gen_random_bytes(12), 'hex');
  v_code := upper(regexp_replace(v_raw, '(.{4})(?=.)', '\1-', 'g'));
  insert into zd_chat.counsellors (email, display_name, code_hash)
  values (lower(trim(p_email)), trim(p_name), zd_chat.h(v_raw))
  on conflict (email) do update
     set display_name = excluded.display_name, code_hash = excluded.code_hash, active = true
  returning id into v_id;
  update zd_chat.sessions set expires_at = now() where counsellor_id = v_id;  -- a new code invalidates old sessions
  return v_code;
end
$fn$;

-- ------------------------------------------------------------------ visitor API
create or replace function public.zd_chat_availability() returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
begin
  perform zd_chat._housekeeping();
  return jsonb_build_object(
    'online',  (select count(*) from zd_chat.counsellors where active and last_seen > now() - interval '2 minutes'),
    'waiting', (select count(*) from zd_chat.chats where status = 'waiting'));
end
$fn$;

create or replace function public.zd_chat_create(p_nickname text default null) returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_nick text; v_token text; v_id uuid; v_hdr json; v_ip text; v_key text; v_n int;
begin
  perform zd_chat._housekeeping();

  v_nick := left(regexp_replace(coalesce(trim(p_nickname), ''), '[\r\n\t<>]', '', 'g'), 24);
  if v_nick = '' then v_nick := 'Friend'; end if;

  if (select count(*) from zd_chat.chats where status = 'waiting') >= 100 then
    raise exception 'zd:busy' using errcode = 'P0001';
  end if;

  -- Abuse guard: a salted hash of the caller's IP, kept for at most 2 hours, never the IP itself.
  begin v_hdr := current_setting('request.headers', true)::json; exception when others then v_hdr := null; end;
  v_ip := nullif(split_part(coalesce(v_hdr ->> 'cf-connecting-ip', v_hdr ->> 'x-forwarded-for', ''), ',', 1), '');
  if v_ip is not null then
    v_key := zd_chat.h(trim(v_ip) || (select value from zd_chat.config where key = 'rate_salt'));
    select count(*) into v_n from zd_chat.rate where key = v_key and at > now() - interval '1 hour';
    if v_n >= 6 then raise exception 'zd:rate_limited' using errcode = 'P0001'; end if;
    insert into zd_chat.rate (key) values (v_key);
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into zd_chat.chats (secret_hash, nickname) values (zd_chat.h(v_token), v_nick) returning id into v_id;
  insert into zd_chat.messages (chat_id, sender, body)
  values (v_id, 'system', 'You''re connected anonymously. A volunteer counsellor will join you shortly. You can start typing now.');

  return jsonb_build_object('chat_id', v_id, 'token', v_token);
end
$fn$;

create or replace function public.zd_chat_send(p_chat uuid, p_token text, p_body text) returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare v_chat zd_chat.chats; v_body text; v_id bigint; v_crisis boolean;
begin
  select * into v_chat from zd_chat.chats where id = p_chat and secret_hash = zd_chat.h(coalesce(p_token, ''));
  if not found then raise exception 'zd:not_found' using errcode = 'P0001'; end if;
  if v_chat.status = 'closed' then raise exception 'zd:closed' using errcode = 'P0001'; end if;

  v_body := btrim(coalesce(p_body, ''));
  if v_body = '' then raise exception 'zd:empty' using errcode = 'P0001'; end if;
  if char_length(v_body) > 2000 then raise exception 'zd:too_long' using errcode = 'P0001'; end if;

  if exists (select 1 from zd_chat.messages
              where chat_id = p_chat and sender = 'user'
                and created_at > clock_timestamp() - interval '600 milliseconds') then
    raise exception 'zd:slow_down' using errcode = 'P0001';
  end if;
  if (select count(*) from zd_chat.messages where chat_id = p_chat and sender = 'user') >= 400 then
    raise exception 'zd:limit' using errcode = 'P0001';
  end if;

  -- Keyword heuristic, NOT a classifier: it only moves the chat up the counsellor queue.
  v_crisis := v_body ~* '(suicid|kill myself|end my life|end it all|take my own life|want to die|wanna die|wan die|rather be dead|better off dead|dont want to (live|be alive)|don''t want to (live|be alive)|no reason to live|hurt myself|harm myself|self.?harm|cut myself|overdose)';

  insert into zd_chat.messages (chat_id, sender, body) values (p_chat, 'user', v_body) returning id into v_id;
  update zd_chat.chats
     set last_activity = clock_timestamp(), user_seen = clock_timestamp(), crisis = crisis or v_crisis
   where id = p_chat;

  return jsonb_build_object('id', v_id, 'crisis', v_crisis);
end
$fn$;

create or replace function public.zd_chat_poll(p_chat uuid, p_token text, p_after bigint default 0) returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare v_chat zd_chat.chats; v_name text;
begin
  select * into v_chat from zd_chat.chats where id = p_chat and secret_hash = zd_chat.h(coalesce(p_token, ''));
  if not found then raise exception 'zd:not_found' using errcode = 'P0001'; end if;

  if v_chat.status <> 'closed' then
    update zd_chat.chats set user_seen = now() where id = p_chat;
    perform zd_chat._housekeeping();
    select * into v_chat from zd_chat.chats where id = p_chat;
  end if;

  select display_name into v_name from zd_chat.counsellors where id = v_chat.counsellor_id;
  return jsonb_build_object(
    'status', v_chat.status,
    'counsellor', v_name,
    'online', (select count(*) from zd_chat.counsellors where active and last_seen > now() - interval '2 minutes'),
    'ahead', case when v_chat.status = 'waiting'
                  then (select count(*) from zd_chat.chats w where w.status = 'waiting' and w.created_at < v_chat.created_at) end,
    'messages', zd_chat._msgs(p_chat, p_after));
end
$fn$;

create or replace function public.zd_chat_end(p_chat uuid, p_token text) returns void
language plpgsql security definer set search_path = ''
as $fn$
declare v_chat zd_chat.chats;
begin
  select * into v_chat from zd_chat.chats where id = p_chat and secret_hash = zd_chat.h(coalesce(p_token, ''));
  if not found then raise exception 'zd:not_found' using errcode = 'P0001'; end if;
  if v_chat.status = 'closed' then return; end if;
  update zd_chat.chats set status = 'closed', closed_at = now(), closed_by = 'user' where id = p_chat;
  insert into zd_chat.messages (chat_id, sender, body)
  values (p_chat, 'system', 'You ended the chat. Take care of yourself. You are always welcome back.');
end
$fn$;

-- ------------------------------------------------------------------ counsellor API
-- Returns {token, name} on success or {error: 'bad_login' | 'locked'}. Failures RETURN rather than
-- raise so the attempt row is committed and the 8-failures-per-15-minutes lockout actually works.
create or replace function public.zd_counsellor_login(p_email text, p_code text) returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare v_email text; v_c zd_chat.counsellors; v_token text; v_norm text;
begin
  v_email := lower(btrim(coalesce(p_email, '')));
  v_norm  := lower(regexp_replace(coalesce(p_code, ''), '[^a-zA-Z0-9]', '', 'g'));

  if (select count(*) from zd_chat.attempts where email = v_email and at > now() - interval '15 minutes') >= 8 then
    return jsonb_build_object('error', 'locked');
  end if;

  select * into v_c from zd_chat.counsellors where email = v_email and active and code_hash = zd_chat.h(v_norm);
  if not found then
    insert into zd_chat.attempts (email) values (v_email);
    return jsonb_build_object('error', 'bad_login');
  end if;

  update zd_chat.attempts set at = '-infinity' where email = v_email;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into zd_chat.sessions (token_hash, counsellor_id, expires_at)
  values (zd_chat.h(v_token), v_c.id, now() + interval '12 hours');
  update zd_chat.counsellors set last_seen = now() where id = v_c.id;
  return jsonb_build_object('token', v_token, 'name', v_c.display_name);
end
$fn$;

create or replace function public.zd_counsellor_logout(p_token text) returns void
language sql security definer set search_path = ''
as $fn$ update zd_chat.sessions set expires_at = now() where token_hash = zd_chat.h(coalesce(p_token, '')) $fn$;

create or replace function public.zd_counsellor_queue(p_token text) returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare v_me uuid; v_name text;
begin
  v_me := zd_chat._auth(p_token);
  update zd_chat.counsellors set last_seen = now() where id = v_me returning display_name into v_name;
  perform zd_chat._housekeeping();

  return jsonb_build_object(
    'name', v_name,
    'waiting', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'nickname', c.nickname, 'crisis', c.crisis, 'created_at', c.created_at,
               'preview', left(coalesce((select m.body from zd_chat.messages m
                                          where m.chat_id = c.id and m.sender = 'user'
                                          order by m.id limit 1), ''), 140))
             order by c.crisis desc, c.created_at)
        from zd_chat.chats c where c.status = 'waiting'), '[]'::jsonb),
    'mine', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'nickname', c.nickname, 'crisis', c.crisis, 'last_activity', c.last_activity,
               'last_sender', (select m.sender from zd_chat.messages m where m.chat_id = c.id order by m.id desc limit 1))
             order by c.last_activity desc)
        from zd_chat.chats c where c.status = 'active' and c.counsellor_id = v_me), '[]'::jsonb));
end
$fn$;

create or replace function public.zd_counsellor_claim(p_token text, p_chat uuid) returns boolean
language plpgsql security definer set search_path = ''
as $fn$
declare v_me uuid; v_name text; v_id uuid;
begin
  v_me := zd_chat._auth(p_token);
  if (select count(*) from zd_chat.chats where status = 'active' and counsellor_id = v_me) >= 3 then
    raise exception 'zd:too_many' using errcode = 'P0001';
  end if;
  select display_name into v_name from zd_chat.counsellors where id = v_me;

  update zd_chat.chats
     set status = 'active', counsellor_id = v_me, claimed_at = now(), last_activity = now()
   where id = p_chat and status = 'waiting'
   returning id into v_id;
  if v_id is null then return false; end if;

  insert into zd_chat.messages (chat_id, sender, body)
  values (p_chat, 'system', v_name || ' has joined. You''re talking with a volunteer counsellor, and this chat is anonymous.');
  return true;
end
$fn$;

create or replace function public.zd_counsellor_poll(p_token text, p_chat uuid, p_after bigint default 0) returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare v_me uuid; v_chat zd_chat.chats;
begin
  v_me := zd_chat._auth(p_token);
  update zd_chat.counsellors set last_seen = now() where id = v_me;
  select * into v_chat from zd_chat.chats where id = p_chat and counsellor_id = v_me;
  if not found then raise exception 'zd:not_found' using errcode = 'P0001'; end if;
  return jsonb_build_object('status', v_chat.status, 'nickname', v_chat.nickname, 'crisis', v_chat.crisis,
                            'messages', zd_chat._msgs(p_chat, p_after));
end
$fn$;

create or replace function public.zd_counsellor_send(p_token text, p_chat uuid, p_body text) returns bigint
language plpgsql security definer set search_path = ''
as $fn$
declare v_me uuid; v_body text; v_id bigint;
begin
  v_me := zd_chat._auth(p_token);
  v_body := btrim(coalesce(p_body, ''));
  if v_body = '' then raise exception 'zd:empty' using errcode = 'P0001'; end if;
  if char_length(v_body) > 2000 then raise exception 'zd:too_long' using errcode = 'P0001'; end if;
  perform 1 from zd_chat.chats where id = p_chat and counsellor_id = v_me and status = 'active';
  if not found then raise exception 'zd:not_found' using errcode = 'P0001'; end if;
  insert into zd_chat.messages (chat_id, sender, body) values (p_chat, 'counsellor', v_body) returning id into v_id;
  update zd_chat.chats set last_activity = now() where id = p_chat;
  return v_id;
end
$fn$;

create or replace function public.zd_counsellor_close(p_token text, p_chat uuid) returns void
language plpgsql security definer set search_path = ''
as $fn$
declare v_me uuid; v_id uuid;
begin
  v_me := zd_chat._auth(p_token);
  update zd_chat.chats set status = 'closed', closed_at = now(), closed_by = 'counsellor'
   where id = p_chat and counsellor_id = v_me and status = 'active' returning id into v_id;
  if v_id is null then return; end if;
  insert into zd_chat.messages (chat_id, sender, body)
  values (p_chat, 'system', 'The counsellor ended the chat. Thank you for reaching out. You are welcome back any time, and you can call 0800 1100 2200 (free) whenever you need to talk.');
end
$fn$;

create or replace function public.zd_counsellor_release(p_token text, p_chat uuid) returns void
language plpgsql security definer set search_path = ''
as $fn$
declare v_me uuid; v_name text; v_id uuid;
begin
  v_me := zd_chat._auth(p_token);
  select display_name into v_name from zd_chat.counsellors where id = v_me;
  update zd_chat.chats set status = 'waiting', counsellor_id = null, claimed_at = null
   where id = p_chat and counsellor_id = v_me and status = 'active' returning id into v_id;
  if v_id is null then return; end if;
  insert into zd_chat.messages (chat_id, sender, body)
  values (p_chat, 'system', v_name || ' had to step away. We''re finding another counsellor for you. Please stay on this page.');
end
$fn$;

-- ------------------------------------------------------------------ privileges
-- Internal helpers are never callable through the API.
revoke all on function zd_chat.h(text), zd_chat._auth(text), zd_chat._housekeeping(), zd_chat._purge(),
                       zd_chat._msgs(uuid, bigint), zd_chat.create_counsellor(text, text)
  from public, anon, authenticated;

-- Public surface: only these entry points.
revoke all on function
  public.zd_chat_availability(), public.zd_chat_create(text), public.zd_chat_send(uuid, text, text),
  public.zd_chat_poll(uuid, text, bigint), public.zd_chat_end(uuid, text),
  public.zd_counsellor_login(text, text), public.zd_counsellor_logout(text), public.zd_counsellor_queue(text),
  public.zd_counsellor_claim(text, uuid), public.zd_counsellor_poll(text, uuid, bigint),
  public.zd_counsellor_send(text, uuid, text), public.zd_counsellor_close(text, uuid),
  public.zd_counsellor_release(text, uuid)
  from public;

grant execute on function
  public.zd_chat_availability(), public.zd_chat_create(text), public.zd_chat_send(uuid, text, text),
  public.zd_chat_poll(uuid, text, bigint), public.zd_chat_end(uuid, text),
  public.zd_counsellor_login(text, text), public.zd_counsellor_logout(text), public.zd_counsellor_queue(text),
  public.zd_counsellor_claim(text, uuid), public.zd_counsellor_poll(text, uuid, bigint),
  public.zd_counsellor_send(text, uuid, text), public.zd_counsellor_close(text, uuid),
  public.zd_counsellor_release(text, uuid)
  to anon, authenticated;
