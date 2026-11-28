import { createClient } from "npm:@supabase/supabase-js@2.108.2";
import { importPKCS8, SignJWT } from "npm:jose@6.1.3";
import { createHmac, timingSafeEqual } from "node:crypto";
import { notificationPreviewTitle } from "./notification-copy.ts";

const secret = Deno.env.get("VOICE_REPLY_WEBHOOK_SECRET");
const serviceAccount = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
const googleTokenUrl = "https://oauth2.googleapis.com/token";
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();
type DeliveryDevice = {
  lease: string;
  device_session: string | null;
  token: string | null;
  is_message: boolean;
  sender_name: string | null;
  sender_gender: string | null;
  audience: string | null;
};

async function getGoogleToken(account: {
  client_email: string;
  private_key: string;
}) {
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(account.client_email)
    .setAudience(googleTokenUrl)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(await importPKCS8(account.private_key, "RS256"));
  const response = await fetch(googleTokenUrl, {
    method: "POST",
    signal: AbortSignal.timeout(7000),
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) {
    throw new Error(`Firebase authentication status ${response.status}`);
  }
  const { access_token: token } = await response.json();
  if (typeof token !== "string") {
    throw new Error("Missing Firebase access token");
  }
  return token;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const signature = request.headers.get("x-voice-reply-signature") ?? "";
  if (!secret || !/^[a-f0-9]{64}$/.test(signature)) {
    return new Response(null, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const ticket = payload?.ticket;
  if (typeof ticket !== "string" || !uuid.test(ticket)) {
    return new Response(null, { status: 400 });
  }
  const expected = createHmac("sha256", secret).update(ticket).digest("hex");
  if (!timingSafeEqual(encoder.encode(signature), encoder.encode(expected))) {
    return new Response(null, { status: 401 });
  }
  if (!serviceAccount) return new Response(null, { status: 503 });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { data: devices, error } = await supabase.rpc(
      "claim_android_notification_attempt",
      {
        p_ticket: ticket,
      },
    );
    if (error) throw new Error(`Device lookup failed (${error.code})`);
    if (!devices?.length) return new Response(null, { status: 204 });

    const lease = devices[0].lease;
    const recipients = (devices as DeliveryDevice[]).filter(
      (device) => device.token !== null && device.device_session !== null,
    );
    const account = JSON.parse(serviceAccount);
    const accessToken = recipients.length
      ? await getGoogleToken(account)
      : null;
    const project = encodeURIComponent(account.project_id);
    const results = await Promise.allSettled(recipients.map(async (device) => {
      const title = device.is_message ? "Máš novú správu" : "Máš novú odpoveď";
      const payload = device.audience === null
        ? {
          notification: { title },
          android: {
            ttl: "86400s",
            notification: {
              channel_id: device.is_message ? "chat-messages" : "voice-replies",
              tag: ticket,
              visibility: "PUBLIC",
            },
          },
        }
        : {
          data: {
            antidote_kind: device.is_message ? "message" : "voice_reply",
            sender_name: device.sender_name ?? "",
            preview_title: notificationPreviewTitle(
              device.is_message,
              device.sender_name,
              device.sender_gender,
            ),
            audience: device.audience,
            notification_id: ticket,
          },
          android: { ttl: "86400s", priority: "HIGH" },
        };
      const result = await fetch(
        `https://fcm.googleapis.com/v1/projects/${project}/messages:send`,
        {
          method: "POST",
          signal: AbortSignal.timeout(7000),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            message: {
              token: device.token,
              ...payload,
            },
          }),
        },
      );
      if (result.ok) return device.device_session;
      if (result.status === 404) {
        const payload = await result.json().catch(() => null);
        if (
          payload?.error?.details?.some((detail: { errorCode?: string }) =>
            detail.errorCode === "UNREGISTERED"
          )
        ) return device.device_session;
      }
      throw new Error(`FCM status ${result.status}`);
    }));
    const retry = results.some((result) => result.status === "rejected");
    const { error: finishError } = await supabase.rpc(
      "finish_android_notification_attempt",
      {
        p_ticket: ticket,
        p_lease: lease,
        p_settled: results.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : []
        ),
        p_retry: retry,
      },
    );
    if (finishError) {
      throw new Error(
        `Could not acknowledge notification attempt (${finishError.code})`,
      );
    }
    if (retry) {
      console.warn("Retrying one or more Android notification deliveries");
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Voice notification delivery failed",
    );
    return new Response(null, { status: 502 });
  }
});
