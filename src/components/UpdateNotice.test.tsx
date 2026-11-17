import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateNotice } from "./UpdateNotice";

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
