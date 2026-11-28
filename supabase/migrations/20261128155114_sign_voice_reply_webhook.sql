create table profile_private.voice_reply_deliveries (
  ticket uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  recipient uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '15 minutes')
);
alter table profile_private.voice_reply_deliveries enable row level security;
revoke all on profile_private.voice_reply_deliveries from public, anon, authenticated;

create function public.claim_voice_reply_delivery(p_ticket uuid)
returns setof text language sql security definer set search_path = ''
as $$
  with delivery as (
    delete from profile_private.voice_reply_deliveries
    where ticket = p_ticket and expires_at > now()
    returning match_id, recipient
  )
  select token from delivery d
  cross join lateral public.voice_reply_delivery_tokens(d.match_id, d.recipient) as tokens(token);
$$;
revoke all on function public.claim_voice_reply_delivery(uuid) from public, anon, authenticated;
grant execute on function public.claim_voice_reply_delivery(uuid) to service_role;

create or replace function profile_private.queue_voice_reply_notification()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  recipient_id uuid;
  delivery_ticket uuid;
  endpoint text;
  secret text;
begin
  select case when old.answer_p is not null then m.user_p else m.user_q end into recipient_id
  from public.matches m where m.id = new.match_id and m.status = 'active';
  if not exists (select from profile_private.voice_reply_devices d where d.user_id = recipient_id) then
    return new;
  end if;

  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'voice_reply_webhook_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'voice_reply_webhook_secret';
  if nullif(endpoint, '') is null or nullif(secret, '') is null then
    return new;
  end if;

  delete from profile_private.voice_reply_deliveries where expires_at <= now();
  insert into profile_private.voice_reply_deliveries (match_id, recipient)
  values (new.match_id, recipient_id) returning ticket into delivery_ticket;

  -- Keep participant identifiers and the webhook key out of the managed HTTP queue.
  perform net.http_post(
    url := endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-voice-reply-signature', encode(extensions.hmac(delivery_ticket::text, secret, 'sha256'), 'hex')
    ),
    body := jsonb_build_object('ticket', delivery_ticket),
    timeout_milliseconds := 15000
  );
  return new;
exception when others then
  raise warning 'Failed to enqueue voice reply notification (%)', sqlstate;
  return new;
end;
$$;
