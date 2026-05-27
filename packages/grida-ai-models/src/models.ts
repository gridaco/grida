/**
 * Central model catalogue.
 *
 * The `models` namespace is the only export, also re-exported as the
 * package default (`import models from "@grida/ai-models"`). Surface:
 *
 * - `models.text.*`        — text-model spec table, tier→spec map, lookup
 * - `models.image.*`       — image-generation catalogue
 * - `models.audio.*`       — audio-generation catalogue
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
 * `provider: "gateway"` and `provider: "replicate"` on the cards are
 * data labels only — see the README for the full contract.
 *
 * @module
 */

import { TIER_MODEL_IDS, type ModelTier } from "./tiers";

export namespace models {
  // ── Shared discriminators ─────────────────────────────────────────

  /**
   * Routing label for hosted-provider calls. `"gateway"` indicates
   * the model is served via a hosted AI gateway (e.g. Vercel AI
   * Gateway); the label is data, not an SDK directive.
   */
  export type Provider = "gateway";

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
    | "stability-ai";

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
      /** Human-readable label. */
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
  }

  // ── models.image ──────────────────────────────────────────────────

  export namespace image {
    /**
     * @deprecated Use `ImageModelId` directly — every card carries
     * a `provider` field on its own.
     */
    export type ProviderModel = {
      provider: "gateway";
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
        provider: "gateway",
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
        provider: "gateway",
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
        provider: "gateway",
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
        provider: "gateway",
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
        provider: "gateway",
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
        provider: "gateway",
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
        provider: "gateway",
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
        provider: "gateway",
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
        provider: "gateway",
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
