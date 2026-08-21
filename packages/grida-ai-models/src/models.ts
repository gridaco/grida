/**
 * Central model catalogue.
 *
 * The `models` namespace is the only export, also re-exported as the
 * package default (`import models from "@grida/ai-models"`). Surface:
 *
 * - `models.text.*`        — text-model spec table, tier→spec map, lookup
 * - `models.image.*`       — image-generation catalogue
 * - `models.audio.music.*` / `.sound_effects.*` — exact audio-output catalogues
 * - `models.three_d.*`     — 3D-generation catalogue
 * - `models.video.*`       — video-generation catalogue
 * - `models.image_tools.*` — non-generator image tools (background removal, upscale)
 * - `models.Provider`, `models.Vendor` — shared discriminator labels
 *
 * Tier vocabulary lives in `./tiers.ts`; that module type-uses
 * `models.text.CatalogId` from this one so the tier→id table is
 * constrained to real catalogue entries at compile time.
 *
 * Everything sits in one file because tsdown's `.d.ts` bundler does
 * not preserve `export import` namespace aliases across internal
 * modules — keeping the full `namespace models` declaration in a
 * single source file is the workaround.
 *
 * Routing labels on the cards — `Provider` (text/image), the literal provider
 * bindings on music, sound-effect, and 3D cards, and video's per-binding
 * `video.VideoProvider` — are data labels only; see the README for the full
 * contract.
 *
 * @module
 */

import { TIER_MODEL_IDS, type ModelTier } from "./tiers";

/**
 * The id-matching rules, over an arbitrary spec table.
 *
 * Private to this file and parameterized rather than closed over
 * `catalogSpecs` so that `models.text.modelSpecById` (the bundled
 * catalogue) and a `models.snapshot` view (a published catalogue) match
 * ids identically. Two copies of these rules would drift the day a
 * provider changes its id convention.
 *
 * Accepts an exact namespaced id, a bare id, or a date-suffixed id —
 * see {@link models.text.modelSpecById} for the contract.
 */
