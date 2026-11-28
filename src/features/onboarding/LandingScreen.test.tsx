import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Landing } from "./LandingScreen";

vi.mock("@/components/GoogleSignInButton", () => ({
  GoogleSignInButton: () => <button type="button">Pokračovať cez Google</button>,
}));

describe("Landing", () => {
  it("shows the question first and reveals sign-in after selecting an answer", () => {
    render(<Landing mobile onGoogle={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Čo by si radšej stratil/a na jeden rok?" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Pokračovať cez Google" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Možnosť cestovať" }));

    expect(screen.getByText("Antidote")).toBeVisible();
    expect(screen.getByRole("button", { name: "Možnosť cestovať" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Pokračovať cez Google" })).toBeVisible();
  });

  it("lets returning users sign in directly on mobile without choosing an answer", () => {
    render(<Landing mobile onGoogle={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Už mám účet · Prihlásiť sa" }));
    expect(screen.getByRole("button", { name: "Pokračovať cez Google" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Možnosť cestovať" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
