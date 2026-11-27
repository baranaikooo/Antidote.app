import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pickAudioMime, pickVideoMime, canPlayMime } from "./media";

describe("Media Helpers", () => {
  beforeEach(() => {
    // Mock navigator user agent
    Object.defineProperty(window, "navigator", {
      value: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      writable: true,
    });

    // Mock MediaRecorder
    global.MediaRecorder = {
      isTypeSupported: vi.fn().mockImplementation((mime) => {
        return mime.includes("webm") || mime.includes("mp4");
      }),
    } as unknown as typeof MediaRecorder;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should pick supported audio mime", () => {
    const mime = pickAudioMime();
    expect(mime).not.toBe("");
    expect(mime).toContain("audio/");
  });

  it("should pick supported video mime without audio codec when audio is absent", () => {
    const mime = pickVideoMime(false);
    expect(mime).not.toBe("");
    expect(mime).toContain("video/");
    expect(mime).not.toContain("opus");
    expect(mime).not.toContain("mp4a");
  });

  it("should pick supported video mime with audio codec when audio is present", () => {
    const mime = pickVideoMime(true);
    expect(mime).not.toBe("");
    expect(mime).toContain("video/");
  });

  it("canPlayMime should return false if document is undefined or mime is empty", () => {
    expect(canPlayMime("")).toBe(false);
  });
});
