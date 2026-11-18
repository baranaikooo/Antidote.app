import { afterEach, describe, expect, it, vi } from "vitest";
import server from "./server";

const relay = (query: string) =>
  server.fetch(new Request(`https://reson-analytical-composer.vercel.app/?${query}`), undefined, undefined);

describe("Google sign-in return", () => {
  it("hands the PKCE code to the Android app without passing other parameters", async () => {
    const response = await relay("native_auth=1&code=test-code_123&access_token=discard-me");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const html = await response.text();
    expect(html).toContain('href="antidote://auth?code=test-code_123"');
    expect(html).toContain("Otvoriť Antidote");
    expect(html).not.toContain("discard-me");
  });

  it("allows a user to return after cancellation and rejects invalid codes", async () => {
    const response = await relay("native_auth=1&code=%22%3Cscript%3E");
    const html = await response.text();
    expect(html).toContain('href="antidote://auth"');
    expect(html).toContain("Prihlásenie sa nedokončilo");
    expect(html).not.toContain("<script>");
  });

  it("returns web users to the fixed origin that holds their verifier", async () => {
    const response = await relay("web_auth=1&code=test-code_123&redirect_to=https://example.org");
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("https://antidotesk.vercel.app/?code=test-code_123");
  });
});

describe("Android update endpoint", () => {
  afterEach(() => vi.unstubAllGlobals());

  const check = () => server.fetch(new Request("https://antidotesk.vercel.app/api/android-update"), undefined, undefined);

  it("returns the highest uploaded versioned APK without trusting asset URLs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ assets: [
      { name: "Antidote-debug.apk", state: "uploaded" },
      { name: "Antidote-4-1.0.3.apk", state: "uploaded" },
      { name: "Antidote-10-1.1.0.apk", state: "uploaded", browser_download_url: "https://example.org" },
      { name: "Antidote-11-1.1.1.apk", state: "new" },
    ] })));
    expect(await (await check()).json()).toEqual({ code: 10, name: "1.1.0" });
  });

  it("reports availability-check failures without caching them", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    const response = await check();
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
