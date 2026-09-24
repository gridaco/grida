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
 * Auth: scoped AI token only (GRIDA-SEC-006). Billing: hosted media policy selects fal by default with actual request receipts,
 * or a Vercel control-compatibility exception. NO library
 * upload — the daemon owns persistence.
 */
import { z } from "zod";
import { verifyGgToken } from "@/lib/auth/gg-token";
import ai from "@/lib/ai";
import { methods } from "@/lib/ai/server";
import {
  fromUnknownError,
  modelNotFound,
  parseJsonRequest,
  rateLimited,
} from "@/lib/ai/openai-compat/errors";
import { allowAiRequest } from "@/lib/ai/openai-compat/limits";

// Complex image requests can take two minutes before auth/billing overhead.
// Keep headroom within Vercel Fluid Compute's all-plan 300-second limit.
export const maxDuration = 300;

const NO_STORE = { "cache-control": "no-store" } as const;

const requestSchema = z.looseObject({
  model_id: z.string().min(1),
  prompt: z.string().min(1),
  width: z.number().int().positive().nullish(),
  height: z.number().int().positive().nullish(),
  // Reject malformed ratios at the boundary — a bad value otherwise reaches
  // the provider and comes back as an SDK warning + a fallback-rendered 200.
  aspect_ratio: z
    .string()
    .regex(/^\d+:\d+$/, 'aspect_ratio must be "<w>:<h>"')
    .nullish(),
  n: z.number().int().min(1).max(4).nullish(),
  seed: z.number().int().nullish(),
  quality: z.string().nullish(),
  background: z.enum(["auto", "opaque", "transparent"]).optional(),
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
    if (!card || !ai.image.hostedBinding(card))
      return modelNotFound(req.model_id);
    const result = await methods.generateImage(claims.org, {
      model_id: card.id,
      prompt: req.prompt,
      width: req.width ?? undefined,
      height: req.height ?? undefined,
      aspect_ratio: req.aspect_ratio ?? undefined,
      n: req.n ?? undefined,
      seed: req.seed ?? undefined,
      quality: req.quality ?? undefined,
      background: req.background,
    });
    return Response.json(result, { headers: NO_STORE });
  } catch (err) {
    return fromUnknownError(err, "v1/ai/images");
  }
}
