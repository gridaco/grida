// GRIDA-GG: provider — see docs/wg/platform/hosted-ai.md
/**
 * GRIDA-SEC-006 — the `grida` hosted ("included") text-model factory.
 *
 * Grida Cloud is just another OpenAI-compatible provider from the
 * agent's point of view: `{EDITOR_BASE}/api/v1/ai` speaks the chat-
 * completions wire, gated and metered server-side against the org's AI
 * credits. What differs from BYOK is the credential: a short-lived
 * scoped JWT read from the {@link GridaGatewaySessionStore} AT REQUEST
 * TIME (a custom fetch), not a static key — agent turns can outlive the
 * 15-minute token, and every step must ride the freshest token the
 * renderer has pushed.
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ModelFactory } from "../agent";
import type { GgTokenSource } from "@grida/ai";
import { ProviderHttp } from "./http";
import { BUNDLED_TIER_MODEL_IDS, type TierModelIds } from "./byok";

// Shared scoped-token semantics belong to the AI producer; tiers stay agent-owned.
import {
  readGgToken,
  throwOnGgHttpError,
  gridaGatewayApiBase,
} from "@grida/ai/providers";
export {
  GridaGatewayAuthError,
  GridaGatewayCreditsError,
  readGgToken,
  throwOnGgHttpError,
  gridaGatewayApiBase,
} from "@grida/ai/providers";

export function makeGridaGatewayFactory(
  session: GgTokenSource,
  baseUrl: string,
  providerHttp: ProviderHttp = new ProviderHttp(),
  tierModelIds: TierModelIds = BUNDLED_TIER_MODEL_IDS
): ModelFactory {
  const provider = createOpenAICompatible({
    name: "gg",
    baseURL: gridaGatewayApiBase(baseUrl),
    // Same load-bearing flag as the BYOK factories: without the usage
    // chunk every streamed run records zero tokens.
    includeUsage: true,
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("authorization", `Bearer ${readGgToken(session)}`);
      const response = await providerHttp.request(input, { ...init, headers });
      // 401/402 → typed errors; everything else passes through to the SDK's
      // own handling (already downgraded before reaching the renderer).
      await throwOnGgHttpError(response);
      return response;
    }) as typeof fetch,
  });
  // Catalog ids ARE the hosted call ids (the server allowlist is the
  // same catalog) — explicit picks hand straight through, tiers resolve
  // via the canonical table. Deliberately NOT the endpoint factory's
  // collapse-to-default: Grida Cloud serves the catalog.
  return (tier, modelId) => provider(modelId ?? tierModelIds()[tier]);
}
