create table profile_private.matching_pilot_assignments (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  variant text not null default (case when random() < 0.5 then 'current' else 'baseline' end)
    check (variant in ('current', 'baseline')),
  enrolled_at timestamptz not null default now()
);

alter table profile_private.matching_pilot_assignments enable row level security;
revoke all on profile_private.matching_pilot_assignments from public, anon, authenticated, service_role;

alter table public.conversation_pilot_responses
  add column recorded_at timestamptz not null default now();

create or replace function profile_private.get_recommended_matches(max_limit integer)
returns table (
  id uuid, name text, age integer, city text, top_priority text,
  shared_reflection varchar, distance_km integer, score double precision
)
language sql stable security definer set search_path = ''
as $$
  with viewer as (
    select p.*, coalesce(p.radius_km, 200) as search_radius, a.variant
    from public.profiles p
    left join profile_private.matching_pilot_assignments a on a.user_id = p.id
      and a.enrolled_at <= now() and now() < a.enrolled_at + interval '14 days'
    where p.id = (select auth.uid())
  ), eligible as (
    select p.id, p.name, p.age, p.city, p.top_priority, p.shared_reflection,
      round(location.distance_km)::integer as distance_km,
      location.distance_km as exact_distance_km, v.variant,
      coalesce(p.top_priority <> '' and p.top_priority = v.top_priority, false) as same_priority,
      p.similarity_vector operator(public.<->) v.similarity_vector as vector_distance,
      least(1, greatest(0, coalesce(p.extraversion, 0.5))) as extraversion,
      least(1, greatest(0, coalesce(v.extraversion, 0.5))) as viewer_extraversion,
      1 - sqrt(
        (least(1, greatest(0, coalesce(p.cognitive_depth, 0.5)))
          - least(1, greatest(0, coalesce(v.cognitive_depth, 0.5))))^2
        + (least(1, greatest(0, coalesce(p.conscientiousness, 0.5)))
          - least(1, greatest(0, coalesce(v.conscientiousness, 0.5))))^2
      ) / sqrt(2.0) as similarity,
      case when abs(v.age - p.age) <= 2 then 10
        when abs(v.age - p.age) <= 5 then 5 else 0 end as age_bonus
    from viewer v
    join public.profiles p on p.id <> v.id
    join auth.users u on u.id = p.id
    cross join lateral (
      select case
        when v.latitude between -90 and 90 and v.longitude between -180 and 180
          and p.latitude between -90 and 90 and p.longitude between -180 and 180
        then 12742 * asin(least(1, sqrt(
          sin(radians(p.latitude - v.latitude) / 2)^2
          + cos(radians(v.latitude)) * cos(radians(p.latitude))
            * sin(radians(p.longitude - v.longitude) / 2)^2
        )))
      end as distance_km
    ) location
    where p.liveness_verified and p.status = 'ACTIVE'
      and p.age between greatest(18, v.age / 2 + 7) and (v.age::bigint - 7) * 2
      and v.age between greatest(18, p.age / 2 + 7) and (p.age::bigint - 7) * 2
      and (v.orientation = 'bi' or (
        v.gender <> 'other' and p.gender <> 'other'
        and (
          (v.orientation = 'hetero' and v.gender <> p.gender)
          or (v.orientation = 'homo' and v.gender = p.gender)
        )
      ))
      and (p.orientation = 'bi' or (
        p.gender <> 'other' and v.gender <> 'other'
        and (
          (p.orientation = 'hetero' and p.gender <> v.gender)
          or (p.orientation = 'homo' and p.gender = v.gender)
        )
      ))
      -- Apply the exact radius before rounding or limiting results.
      and (v.search_radius >= 500 or location.distance_km <= v.search_radius)
  ), candidates as (
    select * from eligible
    order by
      case when variant = 'baseline' then same_priority end desc nulls last,
      case when variant = 'baseline' then exact_distance_km end nulls last,
      case when variant is distinct from 'baseline' then vector_distance end,
      id
    limit greatest(0, least(100, coalesce(max_limit, 100)))
  ), scoring as (
    select c.*, c.viewer_extraversion + c.extraversion
      - greatest(0.6, least(1.4, 2 * avg(c.extraversion) over ())) as balance
    from candidates c
  )
  select s.id, s.name, s.age, s.city, s.top_priority, s.shared_reflection, s.distance_km,
    case when s.variant = 'baseline' then case when s.same_priority then 100 else 0 end
      else least(100, round((60 * s.similarity + 40 * (1 - least(1, greatest(s.balance, -s.balance * 0.5)))
        + s.age_bonus)::numeric, 1))
    end::double precision as score
  from scoring s
  order by score desc,
    case when s.variant = 'baseline' then s.exact_distance_km end nulls last,
    case when s.variant is distinct from 'baseline' then s.vector_distance end,
    s.id;
$$;

-- Report the two cohorts after an equal 14-day observation window. Attribute a conversation
-- only to its first sender, so a match between participants is never counted in both cohorts.
create view profile_private.matching_pilot_metrics
with (security_invoker = true)
as
with variants(variant) as (
  values ('current'::text), ('baseline'::text)
), completed as (
  select a.*, a.enrolled_at + interval '14 days' as ends_at
  from profile_private.matching_pilot_assignments a
  where a.enrolled_at + interval '14 days' <= now()
), started as (
  select c.variant, c.user_id, m.id as match_id,
    exists (
      select 1 from public.messages reply
      where reply.match_id = m.id and reply.sender_id <> c.user_id
        and reply.created_at < c.ends_at
    ) as two_way,
    feedback.would_continue
  from completed c
  join public.matches m on c.user_id in (m.user_p, m.user_q)
    and m.created_at >= c.enrolled_at and m.created_at < c.ends_at
  join lateral (
    select msg.sender_id, msg.created_at
    from public.messages msg
    where msg.match_id = m.id
    order by msg.created_at, msg.id
    limit 1
  ) first_message on first_message.sender_id = c.user_id
    and first_message.created_at >= c.enrolled_at and first_message.created_at < c.ends_at
  left join public.conversation_pilot_responses feedback
    on feedback.match_id = m.id and feedback.respondent_id = c.user_id
    and feedback.recorded_at >= c.enrolled_at and feedback.recorded_at < c.ends_at
), counts as (
  select variant, count(*) as started_conversations,
    count(*) filter (where two_way) as two_way_conversations,
    count(would_continue) filter (where two_way) as voluntary_responses,
    count(*) filter (where two_way and would_continue) as would_continue
  from started
  group by variant
)
select v.variant,
  (select count(*) from profile_private.matching_pilot_assignments a where a.variant = v.variant)
    as enrolled,
  (select count(*) from completed c where c.variant = v.variant) as completed_participants,
  coalesce(s.started_conversations, 0) as started_conversations,
  coalesce(s.two_way_conversations, 0) as two_way_conversations,
  coalesce(s.voluntary_responses, 0) as voluntary_responses,
  coalesce(s.would_continue, 0) as would_continue
from variants v
left join counts s on s.variant = v.variant;

revoke all on profile_private.matching_pilot_metrics from public, anon, authenticated, service_role;
