-- Preserve the flow for existing chats, including those with no question.
alter table profile_private.shared_conversation_questions add column required boolean not null default false;
alter table profile_private.shared_conversation_questions alter column required set default true;

create or replace function profile_private.initialize_shared_question()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into profile_private.shared_conversation_questions (match_id, question)
  select new.id, case when p.top_priority = q.top_priority then
    case p.top_priority
      when 'rodina' then 'Čo najradšej robíš s ľuďmi, na ktorých ti záleží?'
      when 'kariera' then 'Čo ťa v poslednom čase pri práci alebo učení bavilo?'
      when 'stabilita' then 'Čo ti po dlhom dni pomáha vypnúť?'
      when 'kreativita' then 'Čo by si chcel/a raz vytvoriť?'
      when 'sloboda' then 'Ako by si strávil/a deň úplne podľa seba?'
      else 'Ako vyzerá tvoj ideálny voľný víkend?'
    end
    else 'Ako vyzerá tvoj ideálny voľný víkend?'
  end
  from (select 1) anchor
  left join public.profiles p on p.id = new.user_p
  left join public.profiles q on q.id = new.user_q;
  return new;
end;
$$;

create or replace function profile_private.get_shared_conversation_question(p_match_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'question', q.question,
    'skipped', q.skipped,
    'required', q.required,
    'own_answer', case when m.user_p = caller.id then q.answer_p else q.answer_q end,
    'partner_answer', case when q.answer_p is not null and q.answer_q is not null
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
  answer text := regexp_replace(p_answer, '^[[:space:]]+|[[:space:]]+$', '', 'g');
begin
  if answer is not null and char_length(answer) not between 1 and 400 then
    raise exception 'Answer must have 1 to 400 characters' using errcode = '22023';
  end if;

  select m.* into conversation from public.matches m
  where m.id = p_match_id and m.status = 'active' and caller in (m.user_p, m.user_q)
  for update;
  if not found then return null; end if;

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
        where q.match_id = new.match_id and q.answer_p is not null and q.answer_q is not null
          and new.reply_context = case when m.user_p = partner then q.answer_p else q.answer_q end
      )
    )
  ) then
    new.reply_context := null;
  end if;
  return new;
end;
$policy$;
