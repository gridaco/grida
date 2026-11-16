// GRIDA-SEC-006 / GRIDA-GG: gateway — authenticated native chat and explicit cost-ceiling admission.
import "server-only";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { verifyGgToken } from "@/lib/auth/gg-token";
import { gatewayChatRequestId } from "@/lib/ai/gateway-product";
import { GatewaySpending } from "@/lib/ai/gateway-spending";
import { grida, gridaProviderOptions } from "@/lib/ai/server";
import {
  decodeRequest,
  encodeCompletion,
  streamEncoder,
} from "@/lib/ai/openai-compat/codec";
import {
  fromUnknownError,
  invalidRequest,
  modelNotFound,
  parseJsonRequest,
  rateLimited,
} from "@/lib/ai/openai-compat/errors";
import { isHostedTextModel } from "@/lib/ai/openai-compat/hosted-models";
import { allowAiRequest } from "@/lib/ai/openai-compat/limits";
import { chatCompletionRequestSchema } from "@/lib/ai/openai-compat/wire";

export namespace NativeChatRoute {
  export function ordinary(request: Request): Promise<Response> {
    return complete(request, false);
  }
  export function capped(request: Request): Promise<Response> {
    return complete(request, true);
  }
}

const NO_STORE = { "cache-control": "no-store" } as const;

async function complete(request: Request, capped: boolean) {
  try {
    const claims = await verifyGgToken(request);
    const maxCostMills = capped
      ? request.headers.get("x-gg-max-cost-mills")
      : undefined;
    if (capped && !GatewaySpending.amount(maxCostMills))
      return invalidRequest("A valid exact USD-mills ceiling is required.");

    const rl = await allowAiRequest("chat", claims.sub);
    if (!rl.success) return rateLimited(rl.retryAfterSeconds);

    const p = await parseJsonRequest(request, chatCompletionRequestSchema);
    if (!p.ok) return p.res;
    const req = p.data;

    // Preserve the product model allowlist before GG dispatch. Unlisted IDs
    // return the native model-not-found response without a paid submission.
    if (!(await isHostedTextModel(req.model))) return modelNotFound(req.model);

    const decoded = decodeRequest(req);
    const model = grida.languageModel(req.model) as LanguageModelV3;
    if (capped && (!decoded.stream || model.provider !== "gg"))
      return invalidRequest(
        "Spending ceilings require streaming Gateway execution."
      );
    const nativeChatBilling =
      decoded.stream &&
      model.provider === "gg" &&
      request.headers.get("x-grida-billing-receipt") === "1";
    const callOptions = {
      ...decoded.callOptions,
      ...(nativeChatBilling && { abortSignal: request.signal }),
      providerOptions: gridaProviderOptions({
        organizationId: claims.org,
        feature: "v1/ai/chat",
        awaitIngest: false,
        ...(nativeChatBilling && { nativeChatBillingReceipt: true }),
        ...(capped && { maxCostMills: maxCostMills! }),
      }),
    };

    if (!decoded.stream) {
      const result = await model.doGenerate(callOptions);
      return Response.json(encodeCompletion(req.model, result), {
        headers: NO_STORE,
      });
    }

    // GG admission completes inside doStream before any SSE bytes are written.
    // A blocked organization still receives the native error response.
    const { stream, response } = await model.doStream(callOptions);
    const gatewayRequestId = nativeChatBilling
      ? gatewayChatRequestId(new Headers(response?.headers).get("x-request-id"))
      : undefined;
    return new Response(
      stream.pipeThrough(
        streamEncoder(req.model, {
          includeUsage: decoded.includeUsage,
          gatewayRequestId,
        })
      ),
      {
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-store",
          "x-accel-buffering": "no",
          ...(gatewayRequestId && { "x-request-id": gatewayRequestId }),
        },
      }
    );
  } catch (err) {
    return fromUnknownError(err, "v1/ai/chat");
  }
}
