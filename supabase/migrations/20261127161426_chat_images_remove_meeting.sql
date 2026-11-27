-- Remove meeting prompts and the RPCs used by older app versions.
lock table public.matches in access exclusive mode;

drop function public.set_meeting_interest(uuid, boolean);
drop function public.get_meeting_interest(uuid);
drop function profile_private.set_meeting_interest(uuid, boolean);
drop function profile_private.get_meeting_interest(uuid);

alter policy "Users create their own unopened conversations" on public.matches
  with check (
    (select auth.uid()) in (user_p, user_q) and user_p < user_q and status = 'active'
    and not is_unlocked and shared_question_activity_at is null
  );

alter table public.matches drop column meeting_agreed;

-- Drop the obsolete private table only when no choices were saved.
do $$
begin
  if not exists (select from profile_private.meeting_interests) then
    drop table profile_private.meeting_interests;
  end if;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', false, 8388608, array['image/jpeg','image/png','image/webp','image/gif']);

create policy "Participants upload own chat images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-images'
  and storage.foldername(name) = array[(select auth.uid())::text]
  and storage.filename(name) ~ '^[0-9a-f-]{36}_[0-9a-f-]{36}[.](gif|jpg|png|webp)$'
  and exists (
    select from public.matches m
    where m.id::text = split_part(storage.filename(name), '_', 1)
      and m.status = 'active' and (select auth.uid()) in (m.user_p, m.user_q)
  )
);

create policy "Owners and conversation recipients read chat images"
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-images' and (
    storage.foldername(name) = array[(select auth.uid())::text]
    or exists (
      select from public.matches m
      join public.messages msg on msg.match_id = m.id
      where m.id::text = split_part(storage.filename(name), '_', 1)
        and m.status = 'active' and (select auth.uid()) in (m.user_p, m.user_q)
        and msg.media_url = 'chat-images/' || storage.objects.name
    )
  )
);

create policy "Owners can delete own chat images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-images' and storage.foldername(name) = array[(select auth.uid())::text]
);

-- A message can reference only its author's own uploaded image for this match and message ID.
create function profile_private.validate_chat_image()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  expected_path text := new.sender_id::text || '/' || new.match_id::text || '_' || new.id::text;
  attachment_path text := substr(new.media_url, length('chat-images/') + 1);
begin
  if new.duration is not null
    or attachment_path not in (expected_path || '.gif', expected_path || '.jpg', expected_path || '.png', expected_path || '.webp')
    or not exists (
      select from storage.objects where bucket_id = 'chat-images' and name = attachment_path
    )
  then
    raise exception 'Chat image unavailable' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function profile_private.validate_chat_image() from public, anon, authenticated, service_role;
create trigger validate_chat_image before insert on public.messages
  for each row when (new.media_url like 'chat-images/%') execute function profile_private.validate_chat_image();
