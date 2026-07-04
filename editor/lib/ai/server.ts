// GRIDA-GG: gateway — the generateVideo seam method the GG video route bills through (docs/wg/platform/hosted-ai.md)
import "server-only";

/**
 * AI credit usage seam — single server-only entry point.
 *
 * `GRIDA-SEC-003` — see [SECURITY.md](../../../SECURITY.md).
 *
 * This file is the only place in the editor allowed to import raw AI
 * provider SDKs (`replicate`, `openai`, `@ai-sdk/*`, `@anthropic-ai/sdk`).
 * Enforced by oxlint `no-restricted-imports` and the CI audit script.
 *
 * Every AI call routes through one of:
 *   - `grida(modelId)` / `grida.imageModel(modelId)` — Vercel AI SDK
 *     calls. Pass `providerOptions: { grida: { organizationId, feature } }`.
 *   - `runPrediction(ctx, input)` — raw Replicate predictions.
 *   - `methods.upscale` / `methods.removeBackground` / `methods.generateAudio`
 *     — named business-logic wrappers.
 *
 * Per call: gate-check → run → fire-and-forget ingest. See
 * [docs/wg/platform/billing/ai-credits.md](../../../docs/wg/platform/billing/ai-credits.md).
 *
 * `organizationId` MUST come from `requireOrganizationId` —
 * see [editor/lib/auth/organization.ts](../auth/organization.ts).
 *
 * **BYOK carve-out (contributor-only).** When a `BYOK_*` key is set
 * (see `editor/lib/ai/models.ts`), `grida`/`model` return a BARE
 * provider and the billing seam is bypassed entirely — no gate, no
 * Metronome ingest, no balance. BYOK bypasses billing ONLY: auth and
 * `requireOrganizationId` always run. GRIDA-SEC-003 — see SECURITY.md.
 */

import type {
  LanguageModelMiddleware,
  LanguageModel,
  ImageModelMiddleware,
  ImageModel,
} from "ai";
import { embed, experimental_generateVideo, wrapProvider } from "ai";
import { models as ai_models } from "@grida/ai-models";
import type { VideoGenerateRequest, VideoGenerateResult } from "@grida/agent";
import Replicate from "replicate";
import OpenAI from "openai";
import { createLibraryClient } from "@/lib/supabase/server";
import { requireOrganizationId } from "@/lib/auth/organization";
import {
  getEntitlement,
  ingestUsageEvent,
  refreshBalance,
  BillingMetronomeError,
} from "@/lib/billing/metronome";
import {
  byok,
  catalog,
  gateway,
  isByokActive,
  modelSpecById,
  tiers,
  type ModelSpec,
  type ModelTier,
} from "./models";
import { ai } from "./ai";
import {
  type AiErrorResponse,
  billingErrorToAiError,
  orgErrorToAiError,
} from "./error";

// ===========================================================================
// Public types
// ===========================================================================

export type CallKind = "text" | "image" | "replicate-prediction" | "audio";

export interface GridaCallContext {
  /** Verified organization id. Required. */
  organizationId: number;
  /** Free-form feature tag — e.g. `"canvas/generate"`. Diagnostics only. */
  feature: string;
  /** Canonical `"vendor/model"` id for cost-card lookup. */
  model_id: string;
  /** Optional pre-allocated transaction id (idempotency on retry). */
  transactionId?: string;
  /**
   * If true, block on the ingest call (Metronome event + local cache
   * debit RPC) before returning. Default `false` — ingest is
   * fire-and-forget so AI latency isn't tied to billing.
   *
   * Set to `true` when the caller needs to read back a debited balance
   * in the same request (e.g. UIs that display "remaining credit"
   * after a sync chat call). The local-debit RPC is sub-100ms.
   */
  awaitIngest?: boolean;
}

export type ReplicateCallContext = GridaCallContext & {
  /** Cost of this invocation in mills (1 mill = $0.001). */
  costMills: number;
};

/**
 * Structural view of AI SDK v3 provider-level usage. Mirrors
 * `LanguageModelV3Usage` without depending on `@ai-sdk/provider`.
 */
