import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VideoRecorderModal } from "./VideoRecorderModal";

const mocks = vi.hoisted(() => ({
  openCamera: vi.fn(),
  attachStreamToVideo: vi.fn(),
  recordStreamForMs: vi.fn(),
  stopStream: vi.fn(),
}));

vi.mock("@/lib/media", () => ({
  openCamera: mocks.openCamera,
  attachStreamToVideo: mocks.attachStreamToVideo,
  recordStreamForMs: mocks.recordStreamForMs,
  stopStream: mocks.stopStream,
  cameraErrorMessage: () => "Chyba kamery",
}));

vi.mock("@/hooks/use-haptics", () => ({ useHaptic: () => () => {} }));

const mockStream = {
  getVideoTracks: () => [{ stop: vi.fn() }],
  getTracks: () => [{ stop: vi.fn() }],
} as unknown as MediaStream;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.openCamera.mockResolvedValue(mockStream);
  mocks.attachStreamToVideo.mockResolvedValue(undefined);
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL() {
        return "blob:captured-moment";
      }
      static revokeObjectURL() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps one camera stream across preview -> recording without jumping and saves the reviewed clip", async () => {
  const blob = new Blob(["video-bytes"], { type: "video/webm" });
  mocks.recordStreamForMs.mockResolvedValueOnce({ blob, mimeType: "video/webm" });
  const onCapture = vi.fn().mockResolvedValueOnce(undefined);
  const onClose = vi.fn();

  render(<VideoRecorderModal slotIndex={0} onCapture={onCapture} onClose={onClose} />);

  const recordBtn = await screen.findByRole("button", { name: "Nahrať moment (3 s)" });
  await waitFor(() => expect(recordBtn).toBeEnabled());
  expect(mocks.openCamera).toHaveBeenCalledTimes(1);

  fireEvent.click(recordBtn);

  // Moving to review confirms recordStreamForMs ran on the original uninterrupted stream.
  const useBtn = await screen.findByRole("button", { name: "Použiť video" });
  expect(mocks.openCamera).toHaveBeenCalledTimes(1);
  expect(mocks.recordStreamForMs).toHaveBeenCalledWith(mockStream, 3000, "video");

  fireEvent.click(useBtn);
  await waitFor(() => expect(onCapture).toHaveBeenCalledExactlyOnceWith(0, blob));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
});

it("preserves the recorded clip in review and surfaces error if saving fails", async () => {
  const blob = new Blob(["video-bytes"], { type: "video/webm" });
  mocks.recordStreamForMs.mockResolvedValueOnce({ blob, mimeType: "video/webm" });
  const onCapture = vi
    .fn()
    .mockRejectedValueOnce(new Error("Upload timeout"))
    .mockResolvedValueOnce(undefined);
  const onClose = vi.fn();

  render(<VideoRecorderModal slotIndex={1} onCapture={onCapture} onClose={onClose} />);

  const recordBtn = await screen.findByRole("button", { name: "Nahrať moment (3 s)" });
  await waitFor(() => expect(recordBtn).toBeEnabled());
  fireEvent.click(recordBtn);

  const useBtn = await screen.findByRole("button", { name: "Použiť video" });
  fireEvent.click(useBtn);

  expect(await screen.findByRole("alert")).toHaveTextContent("Upload timeout");
  expect(onClose).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Použiť video" }));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
});
