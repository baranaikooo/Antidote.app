alter table profile_private.voice_reply_devices
  add column supports_private_preview boolean not null default false;

create function public.register_android_preview_device(
  p_token text, p_voice_replies boolean, p_chat_messages boolean, p_supports_private_preview boolean
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform profile_private.register_android_notification_device(
    p_token, p_voice_replies, p_chat_messages, null
  );
  update profile_private.voice_reply_devices
  set supports_private_preview = coalesce(p_supports_private_preview, false)
  where user_id = auth.uid() and session_id = (auth.jwt() ->> 'session_id')::uuid;
end;
$$;
revoke all on function public.register_android_preview_device(text, boolean, boolean, boolean)
from public, anon, authenticated;
grant execute on function public.register_android_preview_device(text, boolean, boolean, boolean)
to authenticated;

create or replace function public.claim_android_notification(p_ticket uuid)
returns table (token text, is_message boolean, sender_name text)
language sql security definer set search_path = ''
as $$
  with delivery as (
    delete from profile_private.voice_reply_deliveries queued
    where queued.ticket = p_ticket and queued.expires_at > now()
    returning queued.match_id, queued.recipient, queued.is_message
  )
  select d.token, e.is_message,
    case when d.supports_private_preview then coalesce(btrim(p.name), '') end
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
