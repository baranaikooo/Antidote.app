create table profile_private.matching_pilot_exposures (
  viewer_id uuid references profile_private.matching_pilot_assignments(user_id) on delete cascade,
  candidate_id uuid references public.profiles(id) on delete cascade,
  position integer not null check (position between 1 and 3),
  first_seen_at timestamptz not null,
  has_full_priorities boolean not null,
  primary key (viewer_id, candidate_id),
  check (viewer_id <> candidate_id)
);

alter table profile_private.matching_pilot_exposures enable row level security;
revoke all on profile_private.matching_pilot_exposures from public, anon, authenticated, service_role;

create function profile_private.record_matching_pilot_exposure(p_candidate_id uuid, p_position integer)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  viewer uuid := (select auth.uid());
  viewed_at timestamptz := statement_timestamp();
begin
  if viewer is null or p_candidate_id is null or viewer = p_candidate_id
    or p_position is null or p_position not between 1 and 3 then
    return;
  end if;

  -- Lock enrollment until the insert ends so opting out cannot race a new exposure.
  perform 1 from profile_private.matching_pilot_assignments a
    where a.user_id = viewer and viewed_at >= a.enrolled_at
      and viewed_at < a.enrolled_at + interval '14 days'
    for key share;
  if not found or exists (
    select 1 from profile_private.matching_pilot_exposures e
    where e.viewer_id = viewer and e.candidate_id = p_candidate_id
  ) then
    return;
  end if;

  if not exists (
    select 1 from profile_private.get_recommended_matches(100) r where r.id = p_candidate_id
  ) then
    return;
  end if;

  insert into profile_private.matching_pilot_exposures
    (viewer_id, candidate_id, position, first_seen_at, has_full_priorities)
  select viewer, p_candidate_id, p_position, viewed_at,
    v.priority_distribution is not null and c.priority_distribution is not null
  from public.profiles v
  join public.profiles c on c.id = p_candidate_id
  where v.id = viewer
  on conflict (viewer_id, candidate_id) do nothing;
end;
$$;

create function public.record_matching_pilot_exposure(p_candidate_id uuid, p_position integer)
returns void
language sql set search_path = ''
as $$
  select profile_private.record_matching_pilot_exposure(p_candidate_id, p_position);
$$;

revoke all on function profile_private.record_matching_pilot_exposure(uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.record_matching_pilot_exposure(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function profile_private.record_matching_pilot_exposure(uuid, integer) to authenticated;
grant execute on function public.record_matching_pilot_exposure(uuid, integer) to authenticated;

create view profile_private.matching_pilot_exposure_metrics
with (security_invoker = true)
as
with outcomes as (
  select a.variant, e.position, e.has_full_priorities,
    exists (
      select 1
      from public.matches m
      join lateral (
        select msg.sender_id, msg.created_at
        from public.messages msg
        where msg.match_id = m.id
        order by msg.created_at, msg.id
        limit 1
      ) first_message on first_message.sender_id = e.viewer_id
        and first_message.created_at >= e.first_seen_at
        and first_message.created_at < a.enrolled_at + interval '14 days'
      where ((m.user_p = e.viewer_id and m.user_q = e.candidate_id)
          or (m.user_q = e.viewer_id and m.user_p = e.candidate_id))
        and m.created_at >= a.enrolled_at
        and m.created_at < a.enrolled_at + interval '14 days'
        and exists (
          select 1 from public.messages reply
          where reply.match_id = m.id and reply.sender_id = e.candidate_id
            and reply.created_at < a.enrolled_at + interval '14 days'
        )
    ) as two_way
  from profile_private.matching_pilot_exposures e
  join profile_private.matching_pilot_assignments a on a.user_id = e.viewer_id
  where a.enrolled_at + interval '14 days' <= now()
)
select variant, position,
  count(*) as seen_recommendations,
  count(*) filter (where has_full_priorities) as full_priority_recommendations,
  count(*) filter (where two_way) as two_way_conversations,
  round(100.0 * count(*) filter (where has_full_priorities) / count(*), 1) as full_priority_pct,
  round(100.0 * count(*) filter (where two_way) / count(*), 1) as two_way_per_100_seen
from outcomes
group by grouping sets ((variant, position), (variant));

revoke all on profile_private.matching_pilot_exposure_metrics from public, anon, authenticated, service_role;
