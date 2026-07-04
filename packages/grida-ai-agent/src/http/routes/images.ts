// GRIDA-GG: provider — the `gg` hosted image arm (docs/wg/platform/hosted-ai.md)
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
 * Billing contract (#908, Phase 4 + GRIDA-SEC-006): the BYOK arms NEVER
 * enter the web Grida-billed image seam (`editor/lib/ai/server.ts`) — the
 * user's own key pays the provider directly, no Grida credit is metered,
 * and this sidecar route never sets the WEB seam's billing trigger. The
 * `grida` HOSTED arm is not a billing leak: its billing happens
 * server-side at the hosted endpoint (Bearer session token; the seam
 * gates + meters there), never in this process.
 */

import type { Hono } from "hono";
import { generateImage } from "ai";
import type { SecretsStore } from "@grida/daemon/server";
import {
  ImageModelUnavailableError,
  resolveImageModel,
} from "../../providers/resolve-image";
import { hostedGenerationError } from "./gg-media-errors";
import { body, v } from "@grida/daemon/server";

const IMAGE_PROVIDERS = ["vercel", "fal", "openrouter", "gg"] as const;

export type ImagesRoutesDeps = {
  secrets: SecretsStore;
  /** GRIDA-SEC-006 — hosted provider deps; absent ⇒ grida never resolves. */
  gg?: import("../../providers/gg-session").GridaGatewaySessionStore;
  gg_base_url?: string;
};

export function registerImagesRoutes(app: Hono, deps: ImagesRoutesDeps) {
  const { secrets, gg, gg_base_url } = deps;

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
        { secrets, gg, gg_base_url },
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
      return hostedGenerationError(c, {
        error: e,
        scope: "agent-host-images",
        label: "image generation failed",
        model_id,
        provider_id: resolved.provider_id,
      });
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
