import { supabase } from "./supabase";

export const REFLECTION_QUESTION =
  "Ktorú hodnotu si kedysi považoval/a za svoju a časom si zistil/a, že si ju len prevzal/a?";
export const REFLECTION_MAX_LENGTH = 400;
export const REPORT_REASONS = {
  harassment: "Obťažovanie alebo nevhodné správanie",
  spam: "Spam alebo falošný profil",
  other: "Iný dôvod",
} as const;

type ReportReason = keyof typeof REPORT_REASONS;
export type ConversationChoice = "share" | "withdraw" | "close" | ReportReason;

export type ConversationStatus = {
  status: "active" | "deleted";
  is_unlocked: boolean;
  consent_pending: boolean;
};

export type ConversationPartner = {
  id: string;
  name: string;
  age: number;
  city: string;
  top_priority: string | null;
  shared_reflection: string | null;
};

export async function fetchConversationPartnerIds(userId: string) {
  const { data, error } = await supabase
    .from("matches")
    .select("id, user_p, user_q, status, created_at, messages(id)")
    .or("user_p.eq." + userId + ",user_q.eq." + userId)
    .limit(1, { referencedTable: "messages" })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchConversationPartners(ids: string[]): Promise<ConversationPartner[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, age, city, top_priority, shared_reflection")
    .in("id", ids);
  if (error) throw error;
  return data ?? [];
}

export async function updateSharedReflection(userId: string, value: string | null) {
  const { data, error } = await supabase
    .from("profiles")
    .update({ shared_reflection: value })
    .eq("id", userId)
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("Profile unavailable");
}

export async function readConversationStatus(
  matchId: string,
  userId: string,
): Promise<ConversationStatus> {
  const [match, ownVote] = await Promise.all([
    supabase.from("matches").select("status, is_unlocked").eq("id", matchId).single(),
    supabase
      .from("blind_votes")
      .select("vote")
      .eq("match_id", matchId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (match.error || ownVote.error) throw match.error ?? ownVote.error;
  return {
    status: match.data.status,
    is_unlocked: match.data.status === "active" && match.data.is_unlocked,
    consent_pending:
      match.data.status === "active" && !match.data.is_unlocked && ownVote.data?.vote === "unlock",
  };
}

export async function setConversationChoice(
  matchId: string,
  choice: ConversationChoice,
): Promise<ConversationStatus> {
  const { data, error } = await supabase
    .rpc("set_conversation_choice", {
      p_match_id: matchId,
      p_choice: choice,
    })
    .single();
  if (error) throw error;
  return data as ConversationStatus;
}

export async function fetchSharedProfileVideos(ownerId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("list_shared_profile_video_paths", {
    p_owner: ownerId,
  });
  if (error) throw error;
  const urls = await Promise.all(
    ((data ?? []) as { path: string }[]).map(async ({ path: objectPath }) => {
      const path = getOwnerStoragePath(objectPath, ownerId);
      if (!path) return null;
      const signed = await supabase.storage.from("media-snippets").createSignedUrl(path, 300);
      return signed.data?.signedUrl ?? null;
    }),
  );
  return urls.filter((url): url is string => url !== null);
}

function getOwnerStoragePath(raw: string, ownerId: string): string | null {
  try {
    const decoded = decodeURIComponent(raw);
    return decoded.startsWith(ownerId + "/") && !decoded.includes("..") ? decoded : null;
  } catch {
    return null;
  }
}
