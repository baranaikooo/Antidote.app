import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
const gifPath = /^https:\/\/static[.]klipy[.]com\/ii\/[A-Za-z0-9/_-]+[.]gif$/;

type ProviderItem = {
  type?: string;
  slug?: string;
  title?: string;
  file?: { md?: { gif?: { url?: string } }; sm?: { gif?: { url?: string } } };
};

function providerUrl(value: unknown): value is string {
  return typeof value === "string" && value.length <= 512 && gifPath.test(value);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return json({ error: "Unauthorized" }, 401);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return json({ error: "Unauthorized" }, 401);

    const key = Deno.env.get("KLIPY_APP_KEY")?.trim() || Deno.env.get("Klipy")?.trim();
    if (!key) return json({ source: "featured" });

    const input = await request.json().catch(() => null);
    const query = typeof input?.query === "string" ? input.query.trim() : "";
    if (query.length < 2 || query.length > 80) return json({ error: "Invalid search" }, 400);

    const { data: allowed, error: quotaError } = await supabase.rpc("reserve_chat_gif_search", {
      p_user_id: data.user.id,
    });
    if (quotaError) return json({ error: "Search unavailable" }, 503);
    if (!allowed) return json({ error: "Too many searches" }, 429);

    const hashed = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode("antidote-gifs:" + data.user.id),
    );
    const customer = Array.from(new Uint8Array(hashed), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const url = new URL(`https://api.klipy.com/api/v1/${encodeURIComponent(key)}/gifs/search`);
    url.search = new URLSearchParams({
      q: query,
      page: "1",
      per_page: "24",
      content_filter: "high",
      format_filter: "gif",
      locale: "sk",
      customer_id: customer,
    }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: "error" });
    if (!response.ok) return json({ error: "Search unavailable" }, 503);
    const content = await response.json();
    if (content?.result !== true || !Array.isArray(content?.data?.data)) {
      return json({ error: "Search unavailable" }, 503);
    }

    const gifs = (content.data.data as ProviderItem[]).slice(0, 24).flatMap((item) => {
      const url = item?.file?.md?.gif?.url ?? item?.file?.sm?.gif?.url;
      if (!providerUrl(url) || (item.type && item.type !== "gif")) return [];
      const preview = item.file?.sm?.gif?.url;
      return [
        {
          url,
          previewUrl: providerUrl(preview) ? preview : url,
          label: typeof item.title === "string" ? item.title.trim().slice(0, 100) || "GIF" : "GIF",
        },
      ];
    });
    if (gifs.length) {
      const { error: approveError } = await supabase.rpc("approve_provider_chat_gifs", {
        p_urls: gifs.map((gif) => gif.url),
      });
      if (approveError) return json({ error: "Search unavailable" }, 503);
    }
    return json({ source: "klipy", gifs });
  } catch {
    return json({ error: "Search unavailable" }, 503);
  }
});
