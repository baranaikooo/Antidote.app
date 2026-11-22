import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Conversation } from "@/lib/resonance";
import { MessageThread } from "./MessageThread";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  choice: vi.fn(),
  videos: vi.fn(),
  messages: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@/lib/conversations", () => ({
  readConversationStatus: mocks.read,
  setConversationChoice: mocks.choice,
  fetchSharedProfileVideos: mocks.videos,
  REPORT_REASONS: { harassment: "Obťažovanie" },
}));
vi.mock("@/lib/supabase", () => ({
  fetchChatMessages: mocks.messages,
  saveChatMessage: mocks.send,
  supabase: {
    channel: () => {
      const channel = { on: () => channel, subscribe: () => channel };
      return channel;
    },
    removeChannel: vi.fn(),
  },
}));
vi.mock("@/hooks/use-haptics", () => ({ useHaptic: () => () => {} }));

const reply = "Záleží mi na čase pre ľudí.";
const open = { status: "active", is_unlocked: false, consent_pending: false };

function Thread({ onClose = () => {} }: { onClose?: () => void }) {
  const [conversation, setConversation] = useState<Conversation>({
    id: "match",
    matchId: "partner",
    messages: [],
    unread: false,
    createdAt: 1,
  });

  return (
    <MessageThread
      conversation={conversation}
      match={{
        id: "partner",
        name: "Jana",
        age: 30,
        city: "Bratislava",
        top_priority: "rodina",
        shared_reflection: reply,
      }}
      userId="me"
      prompt={reply}
      onUpdate={setConversation}
      onBack={() => {}}
      onVoice={() => {}}
      onClose={onClose}
    />
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.read.mockResolvedValue(open);
  mocks.messages.mockResolvedValue([]);
});

afterEach(cleanup);

it("retries a first reply with the same id, preserving the draft and real reply context", async () => {
  mocks.send.mockRejectedValueOnce(new Error("Offline")).mockResolvedValue({
    id: "saved",
    created_at: "2026-11-01T10:00:00Z",
    reply_context: reply,
  });
  render(<Thread />);
  const textbox = await screen.findByRole("textbox", { name: "Správa" });
  fireEvent.change(textbox, { target: { value: "Ako si na to prišla?" } });
  fireEvent.click(screen.getByRole("button", { name: "Odoslať správu" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("nepodarilo odoslať");
  expect(textbox).toHaveValue("Ako si na to prišla?");

  fireEvent.click(screen.getByRole("button", { name: "Odoslať správu" }));
  expect(await screen.findByText("Ako si na to prišla?")).toBeInTheDocument();
  const [, , , , firstId, context] = mocks.send.mock.calls[0];
  expect(context).toBe(reply);
  expect(mocks.send.mock.calls[1][4]).toBe(firstId);
  expect(mocks.videos).not.toHaveBeenCalled();
});

it("waits for the server's mutual consent before requesting video and closes without sending a message", async () => {
  mocks.messages.mockResolvedValue([{ id: "existing", from: "me", text: "Ahoj", ts: 1 }]);
  const onClose = vi.fn();
  render(<Thread onClose={onClose} />);
  const share = await screen.findByText("Súhlasím so zdieľaním videí");
  mocks.read.mockResolvedValue({ ...open, consent_pending: true });
  mocks.choice.mockResolvedValueOnce({ ...open, consent_pending: true });
  fireEvent.click(share);
  expect(await screen.findByText(/Súhlas uložený/)).toBeInTheDocument();
  expect(mocks.videos).not.toHaveBeenCalled();

  mocks.read.mockResolvedValue({ ...open, is_unlocked: true });
  fireEvent(window, new Event("online"));
  const show = await screen.findByText("Zobraziť videá");
  expect(mocks.videos).not.toHaveBeenCalled();
  mocks.videos.mockResolvedValue([]);
  fireEvent.click(show);
  expect(await screen.findByText("Profil nemá dostupné videá.")).toBeInTheDocument();
  expect(mocks.videos).toHaveBeenCalledWith("partner");

  mocks.choice.mockResolvedValueOnce({ ...open, status: "deleted" });
  fireEvent.click(screen.getByText("Ukončiť rozhovor", { selector: "button" }));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  expect(mocks.choice).toHaveBeenLastCalledWith("match", "close");
  expect(mocks.send).not.toHaveBeenCalled();
});
