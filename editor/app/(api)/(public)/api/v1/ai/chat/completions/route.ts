// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: gateway — see docs/wg/platform/hosted-ai.md
// GRIDA-EE: billing — see ee-billing
/**
 * `POST /api/v1/ai/chat/completions` — OpenAI chat-completions wire over
 * the billed Grida model seam. The desktop sidecar's `grida` provider
 * (`@ai-sdk/openai-compatible`, `baseURL = <origin>/api/v1/ai`) is the
 * primary consumer.
 *
 * Auth: the scoped AI token ONLY (`verifyGgToken` — never Supabase
 * tokens, never cookies; GRIDA-SEC-006). Org context comes from the
 * token claim (membership was verified at mint).
 *
 * Billing: entirely the seam's — `grida.languageModel()` carries the
 * billing middleware (`lib/ai/server.ts`), so the entitlement gate runs
 * BEFORE the upstream opens (a 402 is always a clean pre-stream JSON
 * response, never a mid-stream corpse) and usage is ingested on the
 * finish part. One request per agent step ⇒ per-request gating IS
 * step-level gating (Q-AI-2 resolved for desktop by construction).
 *
 * BYOK interplay (GRIDA-SEC-003): with a `BYOK_*` env set (contributor
 * dev), the language provider is the bare BYOK provider — calls here
 * are authenticated but unbilled, exactly like every other text
 * surface under that carve-out.
 */
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { verifyGgToken } from "@/lib/auth/gg-token";
import { grida, gridaProviderOptions } from "@/lib/ai/server";
import {
  decodeRequest,
  encodeCompletion,
  streamEncoder,
} from "@/lib/ai/openai-compat/codec";
import {
  fromUnknownError,
  modelNotFound,
  parseJsonRequest,
  rateLimited,
} from "@/lib/ai/openai-compat/errors";
import { isHostedTextModel } from "@/lib/ai/openai-compat/hosted-models";
import { allowAiRequest } from "@/lib/ai/openai-compat/limits";
import { chatCompletionRequestSchema } from "@/lib/ai/openai-compat/wire";

export const maxDuration = 300;

const NO_STORE = { "cache-control": "no-store" } as const;

export async function POST(request: Request) {
  try {
    const claims = await verifyGgToken(request);

    const rl = await allowAiRequest("chat", claims.sub);
    if (!rl.success) return rateLimited(rl.retryAfterSeconds);

    const p = await parseJsonRequest(request, chatCompletionRequestSchema);
    if (!p.ok) return p.res;
    const req = p.data;

    // Allowlist BEFORE any provider call — the gateway accepts arbitrary
    // ids; an unlisted one must 404 here, not 500 at cost-card lookup.
    if (!isHostedTextModel(req.model)) return modelNotFound(req.model);

    const decoded = decodeRequest(req);
    const model = grida.languageModel(req.model) as LanguageModelV3;
    const callOptions = {
      ...decoded.callOptions,
      providerOptions: gridaProviderOptions({
        organizationId: claims.org,
        feature: "v1/ai/chat",
        awaitIngest: false,
      }),
    };

    if (!decoded.stream) {
      const result = await model.doGenerate(callOptions);
      return Response.json(encodeCompletion(req.model, result), {
        headers: NO_STORE,
      });
    }

    // The gate awaits inside doStream (middleware) — a blocked org
    // throws here, before any SSE bytes are written.
    const { stream } = await model.doStream(callOptions);
    return new Response(
      stream.pipeThrough(
        streamEncoder(req.model, { includeUsage: decoded.includeUsage })
      ),
      {
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-store",
          "x-accel-buffering": "no",
        },
      }
    );
  } catch (err) {
    return fromUnknownError(err, "v1/ai/chat");
  }
}
