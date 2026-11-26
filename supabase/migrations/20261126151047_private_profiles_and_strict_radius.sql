alter policy select_profile on public.profiles
  using (id = (select auth.uid()));

create schema profile_private;
grant usage on schema profile_private to authenticated;

create function profile_private.get_recommended_matches(max_limit integer)
returns table (
  id uuid, name text, age integer, city text, top_priority text,
  shared_reflection varchar, distance_km integer, score double precision
)
language sql stable security definer set search_path = ''
as $$
  with viewer as (
    select p.*, coalesce(p.radius_km, 200) as search_radius
    from public.profiles p
    where p.id = (select auth.uid())
  ), candidates as (
    select p.id, p.name, p.age, p.city, p.top_priority, p.shared_reflection,
      round(location.distance_km)::integer as distance_km,
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
    order by vector_distance, p.id
    limit greatest(0, least(100, coalesce(max_limit, 100)))
  ), scoring as (
    select c.*, c.viewer_extraversion + c.extraversion
      - greatest(0.6, least(1.4, 2 * avg(c.extraversion) over ())) as balance
    from candidates c
  )
  select s.id, s.name, s.age, s.city, s.top_priority, s.shared_reflection, s.distance_km,
    least(100, round((60 * s.similarity + 40 * (1 - least(1, greatest(s.balance, -s.balance * 0.5)))
      + s.age_bonus)::numeric, 1))::double precision as score
  from scoring s
  order by score desc, s.vector_distance, s.id;
$$;

create function public.get_recommended_matches(max_limit integer default 100)
returns table (
  id uuid, name text, age integer, city text, top_priority text,
  shared_reflection varchar, distance_km integer, score double precision
)
language sql stable security invoker set search_path = ''
as $$
  select * from profile_private.get_recommended_matches(max_limit);
$$;

-- Legacy clients still run a compatibility check, so these placeholders reflect
-- the viewer's preferences without exposing the candidate's private attributes.
create or replace function public.get_recommended_matches(
  caller_id uuid, caller_gender text, caller_orientation text, caller_vector public.vector,
  max_limit integer default 100
)
returns table (
  id uuid, name text, age integer, city text, gender text, orientation text,
  cognitive_depth real, conscientiousness real, extraversion real,
  attachment_style text, avg_response_time real, top_priority text,
  latitude double precision, longitude double precision, distance double precision
)
language sql stable security invoker set search_path = ''
as $$
  select p.id, p.name, p.age, p.city,
    case when v.orientation = 'homo' then v.gender
      when v.orientation = 'hetero' and v.gender = 'male' then 'female'
      when v.orientation = 'hetero' then 'male'
      else 'other' end,
    'bi', 0.5::real, 0.5::real, 0.5::real, 'Secure', 3::real, p.top_priority,
    null::double precision, null::double precision, p.distance_km::double precision / 100
  from profile_private.get_recommended_matches(max_limit) p
  join public.profiles v on v.id = (select auth.uid());
$$;

create function profile_private.get_conversation_partners(partner_ids uuid[])
returns table (
  id uuid, name text, age integer, city text, top_priority text, shared_reflection varchar
)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.name, p.age, p.city, p.top_priority, p.shared_reflection
  from public.profiles p
  where p.id = any(partner_ids)
    and exists (
      select from public.matches m
      where (m.user_p = (select auth.uid()) and m.user_q = p.id)
        or (m.user_q = (select auth.uid()) and m.user_p = p.id)
    );
$$;

create function public.get_conversation_partners(partner_ids uuid[])
returns table (
  id uuid, name text, age integer, city text, top_priority text, shared_reflection varchar
)
language sql stable security invoker set search_path = ''
as $$
  select * from profile_private.get_conversation_partners(partner_ids);
$$;

revoke all on function profile_private.get_recommended_matches(integer) from public, anon, service_role;
revoke all on function public.get_recommended_matches(integer) from public, anon, service_role;
revoke all on function public.get_recommended_matches(uuid, text, text, public.vector, integer) from public, anon, service_role;
revoke all on function profile_private.get_conversation_partners(uuid[]) from public, anon, service_role;
revoke all on function public.get_conversation_partners(uuid[]) from public, anon, service_role;

grant execute on function profile_private.get_recommended_matches(integer) to authenticated;
grant execute on function public.get_recommended_matches(integer) to authenticated;
grant execute on function public.get_recommended_matches(uuid, text, text, public.vector, integer) to authenticated;
grant execute on function profile_private.get_conversation_partners(uuid[]) to authenticated;
grant execute on function public.get_conversation_partners(uuid[]) to authenticated;

notify pgrst, 'reload schema';
