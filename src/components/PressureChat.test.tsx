import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PressureChat } from "./PressureChat";

vi.mock("@/hooks/use-haptics", () => {
  const haptic = () => {};
  return { useHaptic: () => haptic };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("offers a different situation after timeout without recording a response", () => {
  vi.stubGlobal("localStorage", { getItem: () => null });
  vi.useFakeTimers();
  const onDone = vi.fn();
  render(<PressureChat onDone={onDone} isOnboarding />);

  fireEvent.click(screen.getByRole("button", { name: "Zobraziť správu" }));
  act(() => vi.advanceTimersByTime(1800));
  const before = screen.getAllByRole("button").map((button) => button.textContent);
  act(() => vi.advanceTimersByTime(14_100));

  expect(onDone).not.toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent("Čas vypršal");

  fireEvent.click(screen.getByRole("button", { name: "Zobraziť inú situáciu" }));
  act(() => vi.advanceTimersByTime(1800));
  const answers = screen.getAllByRole("button");
  expect(answers.map((button) => button.textContent)).not.toEqual(before);
  fireEvent.click(answers[0]);
  expect(onDone).toHaveBeenCalledTimes(1);
});
