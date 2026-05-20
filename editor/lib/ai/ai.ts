// Client-safe: model catalogs (cost cards), types, and pure helpers.
// Anything seam-dependent lives in `./methods.ts` (server-only) so
// client component bundles that import cost-card data don't drag in
// `next/headers` via the billing transitive chain.

export namespace ai {
  /**
   * Convert a USD cost to mills (thousandths of a dollar).
   *
   * The Upstash rate limiter requires integer tokens. We use mills as the
   * budget unit so that 1000 mills = $1.00. All model cards store
   * {@link cost_usd}; this helper converts to the integer unit consumed
   * by the rate limiter.
   */
  export function toMills(cost_usd: number): number {
    return Math.ceil(cost_usd * 1000);
  }

  /**
   * Format mills as a dollar string (e.g. 780 → "$0.78").
   */
  export function millsToUSD(mills: number): string {
    return `$${(mills / 1000).toFixed(2)}`;
  }

  export type Provider = "gateway";
  export type Vendor =
    | "openai"
    | "recraft-ai"
    | "black-forest-labs"
    | "google"
    | "stability-ai";

  export namespace server {
    export namespace methods {
      export type ImageData =
        | { kind: "base64"; base64: string }
        | { kind: "url"; url: string };

      /**
       * Helper to convert a string (base64 or URL) to ImageData type
       */
      export function toImageData(image: string | ImageData): ImageData {
        if (typeof image === "string") {
          if (image.startsWith("http://") || image.startsWith("https://")) {
            return { kind: "url", url: image };
          }
          // Assume base64
          return { kind: "base64", base64: image };
        }
        return image;
      }

      /**
       * Options for nightmareai/real-esrgan model
       * @see https://replicate.com/nightmareai/real-esrgan/api/schema#input-schema
       */
      export type RealEsrganOptions = {
        image: ImageData;
        scale?: number; // optional, default: 4, max: 10
      };

      /**
       * Result from nightmareai/real-esrgan model
       */
      export type RealEsrganResult = {
        image: ImageData; // returns URL
      };

      /**
       * Background remover model ID constants (full Replicate model IDs)
       */
      export const MODEL_ID_BRIA_REMOVE_BACKGROUND = "bria/remove-background";
      export const MODEL_ID_851_LABS_BACKGROUND_REMOVER =
        "851-labs/background-remover";
      export const MODEL_ID_RECRAFT_REMOVE_BACKGROUND =
        "recraft-ai/recraft-remove-background";

      /**
       * Background remover model ID type
       */
      export type RemoveBackgroundModelId =
        | typeof MODEL_ID_BRIA_REMOVE_BACKGROUND
        | typeof MODEL_ID_851_LABS_BACKGROUND_REMOVER
        | typeof MODEL_ID_RECRAFT_REMOVE_BACKGROUND;

      /**
       * Type map for background remover model-specific options (without image)
       * @see https://replicate.com/bria/remove-background/api/schema
       * @see https://replicate.com/851-labs/background-remover/api/schema
       * @see https://replicate.com/recraft-ai/recraft-remove-background/api/schema
       */
      export type BackgroundRemoverModelOptions = {
        [MODEL_ID_BRIA_REMOVE_BACKGROUND]: {
          preserve_partial_alpha?: boolean; // optional, control retention of partially transparent areas
          content_moderation?: boolean; // optional, enable content moderation
        };
        [MODEL_ID_851_LABS_BACKGROUND_REMOVER]: {
          format?: string; // optional, default: "png"
          background_type?: string; // optional, default: "rgba"
        };
        [MODEL_ID_RECRAFT_REMOVE_BACKGROUND]: {
          // No additional options - only requires image
        };
      };

      /**
       * Result from background removal models
       */
      export type BackgroundRemoverResult = {
        image: ImageData; // returns URL
      };

      /**
       * Lyria audio model ID constants (Replicate)
       * @see https://replicate.com/google/lyria-3
       * @see https://replicate.com/google/lyria-3-pro
       */
      export const MODEL_ID_GOOGLE_LYRIA_3 = "google/lyria-3";
      export const MODEL_ID_GOOGLE_LYRIA_3_PRO = "google/lyria-3-pro";

