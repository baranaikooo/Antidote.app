-- Preserve the existing inbox RPC for older clients. Return only the next
-- action here, without exposing any answer text or storage path.
create function public.get_conversation_inbox_with_question_stage()
returns table (
  match_id uuid, partner_id uuid, status text, created_at timestamptz,
  message_id uuid, sender_id uuid, message_text text, duration real,
  has_media boolean, message_at timestamptz, unread boolean, question_stage text
)
language sql stable security invoker set search_path = ''
as $$
  select inbox.match_id, inbox.partner_id, inbox.status, inbox.created_at,
    inbox.message_id, inbox.sender_id, inbox.message_text, inbox.duration,
    inbox.has_media, inbox.message_at, inbox.unread,
    case
      when question.state is null or not (question.state ->> 'required')::boolean then null
      when not (question.state ->> 'voice_required')::boolean then null
      when question.state ->> 'own_voice_path' is null then 'your_turn'
      when question.state ->> 'partner_voice_path' is null then 'waiting'
      else 'ready'
    end
  from public.get_conversation_inbox() with ordinality inbox
  left join lateral (
    select profile_private.get_shared_conversation_question(inbox.match_id) as state
    where inbox.status = 'active' and inbox.message_id is null
  ) question on true
  order by inbox.ordinality;
$$;

revoke all on function public.get_conversation_inbox_with_question_stage() from public, anon, authenticated;
grant execute on function public.get_conversation_inbox_with_question_stage() to authenticated;
