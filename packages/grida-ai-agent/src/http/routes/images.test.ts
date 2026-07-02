/**
 * `/images/generate` route (#908) — bare Hono app, fake secrets, mocked
 * `generateImage`. No model, no network.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { SecretsStore } from "@grida/daemon/server";
import { registerImagesRoutes } from "./images";

// Replace the `ai` SDK's generateImage so the route never drives a real model.
vi.mock("ai", () => ({
  generateImage: async () => ({
    images: [{ base64: "AAAA", mediaType: "image/png" }],
  }),
}));

function fakeSecrets(keys: Record<string, string>): SecretsStore {
  return {
    _getKey: async (id: string) => keys[id] ?? null,
  } as unknown as SecretsStore;
}

function appWith(keys: Record<string, string>) {
  const app = new Hono();
  registerImagesRoutes(app, { secrets: fakeSecrets(keys) });
  return app;
}

function post(app: Hono, payload: unknown) {
  return app.request("/images/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

const LISTED = "openai/gpt-image-2";

describe("POST /images/generate", () => {
  it("200 + image bytes for a listed model with a connected key", async () => {
    const res = await post(appWith({ fal: "sk-fal" }), {
      model_id: LISTED,
      prompt: "a red apple",
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.provider_id).toBe("fal");
    expect(json.model_id).toBe(LISTED);
    expect(json.images).toEqual([{ base64: "AAAA", media_type: "image/png" }]);
  });

  it("400 for an unknown model id", async () => {
    const res = await post(appWith({ fal: "sk-fal" }), {
      model_id: "nobody/nope",
      prompt: "x",
    });
    expect(res.status).toBe(400);
  });

  it("400 when no provider key is connected", async () => {
    const res = await post(appWith({}), { model_id: LISTED, prompt: "x" });
    expect(res.status).toBe(400);
  });

  it("400 on a malformed body (missing prompt)", async () => {
    const res = await post(appWith({ fal: "sk-fal" }), { model_id: LISTED });
    expect(res.status).toBe(400);
  });

  it("honors an explicit provider pick", async () => {
    const res = await post(appWith({ vercel: "sk-v", openrouter: "sk-or" }), {
      model_id: LISTED,
      prompt: "x",
      provider: "vercel",
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Record<string, unknown>).provider_id).toBe(
      "vercel"
    );
  });

  it("never returns the api key in the response", async () => {
    const res = await post(appWith({ fal: "sk-secret-123" }), {
      model_id: LISTED,
      prompt: "x",
    });
    expect(await res.text()).not.toContain("sk-secret-123");
  });
});

// Phase 4 (#908) — the BYOK path must never enter the web Grida-billed seam.
describe("images route billing isolation", () => {
  const src = readFileSync(new URL("./images.ts", import.meta.url), "utf8");

  it("does not import the web billing server", () => {
    // Match an actual import/require, not the prose mention in the docblock.
    expect(src).not.toMatch(/(from|require\()\s*["'][^"']*editor\/lib\/ai/);
  });

  it("never sets the `grida` provider-option (the billing trigger)", () => {
    // The route MAY set providerOptions keyed by the image provider (e.g. for
    // quality), but never a literal `grida: { … }` — that's the field the web
    // billing middleware keys on. Image providers are vercel/fal/openrouter.
    // (Prose mentions of `providerOptions.grida` in the docblock are fine;
    // assert only an actual object-literal key.)
    expect(src).not.toMatch(/grida\s*:\s*\{/);
  });
});
