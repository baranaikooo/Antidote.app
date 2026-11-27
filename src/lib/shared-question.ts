import { supabase } from "./supabase";

export type SharedQuestion = {
  question: string;
  own_answer: string | null;
  partner_answer: string | null;
  skipped: boolean;
  required?: boolean;
};

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
