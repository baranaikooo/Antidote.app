import { supabase } from "./supabase";

export type MeetingInterest = { interested: boolean; mutual: boolean };

export async function readMeetingInterest(matchId: string): Promise<MeetingInterest | null> {
  const { data, error } = await supabase.rpc("get_meeting_interest", { p_match_id: matchId });
  if (error) throw error;
  return data as MeetingInterest | null;
}

export async function setMeetingInterest(
  matchId: string,
  interested: boolean,
): Promise<MeetingInterest> {
  const { data, error } = await supabase.rpc("set_meeting_interest", {
    p_match_id: matchId,
    p_interested: interested,
  });
  if (error || !data) throw error ?? new Error("Meeting interest unavailable");
  return data as MeetingInterest;
}
