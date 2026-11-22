import { createClient, type AuthChangeEvent, type Session } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { ChatMessage } from "./resonance";

const sanitize = (val: string) => {
  return (val || "").trim().replace(/[^\x20-\x7E]/g, "");
};

const supabaseUrl = sanitize(import.meta.env.VITE_SUPABASE_URL as string);
const supabaseAnonKey = sanitize(import.meta.env.VITE_SUPABASE_ANON_KEY as string);

const isNative = typeof window !== "undefined" && Capacitor.isNativePlatform();

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "", {
  auth: {
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: !isNative,
  },
});

if (isNative) {
  let lastCode: string | undefined;
  const handleAuthUrl = async (url: string) => {
    const callback = new URL(url);
    if (callback.protocol !== "antidote:" || callback.hostname !== "auth") return;

    const code = callback.searchParams.get("code");
    if (!code || code === lastCode) return;

    lastCode = code;
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    if (Capacitor.isPluginAvailable("Browser")) await Browser.close();
  };
  const reportCallbackFailure = () => console.warn("Antidote could not complete the Google sign-in callback.");
  void App.addListener("appUrlOpen", ({ url }) => {
    void handleAuthUrl(url).catch(reportCallbackFailure);
  }).catch(reportCallbackFailure);
  void App.getLaunchUrl().then((result) => {
    if (result?.url) return handleAuthUrl(result.url);
  }).catch(reportCallbackFailure);
}

export const supabaseLogs: string[] = [];
let logListener: ((msg: string) => void) | null = null;

export function addSupabaseLog(msg: string) {
  const formatted = `${new Date().toLocaleTimeString()}: ${msg}`;
  supabaseLogs.push(formatted);
  if (logListener) {
    logListener(msg); // Send unformatted, let subscriber format if needed, or format here
  }
  console.log(`[SupabaseLog] ${msg}`);
}

export function subscribeToSupabaseLogs(listener: (msg: string) => void) {
  logListener = listener;
  return () => {
    logListener = null;
  };
}

export type AuthError = {
  message: string;
};

export async function signInWithGoogle() {
  const origin = window.location.origin;
  const needsRelay = isNative || origin === "https://antidotesk.vercel.app";
  // Supabase's configured Site URL is the legacy alias of the production deployment.
  const redirectTo = new URL("/", needsRelay ? "https://reson-analytical-composer.vercel.app" : origin);
  if (isNative) {
    if (!Capacitor.isPluginAvailable("Browser")) throw new Error("System browser unavailable");
    redirectTo.searchParams.set("native_auth", "1");
  } else if (needsRelay) {
    redirectTo.searchParams.set("web_auth", "1");
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectTo.href,
      skipBrowserRedirect: isNative,
    },
  });

  if (error) {
    console.error("Google sign-in error:", error);
    throw error;
  }

  if (isNative && data.url) {
    await Browser.open({ url: data.url });
  }

  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("Sign-out error:", error);
    throw error;
  }
}

export async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) {
    console.error("Get user error:", error);
    return null;
  }
  return user;
}

export function onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
  return supabase.auth.onAuthStateChange(callback);
}

export async function uploadSnippetVideo(
  userId: string,
  slotIndex: number,
  blob: Blob,
): Promise<{ url: string | null; error: string | null }> {
  if (userId === "00000000-0000-0000-0000-000000000001") {
    console.warn(`[Supabase] Skipping video upload for Demo User (slot ${slotIndex})`);
    return { url: null, error: "Demo User" };
  }

  const fileName = `${userId}/snippet_${slotIndex}_${Date.now()}.webm`;

  // Self-healing: try to create the bucket in case it is missing (fails silently if no permission/exists)
  try {
    await supabase.storage.createBucket("media-snippets", { public: false });
  } catch (e) {
    // Ignore error
  }

  const { data, error } = await supabase.storage.from("media-snippets").upload(fileName, blob, {
    contentType: blob.type || "video/webm",
    upsert: true,
  });

  if (error) {
    console.error(`[Supabase] Upload failed for slot ${slotIndex}:`, error);
    return { url: null, error: error.message || JSON.stringify(error) };
  }

  const { data: signedData, error: signError } = await supabase.storage
    .from("media-snippets")
    .createSignedUrl(data.path, 60 * 60 * 24 * 7);

  if (signError || !signedData?.signedUrl) {
    console.error(`[Supabase] Signed URL generation failed for slot ${slotIndex}:`, signError);
    return { url: null, error: signError?.message || "Failed to generate signed URL" };
  }

  return { url: signedData.signedUrl, error: null };
}

