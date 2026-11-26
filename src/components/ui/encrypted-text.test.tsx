import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EncryptedText } from "./encrypted-text";

afterEach(() => vi.unstubAllGlobals());

it("allows the display mode to change while the text is mounted", () => {
  const getItem = vi.fn().mockReturnValue("INSTANT_RAW");
  vi.stubGlobal("localStorage", { getItem });
  const { rerender } = render(<EncryptedText text="Antidote" />);
  expect(screen.getByText("Antidote")).toBeInTheDocument();

  getItem.mockReturnValue("TYPEWRITER_ANIMATED");
  rerender(<EncryptedText text="Antidote" />);

  getItem.mockReturnValue("INSTANT_RAW");
  rerender(<EncryptedText text="Antidote" />);
  expect(screen.getByText("Antidote")).toBeInTheDocument();
});
