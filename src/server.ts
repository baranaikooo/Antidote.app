import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";


type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}


function findLatestAndroidAsset(assets: { name: string; state: string }[]) {
  let latest: { code: number; name: string } | null = null;
  for (const asset of assets) {
    const match = /^Antidote-([1-9]\d{0,9})-(\d{1,9}\.\d{1,9}\.\d{1,9})\.apk$/.exec(asset.name);
    if (asset.state !== "uploaded" || !match) continue;
    const code = Number(match[1]);
    if (code > 2147483647) continue;
    if (!latest || code > latest.code) latest = { code, name: match[2] };
  }
  return latest;
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      const nativeCallback = url.searchParams.get("native_auth") === "1";
      const webCallback = url.searchParams.get("web_auth") === "1";
      if (request.method === "GET" && url.pathname === "/" && (nativeCallback || webCallback)) {
        const code = url.searchParams.get("code");
        const validCode = code && /^[A-Za-z0-9_-]{1,256}$/.test(code);
        if (!nativeCallback) {
          const target = new URL("https://antidotesk.vercel.app/");
          if (validCode) target.searchParams.set("code", code);
          return new Response(null, {
            status: 303,
            headers: { Location: target.href, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
          });
        }
        const appUrl = validCode ? `antidote://auth?code=${code}` : "antidote://auth";
        return new Response(`<!doctype html>
<html lang="sk">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Návrat do Antidote</title>
<style>
  body { color-scheme: light dark; font: 1rem system-ui; margin: 0; padding: 2rem; }
  main { max-width: 28rem; margin: 12vh auto; }
  a { display: inline-block; padding: 0.875rem 1.25rem; border-radius: 0.75rem; background: #3159d6; color: white; font-weight: 700; }
</style>
<main>
  <h1>${validCode ? "Späť do Antidote" : "Prihlásenie sa nedokončilo"}</h1>
  <p>${validCode ? "Pokračuj v aplikácii." : "Vráť sa do aplikácie a skús to znova."}</p>
  <a id="open-app" href="${appUrl}">Otvoriť Antidote</a>
</main>
${validCode ? '<script>location.replace(document.getElementById("open-app").href)</script>' : ""}
</html>`, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
          },
        });
      }
      if (request.method === "GET" && url.pathname === "/api/android-update") {
        try {
          const release = await fetch("https://api.github.com/repos/baranaikooo/Antidote.app/releases/tags/v1.0.0-alpha", {
            headers: { Accept: "application/vnd.github+json" },
            signal: AbortSignal.timeout(5000),
          });
          if (!release.ok) throw new Error("Release unavailable");
          const { assets } = await release.json();
          return Response.json(findLatestAndroidAsset(assets), {
            headers: { "Cache-Control": "public, max-age=0, s-maxage=60" },
          });
        } catch {
          return Response.json(null, { status: 503, headers: { "Cache-Control": "no-store" } });
        }
      }
      if (url.pathname === "/api/app-version") {
        return Response.json({ version: __ANTIDOTE_BUILD_ID__ }, {
          headers: { "Cache-Control": "no-store, max-age=0" },
        });
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
