import type { Conversation } from "./resonance";
import { supabase } from "./supabase";

export type InboxMessage = {
  id: string;
  from: "me" | "them";
  text: string;
  kind: "voice" | "media" | "text";
  ts: number;
};

type QuestionStage = "your_turn" | "waiting" | "ready";

export type InboxConversation = Conversation & {
  preview?: InboxMessage;
  questionStage?: QuestionStage;
};

type InboxRow = {
  match_id: string;
  partner_id: string;
  status: "active" | "deleted";
  created_at: string;
  message_id: string | null;
  sender_id: string | null;
  message_text: string | null;
  duration: number | null;
  has_media: boolean;
  message_at: string | null;
  unread: boolean;
  question_stage?: QuestionStage | null;
};

export async function fetchConversationInbox(userId: string) {
  const result = await supabase.rpc("get_conversation_inbox_with_question_stage");
  const { data, error } =
    result.error?.code === "PGRST202" ? await supabase.rpc("get_conversation_inbox") : result;
  if (error) throw error;
  const rows = (data ?? []) as InboxRow[];
  const conversations: InboxConversation[] = [];
  const excluded = new Set<string>();
  for (const row of rows) {
    if (row.status === "deleted") {
      excluded.add(row.partner_id);
    } else {
      conversations.push({
        id: row.match_id,
        matchId: row.partner_id,
        messages: [],
        unread: row.unread,
        questionStage: row.question_stage ?? undefined,
        createdAt: Date.parse(row.created_at),
        preview:
          row.message_id && row.message_at
            ? {
                id: row.message_id,
                from: row.sender_id === userId ? "me" : "them",
                text: row.message_text ?? "",
                kind: row.duration !== null ? "voice" : row.has_media ? "media" : "text",
                ts: Date.parse(row.message_at),
              }
            : undefined,
      });
    }
  }
  return { conversations, excluded };
}

export async function markConversationRead(matchId: string, messageId: string) {
  const { error } = await supabase.rpc("mark_conversation_read", {
    p_match_id: matchId,
    p_message_id: messageId,
  });
  if (error) throw error;
}

export async function hasConversationPilotResponse(matchId: string) {
  const { data, error } = await supabase
    .from("conversation_pilot_responses")
    .select("match_id")
    .eq("match_id", matchId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function submitConversationPilotResponse(matchId: string, wouldContinue: boolean) {
  const { data, error } = await supabase.rpc("submit_conversation_pilot_response", {
    p_match_id: matchId,
    p_would_continue: wouldContinue,
  });
  if (error || data !== true) throw error ?? new Error("Feedback unavailable");
}

export function inboxMessageLabel(message: InboxMessage) {
  return (
    (message.from === "me" ? "Ty: " : "") +
    (message.text || (message.kind === "voice" ? "Hlasová správa" : "Príloha"))
  );
}
