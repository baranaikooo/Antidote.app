create extension if not exists pg_cron with schema pg_catalog;

alter table profile_private.voice_reply_deliveries
  add column next_attempt_at timestamptz not null default now(),
  add column lease uuid,
  add column lease_expires_at timestamptz,
  add column attempt_count integer not null default 0,
  add column settled_sessions uuid[] not null default '{}';

create index voice_reply_deliveries_next_attempt_idx
  on profile_private.voice_reply_deliveries (next_attempt_at);

create function profile_private.dispatch_android_notification(p_ticket uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  endpoint text;
  secret text;
begin
  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'voice_reply_webhook_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'voice_reply_webhook_secret';
  if nullif(endpoint, '') is null or nullif(secret, '') is null then return; end if;

  perform net.http_post(
    url := endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-voice-reply-signature', encode(extensions.hmac(p_ticket::text, secret, 'sha256'), 'hex')
    ),
    body := jsonb_build_object('ticket', p_ticket),
    timeout_milliseconds := 30000
  );
exception when others then
  raise warning 'Failed to dispatch Android notification (%)', sqlstate;
end;
$$;
revoke all on function profile_private.dispatch_android_notification(uuid)
from public, anon, authenticated;

create or replace function profile_private.enqueue_android_notification(
  p_match_id uuid, p_recipient uuid, p_is_message boolean
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  delivery_ticket uuid;
begin
  if not exists (
    select from profile_private.voice_reply_devices d
    where d.user_id = p_recipient and (case when p_is_message then d.chat_messages else d.voice_replies end)
  ) or not public.voice_reply_push_available() then return; end if;

  insert into profile_private.voice_reply_deliveries (match_id, recipient, is_message, next_attempt_at)
  values (p_match_id, p_recipient, p_is_message, now() + interval '30 seconds')
  returning ticket into delivery_ticket;
  perform profile_private.dispatch_android_notification(delivery_ticket);
exception when others then
  raise warning 'Failed to enqueue Android notification (%)', sqlstate;
end;
$$;

create function profile_private.retry_android_notifications()
returns void language plpgsql security definer set search_path = ''
as $$
declare
  delivery_ticket uuid;
begin
  delete from profile_private.voice_reply_deliveries where expires_at <= now();
  if not public.voice_reply_push_available() then return; end if;
  for delivery_ticket in
    with due as (
      select queued.ticket from profile_private.voice_reply_deliveries queued
      where queued.next_attempt_at <= now()
        and (queued.lease_expires_at is null or queued.lease_expires_at <= now())
      order by queued.next_attempt_at
      limit 100 for update skip locked
    )
    update profile_private.voice_reply_deliveries queued
    set next_attempt_at = now() + interval '30 seconds'
    from due where queued.ticket = due.ticket
    returning queued.ticket
  loop
    perform profile_private.dispatch_android_notification(delivery_ticket);
  end loop;
end;
$$;
revoke all on function profile_private.retry_android_notifications()
from public, anon, authenticated;

create function public.claim_android_notification_attempt(p_ticket uuid)
returns table (
  lease uuid, device_session uuid, token text, is_message boolean,
  sender_name text, audience uuid, sender_gender text
)
language sql security definer set search_path = ''
as $$
  with delivery as (
    update profile_private.voice_reply_deliveries queued
    set lease = gen_random_uuid(), lease_expires_at = now() + interval '45 seconds',
        attempt_count = queued.attempt_count + 1
    where queued.ticket = p_ticket and queued.expires_at > now()
      and (queued.lease_expires_at is null or queued.lease_expires_at <= now())
    returning queued.*
  )
  select e.lease, devices.session_id, devices.token, e.is_message,
    devices.sender_name, devices.preview_audience, devices.sender_gender
  from delivery e
  left join lateral (
    select d.session_id, d.token, d.preview_audience,
      case when d.preview_audience is not null then nullif(btrim(p.name), '') end as sender_name,
      case when d.preview_audience is not null then p.gender end as sender_gender
    from public.matches m
    join profile_private.voice_reply_devices d on d.user_id = e.recipient
    join auth.sessions s on s.id = d.session_id and s.user_id = d.user_id
    left join public.profiles p on p.id = case when e.recipient = m.user_p then m.user_q else m.user_p end
    where m.id = e.match_id and m.status = 'active' and e.recipient in (m.user_p, m.user_q)
      and (s.not_after is null or s.not_after > now())
      and not (d.session_id = any(e.settled_sessions))
      and case when e.is_message then d.chat_messages else d.voice_replies and exists (
        select from profile_private.shared_conversation_questions q
        where q.match_id = e.match_id and q.voice_required and q.answer_p is not null and q.answer_q is not null
      ) end
  ) devices on true;
$$;
revoke all on function public.claim_android_notification_attempt(uuid)
from public, anon, authenticated;
grant execute on function public.claim_android_notification_attempt(uuid) to service_role;

create function public.finish_android_notification_attempt(
  p_ticket uuid, p_lease uuid, p_settled uuid[], p_retry boolean
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_retry then
    update profile_private.voice_reply_deliveries queued
    set settled_sessions = array(select distinct unnest(queued.settled_sessions || p_settled)),
        lease = null, lease_expires_at = null,
        next_attempt_at = now() + least(queued.attempt_count * interval '10 seconds', interval '2 minutes')
    where queued.ticket = p_ticket and queued.lease = p_lease;
  else
    delete from profile_private.voice_reply_deliveries queued
    where queued.ticket = p_ticket and queued.lease = p_lease;
  end if;
end;
$$;
revoke all on function public.finish_android_notification_attempt(uuid, uuid, uuid[], boolean)
from public, anon, authenticated;
grant execute on function public.finish_android_notification_attempt(uuid, uuid, uuid[], boolean)
to service_role;

-- Periodic dispatch recovers requests that timed out before reaching the Edge Function.
select cron.schedule('antidote-android-notification-retries', '15 seconds',
  $$select profile_private.retry_android_notifications()$$);
