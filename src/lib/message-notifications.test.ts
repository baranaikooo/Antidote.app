import { afterEach, expect, it, vi } from "vitest";
import {
  isQuietTime,
  saveMessageAlertSettings,
  shouldShowMessageAlert,
} from "./message-notifications";

afterEach(() => vi.unstubAllGlobals());

it("handles overnight and same-day quiet hours, including boundaries", () => {
  const night = { enabled: true, quiet: true, start: "22:00", end: "08:00" };
  expect(isQuietTime(night, new Date(2026, 10, 26, 22))).toBe(true);
  expect(isQuietTime(night, new Date(2026, 10, 27, 7, 59))).toBe(true);
  expect(isQuietTime(night, new Date(2026, 10, 27, 8))).toBe(false);
  expect(
    isQuietTime({ ...night, start: "12:00", end: "13:00" }, new Date(2026, 10, 26, 12, 30)),
  ).toBe(true);
});

it("keeps alerts opt-in and account scoped", () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  const atNoon = new Date(2026, 10, 26, 12);
  expect(shouldShowMessageAlert("first", atNoon)).toBe(false);
  saveMessageAlertSettings("first", { enabled: true, quiet: true, start: "22:00", end: "08:00" });
  expect(shouldShowMessageAlert("first", atNoon)).toBe(true);
  expect(shouldShowMessageAlert("another", atNoon)).toBe(false);
  expect(shouldShowMessageAlert("first", new Date(2026, 10, 26, 23))).toBe(false);
});
