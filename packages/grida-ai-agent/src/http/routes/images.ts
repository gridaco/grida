/**
 * GRIDA-SEC-004 — `/images/generate` route (BYOK image generation, #908).
 *
 * Desktop-only, user-BYOK image generation. The route resolves the user's
 * connected provider for a curated model id, builds the `ImageModelV3` with the
 * key (read internally — never exposed), and returns the generated **bytes**.
 *
 * Security contract (reviewed):
 *   - Reads `_getKey` internally (legal — sidecar only). The response carries
 *     base64 image bytes + provider id only: never the key, never the raw
 *     upstream JSON.
 *   - `model_id` is a closed catalog lookup (curated `listed` cards only) and
 *     `provider` is `oneOf` the fixed image providers — there is NO
 *     user-supplied base URL, so this opens no new egress beyond the three
 *     fixed provider hosts (unlike the endpoint routes, issue #806).
 *
 * Billing contract (#908, Phase 4): this path NEVER enters the web
 * Grida-billed image seam (`editor/lib/ai/server.ts`). It calls `generateImage`
 * WITHOUT `providerOptions.grida` — the field that triggers Grida's billing
 * middleware — so the user's own key pays the provider directly and no Grida
 * credit is metered. Do not add `providerOptions.grida` here.
 */

import type { Hono } from "hono";
import { generateImage } from "ai";
import type { SecretsStore } from "../../secrets";
import {
  ImageModelUnavailableError,
  resolveImageModel,
} from "../../providers/resolve-image";
import { body, v } from "../validate";

const IMAGE_PROVIDERS = ["vercel", "fal", "openrouter"] as const;

export type ImagesRoutesDeps = {
  secrets: SecretsStore;
};

export function registerImagesRoutes(app: Hono, deps: ImagesRoutesDeps) {
  const { secrets } = deps;

  app.post("/images/generate", async (c) => {
    const r = await body(c, {
      model_id: v.string,
      prompt: v.string,
      provider: v.optional(v.oneOf(IMAGE_PROVIDERS)),
      width: v.optional(v.number),
      height: v.optional(v.number),
      aspect_ratio: v.optional(v.string),
      n: v.optional(v.number),
      seed: v.optional(v.number),
      quality: v.optional(v.string),
    });
    if (!r.ok) return r.res;
    const {
      model_id,
      prompt,
      provider,
      width,
      height,
      aspect_ratio,
      n,
      seed,
      quality,
    } = r.data;

    let resolved;
    try {
      resolved = await resolveImageModel(
        { secrets },
        model_id,
        provider ? { explicit: provider } : {}
      );
    } catch (e) {
      if (e instanceof ImageModelUnavailableError) {
        return c.json({ error: e.message, model_id: e.model_id }, 400);
      }
      throw e;
    }

    const size =
      width && height
        ? (`${Math.round(width)}x${Math.round(height)}` as `${number}x${number}`)
        : undefined;

    // Quality is forwarded as a provider-option keyed by the resolved provider.
    // The OpenRouter/fal adapters spread their provider-option bag into the
    // upstream request body, so `{ quality }` reaches the provider that supports
    // it; others ignore it. NB: keyed by provider, never `grida` (no billing).
    const providerOptions =
      quality && quality !== "auto"
        ? { [resolved.provider_id]: { quality } }
        : undefined;

    let generation;
    try {
      generation = await generateImage({
        model: resolved.model,
        prompt,
        n: n ?? 1,
        ...(size ? { size } : {}),
        ...(aspect_ratio
          ? { aspectRatio: aspect_ratio as `${number}:${number}` }
          : {}),
        ...(seed !== undefined ? { seed } : {}),
        ...(providerOptions ? { providerOptions } : {}),
      });
    } catch (e) {
      // Keep the raw upstream body (AI SDK APICallError.responseBody) in the
      // sidecar log ONLY — never echo provider diagnostics / prompt content back
      // across the bridge to the renderer.
      const detail = e instanceof Error ? e.message : String(e);
      const upstreamBody = (e as { responseBody?: unknown })?.responseBody;
      const message = `image generation failed: ${detail}`;
      console.error(
        `[agent-host-images] failed provider=${resolved.provider_id} model=${model_id}: ${message}${
          upstreamBody ? ` — ${String(upstreamBody).slice(0, 300)}` : ""
        }`
      );
      return c.json(
        { error: message, model_id, provider_id: resolved.provider_id },
        502
      );
    }

    return c.json({
      model_id: resolved.model_id,
      provider_id: resolved.provider_id,
      images: generation.images.map((f) => ({
        base64: f.base64,
        media_type: f.mediaType,
      })),
    });
  });
}
