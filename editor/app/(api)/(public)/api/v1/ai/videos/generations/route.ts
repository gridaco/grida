// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: gateway — see docs/wg/platform/hosted-ai.md
// GRIDA-EE: billing — see ee-billing
/**
 * `POST /api/v1/ai/videos/generations` — hosted video generation for
 * the desktop sidecar. Grida-native wire (`VideoGenerateRequest` /
 * `VideoGenerateResult`; base64 bytes per the v1 contract — never
 * URLs). All validation, pricing, and the gate → generate → ingest
 * envelope live in the seam's `methods.generateVideo`.
 *
 * Sync request/response — Veo-class latency runs minutes, hence the
 * large `maxDuration`. If the deployment plan caps below this,
 * restrict the video allowlist before shipping (plan risk item).
 */
import { z } from "zod";
import { verifyGgToken } from "@/lib/auth/gg-token";
import { methods } from "@/lib/ai/server";
import {
  fromUnknownError,
  parseJsonRequest,
  rateLimited,
} from "@/lib/ai/openai-compat/errors";
import { allowAiRequest } from "@/lib/ai/openai-compat/limits";

export const maxDuration = 600;

const NO_STORE = { "cache-control": "no-store" } as const;

const requestSchema = z.looseObject({
  model_id: z.string().min(1),
  prompt: z.string().min(1),
  aspect_ratio: z.string().nullish(),
  resolution: z.string().nullish(),
  duration: z.number().positive().nullish(),
  fps: z.number().int().positive().nullish(),
  seed: z.number().int().nullish(),
  image_url: z.string().nullish(),
});

export async function POST(request: Request) {
  try {
    const claims = await verifyGgToken(request);
    const rl = await allowAiRequest("video", claims.sub);
    if (!rl.success) return rateLimited(rl.retryAfterSeconds);

    const p = await parseJsonRequest(request, requestSchema);
    if (!p.ok) return p.res;
    const req = p.data;

    const result = await methods.generateVideo(claims.org, {
      model_id: req.model_id,
      prompt: req.prompt,
      aspect_ratio: req.aspect_ratio ?? undefined,
      resolution: req.resolution ?? undefined,
      duration: req.duration ?? undefined,
      fps: req.fps ?? undefined,
      seed: req.seed ?? undefined,
      image_url: req.image_url ?? undefined,
    });
    return Response.json(result, { headers: NO_STORE });
  } catch (err) {
    return fromUnknownError(err, "v1/ai/videos");
  }
}
