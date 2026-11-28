import { createClient } from "npm:@supabase/supabase-js@2.108.2";
import { importPKCS8, SignJWT } from "npm:jose@6.1.3";
import { createHmac, timingSafeEqual } from "node:crypto";
import { notificationPreviewTitle } from "./notification-copy.ts";

const secret = Deno.env.get("VOICE_REPLY_WEBHOOK_SECRET");
const serviceAccount = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
const googleTokenUrl = "https://oauth2.googleapis.com/token";
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();

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
      "claim_android_notification_details",
      {
        p_ticket: ticket,
      },
    );
    if (error) throw new Error(`Device lookup failed (${error.code})`);
    if (!devices?.length) return new Response(null, { status: 204 });

    const account = JSON.parse(serviceAccount);
    const accessToken = await getGoogleToken(account);
    const project = encodeURIComponent(account.project_id);
    const results = await Promise.allSettled(devices.map(async (device: {
      token: string;
      is_message: boolean;
      sender_name: string | null;
      sender_gender: string | null;
      audience: string | null;
    }) => {
      const title = device.is_message ? "Máš novú správu" : "Máš novú odpoveď";
      const payload = device.audience === null
        ? {
          notification: { title },
          android: {
            ttl: "86400s",
            notification: {
              channel_id: device.is_message ? "chat-messages" : "voice-replies",
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
          },
          android: { ttl: "86400s", priority: "HIGH" },
        };
      const result = await fetch(
        `https://fcm.googleapis.com/v1/projects/${project}/messages:send`,
        {
          method: "POST",
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
      if (result.ok) return;
      if (result.status === 404) {
        const payload = await result.json().catch(() => null);
        if (
          payload?.error?.details?.some((detail: { errorCode?: string }) =>
            detail.errorCode === "UNREGISTERED"
          )
        ) return;
      }
      throw new Error(`FCM status ${result.status}`);
    }));
    if (results.some((result) => result.status === "rejected")) {
      throw new Error("One or more voice notifications could not be delivered");
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
