// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: gateway — see docs/wg/platform/hosted-ai.md
// GRIDA-EE: billing — see ee-billing
/**
 * `POST /api/v1/ai/images/generations` — hosted image generation for
 * the desktop sidecar. Grida-native wire (the agent package's
 * `ImageGenerateRequest`/`ImageGenerateResult` protocol — NOT OpenAI's
 * images API, despite the OpenAI-style path; the sidecar's BYOK image
 * adapters already speak these shapes). Text-to-image only in v1 (the
 * protocol carries no reference images; the sidecar resolver routes
 * i2i to BYOK providers).
 *
 * Auth: scoped AI token only (GRIDA-SEC-006). Billing: pre-priced via
 * the shared `computeImageCostMills` and threaded through the seam's
 * image middleware (`providerOptions.grida.costMills`). NO library
 * upload — the daemon owns persistence.
 */
import { generateImage } from "ai";
import { z } from "zod";
import type { ImageGenerateResult } from "@grida/agent";
import { verifyGgToken } from "@/lib/auth/gg-token";
import ai from "@/lib/ai";
import { computeImageCostMills } from "@/lib/ai/image-cost";
import { methods } from "@/lib/ai/server";
import {
  fromUnknownError,
  modelNotFound,
  parseJsonRequest,
  rateLimited,
} from "@/lib/ai/openai-compat/errors";
import { allowAiRequest } from "@/lib/ai/openai-compat/limits";

export const maxDuration = 120;

const NO_STORE = { "cache-control": "no-store" } as const;

const requestSchema = z.looseObject({
  model_id: z.string().min(1),
  prompt: z.string().min(1),
  width: z.number().int().positive().nullish(),
  height: z.number().int().positive().nullish(),
  aspect_ratio: z.string().nullish(),
  n: z.number().int().min(1).max(4).nullish(),
  seed: z.number().int().nullish(),
  quality: z.string().nullish(),
});

export async function POST(request: Request) {
  try {
    const claims = await verifyGgToken(request);
    const rl = await allowAiRequest("images", claims.sub);
    if (!rl.success) return rateLimited(rl.retryAfterSeconds);

    const p = await parseJsonRequest(request, requestSchema);
    if (!p.ok) return p.res;
    const req = p.data;

    const card = ai.image.findImageModelCard(req.model_id);
    if (!card) return modelNotFound(req.model_id);
    // Hosted serving goes through the gateway — a card without a
    // vercel binding is not servable here (the sidecar's BYOK
    // adapters cover the rest).
    if (!ai.image.binding(card, "vercel")) return modelNotFound(req.model_id);

    const resolved = methods.getSDKImageModel(card.id);
    if (!resolved) return modelNotFound(req.model_id);

    const n = req.n ?? 1;
    const costMills = computeImageCostMills(card, {
      n,
      width: req.width ?? undefined,
      height: req.height ?? undefined,
      quality: req.quality ?? undefined,
    });

    const size =
      req.width && req.height
        ? (`${req.width}x${req.height}` as `${number}x${number}`)
        : undefined;

    // Forward the requested quality tier to the ORIGIN provider so the
    // tier we just billed (`computeImageCostMills`) is the tier actually
    // delivered — otherwise a `per_image_tiered` card (e.g. gpt-image-*)
    // charges "high" while the provider renders its default. The Vercel
    // AI Gateway keys providerOptions by origin provider (`openai` for
    // `openai/gpt-image-2`).
    const slash = card.id.indexOf("/");
    const originProvider = slash > 0 ? card.id.slice(0, slash) : undefined;
    const quality =
      req.quality && req.quality !== "auto" ? req.quality : undefined;

    const generation = await generateImage({
      model: resolved.model,
      prompt: req.prompt,
      n,
      size,
      aspectRatio: req.aspect_ratio as `${number}:${number}` | undefined,
      seed: req.seed ?? undefined,
      providerOptions: {
        grida: {
          organizationId: claims.org,
          feature: "v1/ai/images",
          costMills,
        },
        ...(originProvider && quality ? { [originProvider]: { quality } } : {}),
      },
    });

    const result: ImageGenerateResult = {
      model_id: card.id,
      provider_id: "vercel",
      images: generation.images.map((file) => ({
        base64: file.base64,
        media_type: file.mediaType,
      })),
    };
    return Response.json(result, { headers: NO_STORE });
  } catch (err) {
    return fromUnknownError(err, "v1/ai/images");
  }
}
