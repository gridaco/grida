/**
 * Editor-side AI provider seam — `GRIDA-SEC-003` carve-out.
 *
 * Owns the attributed AI Gateway provider ({@link gateway}) and the
 * BYOK branch ({@link byok}). All catalogue data (text-model specs,
 * tier→spec map, lookup helpers) lives in `@grida/ai-models` under
 * its `models.text.*` namespace and is re-exported here under its
 * original editor-side names so existing call sites keep working
 * unchanged.
 *
 * ## Updating models
 *
 * To bump a tier or add a model, edit `packages/grida-ai-models/src/`
 * directly. Context window, output limits, and cost are sourced from
 * models.dev (`python .tools/model_info.py <model_id>`).
 *
 * @module
 */

import { createGateway } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import _catalog, { TIER_MODEL_IDS } from "@grida/ai-models";

// ---------------------------------------------------------------------------
// Catalogue re-exports — keep the original editor-side names.
// ---------------------------------------------------------------------------

export type { ModelTier } from "@grida/ai-models";

export type ModelCostPerMillion = _catalog.text.ModelCostPerMillion;
export type ModelSpec = _catalog.text.ModelSpec;
export type CatalogId = _catalog.text.CatalogId;

export const catalog = _catalog.text.catalog;
export const modelSpecById = _catalog.text.modelSpecById;

/**
 * Read-only map of tier → model spec, sourced from
 * `@grida/ai-models`'s `models.text.byTier`. Same shape as before the
 * catalogue move so consumers can keep `import { models } from
 * "@/lib/ai/models"` and read `models[tier]`.
 */
export const models = _catalog.text.byTier;

/**
 * Read-only map of tier → catalog model ID. Alias of `TIER_MODEL_IDS`
 * from `@grida/ai-models`; the editor-side name stays `tiers` for
 * backwards compatibility.
 */
export const tiers = TIER_MODEL_IDS;

// ---------------------------------------------------------------------------
// AI Gateway instance — with app attribution headers
//
// @see https://vercel.com/docs/ai-gateway/ecosystem/app-attribution
// ---------------------------------------------------------------------------

/**
 * Vercel AI Gateway app-attribution headers — lowercase per the `ai`
 * SDK convention. Shared by the billed `gateway` and the BYOK
 * AI-Gateway branch. (OpenRouter uses its own `HTTP-Referer`/`X-Title`
 * casing — see `resolveByokProvider`.)
 */
const GATEWAY_ATTRIBUTION_HEADERS = {
  "http-referer": "https://grida.co",
  "x-title": "Grida",
} as const;

/**
 * Attributed AI Gateway instance.
 *
 * **Internal — seam consumers only.** This is the raw Vercel AI Gateway
 * provider; it does NOT go through the billing seam. Any code outside
 * `editor/lib/ai/_seam/**` should import `grida` from
 * [editor/lib/ai/server.ts](./server.ts) instead, which wraps every model
 * with gate + ingest middleware.
 *
 * Lint blocks direct imports of this export from non-seam files (see
 * [editor/.oxlintrc.jsonc](../../.oxlintrc.jsonc)).
 */
export const gateway = createGateway({
  headers: GATEWAY_ATTRIBUTION_HEADERS,
});

// ---------------------------------------------------------------------------
// BYOK layer — GRIDA-SEC-003 carve-out (see /SECURITY.md).
//
// **Internal — seam consumers only.** `byok` holds a live provider API
// key; like `gateway`, consume only from `lib/ai/server.ts`. (No lint
// rule enforces this for the named export — `.oxlintrc.jsonc` restricts
// SDK *packages*, not `gateway`/`byok` imports — convention only,
// mirroring `gateway`.)
//
// When a contributor sets a BYOK key, calls route through a BARE
// provider that bypasses the billing seam entirely (no gate, no
// Metronome ingest, no balance). The key is charged by the upstream
// provider directly — no Grida balance to meter/drain. BYOK bypasses
// billing ONLY, never auth (requireOrganizationId still runs). Gated
// solely by server-only env vars NEVER set in the hosted product (same
// trust model as OPENAI_API_KEY / REPLICATE_API_TOKEN). Fail-closed:
// active only when a key env var is a non-empty string after trim
// (whitespace-only secrets fall back to the billed path).
//
// Implementations (precedence: OpenRouter first, then Vercel). A
// third BYOK key is a new branch here — no registry.
// ---------------------------------------------------------------------------
function resolveByokProvider() {
  const openrouterKey = process.env.BYOK_OPENROUTER_API_KEY?.trim();
  if (openrouterKey) {
    return createOpenAICompatible({
      name: "openrouter",
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: openrouterKey,
      headers: { "HTTP-Referer": "https://grida.co", "X-Title": "Grida" },
    });
  }
  const aiGatewayKey = process.env.BYOK_AI_GATEWAY_API_KEY?.trim();
  if (aiGatewayKey) {
    return createGateway({
      apiKey: aiGatewayKey,
      headers: GATEWAY_ATTRIBUTION_HEADERS,
    });
  }
  return null;
}

/** The active BYOK provider, or `null` when no BYOK key is set. */
export const byok = resolveByokProvider();

/** True when the BYOK layer is active (billing layer is bypassed). */
export function isByokActive(): boolean {
  return byok !== null;
}

// `model(tier)` lives in `editor/lib/ai/server.ts` so the seam owns the
// public surface. Importing `model` from `@/lib/ai/models` is no longer
// supported.
