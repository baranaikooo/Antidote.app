create extension if not exists pg_net with schema extensions;

create table profile_private.voice_reply_devices (
  token text primary key,
  session_id uuid not null unique references auth.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade
);
create index voice_reply_devices_user_idx on profile_private.voice_reply_devices (user_id);
alter table profile_private.voice_reply_devices enable row level security;
revoke all on profile_private.voice_reply_devices from public, anon, authenticated;

create function public.voice_reply_push_available()
returns boolean language sql stable security definer set search_path = ''
as $$
  select count(distinct name) = 2 from vault.decrypted_secrets
  where name in ('voice_reply_webhook_url', 'voice_reply_webhook_secret')
    and nullif(decrypted_secret, '') is not null;
$$;
revoke all on function public.voice_reply_push_available() from public, anon, authenticated;
grant execute on function public.voice_reply_push_available() to authenticated;

create function public.register_voice_reply_device(p_token text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  active_session uuid := (auth.jwt() ->> 'session_id')::uuid;
begin
  -- Serialize token changes for this session with each other and with sign-out.
  perform 1 from auth.sessions s where s.id = active_session and s.user_id = caller for update;
  if not found then
    raise exception 'A live session is required' using errcode = '42501';
  end if;
  if p_token is null or char_length(p_token) not between 20 and 1024 then
    raise exception 'Invalid device token' using errcode = '22023';
  end if;

  delete from profile_private.voice_reply_devices
  where session_id = active_session and token <> p_token;
  insert into profile_private.voice_reply_devices (token, session_id, user_id)
  values (p_token, active_session, caller)
  on conflict (token) do update set session_id = excluded.session_id, user_id = excluded.user_id;
end;
$$;
revoke all on function public.register_voice_reply_device(text) from public, anon, authenticated;
grant execute on function public.register_voice_reply_device(text) to authenticated;

create function public.voice_reply_delivery_tokens(p_match_id uuid, p_recipient uuid)
returns setof text language sql stable security definer set search_path = ''
as $$
  select d.token from profile_private.voice_reply_devices d
  join auth.sessions s on s.id = d.session_id and s.user_id = d.user_id
  where d.user_id = p_recipient and (s.not_after is null or s.not_after > now())
    and exists (
      select from public.matches m
      join profile_private.shared_conversation_questions q on q.match_id = m.id
      where m.id = p_match_id and m.status = 'active' and p_recipient in (m.user_p, m.user_q)
        and q.voice_required and q.answer_p is not null and q.answer_q is not null
    );
$$;
revoke all on function public.voice_reply_delivery_tokens(uuid, uuid) from public, anon, authenticated;
grant execute on function public.voice_reply_delivery_tokens(uuid, uuid) to service_role;

create function profile_private.queue_voice_reply_notification()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  recipient uuid;
  endpoint text;
  secret text;
begin
  -- The other participant can play the reply as soon as this transaction commits.
  select case when old.answer_p is not null then m.user_p else m.user_q end into recipient
  from public.matches m where m.id = new.match_id and m.status = 'active';
  if not exists (select from profile_private.voice_reply_devices d where d.user_id = recipient) then
    return new;
  end if;

  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'voice_reply_webhook_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'voice_reply_webhook_secret';
  if nullif(endpoint, '') is not null and nullif(secret, '') is not null then
    perform net.http_post(
      url := endpoint,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-voice-reply-secret', secret),
      body := jsonb_build_object('match_id', new.match_id, 'recipient', recipient),
      timeout_milliseconds := 15000
    );
  end if;
  return new;
exception when others then
  -- Notification infrastructure must never prevent recording an answer.
  raise warning 'Failed to enqueue voice reply notification (%)', sqlstate;
  return new;
end;
$$;
revoke all on function profile_private.queue_voice_reply_notification() from public, anon, authenticated;

create trigger queue_voice_reply_notification
after update of answer_p, answer_q on profile_private.shared_conversation_questions
for each row when (
  new.voice_required and new.answer_p is not null and new.answer_q is not null
  and ((old.answer_p is null) <> (old.answer_q is null))
)
execute function profile_private.queue_voice_reply_notification();
