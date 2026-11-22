import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ValueBankroll } from "./ValueBankroll";

const haptic = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-haptics", () => ({ useHaptic: () => haptic }));

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
});
