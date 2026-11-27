-- Use two scale midpoints as a fixed complementarity target. Other candidates cannot affect a pair's score.
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
      v.priority_distribution as viewer_distribution, p.priority_distribution as candidate_distribution,
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
      case when variant in ('baseline', 'full_priorities') then same_priority end desc nulls last,
      case when variant in ('baseline', 'full_priorities') then exact_distance_km end nulls last,
      case when variant is distinct from 'baseline' and variant is distinct from 'full_priorities'
        then vector_distance end,
      id
    limit greatest(0, least(100, coalesce(max_limit, 100)))
  ), scoring as (
    select c.*, c.viewer_extraversion + c.extraversion
      - 1.0 as balance
    from candidates c
  ), comparison as (
    select s.*,
      case when s.variant in ('baseline', 'full_priorities') then case when s.same_priority then 100 else 0 end
        else least(100, round((60 * s.similarity + 40 * (1 - least(1, greatest(s.balance, -s.balance * 0.5)))
          + s.age_bonus)::numeric, 1))
      end::double precision as score,
      case when s.variant = 'full_priorities'
        and s.viewer_distribution is not null and s.candidate_distribution is not null
      then 10 * (
        select sum(least(s.viewer_distribution[k], s.candidate_distribution[k]))
        from generate_series(1, 5) positions(k)
      ) end as overlap_score
    from scoring s
  ), positions as (
    select c.*, row_number() over (order by c.score desc,
      case when c.variant in ('baseline', 'full_priorities') then c.exact_distance_km end nulls last,
      case when c.variant is distinct from 'baseline' and c.variant is distinct from 'full_priorities'
        then c.vector_distance end,
      c.id) as base_position
    from comparison c
  ), full_slots as (
    -- Candidates without complete data keep their original positions.
    select p.base_position, row_number() over (order by p.base_position) as slot
    from positions p
    where p.overlap_score is not null
  ), full_order as (
    select p.id, row_number() over (
      order by p.overlap_score desc, p.exact_distance_km nulls last, p.id
    ) as slot
    from positions p
    where p.overlap_score is not null
  )
  select p.id, p.name, p.age, p.city, p.top_priority, p.shared_reflection, p.distance_km,
    coalesce(p.overlap_score, p.score)::double precision
  from positions p
  left join full_order f on f.id = p.id
  left join full_slots slots on slots.slot = f.slot
  order by coalesce(slots.base_position, p.base_position);
$$;
