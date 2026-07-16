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
import { TIER_MODEL_IDS, type TierModelId } from "@grida/ai-models";
import type { ModelFactory } from "../agent";
import type { ModelTier } from "../tiers";
import type { GridaGatewaySessionStore } from "./gg-session";
import { ProviderHttp } from "./http";

const MODEL_BY_TIER: Record<ModelTier, TierModelId> = TIER_MODEL_IDS;

/**
 * The hosted session is missing or expired. The literal code LEADS the
 * message: mid-run errors cross Electron's `contextBridge`, which strips
 * custom props — the renderer detects by message substring (the
 * `isWriteConflict` idiom).
 */
export class GridaGatewayAuthError extends Error {
  readonly code = "gg_token_expired" as const;
  constructor() {
    super("gg_token_expired: the Grida session token is missing or expired");
    this.name = "GridaGatewayAuthError";
  }
}

/** The org's AI credit balance can't cover the call (server 402). */
export class GridaGatewayCreditsError extends Error {
  readonly code = "insufficient_credits" as const;
  constructor() {
    super(
      "insufficient_credits: the organization's AI credit balance is too low"
    );
    this.name = "GridaGatewayCreditsError";
  }
}

/** `<base>/api/v1/ai` — `@ai-sdk/openai-compatible` appends the paths. */
export function gridaGatewayApiBase(baseUrl: string): string {
  return new URL("/api/v1/ai", baseUrl).toString();
}

/** The live scoped token, or throw the typed auth error (never a bare null). */
export function readGgToken(session: GridaGatewaySessionStore): string {
  const token = session.getAccessToken();
  if (!token) throw new GridaGatewayAuthError();
  return token;
}

/**
 * Map the two actionable hosted-response failures to typed, model-safe
 * errors — the single source for this contract, shared by the text factory
 * and the media adapters. Every other status is left to the caller. Never
 * embed upstream body text (GRIDA-SEC-004 posture). Drains the unconsumed
 * body before throwing so undici can return the socket to the pool
 * (unconsumed bodies pin the connection).
 */
export async function throwOnGgHttpError(res: Response): Promise<void> {
  if (res.status === 401 || res.status === 402) {
    await res.body?.cancel().catch(() => {});
    if (res.status === 401) throw new GridaGatewayAuthError();
    throw new GridaGatewayCreditsError();
  }
}

export function makeGridaGatewayFactory(
  session: GridaGatewaySessionStore,
  baseUrl: string,
  providerHttp: ProviderHttp = new ProviderHttp()
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
  return (tier, modelId) => provider(modelId ?? MODEL_BY_TIER[tier]);
}
