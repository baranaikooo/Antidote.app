import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { androidUpdatePlatform, downloadAndroidUpdater, installAndroidUpdate, installedAndroidVersion, latestAndroidVersion, type AndroidUpdateProgress } from "@/lib/android-updates";
import { AndroidUpdateProvider, AndroidUpdateSettings, UpdateNotice } from "./UpdateNotice";

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
    render(<AndroidUpdateProvider enabled><AndroidUpdateSettings /></AndroidUpdateProvider>);
    expect(await screen.findByText("Nainštalovaná verzia 1.0.3")).toBeInTheDocument();
    expect(await screen.findByText("Dostupná verzia 1.0.4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stiahnuť aktualizáciu" }));
    expect(await screen.findByText(/Povoľ inštaláciu z Antidote/)).toBeInTheDocument();
    expect(installAndroidUpdate).toHaveBeenCalledWith(latest, expect.any(Function));
  });

  it("downloads a native release directly from the notification", async () => {
    const latest = { code: 7, name: "1.0.6" };
    const fetchWeb = vi.fn();
    vi.stubGlobal("fetch", fetchWeb);
    vi.mocked(androidUpdatePlatform).mockReturnValue("native");
    vi.mocked(installedAndroidVersion).mockResolvedValue({ code: 6, name: "1.0.5" });
    vi.mocked(latestAndroidVersion).mockResolvedValue(latest);
    let report!: (progress: AndroidUpdateProgress) => void;
    let openInstaller!: () => void;
    vi.mocked(installAndroidUpdate).mockImplementation((_version, onProgress) => {
      report = onProgress;
      return new Promise((resolve) => { openInstaller = () => resolve({ state: "installer" }); });
    });
    render(<AndroidUpdateProvider enabled><UpdateNotice /></AndroidUpdateProvider>);
    expect(await screen.findByText("Android verzia 1.0.6 je dostupná.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Obnoviť" })).not.toBeInTheDocument();
    expect(fetchWeb).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Stiahnuť" }));
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
    act(() => report({ stage: "downloading", received: 400, total: 1000 }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
    act(() => report({ stage: "verifying" }));
    expect(screen.getByRole("progressbar", { name: "Overujem APK…" })).toBeInTheDocument();
    act(() => openInstaller());
    expect(await screen.findByText("Potvrď aktualizáciu v okne Androidu.")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(installAndroidUpdate).toHaveBeenCalledWith(latest, expect.any(Function));
    vi.unstubAllGlobals();
  });

  it("checks for a newer APK immediately after reconnecting", async () => {
    const installed = { code: 8, name: "1.0.7" };
    vi.mocked(androidUpdatePlatform).mockReturnValue("native");
    vi.mocked(installedAndroidVersion).mockResolvedValue(installed);
    vi.mocked(latestAndroidVersion).mockReset().mockResolvedValueOnce(installed)
      .mockResolvedValue({ code: 9, name: "1.0.8" });

    render(<AndroidUpdateProvider enabled><UpdateNotice /></AndroidUpdateProvider>);
    await waitFor(() => expect(latestAndroidVersion).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "Stiahnuť" })).not.toBeInTheDocument();

    fireEvent(window, new Event("online"));
    expect(await screen.findByText("Android verzia 1.0.8 je dostupná.")).toBeInTheDocument();
  });

  it("offers a direct APK download to older Android builds", async () => {
    vi.mocked(androidUpdatePlatform).mockReturnValue("legacy");
    vi.mocked(latestAndroidVersion).mockResolvedValue({ code: 7, name: "1.0.6" });
    vi.mocked(downloadAndroidUpdater).mockResolvedValue(undefined);
    render(<AndroidUpdateProvider enabled><UpdateNotice /></AndroidUpdateProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Stiahnuť" }));
    expect(await screen.findByText(/Po stiahnutí otvor APK/)).toBeInTheDocument();
    expect(downloadAndroidUpdater).toHaveBeenCalled();
  });

});
