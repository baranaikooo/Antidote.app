import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AndroidNotificationSettings } from "./AndroidNotificationSettings";
import { saveAndroidAlertOptions } from "@/lib/android-voice-alerts";

vi.mock("@/lib/android-voice-alerts", () => {
  const defaults = { voice_replies: false, chat_messages: false };
  return {
    defaultAndroidAlertOptions: defaults,
    readAndroidAlertOptions: vi.fn().mockResolvedValue(defaults),
    saveAndroidAlertOptions: vi.fn().mockResolvedValue(true),
  };
});

beforeEach(() =>
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  ),
);
afterEach(() => vi.unstubAllGlobals());

it("offers notification types without requiring a separate setting to show names", async () => {
  render(<AndroidNotificationSettings userId="account" />);
  const messages = await screen.findByRole("switch", { name: "Nové správy" });
  expect(screen.getAllByRole("switch")).toHaveLength(2);

  fireEvent.click(messages);
  fireEvent.click(screen.getByRole("button", { name: "Uložiť upozornenia Androidu" }));
  expect(await screen.findByText("Upozornenia Androidu sú uložené.")).toBeVisible();
  expect(saveAndroidAlertOptions).toHaveBeenCalledWith(
    "account",
    { voice_replies: false, chat_messages: true },
    { voice_replies: false, chat_messages: false },
  );
});
