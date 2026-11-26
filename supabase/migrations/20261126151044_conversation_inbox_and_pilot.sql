create table public.conversation_reads (
  match_id uuid not null references public.matches(id) on delete cascade,
  reader_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null,
  primary key (match_id, reader_id)
);
alter table public.conversation_reads enable row level security;
create policy "Read own conversation state" on public.conversation_reads
  for select to authenticated using (reader_id = (select auth.uid()));
revoke all on public.conversation_reads from public, anon, authenticated;
grant select on public.conversation_reads to authenticated;

create table public.conversation_pilot_responses (
  match_id uuid not null references public.matches(id) on delete cascade,
  respondent_id uuid not null references public.profiles(id) on delete cascade,
  would_continue boolean not null,
  primary key (match_id, respondent_id)
);
alter table public.conversation_pilot_responses enable row level security;
create policy "Read own pilot response" on public.conversation_pilot_responses
  for select to authenticated using (respondent_id = (select auth.uid()));
revoke all on public.conversation_pilot_responses from public, anon, authenticated;
grant select on public.conversation_pilot_responses to authenticated, service_role;

create index if not exists messages_match_created_at_idx
  on public.messages (match_id, created_at desc, id desc);

-- The caller sees previews for their conversations and only their own unread status.
create function public.get_conversation_inbox()
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
    and (m.status = 'deleted' or latest.id is not null)
  order by coalesce(latest.created_at, m.created_at) desc, m.id;
$$;
revoke all on function public.get_conversation_inbox() from public, anon, authenticated;
grant execute on function public.get_conversation_inbox() to authenticated;

create function public.mark_conversation_read(p_match_id uuid, p_message_id uuid)
returns void language sql security definer set search_path = ''
as $$
  insert into public.conversation_reads as receipt (match_id, reader_id, last_read_at)
  select m.id, auth.uid(), x.created_at
  from public.matches m join public.messages x on x.match_id = m.id
  where m.id = p_match_id and x.id = p_message_id and auth.uid() in (m.user_p, m.user_q)
  on conflict (match_id, reader_id)
    do update set last_read_at = greatest(receipt.last_read_at, excluded.last_read_at);
$$;
revoke all on function public.mark_conversation_read(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mark_conversation_read(uuid, uuid) to authenticated;

-- Ask only after both participants have sent a message. Do not expose answers to the partner.
create function public.submit_conversation_pilot_response(p_match_id uuid, p_would_continue boolean)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if p_would_continue is null then return false; end if;
  insert into public.conversation_pilot_responses (match_id, respondent_id, would_continue)
  select m.id, auth.uid(), p_would_continue
  from public.matches m
  where m.id = p_match_id and m.status = 'active' and auth.uid() in (m.user_p, m.user_q)
    and exists (select from public.messages x where x.match_id = m.id and x.sender_id = m.user_p)
    and exists (select from public.messages x where x.match_id = m.id and x.sender_id = m.user_q)
  on conflict do nothing;
  return found or exists (
    select from public.conversation_pilot_responses p
    where p.match_id = p_match_id and p.respondent_id = auth.uid()
  );
end;
$$;
revoke all on function public.submit_conversation_pilot_response(uuid, boolean) from public, anon, authenticated;
grant execute on function public.submit_conversation_pilot_response(uuid, boolean) to authenticated;

create view public.conversation_pilot_metrics with (security_invoker = true) as
select
  (select count(distinct m.match_id) from public.messages m) as conversations_started,
  (select count(*) from (
    select m.match_id from public.messages m group by m.match_id having count(distinct m.sender_id) > 1
  ) exchanges) as conversations_with_both_participants,
  (select count(*) from public.conversation_pilot_responses) as voluntary_responses,
  (select count(*) from public.conversation_pilot_responses where would_continue) as would_continue;
revoke all on public.conversation_pilot_metrics from public, anon, authenticated;
grant select on public.conversation_pilot_metrics to service_role;

-- A device only receives changes to its signed-in account's read cursor.
do $publication$
begin
  if exists (select from pg_publication where pubname = 'supabase_realtime' and not puballtables)
    and not exists (select from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'conversation_reads') then
    alter publication supabase_realtime add table public.conversation_reads;
  end if;
end;
$publication$;
