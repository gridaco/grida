import type { ImageModel } from "ai";
import Replicate from "replicate";
import { gateway } from "./models";

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
    export namespace providers {
      export namespace replicate {
        /**
         * Run a Replicate model and return the output URL
         *
         * Note: Replicate can return either URLs or FileOutput objects depending on configuration.
         * We configure the client to return URLs (useFileOutput: false) to ensure consistent behavior.
         */
        export async function run(
          modelId: `${string}/${string}`,
          input: Record<string, unknown>
        ): Promise<string> {
          if (!process.env.REPLICATE_API_TOKEN) {
            throw new Error("REPLICATE_API_TOKEN is not set");
          }

          const replicate = new Replicate({
            auth: process.env.REPLICATE_API_TOKEN,
            useFileOutput: false, // Always return URLs instead of FileOutput objects
          });

          const output = await replicate.run(modelId, {
            input,
          });

          // With useFileOutput: false, output is always a string URL or array of URL strings
          if (typeof output === "string") {
            return output;
          }
          if (Array.isArray(output) && output.length > 0) {
            const firstOutput = output[0];
            // Handle both string URLs and FileOutput objects (defensive check)
            if (typeof firstOutput === "string") {
              return firstOutput;
            }
            // If FileOutput is returned despite useFileOutput: false, extract URL
            if (
              firstOutput &&
              typeof firstOutput === "object" &&
              "url" in firstOutput
            ) {
              return (firstOutput as { url: () => string }).url();
            }
          }

          throw new Error("Unexpected output format from Replicate");
        }
      }
    }

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
       * real model identifier - for replicate api call
       */
      const MODEL_ID_851_LABS_BACKGROUND_REMOVER_IDENTIFIER =
        "851-labs/background-remover:a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc";

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

      function normalizeImageUrl(image: ImageData): string {
        if (image.kind === "url") {
          return image.url;
        }
        // base64 kind
        if (image.base64.startsWith("data:")) {
          return image.base64;
        }
        // Assume it's base64 without prefix, add data URL prefix
        return `data:image/png;base64,${image.base64}`;
      }

      export async function upscale(
        options: RealEsrganOptions
      ): Promise<RealEsrganResult> {
        const imageUrl = normalizeImageUrl(options.image);

        const outputUrl = await ai.server.providers.replicate.run(
          "nightmareai/real-esrgan",
          {
            image: imageUrl,
            scale: options.scale ?? 4,
          }
        );

        // Return URL directly - client will fetch it
        return {
          image: { kind: "url", url: outputUrl },
        };
      }

      /**
       * Remove background using specified model
       * @see https://replicate.com/bria/remove-background/api/schema
       * @see https://replicate.com/851-labs/background-remover/api/schema
       * @see https://replicate.com/recraft-ai/recraft-remove-background/api/schema
       */
      export async function removeBackground<
        TModel extends RemoveBackgroundModelId,
      >(
        image: string | ImageData,
        model_id: TModel,
        options?: BackgroundRemoverModelOptions[TModel]
      ): Promise<BackgroundRemoverResult> {
        const imageData = toImageData(image);
        const imageUrl = normalizeImageUrl(imageData);

        switch (model_id) {
          case MODEL_ID_BRIA_REMOVE_BACKGROUND: {
            const __options =
              (options as BackgroundRemoverModelOptions[typeof MODEL_ID_BRIA_REMOVE_BACKGROUND]) ??
              {};
            const outputUrl = await ai.server.providers.replicate.run(
              MODEL_ID_BRIA_REMOVE_BACKGROUND,
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

            return {
              image: { kind: "url", url: outputUrl },
            };
          }

          case MODEL_ID_851_LABS_BACKGROUND_REMOVER: {
            const __options =
              (options as BackgroundRemoverModelOptions[typeof MODEL_ID_851_LABS_BACKGROUND_REMOVER]) ??
              {};
            const outputUrl = await ai.server.providers.replicate.run(
              MODEL_ID_851_LABS_BACKGROUND_REMOVER_IDENTIFIER,
              {
                image: imageUrl,
                format: __options.format ?? "png",
                background_type: __options.background_type ?? "rgba",
              }
            );

            return {
              image: { kind: "url", url: outputUrl },
            };
          }

          case MODEL_ID_RECRAFT_REMOVE_BACKGROUND: {
            const outputUrl = await ai.server.providers.replicate.run(
              MODEL_ID_RECRAFT_REMOVE_BACKGROUND,
              {
                image: imageUrl,
              }
            );

            return {
              image: { kind: "url", url: outputUrl },
            };
          }

          default: {
            const _exhaustive: never = model_id;
            throw new Error(`Unknown model: ${_exhaustive}`);
          }
        }
      }
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
     * Per-image pricing with quality × size tiers (e.g. OpenAI).
     *
     * Values from the provider's official pricing page.
     */
    export type PerImageTieredPricing = {
      type: "per_image_tiered";
      /** USD per image, keyed by `"quality/WxH"` (e.g. `"medium/1024x1024"`). */
      tiers: Record<string, number>;
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
     *
     * Values are USD per **1 million** tokens, matching the convention
     * in `lib/ai/models.ts`.
     */
    export type PerTokenPricing = {
      type: "per_token";
      /** USD per 1M input tokens. */
      input: number;
      /** USD per 1M output tokens. */
      output: number;
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
      min_width: number;
      max_width: number;
      min_height: number;
      max_height: number;
      sizes: SizeSpec[] | null;
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
      // https://developers.openai.com/api/docs/models/gpt-image-1.5
      "openai/gpt-image-1.5": {
        id: "openai/gpt-image-1.5",
        label: "GPT Image 1.5",
        deprecated: false,
        short_description:
          "State-of-the-art image generation with better instruction following",
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
        min_width: 1024,
        max_width: 1536,
        min_height: 1024,
        max_height: 1536,
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
        min_width: 1024,
        max_width: 1536,
        min_height: 1024,
        max_height: 1536,
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
        min_width: 0,
        max_width: 1536,
        min_height: 0,
        max_height: 1536,
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
        min_width: 0,
        max_width: 1536,
        min_height: 0,
        max_height: 1536,
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
        min_width: 256,
        max_width: 1440,
        min_height: 256,
        max_height: 1440,
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
        min_width: 0,
        min_height: 0,
        max_width: 1820,
        max_height: 1820,
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
        min_width: 0,
        min_height: 0,
        max_width: 1820,
        max_height: 1820,
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
        min_width: 256,
        max_width: 1440,
        min_height: 256,
        max_height: 1440,
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
     * Resolve a model identifier to an AI SDK `ImageModel` routed through
     * the Vercel AI Gateway.
     *
     * @param model - gateway model ID string (e.g. `"openai/gpt-image-1.5"`)
     *   or a legacy `ProviderModel` object.
     * @returns `{ card, model }` or `null` when the ID is unknown.
     */
    export function getSDKImageModel(
      model: ai.image.ProviderModel | ai.image.ImageModelId | string
    ): {
      card: ai.image.ImageModelCard;
      model: ImageModel;
    } | null {
      if (!model) return null;

      const modelId = typeof model === "string" ? model : model.modelId;

      let card: ai.image.ImageModelCard | null = null;

      if (modelId.includes("/")) {
        card = ai.image.models[modelId] ?? null;
      } else {
        // bare name lookup — search for a card whose ID ends with the input
        const searches = Object.values(ai.image.models).filter((c) =>
          c!.id.includes(modelId)
        );
        if (searches.length === 1) {
          card = searches[0]!;
        }
      }

      if (!card) return null;

      return { model: gateway.image(card.id), card };
    }
  }
}
