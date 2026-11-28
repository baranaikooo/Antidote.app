import { supabase } from "./supabase";

export type FavoriteSong = {
  title: string;
  artist: string;
  artworkUrl: string | null;
  previewUrl: string | null;
  spotifyUrl: string;
};

export type MusicSearchResult = FavoriteSong & {
  id: string;
};

const HTTPS_URL = /^https:\/\/\S+$/i;
const SPOTIFY_URL = /^https:\/\/open\.spotify\.com\/\S+$/i;

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanHttpsUrl(value: unknown, pattern: RegExp) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 400 || !pattern.test(trimmed)) return null;
  return trimmed;
}

export function parseFavoriteSong(raw: unknown): FavoriteSong | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const title = cleanString(record.title, 140);
  const artist = cleanString(record.artist, 140);
  const spotifyUrl = cleanHttpsUrl(record.spotifyUrl, SPOTIFY_URL);
  if (!title || !artist || !spotifyUrl) return null;
  return {
    title,
    artist,
    artworkUrl: cleanHttpsUrl(record.artworkUrl, HTTPS_URL),
    previewUrl: cleanHttpsUrl(record.previewUrl, HTTPS_URL),
    spotifyUrl,
  };
}

export async function searchFavoriteSongs(query: string): Promise<MusicSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const { data, error } = await supabase.functions.invoke("search-profile-music", {
    body: { query: trimmed },
  });
  if (error || !Array.isArray(data?.tracks)) {
    throw error ?? new Error("Music search failed");
  }
  return data.tracks.flatMap((entry: unknown, index: number) => {
    const parsed = parseFavoriteSong(entry);
    if (!parsed) return [];
    const id =
      typeof (entry as { id?: unknown })?.id === "string"
        ? (entry as { id: string }).id
        : `${parsed.artist}:${parsed.title}:${index}`;
    return [{ ...parsed, id }];
  });
}

export async function saveFavoriteSong(userId: string, song: FavoriteSong | null) {
  const next = song ? parseFavoriteSong(song) : null;
  if (song && !next) throw new Error("Invalid track metadata");
  if (!userId || userId === "00000000-0000-0000-0000-000000000001") return next;

  const { error } = await supabase
    .from("profiles")
    .update({ favorite_song: next })
    .eq("id", userId);
  if (error) throw error;
  return next;
}
