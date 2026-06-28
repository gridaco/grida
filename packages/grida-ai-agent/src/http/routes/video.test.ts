/**
 * `/video/generate` route (#908) — bare Hono app, fake secrets. The happy path
 * goes through fal (a plain-fetch adapter) with a mocked global fetch; the
 * error paths exercise resolve + validation. No SDK, no network.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { SecretsStore } from "../../secrets";
import { registerVideoRoutes } from "./video";

function fakeSecrets(keys: Record<string, string>): SecretsStore {
  return {
    _getKey: async (id: string) => keys[id] ?? null,
  } as unknown as SecretsStore;
}

function appWith(keys: Record<string, string>) {
  const app = new Hono();
  registerVideoRoutes(app, { secrets: fakeSecrets(keys) });
  return app;
}

function post(app: Hono, payload: unknown) {
  return app.request("/video/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// Veo binds vercel + fal; fal is a plain-fetch adapter we can drive end-to-end.
const VEO = "google/veo-3.1";

/** Shape of the `init` arg our `fetch` mock reads. */
type MockInit = { method?: string; body?: string };

afterEach(() => vi.unstubAllGlobals());

describe("POST /video/generate", () => {
  it("200 + base64 video for a listed model via fal (sidecar downloads the clip)", async () => {
    const MP4 = new Uint8Array([0, 0, 0, 24]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: MockInit = {}) => {
        if (init.method === "POST")
          return new Response(
            JSON.stringify({
              request_id: "r",
              status_url: "https://queue.fal.run/r/status",
              response_url: "https://queue.fal.run/r",
            }),
            { status: 200 }
          );
        if (url.endsWith("/status"))
          return new Response(JSON.stringify({ status: "COMPLETED" }), {
            status: 200,
          });
        if (url === "https://fal.media/v.mp4")
          return new Response(MP4, {
            status: 200,
            headers: { "content-type": "video/mp4" },
          });
        return new Response(
          JSON.stringify({
            video: {
              url: "https://fal.media/v.mp4",
              content_type: "video/mp4",
            },
          }),
          { status: 200 }
        );
      })
    );
    const res = await post(appWith({ fal: "sk-fal" }), {
      model_id: VEO,
      prompt: "a cat surfing",
      provider: "fal",
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.provider_id).toBe("fal");
    expect(json.videos).toEqual([
      { base64: Buffer.from(MP4).toString("base64"), media_type: "video/mp4" },
    ]);
  });

  it("400 for an unknown model id", async () => {
    const res = await post(appWith({ vercel: "sk-v" }), {
      model_id: "no/pe",
      prompt: "x",
    });
    expect(res.status).toBe(400);
  });

  it("400 when the connected provider does not serve the model", async () => {
    // Seedance has no fal binding.
    const res = await post(appWith({ fal: "sk-fal" }), {
      model_id: "bytedance/seedance-2.0",
      prompt: "x",
    });
    expect(res.status).toBe(400);
  });

  it("400 on a malformed body (missing prompt)", async () => {
    const res = await post(appWith({ fal: "sk-fal" }), { model_id: VEO });
    expect(res.status).toBe(400);
  });

  it("never leaks the api key in the response", async () => {
    // A real secret is present so a regression that echoes connected keys would
    // actually fail this assertion (an empty store could never leak).
    const res = await post(appWith({ fal: "sk-secret-123" }), {
      model_id: "no/pe",
      prompt: "x",
    });
    expect(await res.text()).not.toContain("sk-secret-123");
  });
});

describe("video route billing isolation", () => {
  const src = readFileSync(new URL("./video.ts", import.meta.url), "utf8");
  it("does not import the web billing server", () => {
    expect(src).not.toMatch(/(from|require\()\s*["'][^"']*editor\/lib\/ai/);
  });
  it("never sets the `grida` provider-option", () => {
    expect(src).not.toMatch(/grida\s*:\s*\{/);
    expect(src).not.toMatch(/providerOptions\s*\.\s*grida/);
  });
});