function specByIdOver(
  specs: readonly models.text.ModelSpec[],
  modelId: string
): models.text.ModelSpec | undefined {
  for (const spec of specs) {
    if (spec.id === modelId) return spec;

    const baseName = spec.id.includes("/")
      ? spec.id.split("/").slice(1).join("/")
      : spec.id;

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

/**
 * Open-registry resolution over an arbitrary spec table ∪ `custom`.
 * The table wins on a collision; custom ids match exactly. Shared by
 * `models.text.registry.resolve` and `models.snapshot` views so the
 * precedence is stated once.
 */
function resolveOver(
  specs: readonly models.text.ModelSpec[],
  modelId: string,
  custom?: readonly models.text.registry.CustomModelSpec[]
): models.text.registry.ResolvedModelSpec | undefined {
  const fromTable = specByIdOver(specs, modelId);
  if (fromTable) return { ...fromTable, custom: false };
  const fromCustom = custom?.find((m) => m.id === modelId);
  return fromCustom ? models.text.registry.normalize(fromCustom) : undefined;
}

export namespace models {
  // ── Shared discriminators ─────────────────────────────────────────

  /**
   * Routing label for hosted-provider calls. `"vercel"` indicates
   * the model is served via the Vercel AI Gateway; the label is
   * data, not an SDK directive.
   */
  export type Provider = "vercel";

  /**
   * Model vendor (the organization that produced the weights).
   * Display label only — the routing-target discriminator is
   * `Provider`, not `Vendor`.
   */
  export type Vendor =
    | "openai"
    | "recraft-ai"
    | "black-forest-labs"
    | "google"
    | "microsoft"
    | "tencent"
    | "elevenlabs"
    | "stability-ai"
    | "bytedance"
    | "xai";

  /**
   * Catalogue lifecycle for newly grounded media surfaces.
   *
   * - `listed` — integrated and safe to show in the normal user-facing list.
   * - `staged` — the provider contract is grounded and may be callable only
   *   from a dedicated compatibility playground; it is not yet part of normal
   *   integrated model selection. Staged never means callable by itself.
   */
  export type CatalogueStatus = "listed" | "staged";

  // ── models.text ───────────────────────────────────────────────────
  //
  // Text-model spec catalogue. Single source of truth for per-model
  // metadata. Values from https://models.dev/api.json — to look up:
  // `python .tools/model_info.py <id>`.

  export namespace text {
    /**
     * Cost per 1M tokens in USD.
     *
     * Values from models.dev — direct provider pricing (not reseller
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
      /** Optional request-wide long-context pricing rule. */
      longContext?: {
        /** Apply when total input tokens are strictly greater than this value. */
        inputTokensAbove: number;
        /** Multiplier for every input bucket, including cache reads and writes. */
        inputMultiplier: number;
        /** Multiplier for every output bucket, including reasoning tokens. */
        outputMultiplier: number;
      };
    }

    /** An exact image media type accepted as model input. */
    export type ImageInputMime = `image/${string}`;

    export interface ModelSpec {
      /** Provider-namespaced model id (`creator/model-name`). */
      id: string;
      /** Human-readable label (full name, e.g. "Claude Opus 4.8"). */
      label: string;
      /**
       * Optional compact name for space-constrained UI (e.g. "Opus 4.8").
       * Manually curated — not derived. Falls back to {@link label} when
       * unset; use {@link displayLabel} to resolve.
       */
      short_label?: string;
      /** Whether the model accepts image/file inputs. */
      multimodal: boolean;
      /**
       * Exact image MIME types accepted natively by the model. This is sourced
       * independently from {@link multimodal}: a broad multimodal declaration
       * never manufactures formats, and provider-specific constraints beyond
       * MIME type still apply.
       */
      readonly imageInputMimes: readonly ImageInputMime[];
      /**
       * Whether the model supports native tool/function calling. Explicit
       * on every entry — the agent loop is tool-heavy, so this flag gates
       * "can this model drive the agent at all" decisions downstream.
       */
      tool_call: boolean;
      /** Maximum context window in tokens (input + output combined). */
      contextWindow: number;
      /** Maximum output tokens per response. */
      outputLimit: number;
      /** Cost per 1M tokens in USD. */
      cost: ModelCostPerMillion;
      /**
       * Grida catalogue lifecycle marker. The model is still callable, but
       * Grida considers it superseded; UIs may hide or mark it.
       */
      deprecated?: boolean;
    }

    // Provider-family capabilities are kept private so catalogue entries remain
    // explicit while sharing one source-backed value. Do not derive these from
    // `multimodal`; a future model may be multimodal without a documented image
    // input format set.
    // https://developers.openai.com/api/docs/guides/images-vision#image-input-requirements
    const OPENAI_IMAGE_INPUT_MIMES = [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
    ] as const satisfies readonly ImageInputMime[];
    // https://platform.claude.com/docs/en/build-with-claude/vision#supported-formats
    const ANTHROPIC_IMAGE_INPUT_MIMES = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
    ] as const satisfies readonly ImageInputMime[];
    // https://ai.google.dev/gemini-api/docs/image-understanding#supported-image-formats
    const GOOGLE_IMAGE_INPUT_MIMES = [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/heic",
      "image/heif",
    ] as const satisfies readonly ImageInputMime[];

    // OpenAI bills the full request at these multipliers once its total input
    // exceeds 272K tokens. The same rule is published for GPT-5.5 and every
    // GPT-5.6 family member.
    // https://developers.openai.com/api/docs/models/gpt-5.5
    // https://developers.openai.com/api/docs/models/gpt-5.6-sol
    const OPENAI_LONG_CONTEXT_PRICING = {
      inputTokensAbove: 272_000,
      inputMultiplier: 2,
      outputMultiplier: 1.5,
    } as const satisfies NonNullable<ModelCostPerMillion["longContext"]>;

    const catalogSpecs = {
      "openai/gpt-5.4-nano": {
        id: "openai/gpt-5.4-nano",
        label: "GPT-5.4 Nano",
        multimodal: true,
        imageInputMimes: OPENAI_IMAGE_INPUT_MIMES,
        tool_call: true,
        contextWindow: 400_000,
        outputLimit: 128_000,
        cost: { input: 0.2, output: 1.25, cacheRead: 0.02 },
      },
      "openai/gpt-5.4-mini": {
        id: "openai/gpt-5.4-mini",
        label: "GPT-5.4 Mini",
        multimodal: true,
        imageInputMimes: OPENAI_IMAGE_INPUT_MIMES,
        tool_call: true,
        contextWindow: 400_000,
        outputLimit: 128_000,
        cost: { input: 0.75, output: 4.5, cacheRead: 0.075 },
      },
      "openai/gpt-5.5": {
        id: "openai/gpt-5.5",
        label: "GPT-5.5",
        multimodal: true,
        imageInputMimes: OPENAI_IMAGE_INPUT_MIMES,
        tool_call: true,
        contextWindow: 1_050_000,
        outputLimit: 128_000,
        cost: {
          input: 5,
          output: 30,
          cacheRead: 0.5,
          longContext: OPENAI_LONG_CONTEXT_PRICING,
        },
        deprecated: true,
      },
      "openai/gpt-5.5-pro": {
        id: "openai/gpt-5.5-pro",
        label: "GPT-5.5 Pro",
        multimodal: true,
        imageInputMimes: OPENAI_IMAGE_INPUT_MIMES,
        tool_call: true,
        contextWindow: 1_050_000,
        outputLimit: 128_000,
        cost: { input: 30, output: 180 },
      },
      // Base rates; OPENAI_LONG_CONTEXT_PRICING represents the request-wide
      // band that applies above 272K total input tokens.
      "openai/gpt-5.6-sol": {
        id: "openai/gpt-5.6-sol",
        label: "GPT-5.6 Sol",
        multimodal: true,
        imageInputMimes: OPENAI_IMAGE_INPUT_MIMES,
        tool_call: true,
        contextWindow: 1_050_000,
        outputLimit: 128_000,
        cost: {
          input: 5,
          output: 30,
          cacheRead: 0.5,
          cacheWrite: 6.25,
          longContext: OPENAI_LONG_CONTEXT_PRICING,
        },
      },
      "openai/gpt-5.6-terra": {
        id: "openai/gpt-5.6-terra",
        label: "GPT-5.6 Terra",
        multimodal: true,
        imageInputMimes: OPENAI_IMAGE_INPUT_MIMES,
        tool_call: true,
        contextWindow: 1_050_000,
        outputLimit: 128_000,
        cost: {
          input: 2,
          output: 12,
          cacheRead: 0.2,
          cacheWrite: 2.5,
          longContext: OPENAI_LONG_CONTEXT_PRICING,
        },
      },
      "openai/gpt-5.6-luna": {
        id: "openai/gpt-5.6-luna",
        label: "GPT-5.6 Luna",
        multimodal: true,
        imageInputMimes: OPENAI_IMAGE_INPUT_MIMES,
        tool_call: true,
        contextWindow: 1_050_000,
        outputLimit: 128_000,
        cost: {
          input: 0.2,
          output: 1.2,
          cacheRead: 0.02,
          cacheWrite: 0.25,
          longContext: OPENAI_LONG_CONTEXT_PRICING,
        },
      },
      // Standard rates stored as canonical (identical to Sonnet 4.6).
      // Anthropic ran an introductory discount ($2 in / $10 out / $0.20
      // cacheRead / $2.50 cacheWrite) through 2026-08-31; not modelled — the
      // catalogue holds steady-state provider pricing.
      "anthropic/claude-sonnet-5": {
        id: "anthropic/claude-sonnet-5",
        label: "Claude Sonnet 5",
        short_label: "Sonnet 5",
        multimodal: true,
        imageInputMimes: ANTHROPIC_IMAGE_INPUT_MIMES,
        tool_call: true,
        contextWindow: 1_000_000,
        outputLimit: 128_000,
        cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
      },
      "anthropic/claude-sonnet-4.6": {
        id: "anthropic/claude-sonnet-4.6",
        label: "Claude Sonnet 4.6",
        short_label: "Sonnet 4.6",
        multimodal: true,
        imageInputMimes: ANTHROPIC_IMAGE_INPUT_MIMES,
        tool_call: true,
        contextWindow: 1_000_000,
        outputLimit: 128_000,
        cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
        deprecated: true,
      },
      "anthropic/claude-fable-5": {
        id: "anthropic/claude-fable-5",
        label: "Claude Fable 5",
        short_label: "Fable 5",
        multimodal: true,
        imageInputMimes: ANTHROPIC_IMAGE_INPUT_MIMES,
        tool_call: true,
        contextWindow: 1_000_000,
        outputLimit: 128_000,
        cost: { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
      },
      // Drop-in successor to Opus 4.8 at the same rate card.
      "anthropic/claude-opus-5": {
        id: "anthropic/claude-opus-5",
        label: "Claude Opus 5",
        short_label: "Opus 5",
        multimodal: true,
        imageInputMimes: ANTHROPIC_IMAGE_INPUT_MIMES,
        tool_call: true,
        contextWindow: 1_000_000,
        outputLimit: 128_000,
        cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
      },
      "anthropic/claude-opus-4.8": {
        id: "anthropic/claude-opus-4.8",
        label: "Claude Opus 4.8",
        short_label: "Opus 4.8",
        multimodal: true,
        imageInputMimes: ANTHROPIC_IMAGE_INPUT_MIMES,
        tool_call: true,
        contextWindow: 1_000_000,
        outputLimit: 128_000,
        cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
        deprecated: true,
      },
      "anthropic/claude-opus-4.7": {
        id: "anthropic/claude-opus-4.7",
        label: "Claude Opus 4.7",
        short_label: "Opus 4.7",
        multimodal: true,
        imageInputMimes: ANTHROPIC_IMAGE_INPUT_MIMES,
        tool_call: true,
        contextWindow: 1_000_000,
        outputLimit: 128_000,
        cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
        deprecated: true,
      },
      // Google's cache model is read + hourly storage (no one-time write
      // premium that matches `cacheWrite` semantics), so the field is omitted.
      "google/gemini-3.5-flash": {
        id: "google/gemini-3.5-flash",
        label: "Gemini 3.5 Flash",
        multimodal: true,
        imageInputMimes: GOOGLE_IMAGE_INPUT_MIMES,
        tool_call: true,
        contextWindow: 1_048_576,
        outputLimit: 65_536,
        cost: { input: 1.5, output: 9, cacheRead: 0.15 },
      },
      "google/gemini-3.1-pro-preview": {
        id: "google/gemini-3.1-pro-preview",
        label: "Gemini 3.1 Pro Preview",
        short_label: "Gemini 3.1 Pro",
        multimodal: true,
        imageInputMimes: GOOGLE_IMAGE_INPUT_MIMES,
        tool_call: true,
        contextWindow: 1_048_576,
        outputLimit: 65_536,
        cost: { input: 2, output: 12, cacheRead: 0.2 },
      },
    } as const satisfies Record<string, ModelSpec>;

    /** Catalogued text-model id. The literal key set of {@link catalog}. */
    export type CatalogId = keyof typeof catalogSpecs;

    /** Read-only map of catalog model id → spec. */
    export const catalog: Record<CatalogId, ModelSpec> = catalogSpecs;

    /**
     * Text-model spec for each tier. Derived from `TIER_MODEL_IDS` +
     * `catalog`; the compiler enforces that every tier's id resolves to
     * a real catalog entry.
     */
    export const byTier: Record<ModelTier, ModelSpec> = {
      nano: catalog[TIER_MODEL_IDS.nano],
      mini: catalog[TIER_MODEL_IDS.mini],
      pro: catalog[TIER_MODEL_IDS.pro],
      max: catalog[TIER_MODEL_IDS.max],
    };

    /**
     * Look up a model spec by id.
     *
     * Accepts:
     * - Namespaced id: `"openai/gpt-5.4-mini"` (exact match)
     * - Bare id: `"gpt-5.4-mini"` (matches `openai/gpt-5.4-mini`)
     * - Date-suffixed id: `"gpt-5.4-mini-2025-08-07"` (providers often
     *   append a snapshot date in their API responses)
     */
    export function modelSpecById(modelId: string): ModelSpec | undefined {
      return specByIdOver(Object.values(catalogSpecs), modelId);
    }

    /**
     * The label to show in UI: the curated short name ({@link ModelSpec.short_label})
     * if present, otherwise the full {@link ModelSpec.label}. Centralizes the
     * fallback so call sites never repeat `spec.short_label ?? spec.label`.
     */
    export function displayLabel(spec: ModelSpec): string {
      return spec.short_label ?? spec.label;
    }

    // ── models.text.registry ──────────────────────────────────────────
    //
    // The open-registry seam (issue #806): spec resolution over the
    // static catalogue PLUS caller-supplied user-registered models (local
    // Ollama models, self-hosted OpenAI-compatible gateways). Pure data —
    // the caller owns where the custom list comes from (agent-host config,
    // renderer fetch); this namespace only normalizes and resolves.

    export namespace registry {
      /**
       * A user-registered text model — a model the static catalogue does
       * not know (e.g. `llama3.1:8b` served by a local Ollama). Everything
       * but the id is optional; {@link normalize} fills defaults.
       *
       * `cost` is optional by design: local models are free/unmetered, and
       * a registered model must be first-class without a price card.
       */
      export interface CustomModelSpec {
        /** Provider-side model id, verbatim (e.g. `"llama3.1:8b"`). */
        id: string;
        /** Display label. Falls back to the id. */
        label?: string;
        /** Whether the model accepts image/file inputs. Default `false`. */
        multimodal?: boolean;
        /**
         * Exact image MIME types declared by the model host. Default empty.
         * A non-empty declaration makes the normalized model multimodal; the
         * inverse is deliberately not inferred.
         */
        readonly imageInputMimes?: readonly ImageInputMime[];
        /**
         * Whether the model supports native tool/function calling.
         * Default `true` (permissive) — consumers warn rather than block
         * when this is explicitly `false`.
         */
        tool_call?: boolean;
        /** Context window in tokens. Default {@link CUSTOM_MODEL_DEFAULTS}. */
        contextWindow?: number;
        /** Max output tokens per response. Default {@link CUSTOM_MODEL_DEFAULTS}. */
        outputLimit?: number;
        /** Cost per 1M tokens in USD. Absent for local/unmetered models. */
        cost?: ModelCostPerMillion;
      }

      /**
       * A spec resolved through the open registry: either a catalogue
       * {@link ModelSpec} (cost present, `custom: false`) or a normalized
       * {@link CustomModelSpec} (cost may be absent, `custom: true`).
       */
      export interface ResolvedModelSpec extends Omit<ModelSpec, "cost"> {
        cost?: ModelCostPerMillion;
        /** True when the spec came from the caller's custom list. */
        custom: boolean;
      }

      /**
       * Defaults applied to a {@link CustomModelSpec} by {@link normalize}.
       *
       * The context window is deliberately conservative: overflowing a
       * local model's real window kills the session mid-run, while a too-
       * small assumption merely compacts early. 8k matches the common
       * Ollama serving default; users with larger windows raise it in the
       * model's config.
       */
      export const CUSTOM_MODEL_DEFAULTS = {
        multimodal: false,
        imageInputMimes: [] as readonly ImageInputMime[],
        tool_call: true,
        contextWindow: 8_192,
        outputLimit: 4_096,
      } as const;

      /** Fill a custom spec's gaps with {@link CUSTOM_MODEL_DEFAULTS}. */
      export function normalize(spec: CustomModelSpec): ResolvedModelSpec {
        const imageInputMimes = spec.imageInputMimes
          ? [...spec.imageInputMimes]
          : CUSTOM_MODEL_DEFAULTS.imageInputMimes;
        return {
          id: spec.id,
          label: spec.label && spec.label.length > 0 ? spec.label : spec.id,
          multimodal:
            imageInputMimes.length > 0 ||
            (spec.multimodal ?? CUSTOM_MODEL_DEFAULTS.multimodal),
          imageInputMimes,
          tool_call: spec.tool_call ?? CUSTOM_MODEL_DEFAULTS.tool_call,
          contextWindow:
            spec.contextWindow ?? CUSTOM_MODEL_DEFAULTS.contextWindow,
          outputLimit: spec.outputLimit ?? CUSTOM_MODEL_DEFAULTS.outputLimit,
          cost: spec.cost,
          custom: true,
        };
      }

      /**
       * Resolve a model id over catalogue ∪ custom. The catalogue wins on
       * a collision (it carries curated labels + real pricing); custom ids
       * match exactly — local ids like `llama3.1:8b` have no namespacing
       * convention to fuzzy-match on.
       */
      export function resolve(
        modelId: string,
        custom?: readonly CustomModelSpec[]
      ): ResolvedModelSpec | undefined {
        return resolveOver(Object.values(catalogSpecs), modelId, custom);
      }
    }
  }

  // ── models.image ──────────────────────────────────────────────────

  export namespace image {
    /**
     * @deprecated Use `ImageModelId` directly — every card carries
     * a `provider` field on its own.
     */
    export type ProviderModel = {
      provider: "vercel";
      modelId: ImageModelId;
    };

    /**
     * Image-model ids in `creator/model-name` format.
     */
    export type ImageModelId =
      // OpenAI
      | "openai/gpt-image-2"
      | "openai/gpt-image-1.5"
      | "openai/gpt-image-1-mini"
      // Google (multimodal LLMs with image output)
      | "google/gemini-3.1-flash-image-preview"
      | "google/gemini-3.1-flash-lite-image"
      | "google/gemini-3-pro-image"
      // Black Forest Labs
      | "bfl/flux-2-pro"
      | "bfl/flux-kontext-max"
      | "bfl/flux-kontext-pro"
      | "bfl/flux-pro-1.1"
      // ByteDance
      | "bytedance/seedream-4.5"
      // Recraft
      | "recraft/recraft-v3"
      | (string & {});

    export type AspectRatioString = `${number}:${number}`;

    export type SizeString = `${number}x${number}`;

    export type SizeSpec = [number, number, AspectRatioString];

    /**
     * Coarse speed bucket. Shared by image and audio cards so a
     * single ordering can sort across catalogues.
     */
    export type SpeedLabel = "fastest" | "fast" | "medium" | "slow" | "slowest";

    // ── Pricing ─────────────────────────────────────────────────────

    /**
     * Per-token rate sheet, in USD per **1 million** tokens.
     *
     * The authoritative pricing unit for token-billed models. For
     * tiered/flat per-image pricing, the same provider often publishes
     * an equivalent token-based meter — store it here so that arbitrary
     * sizes (outside the tiered map) can be priced exactly.
     *
     * Providers that distinguish text-input vs image-input modalities
     * (e.g. OpenAI image models) populate both `input` and `image_input`,
     * each with its own optional cached counterpart. Models that bill all
     * inputs uniformly (e.g. Google Gemini) leave the image-side fields
     * unset.
     */
    export type PerTokenRates = {
      /** USD per 1M text input tokens. */
      input: number;
      /** USD per 1M cached text input tokens. */
      cached_input?: number;
      /** USD per 1M image input tokens (edits/refs). */
      image_input?: number;
      /** USD per 1M cached image input tokens. */
      cached_image_input?: number;
      /**
       * USD per 1M output tokens.
       *
       * For image models this is the image-output rate. Some providers
       * publish a separate text-output rate for multimodal flows; that's
       * out of scope for this spec.
       */
      output: number;
    };

    /**
     * Per-image pricing with quality × size tiers (e.g. OpenAI).
     *
     * Values from the provider's official pricing page.
     */
    export type PerImageTieredPricing = {
      type: "per_image_tiered";
      /** USD per image, keyed by `"quality/WxH"` (e.g. `"medium/1024x1024"`). */
      tiers: Record<string, number>;
      /**
       * Authoritative underlying per-token rates.
       *
       * `tiers` covers the provider's published per-image equivalents for
       * popular sizes; arbitrary in-envelope sizes (see
       * {@link ImageSizeConstraints}) are billed by token count using
       * these rates. Always present when the provider documents a token
       * meter for the model.
       */
      tokens?: PerTokenRates;
    };

    /**
     * Flat per-image pricing (e.g. BFL Flux models).
     */
    export type PerImageFlatPricing = {
      type: "per_image_flat";
      /** USD per image. */
      usd: number;
    };

    /**
     * Per-token pricing (e.g. Google Gemini image models).
     */
    export type PerTokenPricing = PerTokenRates & {
      type: "per_token";
    };

    /**
     * Discriminated union of all image-model pricing schemes.
     *
     * Each variant stores the **real** provider pricing — no averages
     * or estimates.
     */
    export type ImageModelPricing =
      | PerImageTieredPricing
      | PerImageFlatPricing
      | PerTokenPricing;

    // ── Providers ───────────────────────────────────────────────────

    /**
     * A provider that can serve an image model. Distinct from the top-level
     * {@link models.Provider} because the same flagship proprietary model is
     * now multi-homed: fal, OpenRouter, and the Vercel gateway each serve it
     * under a different id (and sometimes a different meter). Mirrors
     * {@link video.VideoProvider}.
     */
    export type ImageProvider = "vercel" | "fal" | "openrouter";

    /**
     * How one provider serves an image model: the id you actually call on that
     * provider, plus that provider's own meter. The unit of provider-selection.
     * Keyed by {@link ImageProvider} in {@link ImageModelCard.providers}, so
     * `provider` here must equal that key. Mirrors {@link video.VideoProviderBinding}.
     */
    export type ImageProviderBinding = {
      provider: ImageProvider;
      /**
       * Provider-specific call id. Format varies — `openai/gpt-image-2` (Vercel),
       * `fal-ai/gpt-image-2` (fal), `openai/gpt-image-2` (OpenRouter).
       */
      id: string;
      /** Real upstream pricing for **this** provider — meters differ across providers. */
      pricing: ImageModelPricing;
      /**
       * Coarse provider cost per invocation in USD. For budget estimation;
       * not for display.
       */
      avg_cost_usd: number;
      /** Per-binding deprecation (a provider may retire a route independently). */
      deprecated?: boolean;
      /** Provider's page for this binding; UI falls back to the card. */
      url?: string;
      /**
       * Image-to-image (reference-conditioned generation) support for **this**
       * provider's route. Absent ⇒ the provider serves text-to-image only for
       * this model, so the resolver won't route a reference-bearing call here.
       *
       * - `id` — the endpoint to call when references are present. Equals
       *   {@link id} where edit is the same endpoint plus an extra field
       *   (OpenRouter: `input_references`); a **distinct** id where the provider
       *   separates the routes (fal: `…/edit`). Carrying it explicitly keeps the
       *   resolver honest instead of string-munging the t2i id.
       * - `max` — the provider-advertised maximum number of reference images
       *   (OpenRouter `supported_parameters.input_references.max`). One reference
       *   = single-image edit; many = multi-reference composition.
       *
       * Populate only against a provider that has been verified to serve it (the
       * TOOL-DESIGN doctrine: don't catalogue a capability that doesn't work).
       */
      references?: { id: string; max: number };
    };

    // ── Size constraints ────────────────────────────────────────────

    /**
     * Continuous size constraints for an image model.
     *
     * Models accept arbitrary widths and heights within these bounds.
     * Use alongside (or instead of) `sizes` (discrete presets):
     *
     * - **Presets only** — fixed-size models (legacy OpenAI image).
     * - **Constraints only** — fully flexible (Flux, Gemini).
     * - **Both** — `gpt-image-2`: documented preset prices plus arbitrary
     *   sizes within the engine's pixel/aspect envelope.
     *
     * **Validation precedence.** When both `sizes` (presets) and
     * `constraints` are present on a card, `constraints` is the
     * authoritative validator: a request must satisfy every constraint
     * field. `sizes` is a UI hint and a pricing-tier anchor — off-preset
     * but in-envelope requests are valid, but their cost falls back to
     * the nearest priced tier (see `PerImageTieredPricing`).
     *
     * All bounds are inclusive. Omit a field when the provider does not
     * document that constraint.
     */
    export type ImageSizeConstraints = {
      /**
       * Pixel quantization. Width and height must be multiples of `step`.
       * Default `1` (no quantization).
       *
       * @example 16 // gpt-image-2
       */
      step?: number;
      /** Per-edge bounds, in px. Applies symmetrically to width and height. */
      min_edge?: number;
      max_edge?: number;
      /** Total pixel-count bounds (`width × height`). */
      min_pixels?: number;
      max_pixels?: number;
      /**
       * Aspect-ratio bounds, expressed as the long edge over the short
       * edge (always `>= 1`). Applies in either orientation.
       *
       * @example { max: 3 } // up to 3:1
       */
      aspect_ratio?: {
        min?: number;
        max?: number;
      };
    };

    // ── Card types ──────────────────────────────────────────────────

    export type ImageModelCardCompact = {
      id: ImageModelId;
      label: string;
      deprecated: boolean;
      short_description: string;
      speed_label: SpeedLabel;
      /** Real provider pricing data. */
      pricing: ImageModelPricing;
    };

    export type ImageModelCard = {
      id: ImageModelId;
      label: string;
      deprecated: boolean;
      short_description: string;
      vendor: Vendor;
      /**
       * Primary/default provider for legacy single-provider readers (the web
       * Grida-billed path). Equals one of the keys in {@link providers}. Kept
       * alongside {@link providers} so existing consumers compile unchanged.
       */
      provider: Provider;
      /**
       * Whether this model is surfaced in the curated, user-facing list.
       * Curation rule: proprietary · SOTA · **universal** (served by every
       * supported provider, so one BYOK key serves the whole list). Models that
       * fail the rule stay in the catalog (resolvable by id) but are hidden from
       * the default picker. See {@link listed_reason}.
       */
      listed: boolean;
      /** Why a card is `listed: false` (legacy, superseded, or not universal). */
      listed_reason?: string;
      /**
       * Providers that serve this model, keyed by provider. **No implied
       * preference** — default-provider selection is deferred to the runtime
       * resolver. Mirrors {@link video.VideoModelCard.providers}.
       */
      providers: Partial<Record<ImageProvider, ImageProviderBinding>>;
      styles: string[] | null;
      speed_label: SpeedLabel;
      speed_max: string;
      /** Discrete preset sizes (UI suggestions and pricing-tier anchors). */
      sizes: SizeSpec[] | null;
      /**
       * Continuous size constraints for arbitrary dimensions.
       * Authoritative for input validation when present (see
       * {@link ImageSizeConstraints}).
       */
      constraints: ImageSizeConstraints | null;
      /** Real provider pricing data. */
      pricing: ImageModelPricing;
      /**
       * Coarse estimate of cost per invocation in USD. For flat
       * per-image models this equals the exact price; for tiered
       * models it is the mid-tier (medium quality, default size);
       * for per-token models it is a rough estimate. Not for display.
       */
      avg_cost_usd: number;
      default: {
        width: number;
        height: number;
        aspect_ratio: AspectRatioString;
      };
    };

    export const toCompact = (card: ImageModelCard): ImageModelCardCompact => {
      return {
        id: card.id,
        label: card.label,
        deprecated: card.deprecated,
        short_description: card.short_description,
        speed_label: card.speed_label,
        pricing: card.pricing,
      };
    };

    export const models: Partial<Record<ImageModelId, ImageModelCard>> = {
      // -----------------------------------------------------------------
      // OpenAI
      // -----------------------------------------------------------------
      // https://developers.openai.com/api/docs/models/gpt-image-2
      "openai/gpt-image-2": {
        id: "openai/gpt-image-2",
        label: "GPT Image 2",
        deprecated: false,
        short_description:
          "State-of-the-art image generation and editing with flexible resolutions",
        vendor: "openai",
        provider: "vercel",
        listed: true,
        // ids/prices verified 2026-06-29, see github.com/gridaco/grida/issues/908
        providers: {
          vercel: {
            provider: "vercel",
            id: "openai/gpt-image-2",
            pricing: { type: "per_token", input: 5.0, output: 30.0 },
            avg_cost_usd: 0.053,
          },
          openrouter: {
            provider: "openrouter",
            id: "openai/gpt-image-2",
            pricing: { type: "per_token", input: 8.0, output: 8.0 },
            avg_cost_usd: 0.05,
            url: "https://openrouter.ai/openai/gpt-image-2",
            // input_references advertised by OpenRouter (0–16), 2026-07-01.
            references: { id: "openai/gpt-image-2", max: 16 },
          },
          fal: {
            provider: "fal",
            id: "fal-ai/gpt-image-2",
            pricing: {
              type: "per_image_tiered",
              tiers: {
                "low/1024x1024": 0.006,
                "medium/1024x1024": 0.053,
                "high/1024x1024": 0.211,
              },
            },
            avg_cost_usd: 0.053,
            url: "https://fal.ai/models/openai/gpt-image-2",
          },
        },
        speed_label: "medium",
        speed_max: "1m",
        styles: null,
        sizes: [
          [1024, 1024, "1:1"],
          [1024, 1536, "2:3"],
          [1536, 1024, "3:2"],
        ],
        constraints: {
          step: 16,
          max_edge: 3840,
          min_pixels: 655_360,
          max_pixels: 8_294_400,
          aspect_ratio: { max: 3 },
        },
        // https://developers.openai.com/api/docs/models/gpt-image-2
        pricing: {
          type: "per_image_tiered",
          tiers: {
            "low/1024x1024": 0.006,
            "low/1024x1536": 0.005,
            "low/1536x1024": 0.005,
            "medium/1024x1024": 0.053,
            "medium/1024x1536": 0.041,
            "medium/1536x1024": 0.041,
            "high/1024x1024": 0.211,
            "high/1024x1536": 0.165,
            "high/1536x1024": 0.165,
          },
          tokens: {
            input: 5.0,
            cached_input: 1.25,
            image_input: 8.0,
            cached_image_input: 2.0,
            output: 30.0,
          },
        },
        avg_cost_usd: 0.053, // medium/1024x1024
        default: {
          width: 1024,
          height: 1024,
          aspect_ratio: "1:1",
        },
      },
      // https://developers.openai.com/api/docs/models/gpt-image-1.5
      "openai/gpt-image-1.5": {
        id: "openai/gpt-image-1.5",
        label: "GPT Image 1.5",
        deprecated: true,
        short_description:
          "Previous-generation image model. Superseded by GPT Image 2.",
        vendor: "openai",
        provider: "vercel",
        listed: false,
        listed_reason: "Previous-generation model, superseded by GPT Image 2.",
        providers: {
          vercel: {
            provider: "vercel",
            id: "openai/gpt-image-1.5",
            pricing: { type: "per_token", input: 5.0, output: 32.0 },
            avg_cost_usd: 0.034,
          },
        },
        speed_label: "medium",
        speed_max: "1m",
        styles: null,
        sizes: [
          [1024, 1024, "1:1"],
          [1024, 1536, "2:3"],
          [1536, 1024, "3:2"],
        ],
        // Preset-only — provider rejects arbitrary sizes.
        constraints: null,
        // https://developers.openai.com/api/docs/models/gpt-image-1.5
        pricing: {
          type: "per_image_tiered",
          tiers: {
            "low/1024x1024": 0.009,
            "low/1024x1536": 0.013,
            "low/1536x1024": 0.013,
            "medium/1024x1024": 0.034,
            "medium/1024x1536": 0.05,
            "medium/1536x1024": 0.05,
            "high/1024x1024": 0.133,
            "high/1024x1536": 0.2,
            "high/1536x1024": 0.2,
          },
          tokens: {
            input: 5.0,
            cached_input: 1.25,
            image_input: 8.0,
            cached_image_input: 2.0,
            output: 32.0,
          },
        },
        avg_cost_usd: 0.034, // medium/1024x1024
        default: {
          width: 1024,
          height: 1024,
          aspect_ratio: "1:1",
        },
      },
      // https://developers.openai.com/api/docs/models/gpt-image-1-mini
      "openai/gpt-image-1-mini": {
        id: "openai/gpt-image-1-mini",
        label: "GPT Image Mini",
        deprecated: false,
        short_description: "Cost-efficient image generation model",
        vendor: "openai",
        provider: "vercel",
        listed: false,
        listed_reason:
          "Cost-tier model, not part of the curated flagship/SOTA list.",
        providers: {
          vercel: {
            provider: "vercel",
            id: "openai/gpt-image-1-mini",
            pricing: { type: "per_token", input: 2.0, output: 8.0 },
            avg_cost_usd: 0.011,
          },
        },
        speed_label: "slow",
        speed_max: "1m",
        styles: null,
        sizes: [
          [1024, 1024, "1:1"],
          [1024, 1536, "2:3"],
          [1536, 1024, "3:2"],
        ],
        // Preset-only — provider rejects arbitrary sizes.
        constraints: null,
        // https://developers.openai.com/api/docs/models/gpt-image-1-mini
        pricing: {
          type: "per_image_tiered",
          tiers: {
            "low/1024x1024": 0.005,
            "low/1024x1536": 0.006,
            "low/1536x1024": 0.006,
            "medium/1024x1024": 0.011,
            "medium/1024x1536": 0.015,
            "medium/1536x1024": 0.015,
            "high/1024x1024": 0.036,
            "high/1024x1536": 0.052,
            "high/1536x1024": 0.052,
          },
          tokens: {
            input: 2.0,
            cached_input: 0.2,
            image_input: 2.5,
            cached_image_input: 0.25,
            output: 8.0,
          },
        },
        avg_cost_usd: 0.011, // medium/1024x1024
        default: {
          width: 1024,
          height: 1024,
          aspect_ratio: "1:1",
        },
      },
      // -----------------------------------------------------------------
      // Google (multimodal LLMs with native image output)
      // -----------------------------------------------------------------
      // python .tools/model_info.py --image gemini-3.1-flash-image
      // Vercel gateway pricing: $0.50/MTok input, $3.00/MTok output
      "google/gemini-3.1-flash-image-preview": {
        id: "google/gemini-3.1-flash-image-preview",
        label: "Gemini 3.1 Flash Image",
        deprecated: false,
        short_description:
          "Fast, efficient multimodal model with native image generation",
        vendor: "google",
        provider: "vercel",
        listed: true,
        // "Nano Banana 2"; ids/prices verified 2026-06-29, see issues/908
        providers: {
          vercel: {
            provider: "vercel",
            id: "google/gemini-3.1-flash-image-preview",
            pricing: { type: "per_token", input: 0.5, output: 3.0 },
            avg_cost_usd: 0.004,
          },
          openrouter: {
            provider: "openrouter",
            id: "google/gemini-3.1-flash-image",
            pricing: { type: "per_token", input: 0.5, output: 3.0 },
            avg_cost_usd: 0.004,
            url: "https://openrouter.ai/google/gemini-3.1-flash-image",
            // input_references advertised by OpenRouter (0–14), 2026-07-01.
            references: { id: "google/gemini-3.1-flash-image", max: 14 },
          },
          fal: {
            provider: "fal",
            id: "fal-ai/gemini-3.1-flash-image-preview",
            pricing: { type: "per_image_flat", usd: 0.08 },
            avg_cost_usd: 0.08,
            url: "https://fal.ai/models/fal-ai/gemini-3.1-flash-image-preview",
          },
        },
        speed_label: "fast",
        speed_max: "15s",
        styles: null,
        sizes: null,
        constraints: { max_edge: 1536 },
        pricing: { type: "per_token", input: 0.5, output: 3.0 },
        avg_cost_usd: 0.004, // conservative per-image estimate for budget
        default: {
          width: 1024,
          height: 1024,
          aspect_ratio: "1:1",
        },
      },
      // python .tools/model_info.py --image gemini-3-pro-image
      // Vercel gateway pricing: $2.00/MTok input, $12.00/MTok output
      "google/gemini-3-pro-image": {
        id: "google/gemini-3-pro-image",
        label: "Gemini 3 Pro Image",
        deprecated: false,
        short_description:
          "High-quality multimodal model with native image generation",
        vendor: "google",
        provider: "vercel",
        listed: true,
        // "Nano Banana Pro"; ids/prices verified 2026-06-29, see issues/908
        providers: {
          vercel: {
            provider: "vercel",
            id: "google/gemini-3-pro-image",
            pricing: { type: "per_token", input: 2.0, output: 12.0 },
            avg_cost_usd: 0.015,
          },
          openrouter: {
            provider: "openrouter",
            id: "google/gemini-3-pro-image-preview",
            pricing: { type: "per_token", input: 2.0, output: 12.0 },
            avg_cost_usd: 0.015,
            url: "https://openrouter.ai/google/gemini-3-pro-image-preview",
            // input_references advertised by OpenRouter (0–14), 2026-07-01.
            references: { id: "google/gemini-3-pro-image-preview", max: 14 },
          },
          fal: {
            provider: "fal",
            id: "fal-ai/nano-banana-pro",
            pricing: { type: "per_image_flat", usd: 0.15 },
            avg_cost_usd: 0.15,
            url: "https://fal.ai/models/fal-ai/nano-banana-pro",
          },
        },
        speed_label: "medium",
        speed_max: "30s",
        styles: null,
        sizes: null,
        constraints: { max_edge: 1536 },
        pricing: { type: "per_token", input: 2.0, output: 12.0 },
        avg_cost_usd: 0.015, // conservative per-image estimate for budget
        default: {
          width: 1024,
          height: 1024,
          aspect_ratio: "1:1",
        },
      },
      // "Nano Banana 2 Lite" — GA 2026-06-30. The cost/speed tier of the 3.1
      // Flash family: ~half of Nano Banana 2's meter, and 1K-only output
      // (2K/4K unsupported — the differentiator). Vercel + OpenRouter both
      // meter it at $0.25/$1.50 (verified 2026-07-01); fal id not verified,
      // so left out. OpenRouter doesn't advertise input_references for the
      // Lite (t2i only per its model page), so no `references` (TOOL-DESIGN:
      // no unverified capability).
      "google/gemini-3.1-flash-lite-image": {
        id: "google/gemini-3.1-flash-lite-image",
        label: "Gemini 3.1 Flash Lite Image",
        deprecated: false,
        short_description:
          "Fastest, most cost-efficient Gemini image model; 1K output only.",
        vendor: "google",
        provider: "vercel",
        listed: false,
        listed_reason:
          "Cost-tier model, not part of the curated flagship/SOTA list.",
        providers: {
          vercel: {
            provider: "vercel",
            id: "google/gemini-3.1-flash-lite-image",
            pricing: { type: "per_token", input: 0.25, output: 1.5 },
            avg_cost_usd: 0.034,
          },
          openrouter: {
            provider: "openrouter",
            id: "google/gemini-3.1-flash-lite-image",
            pricing: { type: "per_token", input: 0.25, output: 1.5 },
            avg_cost_usd: 0.034,
            url: "https://openrouter.ai/google/gemini-3.1-flash-lite-image",
          },
        },
        speed_label: "fastest",
        speed_max: "10s",
        styles: null,
        sizes: null,
        constraints: { max_edge: 1024 },
        pricing: { type: "per_token", input: 0.25, output: 1.5 },
        // Published 1K per-image cost (the card default): $0.034 = 1120 tokens
        // × $30/1M image-output (Google/Vercel changelog, 2026-07-01). The
        // budget meter charges this per image, so it must be the real cost.
        avg_cost_usd: 0.034,
        default: {
          width: 1024,
          height: 1024,
          aspect_ratio: "1:1",
        },
      },
      // -----------------------------------------------------------------
      // Black Forest Labs (via Vercel AI Gateway)
      // -----------------------------------------------------------------
      // https://vercel.com/docs/ai-gateway/capabilities/image-generation/ai-sdk
      // https://docs.bfl.ml/pricing
      "bfl/flux-2-pro": {
        id: "bfl/flux-2-pro",
        label: "Flux 2 Pro",
        deprecated: false,
        short_description:
          "Latest Flux model with best-in-class image quality and prompt adherence",
        vendor: "black-forest-labs",
        provider: "vercel",
        listed: true,
        // ids/prices verified 2026-06-29, see issues/908. OR/fal meter per-MP
        // (~$0.03 first MP); represented as flat at the 1MP baseline.
        providers: {
          vercel: {
            provider: "vercel",
            id: "bfl/flux-2-pro",
            pricing: { type: "per_image_flat", usd: 0.06 },
            avg_cost_usd: 0.06,
          },
          openrouter: {
            provider: "openrouter",
            id: "black-forest-labs/flux.2-pro",
            pricing: { type: "per_image_flat", usd: 0.03 },
            avg_cost_usd: 0.03,
            url: "https://openrouter.ai/black-forest-labs/flux.2-pro",
            // input_references advertised by OpenRouter (0–8), 2026-07-01.
            references: { id: "black-forest-labs/flux.2-pro", max: 8 },
          },
          fal: {
            provider: "fal",
            id: "fal-ai/flux-2-pro",
            pricing: { type: "per_image_flat", usd: 0.03 },
            avg_cost_usd: 0.03,
            url: "https://fal.ai/models/fal-ai/flux-2-pro",
          },
        },
        speed_label: "medium",
        speed_max: "30s",
        styles: null,
        sizes: null,
        constraints: { min_edge: 256, max_edge: 1440 },
        pricing: { type: "per_image_flat", usd: 0.06 },
        avg_cost_usd: 0.06,
        default: {
          width: 1024,
          height: 1024,
          aspect_ratio: "1:1",
        },
      },
      "bfl/flux-kontext-max": {
        id: "bfl/flux-kontext-max",
        label: "Flux Kontext Max",
        deprecated: false,
        short_description:
          "Highest quality Flux model for context-aware image generation and editing",
        vendor: "black-forest-labs",
        provider: "vercel",
        listed: false,
        listed_reason:
          "Image-editing model; not on OpenRouter, so not universal (one-key) coverage.",
        providers: {
          vercel: {
            provider: "vercel",
            id: "bfl/flux-kontext-max",
            pricing: { type: "per_image_flat", usd: 0.08 },
            avg_cost_usd: 0.08,
          },
          fal: {
            provider: "fal",
            id: "fal-ai/flux-pro/kontext/max",
            pricing: { type: "per_image_flat", usd: 0.08 },
            avg_cost_usd: 0.08,
            url: "https://fal.ai/models/fal-ai/flux-pro/kontext/max",
          },
        },
        speed_label: "slow",
        speed_max: "30s",
        styles: null,
        sizes: null,
        constraints: { max_edge: 1820 },
        pricing: { type: "per_image_flat", usd: 0.08 },
        avg_cost_usd: 0.08,
        default: {
          width: 1024,
          height: 1024,
          aspect_ratio: "1:1",
        },
      },
      "bfl/flux-kontext-pro": {
        id: "bfl/flux-kontext-pro",
        label: "Flux Kontext Pro",
        deprecated: false,
        short_description: "Fast context-aware image generation and editing",
        vendor: "black-forest-labs",
        provider: "vercel",
        listed: false,
        listed_reason:
          "Image-editing model; superseded by Flux 2 and not universal.",
        providers: {
          vercel: {
            provider: "vercel",
            id: "bfl/flux-kontext-pro",
            pricing: { type: "per_image_flat", usd: 0.05 },
            avg_cost_usd: 0.05,
          },
        },
        speed_label: "medium",
        speed_max: "20s",
        styles: null,
        sizes: null,
        constraints: { max_edge: 1820 },
        pricing: { type: "per_image_flat", usd: 0.05 },
        avg_cost_usd: 0.05,
        default: {
          width: 1024,
          height: 1024,
          aspect_ratio: "1:1",
        },
      },
      "bfl/flux-pro-1.1": {
        id: "bfl/flux-pro-1.1",
        label: "Flux Pro 1.1",
        deprecated: false,
        short_description:
          "Faster, better FLUX Pro. Text-to-image model with excellent image quality and output diversity.",
        vendor: "black-forest-labs",
        provider: "vercel",
        listed: false,
        listed_reason: "Superseded by Flux 2 Pro; not universal.",
        providers: {
          vercel: {
            provider: "vercel",
            id: "bfl/flux-pro-1.1",
            pricing: { type: "per_image_flat", usd: 0.04 },
            avg_cost_usd: 0.04,
          },
        },
        speed_label: "slow",
        speed_max: "30s",
        styles: null,
        sizes: null,
        constraints: { min_edge: 256, max_edge: 1440 },
        pricing: { type: "per_image_flat", usd: 0.04 },
        avg_cost_usd: 0.04,
        default: {
          width: 1024,
          height: 1024,
          aspect_ratio: "1:1",
        },
      },
      // -----------------------------------------------------------------
      // ByteDance — Seedream 4.5
      // -----------------------------------------------------------------
      // Universal: $0.04/img identical on all three providers (verified
      // 2026-06-29, see github.com/gridaco/grida/issues/908).
      "bytedance/seedream-4.5": {
        id: "bytedance/seedream-4.5",
        label: "Seedream 4.5",
        deprecated: false,
        short_description:
          "ByteDance's unified image generation and editing model.",
        vendor: "bytedance",
        provider: "vercel",
        listed: true,
        providers: {
          vercel: {
            provider: "vercel",
            id: "bytedance/seedream-4.5",
            pricing: { type: "per_image_flat", usd: 0.04 },
            avg_cost_usd: 0.04,
          },
          openrouter: {
            provider: "openrouter",
            id: "bytedance-seed/seedream-4.5",
            pricing: { type: "per_image_flat", usd: 0.04 },
            avg_cost_usd: 0.04,
            url: "https://openrouter.ai/bytedance-seed/seedream-4.5",
            // i2i verified live 2026-07-01 (OpenRouter /api/v1/images
            // input_references; same endpoint as t2i). max from
            // supported_parameters.input_references.
            references: { id: "bytedance-seed/seedream-4.5", max: 14 },
          },
          fal: {
            provider: "fal",
            id: "fal-ai/bytedance/seedream/v4.5/text-to-image",
            pricing: { type: "per_image_flat", usd: 0.04 },
            avg_cost_usd: 0.04,
            url: "https://fal.ai/models/fal-ai/bytedance/seedream/v4.5/text-to-image",
          },
        },
        speed_label: "fast",
        speed_max: "15s",
        styles: null,
        sizes: null,
        constraints: { max_edge: 4096 },
        pricing: { type: "per_image_flat", usd: 0.04 },
        avg_cost_usd: 0.04,
        default: {
          width: 1024,
          height: 1024,
          aspect_ratio: "1:1",
        },
      },
      // -----------------------------------------------------------------
      // Recraft — V3
      // -----------------------------------------------------------------
      // Universal: ~$0.04/img across providers (verified 2026-06-29, see
      // issues/908). OpenRouter org slug is `recraft`, not `recraft-ai`.
      "recraft/recraft-v3": {
        id: "recraft/recraft-v3",
        label: "Recraft V3",
        deprecated: false,
        short_description:
          "Design-grade image model with strong text rendering and vector styles.",
        vendor: "recraft-ai",
        provider: "vercel",
        listed: true,
        providers: {
          vercel: {
            provider: "vercel",
            id: "recraft/recraft-v3",
            pricing: { type: "per_image_flat", usd: 0.04 },
            avg_cost_usd: 0.04,
          },
          openrouter: {
            provider: "openrouter",
            id: "recraft/recraft-v3",
            pricing: { type: "per_image_flat", usd: 0.04 },
            avg_cost_usd: 0.04,
            url: "https://openrouter.ai/recraft/recraft-v3",
          },
          fal: {
            provider: "fal",
            id: "fal-ai/recraft/v3/text-to-image",
            pricing: { type: "per_image_flat", usd: 0.04 },
            avg_cost_usd: 0.04,
            url: "https://fal.ai/models/fal-ai/recraft/v3/text-to-image",
          },
        },
        speed_label: "medium",
        speed_max: "30s",
        styles: null,
        sizes: null,
        constraints: { max_edge: 2048 },
        pricing: { type: "per_image_flat", usd: 0.04 },
        avg_cost_usd: 0.04,
        default: {
          width: 1024,
          height: 1024,
          aspect_ratio: "1:1",
        },
      },
    } as const;

    /**
     * Resolve a model identifier to its cost card (data only).
     *
     * Accepts:
     * - Full gateway id (`"bfl/flux-pro-1.1"`)
     * - The deprecated `ProviderModel` wrapper
     * - Bare provider id (`"flux-pro-1.1"`) — exact match against the
     *   segment after the `vendor/` prefix. Unlike
     *   {@link text.modelSpecById}, there is no date-suffix tolerance:
     *   image providers don't snapshot ids the way text providers do.
     *
     * Returns `null` for unknown ids and empty input.
     */
    export function findImageModelCard(
      model: ProviderModel | ImageModelId
    ): ImageModelCard | null {
      if (!model) return null;
      const modelId = typeof model === "string" ? model : model.modelId;
      if (modelId.includes("/")) {
        return models[modelId] ?? null;
      }
      for (const card of Object.values(models)) {
        if (!card) continue;
        const slash = card.id.indexOf("/");
        if (slash < 0) continue;
        if (card.id.slice(slash + 1) === modelId) return card;
      }
      return null;
    }

    /**
     * The binding for a specific provider, or `null` if that provider does
     * not serve this model. Mirrors {@link video.binding}.
     */
    export function binding(
      card: ImageModelCard,
      provider: ImageProvider
    ): ImageProviderBinding | null {
      return card.providers[provider] ?? null;
    }

    let _listed: readonly ImageModelCard[] | null = null;
    /** Cards in the curated user-facing list (`listed: true`). Computed once and
     *  frozen — the catalog is static, so callers can call freely without
     *  risking mutation of the shared view. */
    export const listed_models = (): readonly ImageModelCard[] =>
      (_listed ??= Object.freeze(
        Object.values(models).filter(
          (card): card is ImageModelCard => !!card && card.listed
        )
      ));
  }

  // ── models.audio ──────────────────────────────────────────────────

  /**
   * Audio-output generation catalogues.
   *
   * This namespace is organizational only. Music and sound effects have
   * separate model ids, provider contracts, request shapes, lifecycle lists,
   * and meters; there is deliberately no generic audio-model union.
   */
  export namespace audio {
    /** Replicate-backed Google Lyria music generation. */
    export namespace music {
      export type ModelId = "google/lyria-3" | "google/lyria-3-pro";

      export type Input = {
        modalities: readonly ("text" | "image")[];
        max_images: number;
      };

      export type Duration =
        | { mode: "fixed"; seconds: number }
        | { mode: "up_to"; max_seconds: number };

      export type Output = {
        default_format: "mp3";
        formats: readonly "mp3"[];
        sample_rate_hz: number;
        channels: number;
        duration: Duration;
      };

      /** Replicate's flat charge per generated output file. */
      export type Pricing = {
        type: "per_run_flat";
        usd: number;
      };

      export type ModelCard = {
        id: ModelId;
        label: string;
        deprecated: boolean;
        short_description: string;
        vendor: "google";
        provider: "replicate";
        status: CatalogueStatus;
        input: Input;
        output: Output;
        duration_label: string;
        output_format: "mp3";
        sample_rate_label: string;
        speed_label: image.SpeedLabel;
        speed_max: string;
        pricing: Pricing;
        /** Cost of one generation. Not for display. */
        avg_cost_usd: number;
        url: string;
      };

      export const models = {
        "google/lyria-3": {
          id: "google/lyria-3",
          label: "Lyria 3",
          deprecated: false,
          short_description:
            "Generate 30-second 48kHz stereo music clips from text or images.",
          vendor: "google",
          provider: "replicate",
          status: "listed",
          input: { modalities: ["text", "image"], max_images: 10 },
          output: {
            default_format: "mp3",
            formats: ["mp3"],
            sample_rate_hz: 48_000,
            channels: 2,
            duration: { mode: "fixed", seconds: 30 },
          },
          duration_label: "30s",
          output_format: "mp3",
          sample_rate_label: "48 kHz stereo",
          speed_label: "fast",
          speed_max: "20s",
          // Source: replicate.com/google/lyria-3 — "$0.04 per output audio file"
          pricing: { type: "per_run_flat", usd: 0.04 },
          avg_cost_usd: 0.04,
          url: "https://replicate.com/google/lyria-3",
        },
        "google/lyria-3-pro": {
          id: "google/lyria-3-pro",
          label: "Lyria 3 Pro",
          deprecated: false,
          short_description:
            "Generate full-length tracks up to ~3 minutes from text or images.",
          vendor: "google",
          provider: "replicate",
          status: "listed",
          input: { modalities: ["text", "image"], max_images: 10 },
          output: {
            default_format: "mp3",
            formats: ["mp3"],
            sample_rate_hz: 48_000,
            channels: 2,
            duration: { mode: "up_to", max_seconds: 180 },
          },
          duration_label: "up to 3m",
          output_format: "mp3",
          sample_rate_label: "48 kHz stereo",
          speed_label: "medium",
          speed_max: "60s",
          // Source: replicate.com/google/lyria-3-pro — "$0.08 per output audio file"
          pricing: { type: "per_run_flat", usd: 0.08 },
          avg_cost_usd: 0.08,
          url: "https://replicate.com/google/lyria-3-pro",
        },
      } as const satisfies Record<ModelId, ModelCard>;

      export const model_ids = Object.freeze(Object.keys(models) as ModelId[]);

      export function is_model_id(id: string): id is ModelId {
        return (model_ids as readonly string[]).includes(id);
      }

      let _listed: readonly ModelCard[] | null = null;
      export const listed_models = (): readonly ModelCard[] =>
        (_listed ??= Object.freeze(
          Object.values(models).filter((card) => card.status === "listed")
        ));
    }

    /** ElevenLabs Text to Sound Effects. */
    export namespace sound_effects {
      /** Exact ElevenLabs Sound Effects API `model_id`. */
      export type ModelId = "eleven_text_to_sound_v2";

      export type Input = { type: "text" };

      export type Output = {
        default_format: "mp3";
        formats: readonly "mp3"[];
        sample_rate_hz: number;
        duration: {
          mode: "automatic_or_fixed";
          min_seconds: number;
          max_seconds: number;
        };
      };

      /**
       * ElevenLabs' API-native meter. Credits have no stable USD value because
       * their effective price varies by account plan.
       */
      export type Pricing = {
        type: "provider_credits";
        automatic_duration_credits: number;
        specified_duration_credits_per_second: number;
      };

      export type ModelCard = {
        id: ModelId;
        label: string;
        deprecated: boolean;
        short_description: string;
        vendor: "elevenlabs";
        provider: "elevenlabs";
        status: CatalogueStatus;
        input: Input;
        output: Output;
        duration_label: string;
        output_format: "mp3";
        sample_rate_label: string;
        pricing: Pricing;
        /** Provider credits cannot be converted honestly without an account plan. */
        avg_cost_usd: null;
        url: string;
      };

      export const models = {
        eleven_text_to_sound_v2: {
          id: "eleven_text_to_sound_v2",
          label: "Eleven Text to Sound v2",
          deprecated: false,
          short_description:
            "Generate loopable sound effects up to 30 seconds from text.",
          vendor: "elevenlabs",
          provider: "elevenlabs",
          status: "staged",
          input: { type: "text" },
          output: {
            default_format: "mp3",
            formats: ["mp3"],
            sample_rate_hz: 44_100,
            duration: {
              mode: "automatic_or_fixed",
              min_seconds: 0.5,
              max_seconds: 30,
            },
          },
          duration_label: "0.5–30s",
          output_format: "mp3",
          sample_rate_label: "44.1 kHz",
          // API: 100 credits when duration is automatic, or 11 credits/s when set.
          pricing: {
            type: "provider_credits",
            automatic_duration_credits: 100,
            specified_duration_credits_per_second: 11,
          },
          avg_cost_usd: null,
          url: "https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert",
        },
      } as const satisfies Record<ModelId, ModelCard>;

      export const model_ids = Object.freeze(Object.keys(models) as ModelId[]);

      let _staged: readonly ModelCard[] | null = null;
      export const staged_models = (): readonly ModelCard[] =>
        (_staged ??= Object.freeze(
          Object.values(models).filter((card) => card.status === "staged")
        ));
    }
  }

  // ── models.three_d ────────────────────────────────────────────────

  /**
   * 3D-generation endpoint catalogue.
   *
   * These entries are deliberately `staged`: ids, IO contracts, meters, and a
   * playground execution seam are grounded, while workspace integration remains
   * deferred. The catalogue itself is not an execution seam. All currently
   * selected endpoints are served by fal.
   */
  export namespace three_d {
    export type TextToThreeDModelId = "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d";

    export type ImageToThreeDModelId =
      | "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d"
      | "fal-ai/trellis-2";

    export type ThreeDModelId = TextToThreeDModelId | ImageToThreeDModelId;

    export type ThreeDModelCategory = "3d/text-to-3d" | "3d/image-to-3d";

    export type ThreeDInput =
      | {
          type: "text";
          /** Provider-published UTF-8 prompt ceiling. */
          max_utf8_characters: number;
        }
      | {
          type: "image";
          min_images: number;
          /** One required front image plus any provider-supported extra views. */
          max_images: number;
        };

    export type ThreeDOutputFormat = "glb" | "fbx" | "obj" | "usdz";

    export type ThreeDOutput = {
      /** Required, portable result returned by every catalogued endpoint. */
      primary: "glb";
      /** Provider-schema formats that may also be present in `model_urls`. */
      optional: readonly Exclude<ThreeDOutputFormat, "glb">[];
    };

    export type HunyuanSurcharge = "pbr" | "multi_view" | "custom_face_count";

    export type PerGenerationBasePlusSurchargesPricing = {
      type: "per_generation_base_plus_surcharges";
      /** Starting price for the default generation request. */
      base_usd: number;
      /** Additive provider charges when the corresponding option is used. */
      surcharges_usd: Partial<Record<HunyuanSurcharge, number>>;
    };

    export type TrellisResolution = "512" | "1024" | "1536";

    export type PerGenerationByResolutionPricing = {
      type: "per_generation_by_resolution";
      default_resolution: TrellisResolution;
      usd_by_resolution: Record<TrellisResolution, number>;
    };

    export type ThreeDModelPricing =
      | PerGenerationBasePlusSurchargesPricing
      | PerGenerationByResolutionPricing;

    export type ThreeDModelCard = {
      /** Exact fal endpoint id; unlike video, there is no canonical indirection. */
      id: ThreeDModelId;
      label: string;
      deprecated: boolean;
      short_description: string;
      vendor: Vendor;
      /** Every currently catalogued endpoint is the exact fal route in `id`. */
      provider: "fal";
      category: ThreeDModelCategory;
      status: CatalogueStatus;
      input: ThreeDInput;
      output: ThreeDOutput;
      pricing: ThreeDModelPricing;
      /** Cost of the default request represented by the card. Not for display. */
      avg_cost_usd: number;
      /** Public fal model page for this exact endpoint. */
      url: string;
    };

    const HUNYUAN_OUTPUT = {
      primary: "glb",
      optional: ["fbx", "obj", "usdz"],
    } as const satisfies ThreeDOutput;

    export const models = {
      "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d": {
        id: "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d",
        label: "Hunyuan 3D v3.1 Pro — Text",
        deprecated: false,
        short_description: "Generate a textured 3D asset from a text prompt.",
        vendor: "tencent",
        provider: "fal",
        category: "3d/text-to-3d",
        status: "staged",
        input: { type: "text", max_utf8_characters: 1024 },
        output: HUNYUAN_OUTPUT,
        pricing: {
          type: "per_generation_base_plus_surcharges",
          base_usd: 0.375,
          surcharges_usd: { pbr: 0.15, custom_face_count: 0.15 },
        },
        avg_cost_usd: 0.375,
        url: "https://fal.ai/models/fal-ai/hunyuan-3d/v3.1/pro/text-to-3d",
      },
      "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d": {
        id: "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d",
        label: "Hunyuan 3D v3.1 Pro — Image",
        deprecated: false,
        short_description:
          "Generate a textured 3D asset from one image or up to eight views.",
        vendor: "tencent",
        provider: "fal",
        category: "3d/image-to-3d",
        status: "staged",
        input: { type: "image", min_images: 1, max_images: 8 },
        output: HUNYUAN_OUTPUT,
        pricing: {
          type: "per_generation_base_plus_surcharges",
          base_usd: 0.375,
          surcharges_usd: {
            pbr: 0.15,
            multi_view: 0.15,
            custom_face_count: 0.15,
          },
        },
        avg_cost_usd: 0.375,
        url: "https://fal.ai/models/fal-ai/hunyuan-3d/v3.1/pro/image-to-3d",
      },
      "fal-ai/trellis-2": {
        id: "fal-ai/trellis-2",
        label: "TRELLIS.2",
        deprecated: false,
        short_description:
          "Generate a textured GLB asset from a single reference image.",
        vendor: "microsoft",
        provider: "fal",
        category: "3d/image-to-3d",
        status: "staged",
        input: { type: "image", min_images: 1, max_images: 1 },
        output: { primary: "glb", optional: [] },
        pricing: {
          type: "per_generation_by_resolution",
          default_resolution: "1024",
          usd_by_resolution: { "512": 0.25, "1024": 0.3, "1536": 0.35 },
        },
        avg_cost_usd: 0.3,
        url: "https://fal.ai/models/fal-ai/trellis-2",
      },
    } as const satisfies Record<ThreeDModelId, ThreeDModelCard>;

    const all_cards: readonly ThreeDModelCard[] = Object.values(models);

    export const three_d_model_ids = Object.freeze(
      Object.keys(models) as ThreeDModelId[]
    );
    export const text_to_three_d_model_ids = Object.freeze(
      three_d_model_ids.filter(
        (id): id is TextToThreeDModelId => models[id].input.type === "text"
      )
    );
    export const image_to_three_d_model_ids = Object.freeze(
      three_d_model_ids.filter(
        (id): id is ImageToThreeDModelId => models[id].input.type === "image"
      )
    );

    export function is_text_to_three_d_model_id(
      id: string
    ): id is TextToThreeDModelId {
      return (text_to_three_d_model_ids as readonly string[]).includes(id);
    }

    export function is_image_to_three_d_model_id(
      id: string
    ): id is ImageToThreeDModelId {
      return (image_to_three_d_model_ids as readonly string[]).includes(id);
    }

    let _listed: readonly ThreeDModelCard[] | null = null;
    export const listed_models = (): readonly ThreeDModelCard[] =>
      (_listed ??= Object.freeze(
        all_cards.filter((card) => card.status === "listed")
      ));

    let _staged: readonly ThreeDModelCard[] | null = null;
    export const staged_models = (): readonly ThreeDModelCard[] =>
      (_staged ??= Object.freeze(
        all_cards.filter((card) => card.status === "staged")
      ));
  }

  // ── models.video ──────────────────────────────────────────────────

  /**
   * Video-generation model catalogue.
   *
   * The video provider ecosystem is **fragmented**: the same model is served
   * by several providers (Vercel AI Gateway, fal.ai, OpenRouter), each with a
   * *different id, a different meter, and different availability*. So unlike
   * `models.image`/`models.audio.music`/`models.audio.sound_effects` — which
   * bind one card to one provider — a
   * video card is **canonical** (provider-agnostic id + intrinsic specs) and
   * holds a {@link VideoProviderBinding} per provider that serves it, keyed by
   * provider in {@link VideoModelCard.providers}. The default-provider choice
   * is **deliberately not encoded here** — bindings carry no preference order;
   * selection is a runtime concern. Look up a route with {@link binding}.
   *
   * The cards catalogue the **image-to-video** route (a still → clip) — the
   * canvas-relevant mode and the only one some models (e.g. Grok) offer. Other
   * capabilities (text-to-video, editing) aren't modelled until used; on fal
   * they are distinct endpoint ids, so adding one is a new binding id, not a flag.
   *
   * **Pricing.** Video bills by output **duration**, and the rate varies by
   * both resolution and whether audio is generated, so `per_second` is keyed
   * `resolution → audio-mode → USD/s` (see {@link PerSecondPricing}). A
   * provider-published input-image surcharge stays explicit beside that
   * duration meter. Values are real provider rates; update them if a provider
   * changes its meter.
   *
   * **Catalogue boundary.** A model belongs here only when Grida supports at
   * least one concrete provider route with grounded pricing and enables the
   * model in runtime selection. Published, announced, or compatibility-only
   * models stay out of the catalogue.
   */
  export namespace video {
    /**
     * A provider that can serve a video model. Distinct from the top-level
     * {@link models.Provider} because video routes through more than the
     * Vercel gateway. Each provider uses its own id format and meter.
     */
    export type VideoProvider = "vercel" | "fal" | "openrouter";

    /**
     * **Canonical**, provider-agnostic model id in `vendor/model` form
     * (e.g. `google/veo-3.1`). This is *our* key, not any one provider's id —
     * the provider-specific call id lives on each {@link VideoProviderBinding}.
     * Open union (`string & {}`) keeps unrecognized ids assignable.
     */
    export type VideoModelId =
      | "google/veo-3.1"
      | "bytedance/seedance-2.0"
      | "xai/grok-imagine-video-1.5"
      | (string & {});

    /** Resolution label (e.g. `"720p"`, `"1080p"`, `"4k"`). Pricing-map + UI key. */
    export type ResolutionLabel = string;

    /**
     * Whether a clip is generated with synchronized audio. A real pricing axis:
     * fal meters `silent` at roughly half of `audio`; Vercel sells `audio` only;
     * Seedance bundles audio into its single rate.
     */
    export type AudioMode = "audio" | "silent";

    // ── Pricing ─────────────────────────────────────────────────────

    /**
     * Per-second pricing, nested `resolution → audio-mode → USD/s`. Lives on a
     * {@link VideoProviderBinding} — meters differ across providers.
     *
     * A binding lists only the `(resolution, mode)` combinations its provider
     * actually serves and meters, so the keys double as that provider's
     * resolution/audio support: Vercel's Veo card omits `"4k"` and `silent`
     * because the gateway sells neither; fal lists both. Each value is the real
     * USD-per-output-second rate for that exact config.
     */
    export type PerSecondPricing = {
      type: "per_second";
      /** USD/s, by resolution then audio mode. */
      usd_per_second: Record<
        ResolutionLabel,
        Partial<Record<AudioMode, number>>
      >;
      /** Additional provider charge for each input image, when applicable. */
      usd_per_input_image?: number;
    };

    export type VideoModelPricing = PerSecondPricing;

    /**
     * How one provider serves a canonical model: the id you actually call on
     * that provider, plus that provider's own meter. The unit of
     * provider-selection. Keyed by {@link VideoProvider} in
     * {@link VideoModelCard.providers}, so `provider` here must equal that key.
     */
    export type VideoProviderBinding = {
      provider: VideoProvider;
      /**
       * Provider-specific call id for the image-to-video route. Format varies —
       * `google/veo-3.1-generate-001` (Vercel), `fal-ai/veo3.1/image-to-video`
       * (fal, where the capability is keyed into the endpoint id).
       */
      id: string;
      /** Real upstream pricing for **this** provider — meters differ across providers. */
      pricing: VideoModelPricing;
      /**
       * Coarse provider cost per invocation in USD — this binding's rate at the
       * model's default `(resolution, audio)` × default duration, plus any
       * required input-image surcharge. For budget estimation; not for display.
       */
      avg_cost_usd: number;
      /** Per-binding deprecation (a provider may retire a route independently). */
      deprecated?: boolean;
      /** Provider's page for this binding; UI falls back to {@link VideoModelCard.url}. */
      url?: string;
    };

    export type VideoModelCard = {
      /** Canonical, provider-agnostic id. */
      id: VideoModelId;
      label: string;
      deprecated: boolean;
      short_description: string;
      vendor: Vendor;
      /**
       * Video cards exist only for models enabled in Grida selection. Kept as
       * an explicit marker for runtime guards and cross-modality consumers;
       * unsupported or compatibility-only models do not get catalogue cards.
       */
      listed: true;
      /** Supported aspect ratios. */
      aspect_ratios: image.AspectRatioString[];
      /** Inclusive output-duration bounds, in seconds. */
      min_duration: number;
      max_duration: number;
      /** Whether the model can produce synchronized audio (capability; per-mode pricing lives on each binding). */
      audio: boolean;
      speed_label: image.SpeedLabel;
      /** Default generation request. Every binding must price `(resolution, audio)`. */
      default: {
        resolution: ResolutionLabel;
        aspect_ratio: image.AspectRatioString;
        duration: number;
        audio: boolean;
      };
      /** Original vendor's model card page (not a serving gateway). */
      url: string;
      /**
       * Providers that serve this model, keyed by provider. **No implied
       * preference** — default-provider selection is deferred to the runtime.
       * Non-empty; keying makes providers unique by construction.
       */
      providers: Partial<Record<VideoProvider, VideoProviderBinding>>;
    };

    export const models: Partial<Record<VideoModelId, VideoModelCard>> = {
      // -----------------------------------------------------------------
      // Google — Veo 3.1
      // -----------------------------------------------------------------
      "google/veo-3.1": {
        id: "google/veo-3.1",
        label: "Veo 3.1",
        deprecated: false,
        short_description:
          "Google's flagship video model — strong prompt adherence with native, synchronized audio.",
        vendor: "google",
        listed: true,
        aspect_ratios: ["16:9", "9:16"],
        min_duration: 4,
        max_duration: 8,
        audio: true,
        speed_label: "slow",
        default: {
          resolution: "1080p",
          aspect_ratio: "16:9",
          duration: 8,
          audio: true,
        },
        url: "https://deepmind.google/models/veo/",
        providers: {
          // Vercel AI Gateway — gateway.video(id), image-to-video. Audio-on
          // only, ≤1080p, flat $0.40/s.
          // https://vercel.com/ai-gateway/models/veo-3.1-generate-001
          vercel: {
            provider: "vercel",
            id: "google/veo-3.1-generate-001",
            pricing: {
              type: "per_second",
              usd_per_second: {
                "720p": { audio: 0.4 },
                "1080p": { audio: 0.4 },
              },
            },
            avg_cost_usd: 3.2, // 1080p audio × 8s default
            url: "https://vercel.com/ai-gateway/models/veo-3.1-generate-001",
          },
          // fal.ai — image-to-video endpoint (capability is keyed into the id;
          // t2v is a separate `fal-ai/veo3.1` endpoint, not catalogued). Meters
          // audio/silent and adds 4K. Audio-on matches Vercel ($0.40/s @
          // 720p/1080p); silent ~half; 4K $0.40 silent / $0.60 audio.
          // https://fal.ai/models/fal-ai/veo3.1/image-to-video
          fal: {
            provider: "fal",
            id: "fal-ai/veo3.1/image-to-video",
            pricing: {
              type: "per_second",
              usd_per_second: {
                "720p": { audio: 0.4, silent: 0.2 },
                "1080p": { audio: 0.4, silent: 0.2 },
                "4k": { audio: 0.6, silent: 0.4 },
              },
            },
            avg_cost_usd: 3.2, // 1080p audio × 8s default
            url: "https://fal.ai/models/fal-ai/veo3.1/image-to-video",
          },
          // OpenRouter — async `/api/v1/videos` (job → poll → unsigned url).
          // Text-to-video + image-to-video; native audio. "from $0.40/s"
          // (verified 2026-06-29, https://openrouter.ai/google/veo-3.1).
          openrouter: {
            provider: "openrouter",
            id: "google/veo-3.1",
            pricing: {
              type: "per_second",
              usd_per_second: {
                "720p": { audio: 0.4 },
                "1080p": { audio: 0.4 },
              },
            },
            avg_cost_usd: 3.2, // 1080p audio × 8s default
            url: "https://openrouter.ai/google/veo-3.1",
          },
        },
      },
      // ByteDance — Seedance 2.0
      // -----------------------------------------------------------------
      "bytedance/seedance-2.0": {
        id: "bytedance/seedance-2.0",
        label: "Seedance 2.0",
        deprecated: false,
        short_description:
          "ByteDance's state-of-the-art video model — top-tier image-to-video with reference and editing modes.",
        vendor: "bytedance",
        listed: true,
        aspect_ratios: ["16:9", "9:16", "1:1"],
        min_duration: 5,
        max_duration: 15,
        audio: true,
        speed_label: "slow",
        default: {
          resolution: "720p",
          aspect_ratio: "16:9",
          duration: 5,
          audio: true,
        },
        url: "https://seed.bytedance.com/en/seedance2_0",
        providers: {
          // Vercel AI Gateway — image-to-video. Per-second by resolution; audio
          // bundled into the rate (no separate silent meter). 1080p exists but
          // its per-second rate is unconfirmed; a `bytedance/seedance-2.0-fast`
          // route also exists (~20% cheaper).
          // https://vercel.com/changelog/seedance-2.0-video-now-available-on-ai-gateway
          vercel: {
            provider: "vercel",
            id: "bytedance/seedance-2.0",
            pricing: {
              type: "per_second",
              usd_per_second: {
                "480p": { audio: 0.092 },
                "720p": { audio: 0.199 },
              },
            },
            avg_cost_usd: 1.0, // 720p audio × 5s default (≈ $0.995)
          },
          // OpenRouter — async `/api/v1/videos`. Flat $0.06726/s (verified
          // 2026-06-29, https://openrouter.ai/bytedance/seedance-2.0) — far
          // below Vercel's per-resolution rate (the proprietary-pricing-
          // diverges finding, #908). No separate silent meter surfaced.
          openrouter: {
            provider: "openrouter",
            id: "bytedance/seedance-2.0",
            pricing: {
              type: "per_second",
              usd_per_second: {
                "480p": { audio: 0.06726 },
                "720p": { audio: 0.06726 },
              },
            },
            avg_cost_usd: 0.34, // 720p audio × 5s default
            url: "https://openrouter.ai/bytedance/seedance-2.0",
          },
          // Also served by fal.ai and Replicate — add those bindings once
          // their per-second rates are verified.
        },
      },
      // -----------------------------------------------------------------
      // xAI — Grok Imagine Video 1.5
      // -----------------------------------------------------------------
      // Image-to-video only (no t2v, per xAI docs); native lip-synced audio
      // bundled into the rate. Per-second by resolution, identical on Vercel
      // (no markup) and fal: $0.08/s @480p, $0.14/s @720p, $0.25/s @1080p.
      // Both also bill $0.01 per input image, captured separately from the
      // output meter.
      "xai/grok-imagine-video-1.5": {
        id: "xai/grok-imagine-video-1.5",
        label: "Grok Imagine Video 1.5",
        deprecated: false,
        short_description:
          "xAI's image-to-video model — animates a still into cinematic video with native, lip-synced audio.",
        vendor: "xai",
        listed: true,
        aspect_ratios: ["16:9", "9:16"],
        min_duration: 1,
        max_duration: 15,
        audio: true,
        speed_label: "fast",
        default: {
          resolution: "720p",
          aspect_ratio: "16:9",
          duration: 5,
          audio: true,
        },
        url: "https://docs.x.ai/developers/models/grok-imagine-video-1.5",
        providers: {
          // Vercel AI Gateway — image-to-video; mirrors xAI's list price (no markup).
          // https://vercel.com/changelog/grok-imagine-video-1-5-on-ai-gateway
          vercel: {
            provider: "vercel",
            id: "xai/grok-imagine-video-1.5",
            pricing: {
              type: "per_second",
              usd_per_second: {
                "480p": { audio: 0.08 },
                "720p": { audio: 0.14 },
                "1080p": { audio: 0.25 },
              },
              usd_per_input_image: 0.01,
            },
            avg_cost_usd: 0.71, // 720p audio × 5s + one input image
            url: "https://vercel.com/ai-gateway/models/grok-imagine-video-1.5",
          },
          // fal.ai — image-to-video endpoint; same per-second rate.
          // https://fal.ai/models/xai/grok-imagine-video/v1.5/image-to-video
          fal: {
            provider: "fal",
            id: "xai/grok-imagine-video/v1.5/image-to-video",
            pricing: {
              type: "per_second",
              usd_per_second: {
                "480p": { audio: 0.08 },
                "720p": { audio: 0.14 },
                "1080p": { audio: 0.25 },
              },
              usd_per_input_image: 0.01,
            },
            avg_cost_usd: 0.71, // 720p audio × 5s + one input image
            url: "https://fal.ai/models/xai/grok-imagine-video/v1.5/image-to-video",
          },
        },
      },
    } as const;

    export const video_model_ids = Object.keys(models) as VideoModelId[];

    /**
     * The binding for a specific provider, or `null` if that provider does
     * not serve this model.
     */
    export function binding(
      card: VideoModelCard,
      provider: VideoProvider
    ): VideoProviderBinding | null {
      return card.providers[provider] ?? null;
    }

    let _listed: readonly VideoModelCard[] | null = null;
    /** Cards enabled in Grida model selection. Computed once and frozen — the
     *  catalog is static, so callers can call freely without risking mutation
     *  of the shared view. */
    export const listed_models = (): readonly VideoModelCard[] =>
      (_listed ??= Object.freeze(
        Object.values(models).filter(
          (card): card is VideoModelCard => !!card && card.listed
        )
      ));
  }

  // ── models.image_tools ────────────────────────────────────────────

  /**
   * Image-tool model catalogue — non-generator image models
   * (background removal, upscaling, etc.) routed through Replicate.
   * Separate from `models.image` because the schema is simpler (flat
   * per-invocation cost) and these models surface as canvas tools,
   * not as full image generators.
   */
  export namespace image_tools {
    export type ImageToolModelId =
      | "recraft-ai/recraft-remove-background"
      | "851-labs/background-remover"
      | "bria/remove-background"
      | "nightmareai/real-esrgan";

    export type ImageToolModelCategory =
      | "image/tool/remove-background"
      | "image/tool/upscale";

    export type ImageToolModelCard = {
      id: ImageToolModelId;
      label: string;
      url: string;
      category: ImageToolModelCategory;
      /** Cost per invocation in USD (flat rate from provider). */
      cost_usd: number;
    };

    export const models: Record<ImageToolModelId, ImageToolModelCard> = {
      "recraft-ai/recraft-remove-background": {
        id: "recraft-ai/recraft-remove-background",
        label: "Recraft Remove Background",
        url: "https://replicate.com/recraft-ai/recraft-remove-background",
        category: "image/tool/remove-background",
        cost_usd: 0.01,
      },
      "851-labs/background-remover": {
        id: "851-labs/background-remover",
        label: "851 Labs Background Remover",
        url: "https://replicate.com/851-labs/background-remover",
        category: "image/tool/remove-background",
        cost_usd: 0.00048,
      },
      "bria/remove-background": {
        id: "bria/remove-background",
        label: "Bria Remove Background",
        url: "https://replicate.com/bria/remove-background",
        category: "image/tool/remove-background",
        cost_usd: 0.018,
      },
      "nightmareai/real-esrgan": {
        id: "nightmareai/real-esrgan",
        label: "Real-ESRGAN",
        url: "https://replicate.com/nightmareai/real-esrgan",
        category: "image/tool/upscale",
        cost_usd: 0.002,
      },
    } as const;
  }

  // ── models.embedding ──────────────────────────────────────────────

  /**
   * Embedding-model catalogue.
   *
   * Powers the Grida Library retrieval pipeline: a single multimodal
   * model embeds both an asset's image (`__image` vector) and its text
   * (`__text` vector), and the editor embeds the search query — all into
   * one shared space so similarity (image↔image) and semantic search
   * (text↔text, with a cross-modal floor) are comparable.
   *
   * This card is the SINGLE SOURCE OF THE CONSISTENCY INVARIANT: the
   * worker (document side) and the editor (query side) MUST use the same
   * `id`, `dimensions`, and normalization. Drift makes the stored vectors
   * and query vectors incomparable and silently breaks retrieval.
   *
   * Provider routing is a runtime concern (prod = Vercel AI Gateway,
   * local prep = OpenRouter via BYOK precedence); the `id` is identical
   * across both, so the catalogue carries no provider binding.
   */
  export namespace embedding {
    export type EmbeddingModelId = "google/gemini-embedding-2";

    export type EmbeddingModelCategory = "embedding/multimodal";

    /**
     * Per-input-token pricing (USD per 1M tokens). Embeddings are
     * input-only — there is no output charge.
     */
    export type PerTokenInputPricing = {
      type: "per_token_input";
      input: number;
    };

    export type EmbeddingModelCard = {
      id: EmbeddingModelId;
      label: string;
      deprecated: boolean;
      short_description: string;
      vendor: Vendor;
      category: EmbeddingModelCategory;
      /**
       * Configured output dimensionality for the Grida pipeline. MUST equal
       * the DB `vector(N)` column dim and the worker's configured dim.
       * Gemini Embedding 2 is natively 3072 and Matryoshka-truncatable to
       * 1536 / 768; the library pipeline uses 1536 (largest dim indexable
       * under pgvector's HNSW 2000-dim cap).
       */
      dimensions: number;
      /**
       * Whether output vectors are unit-normalized (cosine-ready). The
       * pipeline L2-normalizes after MRL truncation regardless; this
       * records the contract both sides rely on.
       */
      normalized: boolean;
      /** Accepts image AND text inputs into one shared space. */
      multimodal: boolean;
      pricing: PerTokenInputPricing;
      /**
       * Coarse per-call budget estimate in USD (rate-limiter only, not
       * displayed). A search query is a handful of tokens, so this is
       * negligible.
       */
      avg_cost_usd: number;
      /** Public model page. */
      url: string;
    };

    export const models: Record<EmbeddingModelId, EmbeddingModelCard> = {
      "google/gemini-embedding-2": {
        id: "google/gemini-embedding-2",
        label: "Gemini Embedding 2",
        deprecated: false,
        short_description:
          "Natively multimodal embedding (text + image into one space); 3072-d, MRL-truncatable.",
        vendor: "google",
        category: "embedding/multimodal",
        dimensions: 1536,
        normalized: true,
        multimodal: true,
        // VERIFY before prod: models.dev lists no per-1M price for
        // gemini-embedding-2 yet; using the gemini-embedding-001 family
        // input rate ($0.15 / 1M) as a conservative stand-in.
        pricing: { type: "per_token_input", input: 0.15 },
        avg_cost_usd: 0.00002,
        url: "https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2-preview",
      },
    } as const;

    export const embedding_model_ids = Object.keys(
      models
    ) as EmbeddingModelId[];

    export function modelCardById(id: string): EmbeddingModelCard | undefined {
      return (models as Record<string, EmbeddingModelCard>)[id];
    }

    /**
     * Canonical model id + dim used by BOTH the editor query embedder and
     * the worker. Import these rather than hard-coding to keep the two
     * sides in lock-step.
     */
    export const LIBRARY_EMBEDDING_MODEL_ID: EmbeddingModelId =
      "google/gemini-embedding-2";
    export const LIBRARY_EMBEDDING_DIMENSIONS = 1536;
  }

  // ── models.snapshot ───────────────────────────────────────────────
  //
  // Catalogue distribution — see docs/wg/platform/hosted-ai.md.
  //
  // The bundled catalogue is a SEED, not the authority. A host may fetch
  // a published snapshot and resolve against that instead, so a model
  // added on the server reaches an already-installed binary without a
  // release. This namespace is pure data + pure resolution: fetching,
  // caching, and scheduling belong to the host (`ModelCatalogStore` in
  // `@grida/agent`).

  export namespace snapshot {
    /**
     * Wire schema major. {@link parse} rejects anything else.
     *
     * Additive evolution does NOT bump this — v1 parsers ignore fields
     * they do not know, so publishing a new optional field is safe. A
     * breaking shape change publishes at a NEW route path and bumps this,
     * leaving old clients on the old path (or rejecting the body and
     * falling back to the seed — fail-safe either way).
     */
    export const SCHEMA = 1;

    /** Text catalogue + tier map. Replaces the seed's wholesale. */
    export interface TextSection {
      /**
       * Full replacement for `models.text.catalog`. Each key equals its
       * entry's `id`. Deliberately NOT merged with the seed: removing a
       * model from the catalogue is the kill switch, and a merge would
       * defeat it on every installed client.
       */
      catalog: Record<string, text.ModelSpec>;
      /** Full replacement for `TIER_MODEL_IDS`. Every id is a `catalog` key. */
      tier_model_ids: Record<ModelTier, string>;
    }

    /**
     * A published catalogue.
     *
     * Sections are independent: a media section that fails validation is
     * dropped on its own and the rest of the snapshot still applies. Only
     * `text` is load-bearing enough to reject the whole payload, because a
     * host with no text catalogue cannot run a turn at all.
     */
    export interface Snapshot {
      /** Always {@link SCHEMA} on a parsed value. */
      schema: number;
      /** Opaque publisher version (a deploy sha; `"seed"` for the bundle). */
      version: string;
      /** Informational only; never drives resolution. */
      generated_at?: string;
      text: TextSection;
      /** Absent ⇒ the consumer keeps its bundled image catalogue. */
      image?: ImageSection;
      /** Absent ⇒ the consumer keeps its bundled video catalogue. */
      video?: VideoSection;
    }

    /** Image catalogue. Replaces `models.image.models` wholesale. */
    export interface ImageSection {
      models: Record<string, image.ImageModelCard>;
    }

    /** Video catalogue. Replaces `models.video.models` wholesale. */
    export interface VideoSection {
      models: Record<string, video.VideoModelCard>;
    }

    /**
     * The read surface for one media catalogue. Mirrors the lookups the
     * corresponding namespace exports, so a call site reads the same
     * whether it is on the bundled catalogue or a published one.
     */
    export interface MediaView<Card, Provider extends string, Binding> {
      readonly models: Readonly<Record<string, Card>>;
      /** Cards in the curated user-facing list (`listed: true`). */
      listed(): readonly Card[];
      /** Exact namespaced id, or a bare post-slash name. No date tolerance. */
      cardById(modelId: string): Card | undefined;
      /** That provider's binding, or `null` if it does not serve the model. */
      binding(card: Card, provider: Provider): Binding | null;
    }

    export type ImageView = MediaView<
      image.ImageModelCard,
      image.ImageProvider,
      image.ImageProviderBinding
    >;

    export type VideoView = MediaView<
      video.VideoModelCard,
      video.VideoProvider,
      video.VideoProviderBinding
    >;

    /**
     * Resolution surface over one snapshot — the read API a host swaps
     * atomically on refresh. Mirrors the `models.text.*` shape so a call
     * site reads the same either way.
     *
     * Build only from {@link seed} or a {@link parse} result: `by_tier`
     * assumes tier ids resolve, which is exactly what `parse` validates.
     */
    export interface View {
      readonly catalog: Readonly<Record<string, text.ModelSpec>>;
      readonly tier_model_ids: Readonly<Record<ModelTier, string>>;
      readonly by_tier: Readonly<Record<ModelTier, text.ModelSpec>>;
      /**
       * Exact catalogue membership — `catalog[modelId] !== undefined`.
       *
       * This, NOT {@link modelSpecById}, is what a gate asks. The two
       * differ on purpose: `modelSpecById` also matches a bare name and a
       * date suffix, which is right when you want a model's LIMITS or
       * RATES (a near-miss id is still that model), and wrong when you
       * are deciding what id to forward to a provider — a provider is
       * given the id the caller sent, and only an exact catalogue id is
       * one it will recognize.
       */
      has(modelId: string): boolean;
      /** Same matching rules as {@link models.text.modelSpecById}. */
      modelSpecById(modelId: string): text.ModelSpec | undefined;
      /** Same precedence as {@link models.text.registry.resolve}. */
      resolve(
        modelId: string,
        custom?: readonly text.registry.CustomModelSpec[]
      ): text.registry.ResolvedModelSpec | undefined;
      readonly image: ImageView;
      readonly video: VideoView;
    }

    const TIERS: readonly ModelTier[] = ["nano", "mini", "pro", "max"];

    /** Bounds on untrusted input. Generous — the real catalogue is ~15. */
    const MAX_CATALOG_ENTRIES = 256;

    /**
     * Plausible model-id shape. Also the reason a catalogue key can never
     * be `__proto__`: assigning that key to an object literal would
     * mutate its prototype instead of adding an entry.
     */
    const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

    function isRecord(v: unknown): v is Record<string, unknown> {
      return typeof v === "object" && v !== null && !Array.isArray(v);
    }

    function isText(v: unknown): v is string {
      return typeof v === "string" && v.length > 0;
    }

    /** A token count: positive and exactly representable. */
    function isCount(v: unknown): v is number {
      return typeof v === "number" && Number.isSafeInteger(v) && v > 0;
    }

    /** A price or multiplier: finite and non-negative (free is legal). */
    function isRate(v: unknown): v is number {
      return typeof v === "number" && Number.isFinite(v) && v >= 0;
    }

    function parseCost(v: unknown): text.ModelCostPerMillion | undefined {
      if (!isRecord(v) || !isRate(v.input) || !isRate(v.output)) {
        return undefined;
      }
      const cost: text.ModelCostPerMillion = {
        input: v.input,
        output: v.output,
      };
      if (v.cacheRead !== undefined) {
        if (!isRate(v.cacheRead)) return undefined;
        cost.cacheRead = v.cacheRead;
      }
      if (v.cacheWrite !== undefined) {
        if (!isRate(v.cacheWrite)) return undefined;
        cost.cacheWrite = v.cacheWrite;
      }
      if (v.longContext !== undefined) {
        const lc = v.longContext;
        if (
          !isRecord(lc) ||
          !isCount(lc.inputTokensAbove) ||
          !isRate(lc.inputMultiplier) ||
          !isRate(lc.outputMultiplier)
        ) {
          return undefined;
        }
        cost.longContext = {
          inputTokensAbove: lc.inputTokensAbove,
          inputMultiplier: lc.inputMultiplier,
          outputMultiplier: lc.outputMultiplier,
        };
      }
      return cost;
    }

    function parseSpec(key: string, v: unknown): text.ModelSpec | undefined {
      if (!MODEL_ID_PATTERN.test(key)) return undefined;
      if (!isRecord(v) || v.id !== key) return undefined;
      if (!isText(v.label)) return undefined;
      if (typeof v.multimodal !== "boolean") return undefined;
      if (typeof v.tool_call !== "boolean") return undefined;
      if (!isCount(v.contextWindow) || !isCount(v.outputLimit))
        return undefined;
      if (!Array.isArray(v.imageInputMimes)) return undefined;
      const imageInputMimes: text.ImageInputMime[] = [];
      for (const mime of v.imageInputMimes) {
        if (typeof mime !== "string" || !mime.startsWith("image/")) {
          return undefined;
        }
        imageInputMimes.push(mime as text.ImageInputMime);
      }
      const cost = parseCost(v.cost);
      if (!cost) return undefined;

      const spec: text.ModelSpec = {
        id: key,
        label: v.label,
        multimodal: v.multimodal,
        imageInputMimes,
        tool_call: v.tool_call,
        contextWindow: v.contextWindow,
        outputLimit: v.outputLimit,
        cost,
      };
      if (v.short_label !== undefined) {
        if (!isText(v.short_label)) return undefined;
        spec.short_label = v.short_label;
      }
      if (v.deprecated !== undefined) {
        if (typeof v.deprecated !== "boolean") return undefined;
        spec.deprecated = v.deprecated;
      }
      return spec;
    }

    // ── media validation ──────────────────────────────────────────────

    /** Bounds on the free-form key maps inside media pricing. */
    const MAX_PRICE_KEYS = 64;

    /**
     * Keys that mutate an object instead of adding an entry.
     *
     * Media pricing carries FREE-FORM key maps — image `tiers`
     * (`"medium/1024x1024"`) and video `usd_per_second` (`"720p"`) — which
     * {@link MODEL_ID_PATTERN} does not cover. Copying a JSON-parsed
     * `__proto__` key onto a plain object replaces that object's prototype
     * rather than adding a key, and a later lookup then resolves through
     * the prototype chain: `tiers["anything"]` would return an
     * attacker-chosen number while `Object.keys(tiers)` still looks clean.
     * That reads as a real price to a `!== undefined` billing guard.
     */
    const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    /** A bounded map of free-form keys to validated values, or undefined. */
    function parseKeyedMap<T>(
      v: unknown,
      parseValue: (value: unknown) => T | undefined
    ): Record<string, T> | undefined {
      if (!isRecord(v)) return undefined;
      const entries = Object.entries(v);
      if (entries.length === 0 || entries.length > MAX_PRICE_KEYS) {
        return undefined;
      }
      const out: Record<string, T> = {};
      for (const [key, value] of entries) {
        if (!isText(key) || UNSAFE_KEYS.has(key)) return undefined;
        const parsed = parseValue(value);
        if (parsed === undefined) return undefined;
        out[key] = parsed;
      }
      return out;
    }

    function parseRate(v: unknown): number | undefined {
      return isRate(v) ? v : undefined;
    }

    /** Copy `key` from `src` onto `dst` only when present and valid. */
    function optional<T extends object>(
      dst: T,
      src: Record<string, unknown>,
      key: string & keyof T,
      ok: (v: unknown) => boolean
    ): boolean {
      const value = src[key];
      if (value === undefined) return true;
      if (!ok(value)) return false;
      // Conditional assign, never `{ k: src[k] }` — an own key holding
      // `undefined` is dropped by JSON.stringify and breaks round-trip.
      (dst as Record<string, unknown>)[key] = value;
      return true;
    }

    function parsePerTokenRates(
      v: Record<string, unknown>,
      into: Record<string, unknown>
    ): boolean {
      if (!isRate(v.input) || !isRate(v.output)) return false;
      into.input = v.input;
      into.output = v.output;
      for (const key of ["cached_input", "image_input", "cached_image_input"]) {
        if (v[key] === undefined) continue;
        if (!isRate(v[key])) return false;
        into[key] = v[key];
      }
      return true;
    }

    function parseImagePricing(
      v: unknown
    ): image.ImageModelPricing | undefined {
      if (!isRecord(v)) return undefined;
      if (v.type === "per_image_flat") {
        // Free is legal — `image-cost.ts` distinguishes an absent tier
        // from a $0 one.
        return isRate(v.usd)
          ? { type: "per_image_flat", usd: v.usd }
          : undefined;
      }
      if (v.type === "per_token") {
        const out: Record<string, unknown> = { type: "per_token" };
        return parsePerTokenRates(v, out)
          ? (out as image.PerTokenPricing)
          : undefined;
      }
      if (v.type === "per_image_tiered") {
        const tiers = parseKeyedMap(v.tiers, parseRate);
        if (!tiers) return undefined;
        const out: image.PerImageTieredPricing = {
          type: "per_image_tiered",
          tiers,
        };
        if (v.tokens !== undefined) {
          if (!isRecord(v.tokens)) return undefined;
          const tokens: Record<string, unknown> = {};
          if (!parsePerTokenRates(v.tokens, tokens)) return undefined;
          out.tokens = tokens as image.PerTokenRates;
        }
        return out;
      }
      // An arm this client cannot price. `image-cost.ts` switches on the
      // three known ones and would fall through to `undefined`.
      return undefined;
    }

    function parseVideoPricing(v: unknown): video.PerSecondPricing | undefined {
      if (!isRecord(v) || v.type !== "per_second") return undefined;
      const usd_per_second = parseKeyedMap(v.usd_per_second, (modes) => {
        if (!isRecord(modes)) return undefined;
        const out: Partial<Record<video.AudioMode, number>> = {};
        for (const mode of ["audio", "silent"] as const) {
          if (modes[mode] === undefined) continue;
          if (!isRate(modes[mode])) return undefined;
          out[mode] = modes[mode];
        }
        // Absence IS the capability statement, but an empty entry states
        // nothing and would make a resolution label unpriceable.
        return Object.keys(out).length > 0 ? out : undefined;
      });
      if (!usd_per_second) return undefined;
      const pricing: video.PerSecondPricing = {
        type: "per_second",
        usd_per_second,
      };
      if (!optional(pricing, v, "usd_per_input_image", isRate))
        return undefined;
      return pricing;
    }

    /**
     * Provider bindings, keyed by provider.
     *
     * UNKNOWN PROVIDER KEYS ARE DROPPED rather than rejecting the card.
     * A provider this client has no adapter for is not an error — it is a
     * route it cannot take — and rejecting would make adding a provider a
     * breaking publish. (The AI SDK gateway learned this the hard way: it
     * validated its model-kind field as a hard enum, so the day a new kind
     * shipped the whole listing failed to parse; it now accepts loosely
     * and filters unknown rows.)
     */
    function parseBindings<P extends string, B>(
      v: unknown,
      known: readonly P[],
      parseBinding: (provider: P, value: unknown) => B | undefined
    ): Partial<Record<P, B>> | undefined {
      if (!isRecord(v)) return undefined;
      const out: Partial<Record<P, B>> = {};
      for (const provider of known) {
        const value = v[provider];
        if (value === undefined) continue;
        const binding = parseBinding(provider, value);
        if (!binding) return undefined;
        out[provider] = binding;
      }
      // Every card must be servable by something.
      return Object.keys(out).length > 0 ? out : undefined;
    }

    const IMAGE_PROVIDERS: readonly image.ImageProvider[] = [
      "vercel",
      "fal",
      "openrouter",
    ];
    const VIDEO_PROVIDERS: readonly video.VideoProvider[] = [
      "vercel",
      "fal",
      "openrouter",
    ];

    function parseImageBinding(
      provider: image.ImageProvider,
      v: unknown
    ): image.ImageProviderBinding | undefined {
      if (!isRecord(v)) return undefined;
      // The `provider` field is redundant with its key by design; validate
      // the redundancy rather than normalising it away.
      if (v.provider !== provider) return undefined;
      if (!isText(v.id) || !isRate(v.avg_cost_usd)) return undefined;
      const pricing = parseImagePricing(v.pricing);
      if (!pricing) return undefined;
      const out: image.ImageProviderBinding = {
        provider,
        id: v.id,
        pricing,
        avg_cost_usd: v.avg_cost_usd,
      };
      if (!optional(out, v, "deprecated", (x) => typeof x === "boolean")) {
        return undefined;
      }
      if (!optional(out, v, "url", isText)) return undefined;
      if (v.references !== undefined) {
        const refs = v.references;
        // Dropping this silently disables image-to-image routing.
        if (!isRecord(refs) || !isText(refs.id) || !isCount(refs.max)) {
          return undefined;
        }
        out.references = { id: refs.id, max: refs.max };
      }
      return out;
    }

    function parseVideoBinding(
      provider: video.VideoProvider,
      v: unknown
    ): video.VideoProviderBinding | undefined {
      if (!isRecord(v)) return undefined;
      if (v.provider !== provider) return undefined;
      if (!isText(v.id) || !isRate(v.avg_cost_usd)) return undefined;
      const pricing = parseVideoPricing(v.pricing);
      if (!pricing) return undefined;
      const out: video.VideoProviderBinding = {
        provider,
        id: v.id,
        pricing,
        avg_cost_usd: v.avg_cost_usd,
      };
      if (!optional(out, v, "deprecated", (x) => typeof x === "boolean")) {
        return undefined;
      }
      if (!optional(out, v, "url", isText)) return undefined;
      return out;
    }

    /** `T | null` — null is meaningful here, a missing key is not. */
    function nullable<T>(
      v: unknown,
      parseValue: (value: unknown) => T | undefined
    ): T | null | undefined {
      if (v === null) return null;
      return parseValue(v);
    }

    function parseSizes(v: unknown): image.SizeSpec[] | undefined {
      if (!Array.isArray(v)) return undefined;
      const out: image.SizeSpec[] = [];
      for (const size of v) {
        if (
          !Array.isArray(size) ||
          size.length !== 3 ||
          !isCount(size[0]) ||
          !isCount(size[1]) ||
          typeof size[2] !== "string" ||
          !/^\d+:\d+$/.test(size[2])
        ) {
          return undefined;
        }
        out.push([size[0], size[1], size[2] as image.AspectRatioString]);
      }
      return out;
    }

    function parseConstraints(
      v: unknown
    ): image.ImageSizeConstraints | undefined {
      if (!isRecord(v)) return undefined;
      const out: image.ImageSizeConstraints = {};
      for (const key of [
        "step",
        "min_edge",
        "max_edge",
        "min_pixels",
        "max_pixels",
      ] as const) {
        if (v[key] === undefined) continue;
        if (!isCount(v[key])) return undefined;
        out[key] = v[key];
      }
      if (v.aspect_ratio !== undefined) {
        const ar = v.aspect_ratio;
        if (!isRecord(ar)) return undefined;
        const bounds: { min?: number; max?: number } = {};
        for (const key of ["min", "max"] as const) {
          if (ar[key] === undefined) continue;
          if (!isRate(ar[key])) return undefined;
          bounds[key] = ar[key];
        }
        out.aspect_ratio = bounds;
      }
      return out;
    }

    function isAspectRatio(v: unknown): v is image.AspectRatioString {
      return typeof v === "string" && /^\d+:\d+$/.test(v);
    }

    function parseImageCard(
      key: string,
      v: unknown
    ): image.ImageModelCard | undefined {
      if (!MODEL_ID_PATTERN.test(key)) return undefined;
      if (!isRecord(v) || v.id !== key) return undefined;
      if (!isText(v.label) || !isText(v.short_description)) return undefined;
      // `vendor` and `speed_label` are closed unions in TypeScript but are
      // validated as text on the wire: a model from a new vendor must not
      // require a client release, which is the whole point of publishing.
      if (!isText(v.vendor) || !isText(v.speed_label)) return undefined;
      if (!isText(v.speed_max)) return undefined;
      if (typeof v.deprecated !== "boolean") return undefined;
      if (typeof v.listed !== "boolean") return undefined;
      if (!isRate(v.avg_cost_usd)) return undefined;

      const pricing = parseImagePricing(v.pricing);
      if (!pricing) return undefined;

      const styles = nullable(v.styles, (x) =>
        Array.isArray(x) && x.every(isText) ? (x as string[]) : undefined
      );
      if (styles === undefined) return undefined;
      const sizes = nullable(v.sizes, parseSizes);
      if (sizes === undefined) return undefined;
      const constraints = nullable(v.constraints, parseConstraints);
      if (constraints === undefined) return undefined;

      if (!isRecord(v.default)) return undefined;
      if (!isCount(v.default.width) || !isCount(v.default.height)) {
        return undefined;
      }
      if (!isAspectRatio(v.default.aspect_ratio)) return undefined;

      const providers = parseBindings(
        v.providers,
        IMAGE_PROVIDERS,
        parseImageBinding
      );
      if (!providers) return undefined;
      // The card's primary provider must actually be bound — the hosted
      // arm and `/api/v1/ai/models` both filter on it.
      if (v.provider !== "vercel" || !providers.vercel) return undefined;
      // The one-key promise: a curated card is servable by EVERY provider,
      // so one connected key serves the whole list. `resolve-image.ts`
      // relies on it, and a listed card missing a binding is a silent
      // capability hole.
      if (v.listed && IMAGE_PROVIDERS.some((p) => !providers[p])) {
        return undefined;
      }

      const card: image.ImageModelCard = {
        id: key,
        label: v.label,
        deprecated: v.deprecated,
        short_description: v.short_description,
        vendor: v.vendor as Vendor,
        provider: "vercel",
        listed: v.listed,
        providers,
        styles,
        speed_label: v.speed_label as image.SpeedLabel,
        speed_max: v.speed_max,
        sizes,
        constraints,
        pricing,
        avg_cost_usd: v.avg_cost_usd,
        default: {
          width: v.default.width,
          height: v.default.height,
          aspect_ratio: v.default.aspect_ratio,
        },
      };
      if (!optional(card, v, "listed_reason", isText)) return undefined;
      return card;
    }

    function parseVideoCard(
      key: string,
      v: unknown
    ): video.VideoModelCard | undefined {
      if (!MODEL_ID_PATTERN.test(key)) return undefined;
      if (!isRecord(v) || v.id !== key) return undefined;
      if (!isText(v.label) || !isText(v.short_description)) return undefined;
      if (!isText(v.vendor) || !isText(v.speed_label) || !isText(v.url)) {
        return undefined;
      }
      if (typeof v.deprecated !== "boolean") return undefined;
      // Not `typeof === "boolean"`: a video card exists ONLY for a model in
      // Grida selection, so the type pins `listed: true`. A payload saying
      // otherwise is malformed, not a hidden card.
      if (v.listed !== true) return undefined;
      if (typeof v.audio !== "boolean") return undefined;
      if (!isCount(v.min_duration) || !isCount(v.max_duration))
        return undefined;
      if (v.min_duration > v.max_duration) return undefined;
      if (
        !Array.isArray(v.aspect_ratios) ||
        !v.aspect_ratios.every(isAspectRatio)
      ) {
        return undefined;
      }

      if (!isRecord(v.default)) return undefined;
      const dflt = v.default;
      if (!isText(dflt.resolution) || !isAspectRatio(dflt.aspect_ratio)) {
        return undefined;
      }
      if (!isCount(dflt.duration) || typeof dflt.audio !== "boolean") {
        return undefined;
      }
      if (dflt.duration < v.min_duration || dflt.duration > v.max_duration) {
        return undefined;
      }

      const providers = parseBindings(
        v.providers,
        VIDEO_PROVIDERS,
        parseVideoBinding
      );
      if (!providers) return undefined;
      // Provider selection is deferred to the runtime, so the contract is
      // route-agnostic: whichever provider it later picks must be able to
      // serve the model's DEFAULT config. Deliberately NOT the image
      // one-key rule — the video ecosystem is fragmented and no model is
      // on every provider.
      const mode: video.AudioMode = dflt.audio ? "audio" : "silent";
      for (const binding of Object.values(providers)) {
        const rate = binding.pricing.usd_per_second[dflt.resolution]?.[mode];
        if (!(typeof rate === "number" && rate > 0)) return undefined;
      }

      const card: video.VideoModelCard = {
        id: key,
        label: v.label,
        deprecated: v.deprecated,
        short_description: v.short_description,
        vendor: v.vendor as Vendor,
        listed: true,
        aspect_ratios: v.aspect_ratios as image.AspectRatioString[],
        min_duration: v.min_duration,
        max_duration: v.max_duration,
        audio: v.audio,
        speed_label: v.speed_label as image.SpeedLabel,
        default: {
          resolution: dflt.resolution,
          aspect_ratio: dflt.aspect_ratio,
          duration: dflt.duration,
          audio: dflt.audio,
        },
        url: v.url,
        providers,
      };
      return card;
    }

    /**
     * A media section, or `undefined` when absent or unusable.
     *
     * Unusable is not fatal: the caller drops just this section and keeps
     * the rest of the snapshot, so a bad image catalogue can never take
     * the text catalogue — or the whole daemon — down with it.
     */
    function parseMediaSection<Card>(
      v: unknown,
      parseCard: (key: string, value: unknown) => Card | undefined
    ): { models: Record<string, Card> } | undefined {
      if (!isRecord(v) || !isRecord(v.models)) return undefined;
      const entries = Object.entries(v.models);
      if (entries.length === 0 || entries.length > MAX_CATALOG_ENTRIES) {
        return undefined;
      }
      const out: Record<string, Card> = {};
      for (const [key, value] of entries) {
        const card = parseCard(key, value);
        if (!card) return undefined;
        out[key] = card;
      }
      return { models: out };
    }

    /**
     * The bundled catalogue expressed as a snapshot — the seed a host
     * starts from and falls back to. Also what the publishing endpoint
     * serves, which is why `parse(JSON.parse(JSON.stringify(seed())))`
     * round-trips exactly (pinned in `__tests__/snapshot.test.ts`).
     */
    export function seed(opts?: { version?: string }): Snapshot {
      return {
        schema: SCHEMA,
        version: opts?.version ?? "seed",
        text: {
          catalog: { ...text.catalog },
          tier_model_ids: { ...TIER_MODEL_IDS },
        },
        image: {
          models: { ...(image.models as Record<string, image.ImageModelCard>) },
        },
        video: {
          models: { ...(video.models as Record<string, video.VideoModelCard>) },
        },
      };
    }

    /**
     * Validate an untrusted published catalogue. Returns `null` rather
     * than throwing — a host must be able to keep serving on a bad
     * payload, and whole-or-reject is what keeps a half-applied
     * catalogue from ever existing.
     *
     * Strict on shape and on the invariants resolution depends on;
     * lenient on unknown fields, so a newer publisher stays readable.
     */
    export function parse(data: unknown): Snapshot | null {
      if (!isRecord(data) || data.schema !== SCHEMA) return null;
      if (!isText(data.version)) return null;
      if (!isRecord(data.text) || !isRecord(data.text.catalog)) return null;

      const entries = Object.entries(data.text.catalog);
      if (entries.length === 0 || entries.length > MAX_CATALOG_ENTRIES) {
        return null;
      }
      const catalog: Record<string, text.ModelSpec> = {};
      for (const [key, value] of entries) {
        const spec = parseSpec(key, value);
        if (!spec) return null;
        catalog[key] = spec;
      }

      const rawTiers = data.text.tier_model_ids;
      if (!isRecord(rawTiers)) return null;
      const tier_model_ids = {} as Record<ModelTier, string>;
      for (const tier of TIERS) {
        const id = rawTiers[tier];
        // A tier pointing outside the catalogue would leave `by_tier`
        // dangling, which every compaction limit reads.
        if (!isText(id) || !Object.hasOwn(catalog, id)) return null;
        tier_model_ids[tier] = id;
      }

      const parsed: Snapshot = {
        schema: SCHEMA,
        version: data.version,
        text: { catalog, tier_model_ids },
      };
      if (data.generated_at !== undefined) {
        if (!isText(data.generated_at)) return null;
        parsed.generated_at = data.generated_at;
      }

      // Media sections are optional and independently fallible. An absent
      // one leaves the consumer on its bundled media catalogue; an invalid
      // one is dropped the same way, because a broken image catalogue must
      // not cost a host its text catalogue too.
      if (data.image !== undefined) {
        const section = parseMediaSection(data.image, parseImageCard);
        if (section) parsed.image = section;
      }
      if (data.video !== undefined) {
        const section = parseMediaSection(data.video, parseVideoCard);
        if (section) parsed.video = section;
      }
      return parsed;
    }

    /**
     * A media read surface over one card table.
     *
     * The `listed` memo lives HERE, on the view, not on the catalogue —
     * `models.image.listed_models()` memoizes over the bundled dict and
     * can never observe a published one, so a swappable catalogue has to
     * own its own lazily-computed list.
     */
    function buildMediaView<
      Card extends { id: string; listed: boolean; providers: object },
      Provider extends string,
      Binding,
    >(models: Record<string, Card>): MediaView<Card, Provider, Binding> {
      let listed: readonly Card[] | undefined;
      return {
        models,
        listed: () =>
          (listed ??= Object.freeze(
            Object.values(models).filter((card) => card.listed)
          )),
        cardById: (modelId) => {
          if (!modelId) return undefined;
          // Same rules as `models.image.findImageModelCard`: exact when
          // namespaced, else an exact post-slash name. No date tolerance —
          // media providers don't snapshot ids the way text ones do.
          if (modelId.includes("/")) return models[modelId];
          for (const card of Object.values(models)) {
            const slash = card.id.indexOf("/");
            if (slash >= 0 && card.id.slice(slash + 1) === modelId) return card;
          }
          return undefined;
        },
        binding: (card, provider) =>
          (card.providers as Record<string, Binding>)[provider] ?? null,
      };
    }

    function build(s: Snapshot): View {
      const catalog = s.text.catalog;
      const specs = Object.values(catalog);
      const tier_model_ids = s.text.tier_model_ids;
      return {
        catalog,
        tier_model_ids,
        by_tier: {
          nano: catalog[tier_model_ids.nano],
          mini: catalog[tier_model_ids.mini],
          pro: catalog[tier_model_ids.pro],
          max: catalog[tier_model_ids.max],
        },
        has: (modelId) => Object.hasOwn(catalog, modelId),
        modelSpecById: (modelId) => specByIdOver(specs, modelId),
        resolve: (modelId, custom) => resolveOver(specs, modelId, custom),
        // A snapshot without a media section falls back to the bundled
        // catalogue for that modality only.
        image: buildMediaView(
          s.image?.models ??
            (image.models as Record<string, image.ImageModelCard>)
        ),
        video: buildMediaView(
          s.video?.models ??
            (video.models as Record<string, video.VideoModelCard>)
        ),
      };
    }

    let seedView: View | undefined;

    /**
     * A resolution surface. With no argument, the bundled catalogue's —
     * built once, so a host that never fetches pays nothing.
     */
    export function view(s?: Snapshot): View {
      if (s) return build(s);
      return (seedView ??= build(seed()));
    }
  }
}

export default models;
