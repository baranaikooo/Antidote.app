import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { androidUpdatePlatform, installAndroidUpdate, installedAndroidVersion, latestAndroidVersion } from "@/lib/android-updates";
import { AndroidUpdateSettings, UpdateNotice } from "./UpdateNotice";

describe("UpdateNotice", () => {
  beforeEach(() => {
    const stored = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    });
    vi.stubGlobal("__ANTIDOTE_BUILD_ID__", "current-build");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("offers a refresh only when the server has a newer build", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: "new-build" }),
    }));
    render(<UpdateNotice />);
    expect(await screen.findByText("K dispozícii je nová verzia.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Obnoviť" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Zavrieť oznámenie" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("acknowledges a newly loaded build once without offering another refresh", async () => {
    localStorage.setItem("antidote:seen-build", "old-build");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: "current-build" }),
    }));
    render(<UpdateNotice />);
    expect(screen.getByText("Aplikácia bola aktualizovaná.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Obnoviť" })).not.toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem("antidote:seen-build")).toBe("current-build"));
  });
});

vi.mock("@/lib/android-updates", () => ({
  androidUpdatePlatform: vi.fn(() => null),
  downloadAndroidUpdater: vi.fn(),
  installedAndroidVersion: vi.fn(),
  installAndroidUpdate: vi.fn(),
  latestAndroidVersion: vi.fn(),
}));

describe("Android app updates", () => {
  afterEach(() => {
    cleanup();
    vi.mocked(androidUpdatePlatform).mockReturnValue(null);
  });

  it("offers a newer APK and explains the system permission step", async () => {
    const latest = { code: 5, name: "1.0.4" };
    vi.mocked(androidUpdatePlatform).mockReturnValue("native");
    vi.mocked(installedAndroidVersion).mockResolvedValue({ code: 4, name: "1.0.3" });
    vi.mocked(latestAndroidVersion).mockResolvedValue(latest);
    vi.mocked(installAndroidUpdate).mockResolvedValue({ state: "permission" });
    render(<AndroidUpdateSettings />);
    expect(await screen.findByText("Nainštalovaná verzia 1.0.3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Skontrolovať aktualizácie" }));
    expect(await screen.findByText("Dostupná verzia 1.0.4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aktualizovať" }));
    expect(await screen.findByText(/Povoľ inštaláciu z Antidote/)).toBeInTheDocument();
    expect(installAndroidUpdate).toHaveBeenCalledWith(latest);
  });
});