export type ProviderUsage = {
  inputTokens: {
    total?: number;
    noCache?: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  outputTokens: {
    total?: number;
    text?: number;
    reasoning?: number;
  };
};

export type ActionSuccess<T> = { success: true; data: T };
export type ActionResult<T> = ActionSuccess<T> | AiErrorResponse;

/**
 * Data shape stamped by `withAiAuth` when `opts.balance !== false`:
 * the inner action's `T` widened with the post-call live balance.
 */
export type AiActionData<T> = T & { balanceCents: number };

/**
 * Standard envelope returned by AI server actions wrapped in
 * `withAiAuth` (default — balance on). Consumers fold it via
 * `useAiCredits().consume(env)`.
 */
export type AiActionResult<T> = ActionResult<AiActionData<T>>;

export class MissingOrgIdError extends Error {
  readonly code = "missing_organization_id";
  constructor(msg = "AI seam called without a verified organizationId.") {
    super(msg);
    this.name = "MissingOrgIdError";
  }
}

/**
 * Caller-shape failure from a seam method (unknown model, unsupported
 * resolution, out-of-bounds duration, …). Routes map `code
 * "invalid_request"` to a 400 — the message is safe for clients (it
 * describes the request, never internals).
 */
export class InvalidAiRequestError extends Error {
  readonly code = "invalid_request";
  readonly status = 400;
  constructor(msg: string) {
    super(msg);
    this.name = "InvalidAiRequestError";
  }
}

export { BillingMetronomeError };
// GRIDA-SEC-003: re-exported through the seam so the credits module can
// read BYOK state via `@/lib/ai/server` without reaching past the seam
// into `./models`. Only the boolean crosses out — never the key.
export { isByokActive };
export type { ModelTier };

// ===========================================================================
// Core seam — gate → run → ingest
// ===========================================================================

function assertOrgId(orgId: unknown): asserts orgId is number {
  if (
    typeof orgId !== "number" ||
    !Number.isFinite(orgId) ||
    !Number.isInteger(orgId) ||
    orgId <= 0
  ) {
    throw new MissingOrgIdError(
      `Invalid organizationId: ${String(orgId)} (must be a positive integer).`
    );
  }
}

function logIngestFailure(
  ctx: GridaCallContext,
  transactionId: string
): (err: unknown) => void {
  return (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[ai-seam] ingest failed org=${ctx.organizationId} model=${ctx.model_id} feature=${ctx.feature} tx=${transactionId}: ${msg}`
    );
  };
}

/**
 * Gate-check only. Used by the streaming path where ingest is deferred
 * to the `finish` part — denial must fire up front. Unconditional on
 * the billed path; BYOK callers never reach here (bare provider, no
 * middleware). GRIDA-SEC-003.
 */
export async function checkGate(ctx: GridaCallContext): Promise<void> {
  assertOrgId(ctx.organizationId);
  const e = await getEntitlement(ctx.organizationId);
  if (!e.allowed) {
    throw new BillingMetronomeError(
      `gate: ${e.reason ?? "blocked"} (cache=${e.cachedBalanceCents}¢)`,
      "blocked",
      402
    );
  }
}

/**
 * The shared billing seam. Wraps any provider call in the
 * gate → run → ingest envelope. Ingest is fire-and-forget — failures
 * are logged but never surfaced (webhook + cron reconcile the cache).
 */
export async function withTransaction<T>(
  ctx: GridaCallContext,
  op: (transactionId: string) => Promise<{ result: T; costMills: number }>
): Promise<T> {
  await checkGate(ctx);

  const transactionId = ctx.transactionId ?? crypto.randomUUID();
  const { result, costMills } = await op(transactionId);

  // Default to `awaitIngest:true` — the common path is `withAiAuth`
  // which reads back the balance after `fn` resolves. Streaming
  // callers (canvas agent route) don't go through `withTransaction`
  // for their ingest, so this default doesn't add latency there. Set
  // `ctx.awaitIngest = false` explicitly to opt back into
  // fire-and-forget.
  const awaitIngest = ctx.awaitIngest ?? true;

  if (awaitIngest) {
    await ingestUsageEvent(ctx.organizationId, costMills, {
      transactionId,
    }).catch(logIngestFailure(ctx, transactionId));
  } else {
    void ingestUsageEvent(ctx.organizationId, costMills, {
      transactionId,
    }).catch(logIngestFailure(ctx, transactionId));
  }

  return result;
}

// ===========================================================================
// Cost lookup
// ===========================================================================

function resolveModelSpec(modelId: string): ModelSpec {
  const direct = (catalog as Record<string, ModelSpec | undefined>)[modelId];
  if (direct) return direct;
  const fallback = modelSpecById(modelId);
  if (fallback) return fallback;
  throw new BillingMetronomeError(
    `No cost card for model id "${modelId}". Add it to editor/lib/ai/models.ts.`,
    "model_unknown",
    500
  );
}

/**
 * Compute the **real** (un-rounded) USD cost for a language-model call
 * from normalized usage. This is what the provider actually charges us.
 *
 * - cached input tokens charge at `cacheRead` rate (falls back to `input`)
 * - cache writes charge at `cacheWrite` rate (falls back to `input`)
 * - reasoning tokens are priced at the standard output rate
 */
export function costUsdFromTokenUsage(
  modelId: string,
  usage: ProviderUsage
): number {
  const spec = resolveModelSpec(modelId);
  const input = usage.inputTokens ?? {};
  const output = usage.outputTokens ?? {};
  const inTotal = input.total ?? 0;
  const inCacheRead = input.cacheRead ?? 0;
  const inCacheWrite = input.cacheWrite ?? 0;
  const inNoCache =
    input.noCache ?? Math.max(0, inTotal - inCacheRead - inCacheWrite);
  const outTotal = output.total ?? 0;

  const rates = spec.cost;
  return (
    (inNoCache * rates.input +
      inCacheRead * (rates.cacheRead ?? rates.input) +
      inCacheWrite * (rates.cacheWrite ?? rates.input) +
      outTotal * rates.output) /
    1_000_000
  );
}

/**
 * Compute the **metered** cost (mills) we send to Metronome.
 *
 * Returns the *real* fractional mill value — Metronome aggregates these
 * across the billing period and invoices the exact sum, so the customer
 * pays at-cost (per the AI-credits design). Rounding happens once, at
 * Stripe invoice time, in cents — not per call.
 *
 * 1 mill = $0.001.
 */
export function costMillsFromTokenUsage(
  modelId: string,
  usage: ProviderUsage
): number {
  return costUsdFromTokenUsage(modelId, usage) * 1000;
}

// ===========================================================================
// Vercel AI SDK adapter — `grida` provider
// ===========================================================================

type GridaProviderOptions = {
  organizationId?: number;
  feature?: string;
  transactionId?: string;
  /**
   * Explicit cost in mills — used by the image-model middleware since
   * AI SDK image gen doesn't expose token usage. The route handler
   * computes cost from request params (n, size, quality) against the
   * cost card and threads it through.
   */
  costMills?: number;
  /** See {@link GridaCallContext.awaitIngest}. */
  awaitIngest?: boolean;
};

type ExtractedContext = GridaCallContext & { costMills?: number };

function readGridaOptions(
  providerOptions: unknown
): GridaProviderOptions | undefined {
  if (!providerOptions || typeof providerOptions !== "object") return undefined;
  const raw = (providerOptions as Record<string, unknown>).grida;
  if (!raw || typeof raw !== "object") return undefined;
  return raw as GridaProviderOptions;
}

function extractContext(
  modelId: string,
  providerOptions: unknown
): ExtractedContext {
  const g = readGridaOptions(providerOptions);
  if (g && typeof g.organizationId === "number") {
    return {
      organizationId: g.organizationId,
      feature: g.feature || "ai-sdk",
      model_id: modelId,
      transactionId:
        typeof g.transactionId === "string" ? g.transactionId : undefined,
      costMills:
        typeof g.costMills === "number" && g.costMills >= 0
          ? g.costMills
          : undefined,
      // Preserve `undefined` so `withTransaction`'s `?? true` default
      // applies. Coercing to `false` would silently flip non-streaming
      // calls to fire-and-forget ingest, leaving `withAiAuth`'s
      // post-call `balanceCents` read stale.
      awaitIngest:
        typeof g.awaitIngest === "boolean" ? g.awaitIngest : undefined,
    };
  }
  throw new MissingOrgIdError(
    `AI SDK call missing providerOptions.grida.organizationId (model=${modelId}). ` +
      `Pass { providerOptions: { grida: { organizationId, feature } } } to the SDK call.`
  );
}

const languageModelMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",

  wrapGenerate: async ({ doGenerate, params, model }) => {
    const ctx = extractContext(model.modelId, params.providerOptions);
    return withTransaction(ctx, async () => {
      const result = await doGenerate();
      const costMills = costMillsFromTokenUsage(ctx.model_id, result.usage);
      return { result, costMills };
    });
  },

  wrapStream: async ({ doStream, params, model }) => {
    const ctx = extractContext(model.modelId, params.providerOptions);
    // Gate fires synchronously before the upstream connection opens.
    // Ingest is deferred to the `finish` part — partial-stream
    // abandonment still ingests observed usage (input tokens are
    // burned regardless).
    await checkGate(ctx);
    const transactionId = ctx.transactionId ?? crypto.randomUUID();
    const upstream = await doStream();
    let finalCostMills: number | null = null;
    const tapped = upstream.stream.pipeThrough(
      new TransformStream({
        transform(part: { type: string; usage?: unknown }, controller) {
          if (part.type === "finish" && part.usage) {
            finalCostMills = costMillsFromTokenUsage(
              ctx.model_id,
              part.usage as Parameters<typeof costMillsFromTokenUsage>[1]
            );
          }
          controller.enqueue(part);
        },
        flush() {
          if (finalCostMills !== null) {
            void ingestUsageEvent(ctx.organizationId, finalCostMills, {
              transactionId,
            }).catch(logIngestFailure(ctx, transactionId));
          }
        },
      })
    );
    return { ...upstream, stream: tapped };
  },
};

const imageModelMiddleware: ImageModelMiddleware = {
  specificationVersion: "v3",

  // Image gen doesn't expose token usage; the caller passes computed
  // cost via providerOptions.grida.costMills. Without it the seam logs
  // and charges 0 — loud enough to surface in review without breaking
  // an already-billed provider call.
  wrapGenerate: async ({ doGenerate, params, model }) => {
    const ctx = extractContext(model.modelId, params.providerOptions);
    if (typeof ctx.costMills !== "number") {
      console.warn(
        `[ai-seam] image call missing providerOptions.grida.costMills (model=${ctx.model_id}, feature=${ctx.feature}); charging 0`
      );
    }
    const costMills = ctx.costMills ?? 0;
    return withTransaction(ctx, async () => {
      const result = await doGenerate();
      return { result, costMills };
    });
  },
};

const wrappedProvider = wrapProvider({
  provider: gateway,
  languageModelMiddleware,
  imageModelMiddleware,
});

export type GridaProvider = ((modelId: string) => LanguageModel) & {
  languageModel(modelId: string): LanguageModel;
  imageModel(modelId: string): ImageModel;
};

/**
 * The seam's public model provider. Default: the billing-wrapped Vercel
 * AI Gateway (gate + ingest middleware). When a `BYOK_*` key is set this
 * is a bare provider that bypasses billing — see the BYOK carve-out in
 * this file's header / `models.ts` / SECURITY.md GRIDA-SEC-003.
 *
 *     grida("openai/gpt-5.4-mini")       // → LanguageModel (callable shorthand)
 *     grida.languageModel("openai/...")  // → LanguageModel (explicit)
 *     grida.imageModel("bfl/flux-2-pro") // → ImageModel
 */
// GRIDA-SEC-003: BYOK is text-path-only. Only the LANGUAGE provider
// swaps to the bare BYOK provider (no billing middleware). Image models
// stay on the billing-wrapped provider so SDK image generation is still
// gated + metered even under BYOK — matching SECURITY.md / billing.md.
const activeLanguageProvider = byok ?? wrappedProvider;

function gridaFn(modelId: string): LanguageModel {
  return activeLanguageProvider.languageModel(modelId);
}
gridaFn.languageModel = (modelId: string): LanguageModel =>
  activeLanguageProvider.languageModel(modelId);
gridaFn.imageModel = (modelId: string): ImageModel =>
  wrappedProvider.imageModel(modelId);

export const grida: GridaProvider = gridaFn;

/**
 * Seam-wrapped tier helper. Returns a `LanguageModel` whose calls flow
 * through billing middleware — pass `providerOptions.grida` at the call site.
 */
export function model(tier: ModelTier) {
  return grida(catalog[tiers[tier]].id);
}

// ===========================================================================
// Text embedding (generic provider primitive)
// ===========================================================================
//
// Generic text-embedding access through the seam's attributed provider.
// FEATURE-SPECIFIC concerns — model choice, dimensionality / normalization,
// caching, rate-limiting — belong to the calling feature, NOT here. E.g. the
// Library composes its query embedding in `@/lib/library/embedding`, which
// owns the model id + 1536-d truncation + cache and calls this primitive.

const embeddingProvider = byok ?? gateway;

/**
 * UNBILLED text embedding through the attributed provider (BYOK precedence:
 * OpenRouter in dev, Vercel AI Gateway in prod). Returns the RAW provider
 * embedding — the caller applies any model-specific post-processing.
 *
 * GRIDA-SEC-003: a system/internal, non-billable passthrough kept in this
 * file so the provider import stays contained (mirrors
 * {@link methods.listOpenAiModels}). It does NOT pass through gate→ingest —
 * there is no org context. A caller reaching this from a PUBLIC surface MUST
 * add its own abuse controls (rate limit + cache).
 */
export async function embedTextUnbilled(
  modelId: string,
  value: string
): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingProvider.textEmbeddingModel(modelId),
    value,
  });
  return embedding;
}

// ===========================================================================
// Replicate adapter
// ===========================================================================

let _replicateClient: Replicate | null = null;

function getReplicateClient(): Replicate {
  if (_replicateClient) return _replicateClient;
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error(
      "REPLICATE_API_TOKEN is not set; cannot run Replicate predictions."
    );
  }
  _replicateClient = new Replicate({ auth: token, useFileOutput: false });
  return _replicateClient;
}

function normalizeReplicateOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (Array.isArray(output) && output.length > 0) {
    const first = output[0];
    if (typeof first === "string") return first;
    // Defensive: some Replicate models still return FileOutput despite
    // useFileOutput: false.
    if (first && typeof first === "object" && "url" in first) {
      const f = (first as { url: () => string }).url;
      if (typeof f === "function") return f.call(first);
    }
  }
  throw new Error("Unexpected output format from Replicate prediction.");
}

/**
 * Run a Replicate prediction, billing the org for `ctx.costMills`.
 * Returns the first output URL (Replicate predictions yield a string or
 * an array of strings; we normalize to one). For structured output,
 * use `runPredictionRaw`.
 */
export async function runPrediction(
  ctx: ReplicateCallContext,
  input: Record<string, unknown>
): Promise<string> {
  return withTransaction(ctx, async () => {
    const replicate = getReplicateClient();
    const modelId = ctx.model_id as `${string}/${string}`;
    const output = await replicate.run(modelId, { input });
    return {
      result: normalizeReplicateOutput(output),
      costMills: ctx.costMills,
    };
  });
}

/**
 * Raw variant — returns whatever Replicate emits. Still gated + ingested.
 */
export async function runPredictionRaw<T = unknown>(
  ctx: ReplicateCallContext,
  input: Record<string, unknown>
): Promise<T> {
  return withTransaction(ctx, async () => {
    const replicate = getReplicateClient();
    const modelId = ctx.model_id as `${string}/${string}`;
    const output = (await replicate.run(modelId, { input })) as T;
    return { result: output, costMills: ctx.costMills };
  });
}

// ===========================================================================
// Named methods — image/audio business logic
//
// Mirrors the `ai.server.methods.*` namespace (where the matching types
// and constants live). Each function accepts a verified `organizationId`
// and dispatches through the seam.
// ===========================================================================

const MODEL_ID_851_LABS_BACKGROUND_REMOVER_IDENTIFIER =
  "851-labs/background-remover:a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc";

function normalizeImageUrl(image: ai.server.methods.ImageData): string {
  if (image.kind === "url") return image.url;
  if (image.base64.startsWith("data:")) return image.base64;
  return `data:image/png;base64,${image.base64}`;
}

export namespace methods {
  export async function upscale(
    organizationId: number,
    options: ai.server.methods.RealEsrganOptions
  ): Promise<ai.server.methods.RealEsrganResult> {
    const imageUrl = normalizeImageUrl(options.image);
    const card = ai.image_tools.models["nightmareai/real-esrgan"];

    const outputUrl = await runPrediction(
      {
        organizationId,
        feature: "ai/image/upscale",
        model_id: "nightmareai/real-esrgan",
        costMills: ai.toMills(card.cost_usd),
      },
      {
        image: imageUrl,
        scale: options.scale ?? 4,
      }
    );

    return { image: { kind: "url", url: outputUrl } };
  }

  export async function generateAudio(
    organizationId: number,
    model_id: ai.server.methods.AudioGenerationModelId,
    options: ai.server.methods.LyriaAudioOptions
  ): Promise<ai.server.methods.AudioGenerationResult> {
    const input: Record<string, unknown> = { prompt: options.prompt };
    if (options.image_inputs && options.image_inputs.length > 0) {
      input.image_inputs = options.image_inputs;
    }
    if (options.language) input.language = options.language;
    if (options.negative_prompt)
      input.negative_prompt = options.negative_prompt;
    if (typeof options.seed === "number") input.seed = options.seed;

    const card = ai.audio.models[model_id];
    const outputUrl = await runPrediction(
      {
        organizationId,
        feature: "ai/audio/generate",
        model_id,
        costMills: ai.toMills(card.pricing.usd),
      },
      input
    );
    return { url: outputUrl };
  }

  export async function removeBackground<
    TModel extends ai.server.methods.RemoveBackgroundModelId,
  >(
    organizationId: number,
    image: string | ai.server.methods.ImageData,
    model_id: TModel,
    options?: ai.server.methods.BackgroundRemoverModelOptions[TModel]
  ): Promise<ai.server.methods.BackgroundRemoverResult> {
    const imageData = ai.server.methods.toImageData(image);
    const imageUrl = normalizeImageUrl(imageData);
    const card = ai.image_tools.models[model_id];
    const baseCtx = {
      organizationId,
      feature: "ai/image/remove-background",
      costMills: ai.toMills(card.cost_usd),
    } as const;

    switch (model_id) {
      case ai.server.methods.MODEL_ID_BRIA_REMOVE_BACKGROUND: {
        const __options =
          (options as ai.server.methods.BackgroundRemoverModelOptions[typeof ai.server.methods.MODEL_ID_BRIA_REMOVE_BACKGROUND]) ??
          {};
        const outputUrl = await runPrediction(
          {
            ...baseCtx,
            model_id: ai.server.methods.MODEL_ID_BRIA_REMOVE_BACKGROUND,
          },
          {
            image: imageUrl,
            ...(__options.preserve_partial_alpha !== undefined && {
              preserve_partial_alpha: __options.preserve_partial_alpha,
            }),
            ...(__options.content_moderation !== undefined && {
              content_moderation: __options.content_moderation,
            }),
          }
        );
        return { image: { kind: "url", url: outputUrl } };
      }

      case ai.server.methods.MODEL_ID_851_LABS_BACKGROUND_REMOVER: {
        const __options =
          (options as ai.server.methods.BackgroundRemoverModelOptions[typeof ai.server.methods.MODEL_ID_851_LABS_BACKGROUND_REMOVER]) ??
          {};
        const outputUrl = await runPrediction(
          {
            ...baseCtx,
            model_id: MODEL_ID_851_LABS_BACKGROUND_REMOVER_IDENTIFIER,
          },
          {
            image: imageUrl,
            format: __options.format ?? "png",
            background_type: __options.background_type ?? "rgba",
          }
        );
        return { image: { kind: "url", url: outputUrl } };
      }

      case ai.server.methods.MODEL_ID_RECRAFT_REMOVE_BACKGROUND: {
        const outputUrl = await runPrediction(
          {
            ...baseCtx,
            model_id: ai.server.methods.MODEL_ID_RECRAFT_REMOVE_BACKGROUND,
          },
          { image: imageUrl }
        );
        return { image: { kind: "url", url: outputUrl } };
      }

      default: {
        const _exhaustive: never = model_id;
        throw new Error(`Unknown model: ${_exhaustive}`);
      }
    }
  }

  /**
   * List OpenAI provider models (passthrough). Only used by the canvas
   * model picker UI today; no auth or billing — the OpenAI list endpoint
   * is non-billable. Lives here (not in a callsite) because GRIDA-SEC-003
   * requires the `openai` SDK import to live inside this file.
   */
  let _openaiClient: OpenAI | null = null;
  function getOpenAiClient(): OpenAI {
    if (_openaiClient) return _openaiClient;
    _openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return _openaiClient;
  }
  export async function listOpenAiModels(): Promise<{
    data: OpenAI.Models.Model[];
  }> {
    const result = await getOpenAiClient().models.list();
    return { data: result.data };
  }

  /**
   * Resolve a model identifier to a billing-wrapped `ImageModel` plus
   * its cost card. The returned `model` carries the seam middleware;
   * callers MUST pass `providerOptions.grida = { organizationId,
   * feature, costMills }` when invoking `generateImage`.
   */
  export function getSDKImageModel(
    model: ai.image.ProviderModel | ai.image.ImageModelId | string
  ): {
    card: ai.image.ImageModelCard;
    model: ImageModel;
  } | null {
    const card = ai.image.findImageModelCard(model);
    if (!card) return null;
    return { model: grida.imageModel(card.id), card };
  }

  /**
   * Hosted video generation — gate → `experimental_generateVideo` via
   * the RAW gateway → ingest. Explicit `withTransaction` because
   * `wrapProvider` has no video middleware (unlike text/image).
   *
   * Billing is **pre-priced by requested duration** against the vercel
   * binding's `(resolution-label, audio-mode)` per-second rate — the
   * same pre-computed-cost pattern as every Replicate/image call.
   * Actual output duration may differ slightly (bounded by the card's
   * max); documented approximation, reconcilable later. The pricing
   * keys double as the provider's support matrix: an unpriced
   * `(label, mode)` pair is an invalid request, not a $0 call.
   */
  export async function generateVideo(
    organizationId: number,
    req: VideoGenerateRequest
  ): Promise<VideoGenerateResult> {
    const card = ai_models.video.models[req.model_id];
    if (!card || !card.listed) {
      throw new InvalidAiRequestError(`unknown video model "${req.model_id}"`);
    }
    const binding = ai_models.video.binding(card, "vercel");
    if (!binding) {
      throw new InvalidAiRequestError(
        `model "${card.id}" is not available on the hosted provider`
      );
    }

    const aspect_ratio = req.aspect_ratio ?? card.default.aspect_ratio;
    if (!(card.aspect_ratios as readonly string[]).includes(aspect_ratio)) {
      throw new InvalidAiRequestError(
        `unsupported aspect_ratio "${aspect_ratio}" (supported: ${card.aspect_ratios.join(", ")})`
      );
    }

    const duration = req.duration ?? card.default.duration;
    if (
      !Number.isFinite(duration) ||
      duration < card.min_duration ||
      duration > card.max_duration
    ) {
      throw new InvalidAiRequestError(
        `duration must be within [${card.min_duration}, ${card.max_duration}] seconds`
      );
    }

    // Wire resolution is "{width}x{height}"; pricing is keyed by label.
    // The short edge is the "p" line (1280x720 → 720p in either
    // orientation). No resolution ⇒ provider default, priced at the
    // card's default label.
    let resolutionLabel = card.default.resolution;
    if (req.resolution) {
      const match = /^(\d+)x(\d+)$/.exec(req.resolution);
      if (!match) {
        throw new InvalidAiRequestError(
          `resolution must be "{width}x{height}", got "${req.resolution}"`
        );
      }
      const shortEdge = Math.min(Number(match[1]), Number(match[2]));
      const label = VIDEO_RESOLUTION_LABEL_BY_SHORT_EDGE[shortEdge];
      if (!label) {
        throw new InvalidAiRequestError(
          `unsupported resolution "${req.resolution}"`
        );
      }
      resolutionLabel = label;
    }

    // The wire has no audio-mode field (protocol gap, accepted v1) —
    // bill the card's default mode.
    const audioMode = card.default.audio ? "audio" : "silent";
    const rate = binding.pricing.usd_per_second[resolutionLabel]?.[audioMode];
    if (rate === undefined) {
      throw new InvalidAiRequestError(
        `resolution "${resolutionLabel}" (${audioMode}) is not served for "${card.id}"`
      );
    }
    const costMills = ai.toMills(rate * duration);

    // Text-to-video only in v1 — the SDK's image input takes raw bytes
    // (`DataContent`), and fetching a caller-supplied URL server-side
    // would be SSRF surface. Mirrors the hosted image t2i-only
    // decision; the sidecar resolver routes image-to-video to BYOK
    // providers.
    if (req.image_url) {
      throw new InvalidAiRequestError(
        "image-to-video is not supported on the hosted provider"
      );
    }

    return withTransaction(
      { organizationId, feature: "v1/ai/video", model_id: card.id },
      async () => {
        const generation = await experimental_generateVideo({
          model: gateway.videoModel(binding.id),
          prompt: req.prompt,
          aspectRatio: aspect_ratio as `${number}:${number}`,
          resolution: req.resolution as `${number}x${number}` | undefined,
          duration,
          fps: req.fps,
          seed: req.seed,
        });
        const result: VideoGenerateResult = {
          model_id: card.id,
          provider_id: "vercel",
          videos: generation.videos.map((file) => ({
            base64: file.base64,
            media_type: file.mediaType,
          })),
        };
        return { result, costMills };
      }
    );
  }
}

const VIDEO_RESOLUTION_LABEL_BY_SHORT_EDGE: Record<number, string> = {
  480: "480p",
  720: "720p",
  1080: "1080p",
  2160: "4k",
};

// ===========================================================================
// Server-action helper
// ===========================================================================

export type WithAiAuthOptions = {
  /**
   * When `true` (default), append the live post-call `balanceCents` to
   * the success envelope so client consumers can fold it via
   * `useAiCredits().consume(env)` without an extra round-trip. Adds a
   * ~100-300ms Metronome read per call.
   *
   * Set to `false` for silent endpoints that never surface a balance
   * (e.g. backfill jobs, internal-only routes).
   */
  balance?: boolean;
  /**
   * When `true` AND a BYOK key is set, this action runs on the BYOK
   * bare provider (AI-SDK text path) which has no billing middleware —
   * there is genuinely no Grida spend, so the post-call balance read is
   * skipped and `balanceCents` is reported as `0`.
   *
   * Safe default `false`: BYOK only swaps the AI-SDK provider, NOT the
   * Replicate `withTransaction` path. Actions that may bill through
   * Replicate (audio/image) must leave this unset so they still read
   * the real balance under BYOK — otherwise they silently drain credit
   * while reporting `0`. GRIDA-SEC-003.
   */
  byokBypass?: boolean;
};

/**
 * GRIDA-SEC-003 — authenticate, resolve a verified org id, then run `fn`.
 * Billing / unknown errors are caught and mapped to the AI error envelope
 * so call sites don't repeat the try-catch.
 *
 * By default, appends `balanceCents` to the success envelope (live
 * Metronome read post-fn). The `withTransaction` middleware defaults to
 * `awaitIngest:true` so the post-fn read sees the reconciled value.
 *
 * BYOK (contributor-only): auth + org lookup always run — BYOK never
 * bypasses auth. The balance short-circuit (`balanceCents:0`, no
 * Metronome read) fires only when the caller passes `byokBypass:true`,
 * i.e. the action runs on the AI-SDK bare provider with no billing
 * middleware. Replicate-billed actions omit it and still read the real
 * balance under BYOK (they genuinely spend). GRIDA-SEC-003.
 */
export function withAiAuth<T extends Record<string, unknown>>(
  scope: string,
  inputOrgId: number | string | undefined,
  fn: (orgId: number) => Promise<T>,
  opts: { balance: false; byokBypass?: boolean }
): Promise<ActionResult<T>>;
export function withAiAuth<T extends Record<string, unknown>>(
  scope: string,
  inputOrgId: number | string | undefined,
  fn: (orgId: number) => Promise<T>,
  opts?: { balance?: true; byokBypass?: boolean }
): Promise<AiActionResult<T>>;
export async function withAiAuth<T extends Record<string, unknown>>(
  scope: string,
  inputOrgId: number | string | undefined,
  fn: (orgId: number) => Promise<T>,
  opts: WithAiAuthOptions = {}
): Promise<ActionResult<T> | AiActionResult<T>> {
  const client = await createLibraryClient();
  const { data: userdata } = await client.auth.getUser();
  if (!userdata.user) {
    return {
      success: false,
      code: "unauthorized",
      message: "login required",
      status: 401,
    };
  }
  let orgId: number;
  try {
    orgId = await requireOrganizationId({
      user_id: userdata.user.id,
      inputOrgId,
    });
  } catch (err) {
    return orgErrorToAiError(err);
  }
  let data: T;
  try {
    data = await fn(orgId);
  } catch (err) {
    return billingErrorToAiError(err, scope);
  }
  if (opts.balance === false) {
    return { success: true, data };
  }
  if (isByokActive() && opts.byokBypass) {
    // GRIDA-SEC-003 BYOK carve-out: AI-SDK path has no billing
    // middleware, so there is no Grida balance to read. Replicate
    // actions omit `byokBypass` and fall through to the real read.
    return {
      success: true,
      data: { ...data, balanceCents: 0 } as AiActionData<T>,
    };
  }
  // The action already succeeded — a Metronome read failure must not
  // demote the envelope to `success: false`. Surface the data and a
  // sentinel balance (-1); clients can `useAiCredits().refresh()` to
  // recover. We log loudly so the failure is visible.
  let balanceCents = -1;
  try {
    const { cents } = await refreshBalance(orgId);
    balanceCents = cents;
  } catch (err) {
    console.error(
      `[ai-seam] post-fn refreshBalance failed for org=${orgId} scope=${scope}:`,
      err
    );
  }
  return {
    success: true,
    data: { ...data, balanceCents } as AiActionData<T>,
  };
}
