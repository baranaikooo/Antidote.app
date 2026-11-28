import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AndroidNotificationSettings } from "./AndroidNotificationSettings";
import { saveAndroidAlertOptions } from "@/lib/android-voice-alerts";

vi.mock("@/lib/android-voice-alerts", () => {
  const defaults = { voice_replies: false, chat_messages: false, show_sender: false };
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

it("keeps sender names private until explicitly enabled and saves message alerts separately", async () => {
  render(<AndroidNotificationSettings userId="account" />);
  const messages = await screen.findByRole("switch", { name: "Nové správy" });
  const name = screen.getByRole("switch", { name: "Zobraziť meno odosielateľa" });
  expect(name).toBeDisabled();

  fireEvent.click(messages);
  expect(name).not.toBeChecked();
  fireEvent.click(name);
  fireEvent.click(screen.getByRole("button", { name: "Uložiť upozornenia Androidu" }));
  expect(await screen.findByText("Upozornenia Androidu sú uložené.")).toBeVisible();
  expect(saveAndroidAlertOptions).toHaveBeenCalledWith(
    "account",
    { voice_replies: false, chat_messages: true, show_sender: true },
    { voice_replies: false, chat_messages: false, show_sender: false },
  );

  fireEvent.click(messages);
  expect(name).not.toBeChecked();
  expect(name).toBeDisabled();
});
