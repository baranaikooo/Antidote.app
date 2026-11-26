import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProfileVisibilityPreview } from "./ProfileVisibilityPreview";

const fetchSharedProfileVideos = vi.hoisted(() => vi.fn());
vi.mock("@/lib/conversations", () => ({ fetchSharedProfileVideos }));

afterEach(() => fetchSharedProfileVideos.mockReset());

const user = { id: "account", name: "Zora", age: 29, city: "Žilina" };

it("previews discovery without revealing a saved reflection or video", () => {
  const fullProfile = { ...user, sharedReflection: "Moja odpoveď.", videoUrls: ["blob:draft"] };
  const { container } = render(<ProfileVisibilityPreview user={fullProfile} />);
  fireEvent.click(screen.getByText("Takto ťa uvidia ostatní"));
  const card = screen.getByRole("article", { name: "Náhľad karty v Spojeniach" });
  expect(within(card).getByRole("heading", { name: "Zora" })).toBeInTheDocument();
  expect(within(card).getByText("29 rokov · Žilina")).toBeInTheDocument();
  expect(within(card).queryByText("Zdieľaná odpoveď")).not.toBeInTheDocument();
  expect(container.querySelector("video")).toBeNull();
  expect(fetchSharedProfileVideos).not.toHaveBeenCalled();

  expect(within(card).queryByText("Moja odpoveď.")).not.toBeInTheDocument();
});

it("uses the shared profile video list and omits any unpublished local video", async () => {
  fetchSharedProfileVideos.mockResolvedValue(["https://video.example/signed"]);
  const { container } = render(
    <ProfileVisibilityPreview user={{ ...user, videoUrls: ["blob:unpublished"] }} />,
  );
  fireEvent.click(screen.getByText("Takto ťa uvidia ostatní"));
  fireEvent.click(screen.getByRole("button", { name: "Po vzájomnom súhlase" }));

  expect(fetchSharedProfileVideos).toHaveBeenCalledExactlyOnceWith("account");
  expect(await screen.findByLabelText("Profilové video 1")).toHaveAttribute(
    "src",
    "https://video.example/signed",
  );
  expect(container.querySelector('[src="blob:unpublished"]')).toBeNull();
  expect(screen.queryByRole("article")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Karta v Spojeniach" }));
  expect(container.querySelector("video")).toBeNull();
});
