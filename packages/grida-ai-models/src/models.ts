/**
 * Central model catalogue.
 *
 * The `models` namespace is the only export, also re-exported as the
 * package default (`import models from "@grida/ai-models"`). Surface:
 *
 * - `models.text.*`        — text-model spec table, tier→spec map, lookup
 * - `models.image.*`       — image-generation catalogue
 * - `models.audio.*`       — audio-generation catalogue
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
 * Routing labels on the cards — `Provider` (text/image), `audio.AudioProvider`,
 * and video's per-binding `video.VideoProvider` — are data labels only; see the
 * README for the full contract.
 *
 * @module
 */

import { TIER_MODEL_IDS, type ModelTier } from "./tiers";

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
    | "stability-ai"
    | "bytedance"
    | "xai";

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
    }

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
       * Legacy/superseded marker. The model is still callable, but a newer
       * sibling has taken its tier slot; UIs may hide or mark it.
       */
      deprecated?: boolean;
    }

    const catalogSpecs = {
      "openai/gpt-5.4-nano": {
        id: "openai/gpt-5.4-nano",
        label: "GPT-5.4 Nano",
        multimodal: true,
        tool_call: true,
        contextWindow: 400_000,
        outputLimit: 128_000,
        cost: { input: 0.2, output: 1.25, cacheRead: 0.02 },
      },
      "openai/gpt-5.4-mini": {
        id: "openai/gpt-5.4-mini",
        label: "GPT-5.4 Mini",
        multimodal: true,
        tool_call: true,
        contextWindow: 400_000,
        outputLimit: 128_000,
        cost: { input: 0.75, output: 4.5, cacheRead: 0.075 },
      },
      "openai/gpt-5.5": {
        id: "openai/gpt-5.5",
        label: "GPT-5.5",
        multimodal: true,
        tool_call: true,
        contextWindow: 1_050_000,
        outputLimit: 128_000,
        cost: { input: 5, output: 30, cacheRead: 0.5 },
      },
      "openai/gpt-5.5-pro": {
        id: "openai/gpt-5.5-pro",
        label: "GPT-5.5 Pro",
        multimodal: true,
        tool_call: true,
        contextWindow: 1_050_000,
        outputLimit: 128_000,
        cost: { input: 30, output: 180 },
      },
      "anthropic/claude-sonnet-4.6": {
        id: "anthropic/claude-sonnet-4.6",
        label: "Claude Sonnet 4.6",
        short_label: "Sonnet 4.6",
        multimodal: true,
        tool_call: true,
        contextWindow: 1_000_000,
        outputLimit: 128_000,
        cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
      },
      "anthropic/claude-opus-4.8": {
        id: "anthropic/claude-opus-4.8",
        label: "Claude Opus 4.8",
        short_label: "Opus 4.8",
        multimodal: true,
        tool_call: true,
        contextWindow: 1_000_000,
        outputLimit: 128_000,
        cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
      },
      "anthropic/claude-opus-4.7": {
        id: "anthropic/claude-opus-4.7",
        label: "Claude Opus 4.7",
        short_label: "Opus 4.7",
        multimodal: true,
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
      for (const spec of Object.values(catalogSpecs)) {
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
        tool_call: true,
        contextWindow: 8_192,
        outputLimit: 4_096,
      } as const;

      /** Fill a custom spec's gaps with {@link CUSTOM_MODEL_DEFAULTS}. */
      export function normalize(spec: CustomModelSpec): ResolvedModelSpec {
        return {
          id: spec.id,
          label: spec.label && spec.label.length > 0 ? spec.label : spec.id,
          multimodal: spec.multimodal ?? CUSTOM_MODEL_DEFAULTS.multimodal,
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
        const fromCatalog = modelSpecById(modelId);
        if (fromCatalog) return { ...fromCatalog, custom: false };
        const fromCustom = custom?.find((m) => m.id === modelId);
        return fromCustom ? normalize(fromCustom) : undefined;
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
      | "google/gemini-3-pro-image"
      // Black Forest Labs
      | "bfl/flux-2-pro"
      | "bfl/flux-kontext-max"
      | "bfl/flux-kontext-pro"
      | "bfl/flux-pro-1.1"
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
      provider: Provider;
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
  }

  // ── models.audio ──────────────────────────────────────────────────

  /**
   * Audio-generation model catalogue.
   *
   * Currently houses Google's Lyria family on Replicate. Pricing is
   * taken from the public Replicate model pages; update if the
   * provider changes its meter.
   *
   * Schema mirrors `models.image` where it makes sense — vendor,
   * provider, speed, deprecation, and a discriminated `pricing`
   * union — so audio cards can be rendered alongside image cards.
   */
  export namespace audio {
    export type AudioModelId = "google/lyria-3" | "google/lyria-3-pro";

    export type AudioModelCategory = "audio/generation";

    export type AudioProvider = "replicate";

    /**
     * Flat per-run pricing — one fee per generation regardless of duration.
     *
     * This is the meter Replicate publishes for the Lyria models today.
     */
    export type PerRunFlatPricing = {
      type: "per_run_flat";
      usd: number;
    };

    export type AudioModelPricing = PerRunFlatPricing;

    export type AudioModelCard = {
      id: AudioModelId;
      label: string;
      deprecated: boolean;
      short_description: string;
      vendor: Vendor;
      provider: AudioProvider;
      category: AudioModelCategory;
      /** Approximate output duration. */
      duration_label: string;
      /** Sample format produced by the model. */
      output_format: string;
      /** Sample rate label (e.g. "48 kHz stereo"). */
      sample_rate_label: string;
      speed_label: image.SpeedLabel;
      speed_max: string;
      pricing: AudioModelPricing;
      /**
       * Coarse estimate of cost per invocation in USD. For flat-rate
       * models this is just `pricing.usd`. Not for display.
       */
      avg_cost_usd: number;
      /** Public model page on the provider. */
      url: string;
    };

    export const models: Record<AudioModelId, AudioModelCard> = {
      "google/lyria-3": {
        id: "google/lyria-3",
        label: "Lyria 3",
        deprecated: false,
        short_description:
          "Generate 30-second 48kHz stereo music clips from text or images.",
        vendor: "google",
        provider: "replicate",
        category: "audio/generation",
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
        category: "audio/generation",
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
    } as const;

    export const audio_model_ids = Object.keys(models) as AudioModelId[];
  }

  // ── models.video ──────────────────────────────────────────────────

  /**
   * Video-generation model catalogue.
   *
   * The video provider ecosystem is **fragmented**: the same model is served
   * by several providers (Vercel AI Gateway, fal.ai, OpenRouter), each with a
   * *different id, a different meter, and different availability*. So unlike
   * `models.image`/`models.audio` — which bind one card to one provider — a
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
   * `resolution → audio-mode → USD/s` (see {@link PerSecondPricing}). Values
   * are the real provider rate; update if a provider changes its meter.
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
       * model's default `(resolution, audio)` × default duration. For budget
       * estimation; not for display.
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
          // OpenRouter also serves it as `google/veo-3.1`, but its API surfaces
          // only token pricing ($0/MTok) for video — no usable per-second
          // meter confirmed. Add a binding once a real rate is verified.
        },
      },
      // -----------------------------------------------------------------
      // ByteDance — Seedance 2.0
      // -----------------------------------------------------------------
      "bytedance/seedance-2.0": {
        id: "bytedance/seedance-2.0",
        label: "Seedance 2.0",
        deprecated: false,
        short_description:
          "ByteDance's state-of-the-art video model — top-tier image-to-video with reference and editing modes.",
        vendor: "bytedance",
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
          // Also served by fal.ai and Replicate — add those bindings once
          // their per-second rates are verified.
        },
      },
      // -----------------------------------------------------------------
      // xAI — Grok Imagine Video 1.5
      // -----------------------------------------------------------------
      // Image-to-video only (no t2v, per xAI docs); native lip-synced audio
      // bundled into the rate. Per-second by resolution, identical on Vercel
      // (no markup) and fal: $0.08/s @480p, $0.14/s @720p. Both also bill
      // ~$0.01 per input image — an input surcharge not captured by the
      // per_second (output) meter.
      "xai/grok-imagine-video-1.5": {
        id: "xai/grok-imagine-video-1.5",
        label: "Grok Imagine Video 1.5",
        deprecated: false,
        short_description:
          "xAI's image-to-video model — animates a still into cinematic video with native, lip-synced audio.",
        vendor: "xai",
        aspect_ratios: ["16:9", "9:16"],
        min_duration: 5,
        max_duration: 15,
        audio: true,
        speed_label: "fast",
        default: {
          resolution: "720p",
          aspect_ratio: "16:9",
          duration: 5,
          audio: true,
        },
        url: "https://docs.x.ai/developers/models/grok-imagine-video-1.5-preview",
        providers: {
          // Vercel AI Gateway — image-to-video; mirrors xAI's list price (no markup).
          // https://vercel.com/changelog/grok-imagine-video-1-5-on-ai-gateway
          vercel: {
            provider: "vercel",
            id: "xai/grok-imagine-video-1.5-preview",
            pricing: {
              type: "per_second",
              usd_per_second: {
                "480p": { audio: 0.08 },
                "720p": { audio: 0.14 },
              },
            },
            avg_cost_usd: 0.7, // 720p audio × 5s default
            url: "https://vercel.com/ai-gateway/models/grok-imagine-video",
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
              },
            },
            avg_cost_usd: 0.7, // 720p audio × 5s default
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
}

export default models;
