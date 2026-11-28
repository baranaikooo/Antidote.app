alter table profile_private.voice_reply_devices
  add column voice_replies boolean not null default true,
  add column chat_messages boolean not null default false,
  add column show_sender boolean not null default false;

alter table profile_private.voice_reply_deliveries
  add column is_message boolean not null default false;

create function profile_private.register_android_notification_device(
  p_token text, p_voice_replies boolean, p_chat_messages boolean, p_show_sender boolean
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  active_session uuid := (auth.jwt() ->> 'session_id')::uuid;
begin
  perform 1 from auth.sessions s where s.id = active_session and s.user_id = caller for update;
  if not found then
    raise exception 'A live session is required' using errcode = '42501';
  end if;
  if p_token is null or char_length(p_token) not between 20 and 1024 then
    raise exception 'Invalid device token' using errcode = '22023';
  end if;

  delete from profile_private.voice_reply_devices
  where token = p_token and session_id <> active_session;
  insert into profile_private.voice_reply_devices as device (
    token, session_id, user_id, voice_replies, chat_messages, show_sender
  )
  values (
    p_token, active_session, caller,
    coalesce(p_voice_replies, true), coalesce(p_chat_messages, false), coalesce(p_show_sender, false)
  )
  on conflict (session_id) do update set
    token = excluded.token,
    voice_replies = coalesce(p_voice_replies, device.voice_replies),
    chat_messages = coalesce(p_chat_messages, device.chat_messages),
    show_sender = coalesce(p_show_sender, device.show_sender);
end;
$$;
revoke all on function profile_private.register_android_notification_device(text, boolean, boolean, boolean)
from public, anon, authenticated;

create or replace function public.register_voice_reply_device(p_token text)
returns void language sql security definer set search_path = ''
as $$ select profile_private.register_android_notification_device(p_token, null, null, null); $$;

create function public.register_android_notification_device(
  p_token text, p_voice_replies boolean, p_chat_messages boolean, p_show_sender boolean
)
returns void language sql security definer set search_path = ''
as $$
  select profile_private.register_android_notification_device(
    p_token, p_voice_replies, p_chat_messages, p_show_sender
  );
$$;
revoke all on function public.register_android_notification_device(text, boolean, boolean, boolean)
from public, anon, authenticated;
grant execute on function public.register_android_notification_device(text, boolean, boolean, boolean)
to authenticated;

create function public.android_notification_options()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'voice_replies', d.voice_replies,
    'chat_messages', d.chat_messages,
    'show_sender', d.show_sender
  )
  from profile_private.voice_reply_devices d
  where d.user_id = auth.uid() and d.session_id = (auth.jwt() ->> 'session_id')::uuid;
$$;
revoke all on function public.android_notification_options() from public, anon, authenticated;
grant execute on function public.android_notification_options() to authenticated;

create function public.set_android_notification_options(
  p_voice_replies boolean, p_chat_messages boolean, p_show_sender boolean
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update profile_private.voice_reply_devices
  set voice_replies = p_voice_replies, chat_messages = p_chat_messages, show_sender = p_show_sender
  where user_id = auth.uid() and session_id = (auth.jwt() ->> 'session_id')::uuid;
  if not found then
    raise exception 'This device is not registered' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.set_android_notification_options(boolean, boolean, boolean)
from public, anon, authenticated;
grant execute on function public.set_android_notification_options(boolean, boolean, boolean)
to authenticated;

create function profile_private.enqueue_android_notification(
  p_match_id uuid, p_recipient uuid, p_is_message boolean
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  delivery_ticket uuid;
  endpoint text;
  secret text;
begin
  if not exists (
    select from profile_private.voice_reply_devices d
    where d.user_id = p_recipient and (case when p_is_message then d.chat_messages else d.voice_replies end)
  ) then
    return;
  end if;
  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'voice_reply_webhook_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'voice_reply_webhook_secret';
  if nullif(endpoint, '') is null or nullif(secret, '') is null then
    return;
  end if;

  delete from profile_private.voice_reply_deliveries where expires_at <= now();
  insert into profile_private.voice_reply_deliveries (match_id, recipient, is_message)
  values (p_match_id, p_recipient, p_is_message) returning ticket into delivery_ticket;

  perform net.http_post(
    url := endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-voice-reply-signature', encode(extensions.hmac(delivery_ticket::text, secret, 'sha256'), 'hex')
    ),
    body := jsonb_build_object('ticket', delivery_ticket),
    timeout_milliseconds := 15000
  );
exception when others then
  raise warning 'Failed to enqueue Android notification (%)', sqlstate;
end;
$$;
revoke all on function profile_private.enqueue_android_notification(uuid, uuid, boolean)
from public, anon, authenticated;

create or replace function profile_private.queue_voice_reply_notification()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  recipient_id uuid;
begin
  select case when old.answer_p is not null then m.user_p else m.user_q end into recipient_id
  from public.matches m where m.id = new.match_id and m.status = 'active';
  perform profile_private.enqueue_android_notification(new.match_id, recipient_id, false);
  return new;
end;
$$;

create function profile_private.queue_chat_message_notification()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  recipient_id uuid;
begin
  select case when new.sender_id = m.user_p then m.user_q else m.user_p end into recipient_id
  from public.matches m
  where m.id = new.match_id and m.status = 'active' and new.sender_id in (m.user_p, m.user_q);
  perform profile_private.enqueue_android_notification(new.match_id, recipient_id, true);
  return new;
end;
$$;
revoke all on function profile_private.queue_chat_message_notification() from public, anon, authenticated;

create trigger queue_chat_message_notification
after insert on public.messages
for each row execute function profile_private.queue_chat_message_notification();

-- In-flight requests can still reach the old function during an Edge deployment.
create or replace function public.claim_voice_reply_delivery(p_ticket uuid)
returns setof text language sql security definer set search_path = ''
as $$
  with delivery as (
    delete from profile_private.voice_reply_deliveries
    where ticket = p_ticket and expires_at > now() and not is_message
    returning match_id, recipient
  )
  select tokens.token from delivery d
  cross join lateral public.voice_reply_delivery_tokens(d.match_id, d.recipient) as tokens(token)
  join profile_private.voice_reply_devices device on device.token = tokens.token and device.voice_replies;
$$;

create function public.claim_android_notification(p_ticket uuid)
returns table (token text, is_message boolean, sender_name text)
language sql security definer set search_path = ''
as $$
  with delivery as (
    delete from profile_private.voice_reply_deliveries queued
    where queued.ticket = p_ticket and queued.expires_at > now()
    returning queued.match_id, queued.recipient, queued.is_message
  )
  select d.token, e.is_message, case when d.show_sender then nullif(btrim(p.name), '') end
  from delivery e
  join public.matches m on m.id = e.match_id and m.status = 'active' and e.recipient in (m.user_p, m.user_q)
  join profile_private.voice_reply_devices d on d.user_id = e.recipient
  join auth.sessions s on s.id = d.session_id and s.user_id = d.user_id
  left join public.profiles p on p.id = case when e.recipient = m.user_p then m.user_q else m.user_p end
  where (s.not_after is null or s.not_after > now())
    and case when e.is_message then d.chat_messages else d.voice_replies and exists (
      select from profile_private.shared_conversation_questions q
      where q.match_id = e.match_id and q.voice_required and q.answer_p is not null and q.answer_q is not null
    ) end;
$$;
revoke all on function public.claim_android_notification(uuid) from public, anon, authenticated;
grant execute on function public.claim_android_notification(uuid) to service_role;
