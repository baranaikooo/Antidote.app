alter table public.matches add column meeting_agreed boolean not null default false;

alter policy "Users create their own unopened conversations" on public.matches
  with check (
    (select auth.uid()) in (user_p, user_q) and user_p < user_q and status = 'active'
    and not is_unlocked and shared_question_activity_at is null and not meeting_agreed
  );

create table profile_private.meeting_interests (
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null,
  primary key (match_id, user_id)
);
alter table profile_private.meeting_interests enable row level security;
revoke all on profile_private.meeting_interests from public, anon, authenticated, service_role;

create function profile_private.get_meeting_interest(p_match_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'interested', exists (
      select from profile_private.meeting_interests i
      where i.match_id = m.id and i.user_id = caller.id
    ),
    'mutual', m.meeting_agreed
  )
  from (select auth.uid() as id) caller
  join public.matches m on m.id = p_match_id and m.status = 'active'
    and caller.id in (m.user_p, m.user_q)
  where exists (select from public.messages x where x.match_id = m.id and x.sender_id = m.user_p)
    and exists (select from public.messages x where x.match_id = m.id and x.sender_id = m.user_q);
$$;

create function profile_private.set_meeting_interest(p_match_id uuid, p_interested boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  mutual boolean;
begin
  if p_interested is null then return null; end if;

  -- Serialize both choices with other changes to the conversation.
  perform from public.matches m
  where m.id = p_match_id and m.status = 'active' and caller in (m.user_p, m.user_q)
  for update;
  if not found or profile_private.get_meeting_interest(p_match_id) is null then return null; end if;

  if p_interested then
    insert into profile_private.meeting_interests (match_id, user_id)
    values (p_match_id, caller) on conflict do nothing;
  else
    delete from profile_private.meeting_interests i
    where i.match_id = p_match_id and i.user_id = caller;
  end if;

  -- A single private choice produces no matches update or Realtime event for the other person.
  select count(*) = 2 into mutual
  from profile_private.meeting_interests i where i.match_id = p_match_id;
  update public.matches m set meeting_agreed = mutual
  where m.id = p_match_id and m.meeting_agreed is distinct from mutual;

  return profile_private.get_meeting_interest(p_match_id);
end;
$$;

create function public.get_meeting_interest(p_match_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select profile_private.get_meeting_interest(p_match_id); $$;

create function public.set_meeting_interest(p_match_id uuid, p_interested boolean)
returns jsonb language sql security invoker set search_path = ''
as $$ select profile_private.set_meeting_interest(p_match_id, p_interested); $$;

revoke all on function profile_private.get_meeting_interest(uuid),
  profile_private.set_meeting_interest(uuid, boolean),
  public.get_meeting_interest(uuid), public.set_meeting_interest(uuid, boolean)
from public, anon, authenticated, service_role;

grant execute on function profile_private.get_meeting_interest(uuid),
  profile_private.set_meeting_interest(uuid, boolean),
  public.get_meeting_interest(uuid), public.set_meeting_interest(uuid, boolean)
to authenticated;
