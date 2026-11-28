import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserProfile } from "@/lib/resonance";
import { AssetDossier } from "./AssetDossier";

const mocks = vi.hoisted(() => ({
  searchFavoriteSongs: vi.fn(),
  saveFavoriteSong: vi.fn(),
  updateSharedReflection: vi.fn(),
  fetchSharedProfileVideos: vi.fn(),
}));

vi.mock("@/lib/favorite-song", () => ({
  searchFavoriteSongs: mocks.searchFavoriteSongs,
  saveFavoriteSong: mocks.saveFavoriteSong,
}));
vi.mock("@/lib/conversations", () => ({
  updateSharedReflection: mocks.updateSharedReflection,
  fetchSharedProfileVideos: mocks.fetchSharedProfileVideos,
  REFLECTION_MAX_LENGTH: 280,
  REFLECTION_QUESTION: "Čo si ochotný/á urobiť pre ľudí, na ktorých ti záleží?",
}));
vi.mock("@/hooks/use-haptics", () => ({ useHaptic: () => () => {} }));
vi.mock("@/components/VideoRecorderModal", () => ({
  VideoRecorderModal: () => null,
}));

const baseUser: UserProfile = {
  id: "user-1",
  name: "Marek",
  age: 28,
  city: "Bratislava",
  gender: "male",
  orientation: "hetero",
  radiusKm: 35,
  topPriority: "rodina",
  sharedReflection: "Ráno behám pri Dunaji.",
  cognitiveDepth: 0.72,
  conscientiousness: 0.65,
  extraversion: 0.55,
  attachmentStyle: "Secure",
  videoUrls: ["https://example.com/v1.mp4"],
  favoriteSong: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.fetchSharedProfileVideos.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
});

describe("AssetDossier Bento Profile", () => {
  it("renders the live Discover identity card and bento tiles with clean navigation", () => {
    const onSettings = vi.fn();
    render(
      <AssetDossier
        user={baseUser}
        onUpdateUser={vi.fn()}
        onBack={vi.fn()}
        onSettings={onSettings}
        pendingRadius={null}
        onChangeRadius={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Môj profil" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Marek" })).toBeVisible();
    expect(screen.getByText(/Ráno behám pri Dunaji/)).toBeVisible();
    expect(screen.getByText("1 / 4")).toBeVisible();
    expect(screen.getByText("Do 35 km")).toBeVisible();
    expect(screen.getByText("Ženy")).toBeVisible();
    expect(screen.getByText("Bezpečný")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Nastavenia" }));
    expect(onSettings).toHaveBeenCalledOnce();
  });

  it("lets the user search and attach a favorite Spotify track from the Bento card", async () => {
    const chosen = {
      id: "spotify:58ge6dfP91o9oXMzq3XkIS",
      title: "505",
      artist: "Arctic Monkeys",
      artworkUrl: "https://is1-ssl.mzstatic.com/image/300x300bb.jpg",
      previewUrl: "https://audio-ssl.itunes.apple.com/preview.m4a",
      spotifyUrl: "https://open.spotify.com/track/58ge6dfP91o9oXMzq3XkIS",
    };
    mocks.searchFavoriteSongs.mockResolvedValue([chosen]);
    mocks.saveFavoriteSong.mockResolvedValue({
      title: chosen.title,
      artist: chosen.artist,
      artworkUrl: chosen.artworkUrl,
      previewUrl: chosen.previewUrl,
      spotifyUrl: chosen.spotifyUrl,
    });
    const onUpdateUser = vi.fn();

    render(
      <AssetDossier
        user={baseUser}
        onUpdateUser={onUpdateUser}
        onBack={vi.fn()}
        onSettings={vi.fn()}
        pendingRadius={null}
        onChangeRadius={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Vybrať skladbu" }));
    fireEvent.change(
      screen.getByLabelText("Vyhľadať skladbu alebo vložiť odkaz zo Spotify"),
      { target: { value: "Arctic Monkeys 505" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Hľadať" }));

    expect(await screen.findByText("505")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Vybrať" }));

    await waitFor(() => expect(mocks.saveFavoriteSong).toHaveBeenCalledTimes(1));
    expect(onUpdateUser).toHaveBeenCalled();
  });
});
