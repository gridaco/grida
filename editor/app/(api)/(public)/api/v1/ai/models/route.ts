// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: gateway — see docs/wg/platform/hosted-ai.md
// GRIDA-EE: billing — see ee-billing
/**
 * `GET /api/v1/ai/models` — the hosted-model allowlist, OpenAI list
 * shape with a `grida` extension (`modality`, `tier`, `label`,
 * `deprecated`). Same auth as every `/api/v1/ai/*` route: the scoped
 * AI token only. No pricing in the payload (billing-page concern).
 */
import { verifyGgToken } from "@/lib/auth/gg-token";
import { fromUnknownError, rateLimited } from "@/lib/ai/openai-compat/errors";
import { hostedModelList } from "@/lib/ai/openai-compat/hosted-models";
import { allowAiRequest } from "@/lib/ai/openai-compat/limits";

const NO_STORE = { "cache-control": "no-store" } as const;

export async function GET(request: Request) {
  try {
    const claims = await verifyGgToken(request);
    const rl = await allowAiRequest("models", claims.sub);
    if (!rl.success) return rateLimited(rl.retryAfterSeconds);

    return Response.json(
      { object: "list", data: hostedModelList() },
      { headers: NO_STORE }
    );
  } catch (err) {
    return fromUnknownError(err, "v1/ai/models");
  }
}
