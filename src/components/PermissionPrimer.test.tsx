import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PermissionPrimer } from "./PermissionPrimer";

vi.mock("@/hooks/use-haptics", () => ({ useHaptic: () => () => {} }));

afterEach(() => {
  cleanup();
});

describe("PermissionPrimer", () => {
  it("explains why notifications matter with in-app notification previews", () => {
    const onEnable = vi.fn();
    const onDismiss = vi.fn();
    render(
      <PermissionPrimer kind="notifications" onEnable={onEnable} onDismiss={onDismiss} />,
    );

    expect(
      screen.getByRole("heading", { name: "Jeden klik a neujde ti odpoveď" }),
    ).toBeVisible();
    expect(
      screen.getByText(/keď ti niekto nahrá hlasovku alebo pošle novú správu/i),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Zapnúť upozornenia" }));
    expect(onEnable).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Možno nabudúce" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("explains why location matters and disables actions while awaiting confirmation", () => {
    const onEnable = vi.fn();
    const onDismiss = vi.fn();
    render(
      <PermissionPrimer kind="location" busy onEnable={onEnable} onDismiss={onDismiss} />,
    );

    expect(
      screen.getByRole("heading", { name: "Spojenia priamo v tvojom okolí" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Čakám na potvrdenie…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Možno nabudúce" })).toBeDisabled();
  });
});
