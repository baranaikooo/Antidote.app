import { createClient } from "npm:@supabase/supabase-js@2.108.2";
import { importPKCS8, SignJWT } from "npm:jose@6.1.3";
import { timingSafeEqual } from "node:crypto";

const secret = Deno.env.get("VOICE_REPLY_WEBHOOK_SECRET");
const serviceAccount = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
const googleTokenUrl = "https://oauth2.googleapis.com/token";
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();

async function getGoogleToken(account: {
  client_email: string;
  private_key: string;
}) {
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(account.client_email)
    .setAudience(googleTokenUrl)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(await importPKCS8(account.private_key, "RS256"));
  const response = await fetch(googleTokenUrl, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`Firebase authentication status ${response.status}`);
  const { access_token: token } = await response.json();
  if (typeof token !== "string") throw new Error("Missing Firebase access token");
  return token;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const supplied = encoder.encode(request.headers.get("x-voice-reply-secret") ?? "");
  const expected = encoder.encode(secret ?? "");
  if (!expected.length || supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    return new Response(null, { status: 401 });
  if (!serviceAccount) return new Response(null, { status: 503 });

  const payload = await request.json().catch(() => null);
  if (!uuid.test(payload?.match_id) || !uuid.test(payload?.recipient))
    return new Response(null, { status: 400 });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: tokens, error } = await supabase.rpc("voice_reply_delivery_tokens", {
      p_match_id: payload.match_id,
      p_recipient: payload.recipient,
    });
    if (error) throw new Error(`Device lookup failed (${error.code})`);
    if (!tokens?.length) return new Response(null, { status: 204 });

    const account = JSON.parse(serviceAccount);
    const accessToken = await getGoogleToken(account);
    const project = encodeURIComponent(account.project_id);
    const results = await Promise.allSettled(tokens.map(async (token: string) => {
      const result = await fetch(`https://fcm.googleapis.com/v1/projects/${project}/messages:send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: "Máš novú odpoveď" },
            android: {
              ttl: "86400s",
              notification: { channel_id: "voice-replies", visibility: "PUBLIC" },
            },
          },
        }),
      });
      if (result.ok) return;
      if (result.status === 404) {
        const payload = await result.json().catch(() => null);
        if (payload?.error?.details?.some((detail: { errorCode?: string }) =>
          detail.errorCode === "UNREGISTERED"
        )) return;
      }
      throw new Error(`FCM status ${result.status}`);
    }));
    if (results.some((result) => result.status === "rejected"))
      throw new Error("One or more voice notifications could not be delivered");
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Voice notification delivery failed");
    return new Response(null, { status: 502 });
  }
});
