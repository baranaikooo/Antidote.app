alter table public.profiles
  add column if not exists favorite_song jsonb;

alter table public.profiles
  drop constraint if exists profiles_favorite_song_check;

alter table public.profiles
  add constraint profiles_favorite_song_check check (
    favorite_song is null
    or (
      jsonb_typeof(favorite_song) = 'object'
      and jsonb_typeof(favorite_song->'title') = 'string'
      and length(btrim(favorite_song->>'title')) between 1 and 140
      and jsonb_typeof(favorite_song->'artist') = 'string'
      and length(btrim(favorite_song->>'artist')) between 1 and 140
      and jsonb_typeof(favorite_song->'spotifyUrl') = 'string'
      and (favorite_song->>'spotifyUrl') ~ '^https://open\.spotify\.com/'
      and length(favorite_song->>'spotifyUrl') <= 320
      and (
        favorite_song->'artworkUrl' is null
        or jsonb_typeof(favorite_song->'artworkUrl') = 'null'
        or (
          jsonb_typeof(favorite_song->'artworkUrl') = 'string'
          and (favorite_song->>'artworkUrl') ~ '^https://'
          and length(favorite_song->>'artworkUrl') <= 400
        )
      )
      and (
        favorite_song->'previewUrl' is null
        or jsonb_typeof(favorite_song->'previewUrl') = 'null'
        or (
          jsonb_typeof(favorite_song->'previewUrl') = 'string'
          and (favorite_song->>'previewUrl') ~ '^https://'
          and length(favorite_song->>'previewUrl') <= 400
        )
      )
    )
  );