      export type AudioGenerationModelId =
        | typeof MODEL_ID_GOOGLE_LYRIA_3
        | typeof MODEL_ID_GOOGLE_LYRIA_3_PRO;

      /**
       * Options for Lyria audio generation models.
       */
      export type LyriaAudioOptions = {
        /** Prompt describing the music. Required. */
        prompt: string;
        /**
         * Optional reference images (data URLs or http(s) URLs) used as
         * additional inspiration for composition. Up to 10 supported by the
         * provider.
         */
        image_inputs?: string[];
        /** Optional language hint passed through to the model. */
        language?: string;
        /** Optional negative prompt. */
        negative_prompt?: string;
        /** Optional seed for reproducibility. */
        seed?: number;
      };

      export type AudioGenerationResult = {
        /** Public URL to the generated audio (mp3). */
        url: string;
      };
    }
  }

  /**
   * Image tool models namespace - separate from ai.image.models
   * Contains metadata for image processing tools (upscale, remove background, etc.)
   */
  export namespace image_tools {
    /**
     * Image tool model ID type
     */
    export type ImageToolModelId =
      | "recraft-ai/recraft-remove-background"
      | "851-labs/background-remover"
      | "bria/remove-background"
      | "nightmareai/real-esrgan";

    /**
     * Image tool model role/category - internal model classification for non-image-generator models
     */
    export type ImageToolModelCategory =
      | "image/tool/remove-background"
      | "image/tool/upscale";

    /**
     * Image tool model card with pricing information
     */
    export type ImageToolModelCard = {
      id: ImageToolModelId;
      label: string;
      url: string;
      /** Internal model classification role/category */
      category: ImageToolModelCategory;
      /** Cost per invocation in USD (flat rate from provider). */
      cost_usd: number;
    };

    /**
     * Image tool models registry
     */
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

  /**
   * Audio generation models namespace.
   *
   * Currently houses Google's Lyria family on Replicate. Pricing is taken
   * from the public Replicate model pages; update if the provider changes
   * its meter.
   *
   * Schema mirrors {@link ai.image} where it makes sense — vendor, provider,
   * speed, deprecation, and a discriminated `pricing` union — so it can be
   * rendered next to image models on the public model catalog.
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
       * Average cost per invocation in USD, used by the rate limiter.
       * For flat-rate models this is just `pricing.usd`.
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

  export namespace image {
    /**
     * @deprecated Use `ImageModelId` directly — all models now route through
     * the Vercel AI Gateway.
     */
    export type ProviderModel = {
      provider: "gateway";
      modelId: ImageModelId;
    };

    /**
     * Gateway image model IDs.
     *
     * All image generation models are routed through the Vercel AI Gateway
     * using the `provider/model` format.
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

    export type SpeedLabel = "fastest" | "fast" | "medium" | "slow" | "slowest";

    // ── Pricing ───────────────────────────────────────────────────────

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

    // ── Size constraints ──────────────────────────────────────────────

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

    // ── Card types ────────────────────────────────────────────────────

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
       * Average cost per invocation in USD, used by the rate limiter.
       *
       * For flat per-image models this equals the exact price; for
       * tiered models it is the mid-tier (medium quality, default size);
       * for per-token models it is a rough estimate.
       *
       * @internal Not displayed to users.
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

    export const image_model_ids = Object.keys(models) as ImageModelId[];

    /**
     * Resolve a model identifier to its cost card (data only). Use
     * `getSDKImageModel` in `lib/ai/methods.ts` if you also need the
     * billing-wrapped AI SDK model instance.
     */
    export function findImageModelCard(
      model: ai.image.ProviderModel | ai.image.ImageModelId | string
    ): ai.image.ImageModelCard | null {
      if (!model) return null;
      const modelId = typeof model === "string" ? model : model.modelId;
      if (modelId.includes("/")) {
        return ai.image.models[modelId] ?? null;
      }
      // bare name lookup — search for a card whose ID ends with the input
      const searches = Object.values(ai.image.models).filter((c) =>
        c!.id.includes(modelId)
      );
      return searches.length === 1 ? searches[0]! : null;
    }
  }
}