/**
 * Resolves a storage path or full Supabase URL into a fresh Signed URL.
 * Supports private buckets: "media-snippets", "voice-messages".
 * Default expiresIn is 7 days (604800 seconds).
 */
export async function getSignedMediaUrl(
  bucket: string,
  pathOrUrl?: string | null,
  expiresInSeconds: number = 60 * 60 * 24 * 7
): Promise<string> {
  if (!pathOrUrl) return "";
  if (pathOrUrl.startsWith("blob:") || pathOrUrl.startsWith("data:")) {
    return pathOrUrl;
  }

  // Extract storage path if a full URL was provided
  let path = pathOrUrl;
  const publicPrefix = `/storage/v1/object/public/${bucket}/`;
  const signPrefix = `/storage/v1/object/sign/${bucket}/`;

  if (path.includes(publicPrefix)) {
    path = path.substring(path.indexOf(publicPrefix) + publicPrefix.length);
  } else if (path.includes(signPrefix)) {
    path = path.substring(path.indexOf(signPrefix) + signPrefix.length);
    if (path.includes("?")) {
      path = path.split("?")[0];
    }
  }

  // If path is still an external URL (not in this bucket), return as is
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(decodeURIComponent(path), expiresInSeconds);

    if (error || !data?.signedUrl) {
      console.warn(`[getSignedMediaUrl] Failed to sign URL for ${bucket}/${path}:`, error);
      return pathOrUrl;
    }

    return data.signedUrl;
  } catch (err) {
    console.error(`[getSignedMediaUrl] Error creating signed URL:`, err);
    return pathOrUrl;
  }
}

