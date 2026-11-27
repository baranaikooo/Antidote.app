import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Conversation } from "@/lib/resonance";
import { MessageThread } from "./MessageThread";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  question: vi.fn(),
  gifSearch: vi.fn(),
  choice: vi.fn(),
  videos: vi.fn(),
  messages: vi.fn(),
  send: vi.fn(),
  markRead: vi.fn(),
  readFeedback: vi.fn(),
  saveFeedback: vi.fn(),
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
    rpc: (name: string, args: unknown) => mocks.question(name, args),
    functions: { invoke: mocks.gifSearch },
    channel: () => {
      const channel = { on: () => channel, subscribe: () => channel };
      return channel;
    },
    removeChannel: vi.fn(),
  },
}));
vi.mock("@/lib/conversation-inbox", () => ({
  markConversationRead: mocks.markRead,
  hasConversationPilotResponse: mocks.readFeedback,
  submitConversationPilotResponse: mocks.saveFeedback,
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
  mocks.question.mockResolvedValue({ data: null, error: null });
  mocks.messages.mockResolvedValue([]);
  mocks.markRead.mockResolvedValue(undefined);
  mocks.readFeedback.mockResolvedValue(false);
  mocks.saveFeedback.mockResolvedValue(undefined);
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
  fireEvent.click(screen.getByRole("button", { name: "Nadviazať" }));
  expect(textbox).toHaveFocus();
  expect(textbox).toHaveAccessibleDescription(/Reaguješ na zdieľanú odpoveď/);
  fireEvent.change(textbox, { target: { value: "Ako si na to prišla?" } });
  fireEvent.click(screen.getByRole("button", { name: "Odoslať správu" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("nepodarilo odoslať");
  expect(textbox).toHaveValue("Ako si na to prišla?");

  fireEvent.click(screen.getByRole("button", { name: "Skúsiť znova" }));
  expect(await screen.findByText("Ako si na to prišla?")).toBeInTheDocument();
  const [, , , , firstId, context] = mocks.send.mock.calls[0];
  expect(context).toBe(reply);
  expect(mocks.send.mock.calls[1][4]).toBe(firstId);
  expect(mocks.videos).not.toHaveBeenCalled();
});

it("can remove context from a failed opening while preserving the text and retry id", async () => {
  mocks.send.mockRejectedValueOnce(new Error("Offline")).mockResolvedValue({
    id: "saved",
    created_at: "2026-11-01T10:00:00Z",
  });
  render(<Thread />);
  const textbox = await screen.findByRole("textbox", { name: "Správa" });
  fireEvent.click(screen.getByRole("button", { name: "Nadviazať" }));
  fireEvent.change(textbox, { target: { value: "Ahoj" } });
  fireEvent.click(screen.getByRole("button", { name: "Odoslať správu" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("nepodarilo odoslať");
  fireEvent.click(screen.getByRole("button", { name: "Odstrániť zdieľanú odpoveď zo správy" }));

  expect(textbox).toHaveFocus();
  expect(textbox).toHaveValue("Ahoj");
  expect(textbox).not.toHaveAccessibleDescription();
  fireEvent.click(screen.getByRole("button", { name: "Odoslať správu" }));
  await screen.findByText("Ahoj");
  expect(mocks.send.mock.calls[0][5]).toBe(reply);
  expect(mocks.send.mock.calls[1][4]).toBe(mocks.send.mock.calls[0][4]);
  expect(mocks.send.mock.calls[1][5]).toBeUndefined();
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

it("marks the last incoming message as read and offers voluntary feedback only once both have replied", async () => {
  mocks.messages.mockResolvedValue([
    { id: "sent", from: "me", text: "Ahoj", ts: 1 },
    { id: "reply", from: "them", text: "Rada ťa počujem.", ts: 2 },
  ]);
  render(<Thread />);
  const yes = await screen.findByRole("button", { name: "Áno" });
  await waitFor(() => expect(mocks.markRead).toHaveBeenCalledExactlyOnceWith("match", "reply"));
  fireEvent.click(yes);
  await waitFor(() => expect(mocks.saveFeedback).toHaveBeenCalledExactlyOnceWith("match", true));
  await waitFor(() => expect(yes).not.toBeInTheDocument());
});

it("keeps the shared question after a normal message and attaches a revealed answer to a reply", async () => {
  mocks.messages.mockResolvedValue([{ id: "existing", from: "me", text: "Ahoj", ts: 1 }]);
  mocks.question.mockResolvedValue({
    data: {
      question: "Ako vyzerá tvoj dobrý víkend?",
      own_answer: "Ráno vonku.",
      partner_answer: null,
      skipped: false,
    },
    error: null,
  });
  render(<Thread />);
  expect(await screen.findByText("Ako vyzerá tvoj dobrý víkend?")).toBeInTheDocument();
  expect(screen.getByText("Ráno vonku.")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Správa" })).toBeEnabled();

  mocks.question.mockResolvedValue({
    data: {
      question: "Ako vyzerá tvoj dobrý víkend?",
      own_answer: "Ráno vonku.",
      partner_answer: "Káva s priateľmi.",
      skipped: false,
    },
    error: null,
  });
  fireEvent(window, new Event("online"));
  const followUp = await screen.findByRole("button", { name: "Nadviazať na odpoveď" });
  fireEvent.click(followUp);
  expect(screen.getByRole("textbox", { name: "Správa" })).toHaveFocus();
  fireEvent.change(screen.getByRole("textbox", { name: "Správa" }), {
    target: { value: "Kam chodíte?" },
  });
  mocks.send.mockResolvedValue({
    id: "next",
    created_at: "2026-11-01T10:00:00Z",
    reply_context: "Káva s priateľmi.",
  });
  fireEvent.click(screen.getByRole("button", { name: "Odoslať správu" }));
  await screen.findByText("Kam chodíte?");
  expect(mocks.send.mock.calls[0][5]).toBe("Káva s priateľmi.");
});

it("submits an optional answer and can withdraw it before the mutual reveal", async () => {
  const pending = {
    question: "Ako vyzerá tvoj dobrý víkend?",
    own_answer: null,
    partner_answer: null,
    skipped: false,
  };
  mocks.question.mockResolvedValue({ data: pending, error: null });
  render(<Thread />);
  fireEvent.click(await screen.findByRole("button", { name: "Odpovedať" }));
  const answer = screen.getByRole("textbox", { name: "Tvoja odpoveď" });
  expect(answer).toHaveFocus();
  expect(answer).toHaveAccessibleDescription("Odpovede sa zobrazia, keď odpoviete obaja.");
  expect(screen.getByRole("textbox", { name: "Správa" })).toBeEnabled();
  fireEvent.change(answer, { target: { value: " Večer s kamarátmi. " } });

  mocks.question.mockResolvedValue({
    data: { ...pending, own_answer: "Večer s kamarátmi." },
    error: null,
  });
  fireEvent.click(screen.getByRole("button", { name: "Odoslať odpoveď" }));
  await screen.findByText(/Odpoveď je uložená/);
  expect(screen.getByText("Večer s kamarátmi.", { selector: "dd" })).toBeInTheDocument();
  expect(mocks.question).toHaveBeenCalledWith("respond_shared_conversation_question", {
    p_match_id: "match",
    p_answer: "Večer s kamarátmi.",
  });
  expect(mocks.send).not.toHaveBeenCalled();

  mocks.question.mockResolvedValue({ data: { ...pending, skipped: true }, error: null });
  fireEvent.click(screen.getByRole("button", { name: "Stiahnuť odpoveď" }));
  await waitFor(() => expect(screen.queryByText(pending.question)).not.toBeInTheDocument());
  expect(mocks.question).toHaveBeenCalledWith("respond_shared_conversation_question", {
    p_match_id: "match",
    p_answer: null,
  });
});

it("only offers approved GIPHY entries and sends a canonical URL from a fresh chat", async () => {
  render(<Thread />);
  fireEvent.click(await screen.findByRole("button", { name: "GIFy" }));
  expect(screen.getAllByRole("button", { name: /^Odoslať GIF/ })).toHaveLength(24);
  expect(document.querySelector('input[type="file"]')).toBeNull();
  expect(screen.queryByRole("button", { name: "Mémy" })).not.toBeInTheDocument();

  mocks.send.mockResolvedValue({ id: "reaction", created_at: "2026-11-27T10:00:00Z" });
  fireEvent.click(screen.getByRole("button", { name: "Odoslať GIF – Mávanie" }));
  expect(await screen.findByRole("img", { name: "Mávanie" })).toHaveAttribute(
    "src",
    "https://media.giphy.com/media/Wj116ZszUZEwRIoz0j/200w.gif",
  );
  expect(mocks.send.mock.calls[0].slice(0, 4)).toEqual([
    "match",
    "me",
    "",
    "https://media.giphy.com/media/Wj116ZszUZEwRIoz0j/200w.gif",
  ]);
});

it("searches the provider, excludes foreign media and sends a returned GIF", async () => {
  const url = "https://static.klipy.com/ii/sample/hello.gif";
  mocks.gifSearch.mockResolvedValue({
    data: {
      source: "klipy",
      gifs: [
        { url, previewUrl: url, label: "Mačka z katalógu" },
        { url: "https://example.test/no.gif", previewUrl: url, label: "Cudzia príloha" },
      ],
    },
    error: null,
  });
  mocks.send.mockResolvedValue({ id: "gif", created_at: "2026-11-27T10:00:00Z" });
  render(<Thread />);
  fireEvent.click(await screen.findByRole("button", { name: "GIFy" }));
  fireEvent.change(screen.getByRole("searchbox", { name: "Hľadať GIFy" }), {
    target: { value: "mačka" },
  });
  const item = await screen.findByRole("button", { name: "Odoslať GIF – Mačka z katalógu" });
  expect(mocks.gifSearch).toHaveBeenCalledWith("search-chat-gifs", { body: { query: "mačka" } });
  expect(
    screen.queryByRole("button", { name: "Odoslať GIF – Cudzia príloha" }),
  ).not.toBeInTheDocument();
  fireEvent.click(item);
  expect(await screen.findByRole("img", { name: "Mačka z katalógu" })).toHaveAttribute("src", url);
  expect(mocks.send.mock.calls[0][3]).toBe(url);
});

it("searches the featured catalog without accents if the provider is not configured", async () => {
  mocks.gifSearch.mockResolvedValue({ data: { source: "featured" }, error: null });
  render(<Thread />);
  fireEvent.click(await screen.findByRole("button", { name: "GIFy" }));
  fireEvent.change(screen.getByRole("searchbox", { name: "Hľadať GIFy" }), {
    target: { value: "kava" },
  });
  expect(
    await screen.findByRole("button", { name: "Odoslať GIF – Káva a žmurknutie" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Odoslať GIF – Mávanie" })).not.toBeInTheDocument();
});
