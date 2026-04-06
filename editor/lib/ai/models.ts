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
// Current model assignments — edit here when bumping models
//
// All values from https://models.dev/api.json
// To look up: python .tools/model_info.py <model_id>
// ---------------------------------------------------------------------------

const specs = {
  nano: {
    id: "openai/gpt-5.4-nano",
    label: "GPT-5.4 Nano",
    multimodal: true,
    contextWindow: 400_000,
    outputLimit: 128_000,
    cost: { input: 0.2, output: 1.25, cacheRead: 0.02 },
  },
  mini: {
    id: "openai/gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    multimodal: true,
    contextWindow: 400_000,
    outputLimit: 128_000,
    cost: { input: 0.75, output: 4.5, cacheRead: 0.075 },
  },
  pro: {
    id: "anthropic/claude-sonnet-4.6",
    label: "Claude Sonnet 4.6",
    multimodal: true,
    contextWindow: 1_000_000,
    outputLimit: 128_000,
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  },
  max: {
    id: "anthropic/claude-opus-4.6",
    label: "Claude Opus 4.6",
    multimodal: true,
    contextWindow: 1_000_000,
    outputLimit: 128_000,
    cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  },
} as const satisfies Record<ModelTier, ModelSpec>;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Read-only map of tier → model spec. */
export const models: Record<ModelTier, ModelSpec> = specs;

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
  for (const spec of Object.values(specs)) {
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
 * Attributed AI Gateway instance.
 *
 * Use this instead of the bare `gateway` from `"ai"` so all requests carry
 * the app attribution headers. This is the **only** gateway instance that
 * should be used across the codebase.
 */
export const gateway = createGateway({
  headers: {
    "http-referer": "https://grida.co",
    "x-title": "Grida",
  },
});

/**
 * Return a `LanguageModelV3` instance for the given tier, ready to pass into
 * `streamText()`, `generateText()`, `streamObject()`, etc.
 *
 * Uses the Vercel AI Gateway provider so the same code works across OpenAI,
 * Anthropic, and any other supported backend.
 *
 * @example
 * ```ts
 * import { streamText } from "ai";
 * import { model } from "@/lib/ai/models";
 *
 * const result = streamText({
 *   model: model("mini"),
 *   prompt: "Hello",
 * });
 * ```
 */
export function model(tier: ModelTier) {
  return gateway(specs[tier].id);
}
