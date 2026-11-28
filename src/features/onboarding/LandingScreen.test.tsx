import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Landing } from "./LandingScreen";

vi.mock("@/components/GoogleSignInButton", () => ({
  GoogleSignInButton: () => <button type="button">Pokračovať cez Google</button>,
}));

describe("Landing", () => {
  it("offers sign-in directly and lets people try the introductory question", () => {
    render(<Landing mobile onGoogle={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Pokračovať cez Google" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Vyskúšať otázku" }));
    fireEvent.click(screen.getByRole("button", { name: "Možnosť cestovať" }));

    expect(screen.getByRole("button", { name: "Možnosť cestovať" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
