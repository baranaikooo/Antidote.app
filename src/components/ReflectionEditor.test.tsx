import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReflectionEditor } from "./ReflectionEditor";

afterEach(cleanup);

it("keeps an unsent reflection private when onboarding is skipped", async () => {
  const onSave = vi.fn();
  const onSkip = vi.fn().mockResolvedValue(undefined);
  render(<ReflectionEditor onSave={onSave} onSkip={onSkip} />);

  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Zatiaľ iba pre mňa." } });
  fireEvent.click(screen.getByRole("button", { name: "Preskočiť" }));

  await waitFor(() => expect(onSkip).toHaveBeenCalledOnce());
  expect(onSave).not.toHaveBeenCalled();
});

it("preserves a reflection on a failed save and allows withdrawal after sharing", async () => {
  const onSave = vi.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValue(undefined);
  render(<ReflectionEditor onSave={onSave} />);
  const draft = screen.getByRole("textbox");
  const submit = screen.getByRole("button", { name: "Zdieľať odpoveď" });

  fireEvent.change(draft, { target: { value: "  Úspech mi neurčuje hodnotu.  " } });
  fireEvent.click(submit);
  expect(await screen.findByRole("alert")).toHaveTextContent("nepodarilo");
  expect(draft).toHaveValue("  Úspech mi neurčuje hodnotu.  ");

  fireEvent.click(submit);
  expect(await screen.findByRole("status")).toHaveTextContent("Odpoveď je zdieľaná");
  expect(onSave).toHaveBeenLastCalledWith("Úspech mi neurčuje hodnotu.");
  fireEvent.click(screen.getByRole("button", { name: "Stiahnuť odpoveď" }));
  await waitFor(() => expect(draft).toHaveValue(""));
  expect(onSave).toHaveBeenLastCalledWith(null);
});
