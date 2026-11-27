-- Gallery storage is retained for account cleanup only. New images cannot be uploaded.
drop policy "Participants upload own chat images" on storage.objects;
drop policy "Owners and conversation recipients read chat images" on storage.objects;
create policy "Owners list own legacy chat images for cleanup"
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-images' and storage.foldername(name) = array[(select auth.uid())::text]
);

drop trigger validate_chat_image on public.messages;
drop function profile_private.validate_chat_image();

-- Only allow an exact approved GIPHY URL or the message's own WAV from private voice storage.
create function profile_private.validate_chat_media()
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
  ]) then
    return new;
  end if;

  raise exception 'This chat attachment is not allowed' using errcode = '22023';
end;
$$;
revoke all on function profile_private.validate_chat_media() from public, anon, authenticated, service_role;
create trigger validate_chat_media before insert on public.messages
  for each row when (new.media_url is not null or new.duration is not null)
  execute function profile_private.validate_chat_media();