export async function recordLivenessVerified(videoUrl?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      return { success: false, error: "No active session" };
    }

    const { error } = await supabase.functions.invoke("verify-liveness", {
      body: { video_url: videoUrl },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (error) {
      console.warn("[Supabase] Edge function verify-liveness failed:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error("[Supabase] recordLivenessVerified error:", err);
    return { success: false, error: err.message || String(err) };
  }
}

export async function submitPsychometricsToLedger(
  profileData: any
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      return { success: false, error: "No active session" };
    }

    const { error } = await supabase.functions.invoke("submit-psychometrics", {
      body: {
        attachment_style: profileData.attachmentStyle,
        avg_response_time: profileData.avgResponseTime,
        extraversion: profileData.extraversion,
        cognitive_depth: profileData.cognitiveDepth,
        conscientiousness: profileData.conscientiousness,
        hesitated: profileData.hesitated,
        top_priority: profileData.topPriority,
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (error) {
      console.warn("[Supabase] Edge function submit-psychometrics failed:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error("[Supabase] submitPsychometricsToLedger error:", err);
    return { success: false, error: err.message || String(err) };
  }
}

export async function saveUserProfile(
  userId: string,
  profileData: any,
  videoUrls: (string | null)[],
): Promise<void> {
  if (userId === "00000000-0000-0000-0000-000000000001") {
    console.warn("[Supabase] Skipping saveUserProfile for Demo User");
    return;
  }

  // 1. Update Profile (pre-created by auth trigger)
  // Note: liveness_verified is locked by DB trigger and must be set via verify-liveness Edge Function
  const baseProfile = {
    name: profileData.name || "Používateľ",
    age: profileData.age || 18,
    birth_date: profileData.birthDate || "2000-01-01",
    city: profileData.city || "",
    gender: profileData.gender || "other",
    orientation: profileData.orientation || "bi",
    radius_km: profileData.radiusKm || 200,
    non_negotiable: profileData.nonNegotiable || "",
    latitude: profileData.coords?.lat,
    longitude: profileData.coords?.lon,
    current_thesis: profileData.currentThesis || "",
    shared_reflection: profileData.sharedReflection,
    similarity_vector: `[${profileData.cognitiveDepth || 0.5},${profileData.conscientiousness || 0.5}]`,
    cognitive_depth: profileData.cognitiveDepth,
    conscientiousness: profileData.conscientiousness,
    extraversion: profileData.extraversion,
    attachment_style: profileData.attachmentStyle,
    avg_response_time: profileData.avgResponseTime,
    top_priority: profileData.topPriority,
    status: profileData.status || "ACTIVE",
    directive_goal: profileData.directive_goal || "",
    directive_redflags: profileData.directive_redflags || "",
    directive_lifestyle: profileData.directive_lifestyle || "",
  };

  const { error: profileUpdateError, count: profileCount } = await supabase
    .from("profiles")
    .update(baseProfile, { count: "exact" })
    .eq("id", userId);

  // If update fails or affects 0 rows, fallback to clean insert
  if (profileUpdateError || profileCount === 0) {
    console.warn("[Supabase] Profile update failed or row not found. Trying insert fallback...", profileUpdateError);
    const { error: insertError } = await supabase
      .from("profiles")
      .insert({
        id: userId,
        ...baseProfile,
      });

    if (insertError) {
      console.error("[Supabase] Profile insert fallback failed:", insertError);
      throw insertError;
    }
  }

  // 2. Submit Psychometrics via secure JWT-authenticated function (locks psychometric_ledger)
  try {
    await submitPsychometricsToLedger(profileData);
  } catch (ledgerErr) {
    console.warn("[Supabase] Ledger update via Edge Function notice:", ledgerErr);
  }

  // 3. If verified during onboarding, record liveness via secure JWT function
  if (profileData.livenessVerified || profileData.liveness_verified) {
    try {
      await recordLivenessVerified();
    } catch (livenessErr) {
      console.warn("[Supabase] Liveness recording notice:", livenessErr);
    }
  }

  // 3. Update/Insert Media Snippets
  for (let i = 0; i < videoUrls.length; i++) {
    const url = videoUrls[i];
    if (!url || url.startsWith("blob:")) continue;

    const { error: snippetUpdateError, count: snippetCount } = await supabase
      .from("media_snippets")
      .update({ video_url: url }, { count: "exact" })
      .eq("user_id", userId)
      .eq("slot_index", i + 1);

    if (snippetUpdateError || snippetCount === 0) {
      const { error: snippetInsertError } = await supabase
        .from("media_snippets")
        .insert({
          user_id: userId,
          slot_index: i + 1,
          video_url: url,
        });

      if (snippetInsertError && !snippetInsertError.message.includes("duplicate key")) {
        console.error(`[Supabase] Snippet ${i + 1} insert failed:`, snippetInsertError);
        throw snippetInsertError;
      }
    }
  }
}

export async function fetchUserProfile(userId: string): Promise<any | null> {
  if (!userId || userId === "00000000-0000-0000-0000-000000000001") return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.age) return null;

  // Fetch video loops from media_snippets table
  const { data: snippetsData, error: snippetsError } = await supabase
    .from("media_snippets")
    .select("slot_index, video_url")
    .eq("user_id", userId)
    .order("slot_index", { ascending: true });

  if (snippetsError) {
    console.error("[fetchUserProfile] Error fetching media snippets:", snippetsError);
  }

  const videoUrls = ["", "", "", ""];
  if (snippetsData) {
    await Promise.all(
      snippetsData.map(async (snippet) => {
        const idx = snippet.slot_index - 1;
        if (idx >= 0 && idx < 4) {
          videoUrls[idx] = await getSignedMediaUrl("media-snippets", snippet.video_url);
        }
      })
    );
  }

  return {
    id: data.id,
    name: data.name,
    age: data.age,
    birthDate: data.birth_date,
    city: data.city,
    gender: data.gender,
    orientation: data.orientation,
    radiusKm: data.radius_km || 200,
    nonNegotiable: data.non_negotiable || "",
    currentThesis: data.current_thesis || "",
    sharedReflection: data.shared_reflection ?? null,
    cognitiveDepth: data.cognitive_depth,
    conscientiousness: data.conscientiousness,
    extraversion: data.extraversion,
    attachmentStyle: data.attachment_style,
    avgResponseTime: data.avg_response_time,
    topPriority: data.top_priority,
    hesitated: data.hesitated,
    redemptionQuota: data.redemption_quota,
    completedPressureScenarios: data.completed_pressure_scenarios || [],
    videoUrls, // Attach fetched videos
    status: data.status, // Map status column (ACTIVE | FROZEN)
    coords: data.latitude && data.longitude ? { lat: data.latitude, lon: data.longitude } : undefined,
    haptic_profile: data.haptic_profile,
    geo_density: data.geo_density,
    ui_speed: data.ui_speed,
    directive_goal: data.directive_goal,
    directive_redflags: data.directive_redflags,
    directive_lifestyle: data.directive_lifestyle,
    livenessVerified: data.liveness_verified ?? false,
  };
}

export async function saveChatMessage(
  matchId: string,
  senderId: string,
  text: string,
  media?: { kind: "image" | "gif"; url: string },
  messageId: string = crypto.randomUUID(),
  replyContext?: string,
): Promise<any> {
  const { data, error } = await supabase
    .from("messages")
    .insert({
      id: messageId,
      match_id: matchId,
      sender_id: senderId,
      message_text: text,
      reply_context: replyContext,
      media_url: media?.url || null,
      duration: null,
    })
    .select()
    .single();

  if (error) {
    const { data: saved } = await supabase.from("messages").select("*").eq("id", messageId)
      .eq("match_id", matchId).eq("sender_id", senderId).maybeSingle();
    if (saved) return saved;
    throw error;
  }
  return data;
}

export async function fetchChatMessages(
  matchId: string,
  myUserId: string
): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("match_id", matchId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  const messagesWithSignedUrls = await Promise.all(
    (data ?? []).map(async (m): Promise<ChatMessage> => {
      let resolvedMediaUrl = m.media_url;
      if (resolvedMediaUrl && m.duration) {
        resolvedMediaUrl = await getSignedMediaUrl("voice-messages", resolvedMediaUrl);
      }
      return {
        id: m.id,
        from: m.sender_id === myUserId ? "me" : "them",
        text: m.message_text || "",
        replyContext: m.reply_context || undefined,
        ts: new Date(m.created_at).getTime(),
        media: resolvedMediaUrl
          ? { kind: m.duration ? "audio" : "gif", url: resolvedMediaUrl, duration: m.duration }
          : undefined,
      };
    })
  );

  return messagesWithSignedUrls;
}

export async function getOrCreateMatch(myUserId: string, partnerUserId: string, evScore: number) {
  const [user_p, user_q] = [myUserId, partnerUserId].sort();
  const find = () => supabase.from("matches").select("id, status").eq("user_p", user_p).eq("user_q", user_q).maybeSingle();
  const existing = await find();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;

  const result = await supabase.from("matches").insert({ user_p, user_q, ev_score: evScore })
    .select("id, status").single();
  if (result.error?.code === "23505") {
    const concurrent = await find();
    if (concurrent.data) return concurrent.data;
  }
  if (result.error) throw result.error;
  return result.data;
}

export async function uploadVoiceMessageBlob(
  matchId: string,
  senderId: string,
  blob: Blob,
  duration: number,
  messageId: string,
): Promise<any> {
  const fileName = `matches/${matchId}/${messageId}.wav`;

  const findSavedMessage = async () => {
    const { data, error } = await supabase.from("messages").select("*")
      .eq("id", messageId).eq("match_id", matchId).eq("sender_id", senderId).maybeSingle();
    if (error) throw error;
    return data;
  };

  const saved = await findSavedMessage();
  if (saved) return saved;

  const { data, error: uploadError } = await supabase.storage
    .from("voice-messages")
    .upload(fileName, blob, {
      contentType: blob.type || "audio/wav",
      upsert: false,
    });

  if (uploadError && String(uploadError.statusCode) !== "409") {
    console.error("[uploadVoiceMessageBlob] Upload failed:", uploadError);
    throw uploadError;
  }

  const { data: dbData, error: dbError } = await supabase
    .from("messages")
    .insert({
      match_id: matchId,
      sender_id: senderId,
      id: messageId,
      media_url: data?.path || fileName,
      duration,
      message_text: null,
    })
    .select()
    .single();

  if (dbError) {
    const existing = await findSavedMessage();
    if (existing) return existing;
    console.error("[uploadVoiceMessageBlob] Error saving message row:", dbError);
    throw dbError;
  }

  return dbData;
}



