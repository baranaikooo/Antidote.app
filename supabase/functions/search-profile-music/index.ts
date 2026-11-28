import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

const spotifyTrackPattern =
  /^https:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{10,40})(?:[?#].*)?$/i;
const allowedArtworkPattern =
  /^https:\/\/(?:[a-z0-9-]+\.)?(?:mzstatic\.com|spotifycdn\.com|scdn\.co)\/\S+$/i;
const allowedPreviewPattern = /^https:\/\/audio-ssl\.itunes\.apple\.com\/\S+$/i;

type ItunesTrack = {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
};

type MusicResult = {
  id: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  previewUrl: string | null;
  spotifyUrl: string;
};

function sanitizeArtwork(url: unknown): string | null {
  if (typeof url !== "string" || url.length > 400) return null;
  const trimmed = url.trim();
  if (!allowedArtworkPattern.test(trimmed)) return null;
  return trimmed.replace("/100x100bb.jpg", "/300x300bb.jpg");
}

function sanitizePreview(url: unknown): string | null {
  if (typeof url !== "string" || url.length > 400) return null;
  const trimmed = url.trim();
  return allowedPreviewPattern.test(trimmed) ? trimmed : null;
}

function spotifySearchUrl(artist: string, title: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${title}`.trim())}`;
}

async function searchItunes(term: string, limit = 10): Promise<ItunesTrack[]> {
  const url = new URL("https://itunes.apple.com/search");
  url.search = new URLSearchParams({
    term,
    media: "music",
    entity: "song",
    limit: String(limit),
    country: "SK",
  }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: "error" });
  if (!response.ok) return [];
  const data = await response.json().catch(() => null);
  return Array.isArray(data?.results) ? (data.results as ItunesTrack[]) : [];
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return json({ error: "Unauthorized" }, 401);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return json({ error: "Unauthorized" }, 401);

    const input = await request.json().catch(() => null);
    const query = typeof input?.query === "string" ? input.query.trim() : "";
    if (query.length < 2 || query.length > 200) {
      return json({ error: "Invalid search" }, 400);
    }

    const spotifyMatch = query.match(spotifyTrackPattern);
    if (spotifyMatch) {
      const canonicalUrl = `https://open.spotify.com/track/${spotifyMatch[1]}`;
      const oembedUrl = new URL("https://open.spotify.com/oembed");
      oembedUrl.searchParams.set("url", canonicalUrl);

      const oembedRes = await fetch(oembedUrl, {
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      });
      if (!oembedRes.ok) return json({ error: "Track not found" }, 404);
      const oembed = await oembedRes.json().catch(() => null);
      const title =
        typeof oembed?.title === "string" ? oembed.title.trim().slice(0, 140) : "";
      if (!title) return json({ error: "Track not found" }, 404);

      const candidates = await searchItunes(title, 3).catch(() => []);
      const firstMatch = candidates.find(
        (item) => typeof item.artistName === "string" && item.artistName.trim(),
      );

      const track: MusicResult = {
        id: `spotify:${spotifyMatch[1]}`,
        title,
        artist: firstMatch?.artistName?.trim().slice(0, 140) || "Spotify",
        artworkUrl: sanitizeArtwork(oembed?.thumbnail_url) ?? sanitizeArtwork(firstMatch?.artworkUrl100),
        previewUrl: sanitizePreview(firstMatch?.previewUrl),
        spotifyUrl: canonicalUrl,
      };
      return json({ tracks: [track] });
    }

    const rawTracks = await searchItunes(query, 10);
    const tracks: MusicResult[] = rawTracks.flatMap((item, index) => {
      const title = typeof item.trackName === "string" ? item.trackName.trim().slice(0, 140) : "";
      const artist = typeof item.artistName === "string" ? item.artistName.trim().slice(0, 140) : "";
      if (!title || !artist) return [];
      return [
        {
          id: item.trackId ? `itunes:${item.trackId}` : `track:${index}:${title}`,
          title,
          artist,
          artworkUrl: sanitizeArtwork(item.artworkUrl100),
          previewUrl: sanitizePreview(item.previewUrl),
          spotifyUrl: spotifySearchUrl(artist, title),
        },
      ];
    });

    return json({ tracks });
  } catch {
    return json({ error: "Search unavailable" }, 503);
  }
});
