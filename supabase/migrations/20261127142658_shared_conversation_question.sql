alter table public.matches add column shared_question_activity_at timestamptz;
alter policy "Users create their own unopened conversations" on public.matches
  with check (
    (select auth.uid()) in (user_p, user_q) and user_p < user_q
    and status = 'active' and not is_unlocked and shared_question_activity_at is null
  );

create table profile_private.shared_conversation_questions (
  match_id uuid primary key references public.matches(id) on delete cascade,
  question text not null,
  answer_p varchar(400),
  answer_q varchar(400),
  skipped boolean not null default false
);
alter table profile_private.shared_conversation_questions enable row level security;
revoke all on profile_private.shared_conversation_questions from public, anon, authenticated, service_role;

create function profile_private.initialize_shared_question()
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
  from public.profiles p cross join public.profiles q
  where p.id = new.user_p and q.id = new.user_q;
  return new;
end;
$$;
revoke all on function profile_private.initialize_shared_question() from public, anon, authenticated, service_role;
create trigger initialize_shared_question after insert on public.matches
  for each row when (new.status = 'active') execute function profile_private.initialize_shared_question();

create function profile_private.get_shared_conversation_question(p_match_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'question', q.question,
    'skipped', q.skipped,
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
create function profile_private.respond_shared_conversation_question(p_match_id uuid, p_answer text)
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

  -- Skipping withdraws any unrevealed answer.
  update profile_private.shared_conversation_questions q set
    skipped = answer is null,
    answer_p = case when answer is null then null when caller = conversation.user_p then answer else q.answer_p end,
    answer_q = case when answer is null then null when caller = conversation.user_q then answer else q.answer_q end
  where q.match_id = p_match_id and not q.skipped
    and (case when answer is null then q.answer_p is null or q.answer_q is null
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

create function public.get_shared_conversation_question(p_match_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select profile_private.get_shared_conversation_question(p_match_id); $$;

create function public.respond_shared_conversation_question(p_match_id uuid, p_answer text)
returns jsonb language sql security invoker set search_path = ''
as $$ select profile_private.respond_shared_conversation_question(p_match_id, p_answer); $$;

revoke all on function profile_private.get_shared_conversation_question(uuid),
  profile_private.respond_shared_conversation_question(uuid, text),
  public.get_shared_conversation_question(uuid), public.respond_shared_conversation_question(uuid, text)
from public, anon, authenticated, service_role;
grant execute on function profile_private.get_shared_conversation_question(uuid),
  profile_private.respond_shared_conversation_question(uuid, text),
  public.get_shared_conversation_question(uuid), public.respond_shared_conversation_question(uuid, text)
to authenticated;

create or replace function public.get_conversation_inbox()
returns table (
  match_id uuid, partner_id uuid, status text, created_at timestamptz,
  message_id uuid, sender_id uuid, message_text text, duration real,
  has_media boolean, message_at timestamptz, unread boolean
)
language sql stable security invoker set search_path = ''
as $$
  select m.id,
    case when m.user_p = (select auth.uid()) then m.user_q else m.user_p end,
    m.status, m.created_at,
    latest.id, latest.sender_id, latest.message_text, latest.duration,
    latest.media_url is not null, latest.created_at,
    exists (
      select from public.messages x
      where x.match_id = m.id and x.sender_id <> (select auth.uid())
        and (r.last_read_at is null or x.created_at > r.last_read_at)
    )
  from public.matches m
  left join public.conversation_reads r
    on r.match_id = m.id and r.reader_id = (select auth.uid())
  left join lateral (
    select x.id, x.sender_id, x.message_text, x.duration, x.media_url, x.created_at
    from public.messages x where x.match_id = m.id
    order by x.created_at desc, x.id desc limit 1
  ) latest on m.status = 'active'
  where (select auth.uid()) in (m.user_p, m.user_q)
    and (m.status = 'deleted' or latest.id is not null or m.shared_question_activity_at is not null)
  order by coalesce(latest.created_at, m.shared_question_activity_at, m.created_at) desc, m.id;
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
