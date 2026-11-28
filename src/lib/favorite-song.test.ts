import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseFavoriteSong, saveFavoriteSong, searchFavoriteSongs } from "./favorite-song";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  eq: vi.fn(),
  update: vi.fn(),
}));

vi.mock("./supabase", () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    from: () => ({
      update: mocks.update.mockReturnValue({ eq: mocks.eq }),
    }),
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.eq.mockResolvedValue({ error: null });
});

describe("favorite-song", () => {
  it("validates Spotify track objects and rejects unsafe URLs", () => {
    expect(
      parseFavoriteSong({
        title: "505",
        artist: "Arctic Monkeys",
        artworkUrl: "https://is1-ssl.mzstatic.com/image/300x300bb.jpg",
        previewUrl: "https://audio-ssl.itunes.apple.com/preview.m4a",
        spotifyUrl: "https://open.spotify.com/track/58ge6dfP91o9oXMzq3XkIS",
      }),
    ).toEqual({
      title: "505",
      artist: "Arctic Monkeys",
      artworkUrl: "https://is1-ssl.mzstatic.com/image/300x300bb.jpg",
      previewUrl: "https://audio-ssl.itunes.apple.com/preview.m4a",
      spotifyUrl: "https://open.spotify.com/track/58ge6dfP91o9oXMzq3XkIS",
    });

    expect(
      parseFavoriteSong({
        title: "505",
        artist: "Arctic Monkeys",
        spotifyUrl: "javascript:alert(1)",
      }),
    ).toBeNull();
  });

  it("queries search-profile-music Edge Function and filters invalid entries", async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        tracks: [
          {
            id: "t1",
            title: "505",
            artist: "Arctic Monkeys",
            artworkUrl: "https://is1-ssl.mzstatic.com/image/300x300bb.jpg",
            previewUrl: null,
            spotifyUrl: "https://open.spotify.com/search/Arctic%20Monkeys%20505",
          },
          { id: "bad", title: "Bad", artist: "Evil", spotifyUrl: "http://example.com" },
        ],
      },
      error: null,
    });

    const tracks = await searchFavoriteSongs("Arctic Monkeys");
    expect(mocks.invoke).toHaveBeenCalledWith("search-profile-music", {
      body: { query: "Arctic Monkeys" },
    });
    expect(tracks).toHaveLength(1);
    expect(tracks[0]?.title).toBe("505");
  });

  it("persists normalized favorite_song for authenticated users", async () => {
    const song = {
      title: "505",
      artist: "Arctic Monkeys",
      artworkUrl: null,
      previewUrl: null,
      spotifyUrl: "https://open.spotify.com/track/58ge6dfP91o9oXMzq3XkIS",
    };
    await saveFavoriteSong("user-1", song);
    expect(mocks.update).toHaveBeenCalledWith({ favorite_song: song });
    expect(mocks.eq).toHaveBeenCalledWith("id", "user-1");
  });
});
