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
