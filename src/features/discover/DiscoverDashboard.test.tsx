import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Dashboard } from "./DiscoverDashboard";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

afterEach(cleanup);

it("opens the radius picker for an empty nearby search and retries a failed search", async () => {
  const onRefresh = vi.fn();
  const props = {
    profile: {
      name: "Jana",
      age: 30,
      city: "Bratislava",
      gender: "female",
      orientation: "hetero",
      radiusKm: 25,
    },
    matches: [],
    pendingRadius: null,
    loading: false,
    onRefresh,
    onChangeRadius: vi.fn(),
    onSelectMatch: vi.fn(),
    openingMatch: false,
    openError: false,
  } satisfies Omit<React.ComponentProps<typeof Dashboard>, "failed">;
  const view = render(<Dashboard {...props} failed={false} />);
  expect(screen.queryByRole("button", { name: "Skúsiť znova" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Upraviť dosah" }));
  expect(await screen.findByRole("dialog", { name: "Nový dosah odporúčaní" })).toBeVisible();
  expect(onRefresh).not.toHaveBeenCalled();

  view.unmount();
  render(<Dashboard {...props} failed />);
  expect(screen.queryByRole("button", { name: "Upraviť dosah" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Skúsiť znova" }));
  expect(onRefresh).toHaveBeenCalledOnce();
});
