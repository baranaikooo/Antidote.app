alter table public.profiles add column shared_reflection varchar(400);
alter table public.messages add column reply_context varchar(400);

-- Keep discovery separate from media. Authenticated users may read explicitly shared text.
drop policy if exists "select_snippets" on public.media_snippets;
create policy "Read own snippet metadata" on public.media_snippets
  for select to authenticated using (user_id = (select auth.uid()));

-- Return storage paths only. Old profile rows can still hold long-lived signed URLs.
create function public.list_shared_profile_video_paths(p_owner uuid)
returns table (path text)
language sql stable security definer set search_path = ''
as $policy$
  select regexp_replace(split_part(s.video_url, '?', 1), '^https?://[^/]+/storage/v1/object/(sign|public)/media-snippets/', '')
  from public.media_snippets s
  where s.user_id = p_owner and (p_owner = auth.uid() or exists (
    select from public.matches m where m.status = 'active' and m.is_unlocked
      and ((m.user_p = auth.uid() and m.user_q = p_owner) or (m.user_q = auth.uid() and m.user_p = p_owner))
  ))
  order by s.slot_index;
$policy$;
revoke all on function public.list_shared_profile_video_paths(uuid) from public, anon, authenticated;
grant execute on function public.list_shared_profile_video_paths(uuid) to authenticated;

drop policy if exists "Anyone can read media snippets" on storage.objects;
create policy "Read own or mutually shared media snippets" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'media-snippets' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select from public.matches m
        where m.status = 'active' and m.is_unlocked
          and ((m.user_p = (select auth.uid()) and m.user_q::text = (storage.foldername(name))[1])
            or (m.user_q = (select auth.uid()) and m.user_p::text = (storage.foldername(name))[1]))
      )
    )
  );

drop policy if exists "Users can update own matches" on public.matches;
drop policy if exists "Users can insert own matches" on public.matches;
create policy "Users create their own unopened conversations" on public.matches
  for insert to authenticated
  with check (auth.uid() in (user_p, user_q) and user_p < user_q and status = 'active' and not is_unlocked);
revoke update on public.matches from anon, authenticated;

drop trigger if exists trg_handle_blind_vote on public.blind_votes;
drop trigger if exists on_blind_vote_inserted on public.blind_votes;
revoke insert, update, delete on public.blind_votes from anon, authenticated;

create table public.conversation_reports (
  match_id uuid not null references public.matches(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('harassment', 'spam', 'other')),
  created_at timestamptz not null default now(),
  primary key (match_id, reporter_id)
);
alter table public.conversation_reports enable row level security;
revoke all on public.conversation_reports from public, anon, authenticated;
grant select on public.conversation_reports to service_role;

-- Serialize both participants' decisions on the match row. Never expose the other participant's vote.
create function public.set_conversation_choice(p_match_id uuid, p_choice text)
returns table (status text, is_unlocked boolean, consent_pending boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  conversation public.matches%rowtype;
begin
  if p_choice is null or p_choice not in ('share', 'withdraw', 'close', 'harassment', 'spam', 'other') then
    raise exception 'Unknown conversation action' using errcode = '22023';
  end if;
  select m.* into conversation from public.matches m
    where m.id = p_match_id and caller in (m.user_p, m.user_q) for update;
  if not found then
    raise exception 'Conversation unavailable' using errcode = '42501';
  end if;

  if p_choice in ('close', 'harassment', 'spam', 'other') then
    if p_choice <> 'close' then
      insert into public.conversation_reports (match_id, reporter_id, reason)
        values (p_match_id, caller, p_choice) on conflict do nothing;
    end if;
    if conversation.status = 'active' then
      update public.matches m set status = 'deleted' where m.id = p_match_id
        returning m.* into conversation;
    end if;
  elsif conversation.status = 'active' and not conversation.is_unlocked then
    if p_choice = 'withdraw' then
      delete from public.blind_votes v where v.match_id = p_match_id and v.user_id = caller;
    else
      insert into public.blind_votes (match_id, user_id, vote) values (p_match_id, caller, 'unlock')
        on conflict (match_id, user_id) do update set vote = excluded.vote;
      if (select count(*) from public.blind_votes v
          where v.match_id = p_match_id and v.user_id in (conversation.user_p, conversation.user_q)
            and v.vote = 'unlock') = 2 then
        update public.matches m set is_unlocked = true where m.id = p_match_id
          returning m.* into conversation;
      end if;
    end if;
  end if;

  return query select conversation.status,
    conversation.is_unlocked and conversation.status = 'active',
    conversation.status = 'active' and not conversation.is_unlocked and exists (
      select from public.blind_votes v where v.match_id = p_match_id and v.user_id = caller and v.vote = 'unlock'
    );
end;
$$;
revoke all on function public.set_conversation_choice(uuid, text) from public, anon, authenticated;
grant execute on function public.set_conversation_choice(uuid, text) to authenticated;

-- Reject a send which races with closing the conversation.
create function public.require_open_conversation() returns trigger
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
    or not exists (select from public.profiles p where p.id = partner and p.shared_reflection = new.reply_context)
    or exists (select from public.messages m where m.match_id = new.match_id)
  ) then
    new.reply_context := null;
  end if;
  return new;
end;
$policy$;
revoke all on function public.require_open_conversation() from public, anon, authenticated;
create trigger require_open_conversation before insert on public.messages
  for each row execute function public.require_open_conversation();
