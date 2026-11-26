import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ValueBankroll } from "./ValueBankroll";

const haptic = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-haptics", () => ({ useHaptic: () => haptic }));

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  haptic.mockClear();
});

describe("ValueBankroll", () => {
  it("limits the allocation, lets the user revise it, and submits the reviewed priorities once", () => {
    const onDone = vi.fn();
    const onSliderChange = vi.fn();
    render(<ValueBankroll onDone={onDone} onSliderChange={onSliderChange} />);

    const addFamily = screen.getByRole("button", { name: "Pridať žetón: Rodina" });
    const subtractFamily = screen.getByRole("button", { name: "Odobrať žetón: Rodina" });
    const addCareer = screen.getByRole("button", { name: "Pridať žetón: Kariéra" });
    const review = screen.getByRole("button", { name: "Pokračovať" });

    expect(screen.getByRole("status")).toHaveTextContent("10 z 10");
    expect(review).toBeDisabled();
    expect(subtractFamily).toBeDisabled();
    for (let i = 0; i < 5; i++) fireEvent.click(addFamily);
    expect(addFamily).toBeDisabled();
    for (let i = 0; i < 5; i++) fireEvent.click(addCareer);
    expect(screen.getByRole("status")).toHaveTextContent("0 z 10");
    expect(review).toBeEnabled();
    expect(haptic).toHaveBeenCalledTimes(10);
    expect(onSliderChange).toHaveBeenLastCalledWith(70 / 220, 0.55);

    fireEvent.click(review);
    expect(screen.getByRole("heading", { name: "Tvoje priority" })).toHaveFocus();
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Upraviť rozdelenie" }));
    fireEvent.click(screen.getByRole("button", { name: "Odobrať žetón: Rodina" }));
    expect(screen.getByRole("status")).toHaveTextContent("1 z 10");
    expect(screen.getByRole("button", { name: "Pokračovať" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Pridať žetón: Stabilita" }));
    fireEvent.click(screen.getByRole("button", { name: "Pokračovať" }));
    fireEvent.click(screen.getByRole("button", { name: "Pokračovať na ďalšiu otázku" }));

    expect(onDone).toHaveBeenCalledExactlyOnceWith(80 / 220, {
      rodina: 40,
      kariera: 50,
      stabilita: 10,
      kreativita: 0,
      sloboda: 0,
    });
    expect(haptic).toHaveBeenLastCalledWith("success");
  });

  it("keeps the allocation responsive when reduced motion is requested", () => {
    const animate = vi.fn();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
    try {
      render(<ValueBankroll onDone={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "Pridať žetón: Rodina" }), { detail: 1 });
      expect(screen.getByRole("status")).toHaveTextContent("9 z 10");
      expect(animate).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, "animate");
    }
  });

  it("restores a partial allocation and its review for the same account", () => {
    const onDone = vi.fn();
    const props = { userId: "first-account", onDone };
    const firstVisit = render(<ValueBankroll {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Pridať žetón: Rodina" }));
    firstVisit.unmount();

    const secondVisit = render(<ValueBankroll {...props} />);
    expect(screen.getByRole("status")).toHaveTextContent("9 z 10");
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByRole("button", { name: "Pridať žetón: Rodina" }));
    }
    for (let i = 0; i < 5; i++) {
      fireEvent.click(screen.getByRole("button", { name: "Pridať žetón: Kariéra" }));
    }
    fireEvent.click(screen.getByRole("button", { name: "Pokračovať" }));
    secondVisit.unmount();

    const thirdVisit = render(<ValueBankroll {...props} />);
    expect(screen.getByRole("heading", { name: "Tvoje priority" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pokračovať na ďalšiu otázku" }));
    expect(onDone).toHaveBeenCalledExactlyOnceWith(70 / 220, {
      rodina: 50,
      kariera: 50,
      stabilita: 0,
      kreativita: 0,
      sloboda: 0,
    });
    thirdVisit.unmount();
    render(<ValueBankroll {...props} />);
    expect(screen.getByRole("status")).toHaveTextContent("10 z 10");
  });

  it("keeps account drafts isolated and resets a partial draft across visits", () => {
    const onDone = vi.fn();
    const firstVisit = render(<ValueBankroll userId="first-account" onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "Pridať žetón: Rodina" }));

    firstVisit.rerender(<ValueBankroll userId="second-account" onDone={onDone} />);
    expect(screen.getByRole("status")).toHaveTextContent("10 z 10");
    firstVisit.rerender(<ValueBankroll userId={null} onDone={onDone} />);
    expect(screen.getByRole("status")).toHaveTextContent("10 z 10");
    firstVisit.rerender(<ValueBankroll userId="first-account" onDone={onDone} />);
    expect(screen.getByRole("status")).toHaveTextContent("9 z 10");

    fireEvent.click(screen.getByRole("button", { name: "Začať odznova" }));
    expect(screen.getByRole("heading", { name: "Na čom ti záleží?" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("10 z 10");
    firstVisit.unmount();
    render(<ValueBankroll userId="first-account" onDone={onDone} />);
    expect(screen.getByRole("status")).toHaveTextContent("10 z 10");
  });

  it("recovers from an invalid saved token total", () => {
    localStorage.setItem(
      "reson:priority-draft:first-account",
      JSON.stringify({
        reviewing: true,
        tokens: { rodina: 5, kariera: 5, stabilita: 1, kreativita: 0, sloboda: 0 },
      }),
    );
    render(<ValueBankroll userId="first-account" onDone={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("10 z 10");
  });
});
