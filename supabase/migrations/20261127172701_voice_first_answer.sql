-- Keep existing written answers and unlocked chats. New and unanswered required questions use voice.
alter table profile_private.shared_conversation_questions add column voice_required boolean not null default false;
alter table profile_private.shared_conversation_questions alter column voice_required set default true;

update profile_private.shared_conversation_questions q set voice_required = true
where q.required and not q.skipped and q.answer_p is null and q.answer_q is null
  and not exists (select from public.messages m where m.match_id = q.match_id);

-- Voice questions store private storage paths in the existing answer slots, so the
-- same serialized writes and chat gate also apply to recorded answers.
create function profile_private.is_question_voice_path(p_path text, p_author uuid, p_match uuid)
returns boolean language sql immutable set search_path = ''
as $$
  select p_path ~ ('^' || p_author::text || '/' || p_match::text ||
    '_[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$');
$$;
revoke all on function profile_private.is_question_voice_path(text, uuid, uuid) from public;

create function profile_private.can_access_question_voice(p_path text, p_upload boolean)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select from profile_private.shared_conversation_questions q
    join public.matches m on m.id = q.match_id
    where q.match_id = substring(p_path from '/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})_')::uuid
      and q.voice_required and m.status = 'active' and auth.uid() in (m.user_p, m.user_q)
      and case when p_upload then
        profile_private.is_question_voice_path(p_path, auth.uid(), q.match_id)
        and case when auth.uid() = m.user_p then q.answer_p is null else q.answer_q is null end
      else
        q.answer_p is not null and q.answer_q is not null and p_path in (q.answer_p, q.answer_q)
      end
  );
$$;
revoke all on function profile_private.can_access_question_voice(text, boolean) from public;
grant execute on function profile_private.can_access_question_voice(text, boolean) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('question-voices', 'question-voices', false, 5242880,
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/wav']);

create policy "Participants upload their own question voice"
on storage.objects for insert to authenticated
with check (bucket_id = 'question-voices' and profile_private.can_access_question_voice(name, true));

create policy "Read own question voices or mutually revealed answers"
on storage.objects for select to authenticated
using (bucket_id = 'question-voices' and (
  storage.foldername(name) = array[(select auth.uid())::text]
  or profile_private.can_access_question_voice(name, false)
));

create policy "Owners can delete their question voices"
on storage.objects for delete to authenticated
using (bucket_id = 'question-voices' and storage.foldername(name) = array[(select auth.uid())::text]);

create or replace function profile_private.get_shared_conversation_question(p_match_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'question', q.question,
    'skipped', q.skipped,
    'required', q.required,
    'voice_required', q.voice_required,
    'own_voice_path', case when q.voice_required
      then case when m.user_p = caller.id then q.answer_p else q.answer_q end
    end,
    'partner_voice_path', case when q.voice_required and q.answer_p is not null and q.answer_q is not null
      then case when m.user_p = caller.id then q.answer_q else q.answer_p end
    end,
    'own_answer', case when not q.voice_required then case when m.user_p = caller.id then q.answer_p else q.answer_q end end,
    'partner_answer', case when not q.voice_required and q.answer_p is not null and q.answer_q is not null
      then case when m.user_p = caller.id then q.answer_q else q.answer_p end
    end
  )
  from (select auth.uid() as id) caller
  join public.matches m on m.id = p_match_id and m.status = 'active'
    and caller.id in (m.user_p, m.user_q)
  join profile_private.shared_conversation_questions q on q.match_id = m.id;
$$;

-- Serialize updates with other participant actions and conversation closure.
create or replace function profile_private.respond_shared_conversation_question(p_match_id uuid, p_answer text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  conversation public.matches%rowtype;
  voice_required boolean;
  answer text := regexp_replace(p_answer, '^[[:space:]]+|[[:space:]]+$', '', 'g');
begin
  if answer is not null and char_length(answer) not between 1 and 400 then
    raise exception 'Answer must have 1 to 400 characters' using errcode = '22023';
  end if;

  select m.* into conversation from public.matches m
  where m.id = p_match_id and m.status = 'active' and caller in (m.user_p, m.user_q)
  for update;
  if not found then return null; end if;

  select q.voice_required into voice_required
  from profile_private.shared_conversation_questions q where q.match_id = p_match_id;

  if voice_required and answer is not null and (
    not profile_private.is_question_voice_path(answer, caller, p_match_id)
    or not exists (
      select from storage.objects o
      where o.bucket_id = 'question-voices' and o.name = answer and o.owner_id = caller::text
    )
  ) then
    raise exception 'An uploaded voice answer is required' using errcode = '22023';
  end if;

  -- Optional legacy questions can be skipped. Required questions only allow withdrawing your own pending answer.
  update profile_private.shared_conversation_questions q set
    skipped = answer is null and not q.required,
    answer_p = case when answer is null and not q.required then null when caller = conversation.user_p then answer else q.answer_p end,
    answer_q = case when answer is null and not q.required then null when caller = conversation.user_q then answer else q.answer_q end
  where q.match_id = p_match_id and not q.skipped
    and (case when answer is null then
        (q.answer_p is null or q.answer_q is null)
        and (not q.required or case when caller = conversation.user_p then q.answer_p else q.answer_q end is not null)
      when caller = conversation.user_p then q.answer_p is null
      else q.answer_q is null end);

  if found then
    -- Reuse matches realtime without publishing answer content.
    update public.matches set shared_question_activity_at =
      case when answer is not null or conversation.shared_question_activity_at is not null
        then clock_timestamp()
      end
    where id = p_match_id;
  end if;

  return profile_private.get_shared_conversation_question(p_match_id);
end;
$$;

create or replace function public.require_open_conversation() returns trigger
language plpgsql security definer set search_path = ''
as $policy$
declare
  partner uuid;
begin
  select case when m.user_p = new.sender_id then m.user_q else m.user_p end
    into partner from public.matches m
    where m.id = new.match_id and m.status = 'active' and new.sender_id in (m.user_p, m.user_q)
    for update;
  if not found then
    raise exception 'Conversation is closed' using errcode = '42501';
  end if;
  if exists (
    select from profile_private.shared_conversation_questions q
    where q.match_id = new.match_id and q.required and (q.answer_p is null or q.answer_q is null)
  ) then
    raise exception 'Both answers are required before sending messages' using errcode = '42501';
  end if;
  if new.reply_context is not null and (
    nullif(btrim(new.message_text), '') is null
    or not (
      (
        exists (select from public.profiles p where p.id = partner and p.shared_reflection = new.reply_context)
        and not exists (select from public.messages m where m.match_id = new.match_id)
      )
      or exists (
        select from profile_private.shared_conversation_questions q
        join public.matches m on m.id = q.match_id
        where q.match_id = new.match_id and not q.voice_required and q.answer_p is not null and q.answer_q is not null
          and new.reply_context = case when m.user_p = partner then q.answer_p else q.answer_q end
      )
    )
  ) then
    new.reply_context := null;
  end if;
  return new;
end;
$policy$;
