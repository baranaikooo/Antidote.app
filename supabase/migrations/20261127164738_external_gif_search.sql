create table profile_private.provider_chat_gifs (
  url text primary key check (
    length(url) <= 512 and url ~ '^https://static[.]klipy[.]com/ii/[A-Za-z0-9/_-]+[.]gif$'
  ),
  approved_until timestamptz not null
);
create index provider_chat_gifs_expiry_idx on profile_private.provider_chat_gifs (approved_until);

create table profile_private.chat_gif_search_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  minute_start timestamptz not null,
  calls integer not null
);
alter table profile_private.provider_chat_gifs enable row level security;
alter table profile_private.chat_gif_search_usage enable row level security;
revoke all on profile_private.provider_chat_gifs, profile_private.chat_gif_search_usage
  from public, anon, authenticated, service_role;

create function public.reserve_chat_gif_search(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  current_minute timestamptz := date_trunc('minute', clock_timestamp());
begin
  insert into profile_private.chat_gif_search_usage as usage (user_id, minute_start, calls)
  values (p_user_id, current_minute, 1)
  on conflict (user_id) do update
    set minute_start = excluded.minute_start,
        calls = case when usage.minute_start = excluded.minute_start then usage.calls + 1 else 1 end
    where usage.minute_start < excluded.minute_start or usage.calls < 15;
  return found;
end;
$$;

create function public.approve_provider_chat_gifs(p_urls text[])
returns void language sql security definer set search_path = ''
as $$
  delete from profile_private.provider_chat_gifs p where p.approved_until <= now();
  insert into profile_private.provider_chat_gifs (url, approved_until)
  select distinct u.url, now() + interval '1 hour'
  from unnest(p_urls[1:24]) u(url)
  where length(u.url) <= 512 and u.url ~ '^https://static[.]klipy[.]com/ii/[A-Za-z0-9/_-]+[.]gif$'
  on conflict (url) do update set approved_until = excluded.approved_until;
$$;

revoke all on function public.reserve_chat_gif_search(uuid), public.approve_provider_chat_gifs(text[])
  from public, anon, authenticated, service_role;
grant execute on function public.reserve_chat_gif_search(uuid), public.approve_provider_chat_gifs(text[])
  to service_role;

create or replace function profile_private.validate_chat_media()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.duration is not null then
    if new.duration > 0 and new.duration < 'Infinity'::real
      and new.media_url = 'matches/' || new.match_id::text || '/' || new.id::text || '.wav'
      and exists (
        select from storage.objects where bucket_id = 'voice-messages' and name = new.media_url
      )
    then
      return new;
    end if;
  elsif new.media_url = any(array[
    'https://media.giphy.com/media/EKrFksrzxQxlb5ahiq/200w.gif',
    'https://media.giphy.com/media/MPxg9U887PS0B8XT4J/200w.gif',
    'https://media.giphy.com/media/Wj116ZszUZEwRIoz0j/200w.gif',
    'https://media.giphy.com/media/9Ekme9q1d8rEImpvFu/200w.gif',
    'https://media.giphy.com/media/VHtuGwzaT0p9uc1Fyi/200w.gif',
    'https://media.giphy.com/media/SLhS4qdH5XsissZ7cV/200w.gif',
    'https://media.giphy.com/media/TlK63ETpu0aX6eJBRu0/200w.gif',
    'https://media.giphy.com/media/l0K4m0mzkJDAIdhHW/200w.gif',
    'https://media.giphy.com/media/3o6Zt0KNPZgqZlCu6k/200w.gif',
    'https://media.giphy.com/media/IdmZ0ECRI5OzJZwEpT/200w.gif',
    'https://media.giphy.com/media/S01epno8jedbadR94l/200w.gif',
    'https://media.giphy.com/media/l0K45fwBufXrJM2jK/200w.gif',
    'https://media.giphy.com/media/Y2VBz2SExrnyxRqGO1/200w.gif',
    'https://media.giphy.com/media/G4A47qhLk2r3jC7eSu/200w.gif',
    'https://media.giphy.com/media/G5MDBwmdTrVMpuRJix/200w.gif',
    'https://media.giphy.com/media/l0MYy2GInHvLon2jS/200w.gif',
    'https://media.giphy.com/media/l0HlU58VINoTOW6Fa/200w.gif',
    'https://media.giphy.com/media/l2QDYGQQKKNGq6mhq/200w.gif',
    'https://media.giphy.com/media/XwEDiXDF4R6LLtyTFR/200w.gif',
    'https://media.giphy.com/media/3ohs7Qa1M9DxGaI94A/200w.gif',
    'https://media.giphy.com/media/QVvJOcVF7vxhOcL2N9/200w.gif',
    'https://media.giphy.com/media/Yle9Yz9izeVRyiwavn/200w.gif',
    'https://media.giphy.com/media/bnOIY81AEMa4llyfFI/200w.gif',
    'https://media.giphy.com/media/JRQeedL8rzLlSvimz9/200w.gif'
  ]) or exists (
    select from profile_private.provider_chat_gifs
    where url = new.media_url and approved_until > now()
  ) then
    return new;
  end if;

  raise exception 'This chat attachment is not allowed' using errcode = '22023';
end;
$$;
