/**
 * Centralized text/chat model definitions for the Grida editor.
 *
 * ## Design
 *
 * Models are organized by **tier** (nano → mini → pro → max) instead of being
 * configured via environment variables.  This makes model selection:
 * - trackable in version control,
 * - mixable per feature (e.g. "nano" for title generation, "pro" for the main
 *   agent), and
 * - auditable in code review when bumping models.
 *
 * All model IDs use the Vercel AI Gateway `creator/model-name` format so they
 * work with `gateway()` from the `ai` package.  When running locally without
 * the gateway you can swap in a direct provider (e.g. `openai()`) — the IDs
 * are still plain model strings.
 *
 * ## Updating models
 *
 * To bump a model, change the `id` in the corresponding tier entry and open a
 * PR.  The tier descriptions and `multimodal` flags document the contract each
 * consumer relies on.
 *
 * Context window, output limits, and cost are sourced from models.dev
 * (`python .tools/model_info.py <model_id>`).  Update them when bumping model
 * IDs.
 *
 * @module
 */

import { createGateway } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// ---------------------------------------------------------------------------
// Tier definitions
// ---------------------------------------------------------------------------

/**
 * Model tier — determines capability and cost bracket.
 *
 * | Tier   | Audience            | Typical use                                    |
 * |--------|---------------------|------------------------------------------------|
 * | `nano` | free users / misc   | title gen, summarise, lightweight extraction   |
 * | `mini` | free users          | main agent, sub-agent, multimodal required     |
 * | `pro`  | paid users only     | main agent, multimodal required                |
 * | `max`  | paid users only     | main agent, heaviest tasks, multimodal required|
 */
export type ModelTier = "nano" | "mini" | "pro" | "max";

/**
 * Cost per 1M tokens in USD.
 *
 * Values from models.dev — represent direct provider pricing (not reseller
 * markup).
 */
export interface ModelCostPerMillion {
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
  /** USD per 1M cached input tokens (read). `undefined` if not supported. */
  cacheRead?: number;
  /** USD per 1M cached input tokens (write). `undefined` if not supported. */
  cacheWrite?: number;
}

export interface ModelSpec {
  /** Vercel AI Gateway model ID (`creator/model-name`). */
  id: string;
  /** Human-readable label for UI / logs. */
  label: string;
  /** Whether the model accepts image/file inputs. */
  multimodal: boolean;
  /** Maximum context window in tokens (input + output combined). */
  contextWindow: number;
  /** Maximum output tokens per response. */
  outputLimit: number;
  /** Cost per 1M tokens in USD. */
  cost: ModelCostPerMillion;
}

// ---------------------------------------------------------------------------
// Catalog — every model the editor knows about
//
// Single source of truth. Tiered models (see `tierAssignments` below) are
// included in the free budget; everything else is opt-in and billed as
// metered at the provider's published per-token rates.
//
// All values from https://models.dev/api.json
// To look up: python .tools/model_info.py <model_id>
// ---------------------------------------------------------------------------

const catalogSpecs = {
  "openai/gpt-5.4-nano": {
    id: "openai/gpt-5.4-nano",
    label: "GPT-5.4 Nano",
    multimodal: true,
    contextWindow: 400_000,
    outputLimit: 128_000,
    cost: { input: 0.2, output: 1.25, cacheRead: 0.02 },
  },
  "openai/gpt-5.4-mini": {
    id: "openai/gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    multimodal: true,
    contextWindow: 400_000,
    outputLimit: 128_000,
    cost: { input: 0.75, output: 4.5, cacheRead: 0.075 },
  },
  "openai/gpt-5.5": {
    id: "openai/gpt-5.5",
    label: "GPT-5.5",
    multimodal: true,
    contextWindow: 1_050_000,
    outputLimit: 128_000,
    cost: { input: 5, output: 30, cacheRead: 0.5 },
  },
  "openai/gpt-5.5-pro": {
    id: "openai/gpt-5.5-pro",
    label: "GPT-5.5 Pro",
    multimodal: true,
    contextWindow: 1_050_000,
    outputLimit: 128_000,
    cost: { input: 30, output: 180 },
  },
  "anthropic/claude-sonnet-4.6": {
    id: "anthropic/claude-sonnet-4.6",
    label: "Claude Sonnet 4.6",
    multimodal: true,
    contextWindow: 1_000_000,
    outputLimit: 128_000,
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  },
  "anthropic/claude-opus-4.7": {
    id: "anthropic/claude-opus-4.7",
    label: "Claude Opus 4.7",
    multimodal: true,
    contextWindow: 1_000_000,
    outputLimit: 128_000,
    cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  },
} as const satisfies Record<string, ModelSpec>;

export type CatalogId = keyof typeof catalogSpecs;

// ---------------------------------------------------------------------------
// Tier assignments — which catalog entry powers each tier
//
// Edit here when bumping a tier to a different catalog model.
// ---------------------------------------------------------------------------

const tierAssignments = {
  nano: "openai/gpt-5.4-nano",
  mini: "openai/gpt-5.4-mini",
  pro: "anthropic/claude-sonnet-4.6",
  max: "anthropic/claude-opus-4.7",
} as const satisfies Record<ModelTier, CatalogId>;

const specs: Record<ModelTier, ModelSpec> = {
  nano: catalogSpecs[tierAssignments.nano],
  mini: catalogSpecs[tierAssignments.mini],
  pro: catalogSpecs[tierAssignments.pro],
  max: catalogSpecs[tierAssignments.max],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Read-only map of tier → model spec (resolved from the catalog). */
export const models: Record<ModelTier, ModelSpec> = specs;

/** Read-only map of catalog model ID → spec. Includes tier and metered models. */
export const catalog: Record<CatalogId, ModelSpec> = catalogSpecs;

/** Read-only map of tier → catalog model ID. */
export const tiers: Record<ModelTier, CatalogId> = tierAssignments;

/**
 * Returns the tier (if any) that currently uses the given catalog model.
 * `undefined` for metered-only models.
 */
export function tierOf(catalogId: CatalogId): ModelTier | undefined {
  for (const [tier, id] of Object.entries(tierAssignments) as [
    ModelTier,
    CatalogId,
  ][]) {
    if (id === catalogId) return tier;
  }
  return undefined;
}

/**
 * Look up a model spec by model ID.
 *
 * Accepts:
 * - Full gateway format: `"openai/gpt-5-mini"` (exact match)
 * - Bare provider ID: `"gpt-5-mini"` (matches `openai/gpt-5-mini`)
 * - Date-suffixed ID: `"gpt-5-mini-2025-08-07"` (providers often append a
 *   snapshot date to the model ID in their API responses)
 */
export function modelSpecById(modelId: string): ModelSpec | undefined {
  for (const spec of Object.values(catalogSpecs)) {
    // Exact match (gateway format)
    if (spec.id === modelId) return spec;

    // Extract the base model name from the spec (strip provider prefix)
    const baseName = spec.id.includes("/")
      ? spec.id.split("/").slice(1).join("/")
      : spec.id;

    // Bare ID match, or date-suffixed match (e.g. "gpt-5-mini-2025-08-07"
    // starts with "gpt-5-mini" and the next char is "-" followed by digits)
    if (modelId === baseName) return spec;
    if (
      modelId.startsWith(baseName) &&
      /^-\d/.test(modelId.slice(baseName.length))
    ) {
      return spec;
    }
  }
  return undefined;
}

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
// Implementations (precedence: OpenRouter first, then AI Gateway). A
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
