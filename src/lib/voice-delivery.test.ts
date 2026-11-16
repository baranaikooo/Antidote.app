import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const upload = vi.fn();
  const single = vi.fn();
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const insertQuery = { select: vi.fn(), single };
  insertQuery.select.mockReturnValue(insertQuery);
  const insert = vi.fn().mockReturnValue(insertQuery);
  return { maybeSingle, upload, single, insert, query };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({ select: mocks.query.select, insert: mocks.insert }),
    storage: { from: () => ({ upload: mocks.upload }) },
  }),
}));

import { uploadVoiceMessageBlob } from "./supabase";

describe("voice message delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.upload.mockResolvedValue({ data: { path: "matches/match/message.wav" }, error: null });
    mocks.single.mockResolvedValue({ data: { id: "message" }, error: null });
  });

  it("stores a stable message id and returns the saved message", async () => {
    const blob = new Blob(["voice"], { type: "audio/webm" });
    await expect(uploadVoiceMessageBlob("match", "sender", blob, 12, "message"))
      .resolves.toEqual({ id: "message" });
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      id: "message", match_id: "match", sender_id: "sender", duration: 12,
    }));
  });

  it("returns an already saved message without uploading it again", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: { id: "message" }, error: null });
    await expect(uploadVoiceMessageBlob("match", "sender", new Blob(), 12, "message"))
      .resolves.toEqual({ id: "message" });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("recovers when upload succeeded but its response was lost", async () => {
    mocks.upload.mockResolvedValueOnce({ data: null, error: { statusCode: "409" } });
    await uploadVoiceMessageBlob("match", "sender", new Blob(), 12, "message");
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      id: "message", media_url: "matches/match/message.wav",
    }));
  });

  it("confirms an insert that succeeded despite an error response", async () => {
    mocks.single.mockResolvedValueOnce({ data: null, error: new Error("connection lost") });
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: "message" }, error: null });
    await expect(uploadVoiceMessageBlob("match", "sender", new Blob(), 12, "message"))
      .resolves.toEqual({ id: "message" });
  });
});
