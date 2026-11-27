import { supabase } from "./supabase";

export type SharedQuestion = {
  question: string;
  own_answer: string | null;
  partner_answer: string | null;
  skipped: boolean;
  required?: boolean;
  voice_required?: boolean;
  own_voice_path?: string | null;
  partner_voice_path?: string | null;
};

export const QUESTION_VOICE_BUCKET = "question-voices";

export async function readSharedQuestion(matchId: string): Promise<SharedQuestion | null> {
  const { data, error } = await supabase.rpc("get_shared_conversation_question", {
    p_match_id: matchId,
  });
  if (error) throw error;
  return data as SharedQuestion | null;
}

export async function respondToSharedQuestion(matchId: string, answer: string | null) {
  const { data, error } = await supabase.rpc("respond_shared_conversation_question", {
    p_match_id: matchId,
    p_answer: answer,
  });
  if (error || !data) throw error ?? new Error("Shared question unavailable");
  return data as SharedQuestion;
}

export async function submitQuestionVoice(matchId: string, userId: string, id: string, blob: Blob) {
  const path = `${userId}/${matchId}_${id}`;
  const { error } = await supabase.storage.from(QUESTION_VOICE_BUCKET).upload(path, blob, {
    contentType: blob.type.split(";")[0],
    upsert: false,
  });
  if (error && String(error.statusCode) !== "409") {
    // The previous attempt may have saved the answer even if its response was lost.
    const saved = await readSharedQuestion(matchId);
    if (saved?.own_voice_path === path) return saved;
    throw error;
  }
  const updated = await respondToSharedQuestion(matchId, path);
  if (updated.own_voice_path !== path) {
    void supabase.storage.from(QUESTION_VOICE_BUCKET).remove([path]);
  }
  return updated;
}

export async function withdrawQuestionVoice(matchId: string, path: string) {
  const updated = await respondToSharedQuestion(matchId, null);
  if (!updated.own_voice_path) {
    // A partner answer can win the race with withdrawal. Keep the clip in that case.
    const { error } = await supabase.storage.from(QUESTION_VOICE_BUCKET).remove([path]);
    if (error) console.warn("[question voice] Could not remove a withdrawn recording", error);
  }
  return updated;
}

export async function signQuestionVoice(path: string) {
  const { data, error } = await supabase.storage
    .from(QUESTION_VOICE_BUCKET)
    .createSignedUrl(path, 600);
  if (error || !data) throw error ?? new Error("Recording unavailable");
  return data.signedUrl;
}
