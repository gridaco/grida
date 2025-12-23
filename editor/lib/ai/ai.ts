import { openai } from "@ai-sdk/openai";
import { replicate } from "@ai-sdk/replicate";
import type { ImageModel } from "ai";
import Replicate from "replicate";

export namespace ai {
  const grida_ai_credit_in_usd = 0.0016;

  export type Provider = "openai" | "replicate";
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
      /** Average price per image in USD */
      avg_ppi: number;
      /** Average credits (margined) */
      avg_credits: number;
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
        avg_ppi: 0.01,
        avg_credits: 7,
      },
      "851-labs/background-remover": {
        id: "851-labs/background-remover",
        label: "851 Labs Background Remover",
        url: "https://replicate.com/851-labs/background-remover",
        category: "image/tool/remove-background",
        avg_ppi: 0.00048,
        avg_credits: 1,
      },
      "bria/remove-background": {
        id: "bria/remove-background",
        label: "Bria Remove Background",
        url: "https://replicate.com/bria/remove-background",
        category: "image/tool/remove-background",
        avg_ppi: 0.018,
        avg_credits: 12,
      },
      "nightmareai/real-esrgan": {
        id: "nightmareai/real-esrgan",
        label: "Real-ESRGAN",
        url: "https://replicate.com/nightmareai/real-esrgan",
        category: "image/tool/upscale",
        avg_ppi: 0.002,
        avg_credits: 2,
      },
    } as const;
  }

  export namespace image {
    export type ProviderModel =
      | {
          provider: "openai";
          modelId: OpenAIImageModelId;
        }
      | {
          provider: "replicate";
          modelId: ReplicateImageModelId;
        };

    export type OpenAIImageModelId =
      | "dall-e-2"
      | "dall-e-3"
      | "gpt-image-1"
      | "gpt-image-1.5"
      | (string & {});

    export type ReplicateImageModelId =
      | "black-forest-labs/flux-kontext-max"
      | "black-forest-labs/flux-1.1-pro"
      | "black-forest-labs/flux-1.1-pro-ultra"
      | "black-forest-labs/flux-dev"
      | "black-forest-labs/flux-pro"
      | "black-forest-labs/flux-schnell"
      | "bytedance/sdxl-lightning-4step"
      | "fofr/aura-flow"
      | "fofr/latent-consistency-model"
      | "fofr/realvisxl-v3-multi-controlnet-lora"
      | "fofr/sdxl-emoji"
      | "fofr/sdxl-multi-controlnet-lora"
      | "ideogram-ai/ideogram-v2"
      | "ideogram-ai/ideogram-v2-turbo"
      | "lucataco/dreamshaper-xl-turbo"
      | "lucataco/open-dalle-v1.1"
      | "lucataco/realvisxl-v2.0"
      | "lucataco/realvisxl2-lcm"
      | "luma/photon"
      | "luma/photon-flash"
      | "nvidia/sana"
      | "playgroundai/playground-v2.5-1024px-aesthetic"
      | "recraft-ai/recraft-v3"
      | "recraft-ai/recraft-v3-svg"
      | "stability-ai/stable-diffusion-3.5-large"
      | "stability-ai/stable-diffusion-3.5-large-turbo"
      | "stability-ai/stable-diffusion-3.5-medium"
      | "tstramer/material-diffusion"
      | (string & {});

    export type ImageModelId = OpenAIImageModelId | ReplicateImageModelId;

    export type AspectRatioString = `${number}:${number}`;

    export type SizeString = `${number}x${number}`;

    export type SizeSpec = [number, number, AspectRatioString];

    export type SpeedLabel = "fastest" | "fast" | "medium" | "slow" | "slowest";

    export type ImageModelCardCompact = {
      id: ImageModelId;
      label: string;
      deprecated: boolean;
      short_description: string;
      speed_label: SpeedLabel;
      avg_ppi: number;
      avg_credit: number;
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
      avg_ppi: number;
      avg_credit: number;
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
        avg_ppi: card.avg_ppi,
        avg_credit: card.avg_credit,
      };
    };

    type RecraftV3Style =
      | "any"
      | "realistic_image"
      | "digital_illustration"
      | "digital_illustration/pixel_art"
      | "digital_illustration/hand_drawn"
      | "digital_illustration/grain"
      | "digital_illustration/infantile_sketch"
      | "digital_illustration/2d_art_poster"
      | "digital_illustration/handmade_3d"
      | "digital_illustration/hand_drawn_outline"
      | "digital_illustration/engraving_color"
      | "digital_illustration/2d_art_poster_2"
      | "realistic_image/b_and_w"
      | "realistic_image/hard_flash"
      | "realistic_image/hdr"
      | "realistic_image/natural_light"
      | "realistic_image/studio_portrait"
      | "realistic_image/enterprise"
      | "realistic_image/motion_blur";

    export const models: Partial<Record<ImageModelId, ImageModelCard>> = {
      "gpt-image-1": {
        id: "gpt-image-1",
        label: "GPT Image",
        deprecated: true,
        short_description: "State-of-the-art image generation model",
        vendor: "openai",
        provider: "openai",
        speed_label: "slowest",
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
        avg_ppi: 0.0975,
        avg_credit: 62,
        default: {
          width: 1024,
          height: 1024,
          aspect_ratio: "1:1",
        },
      },
      "gpt-image-1.5": {
        id: "gpt-image-1.5",
        label: "GPT Image 1.5",
        deprecated: false,
        short_description:
          "Successor to GPT Image 1 - State-of-the-art image generation model",
        vendor: "openai",
        provider: "openai",
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
        avg_ppi: 0.0257,
        avg_credit: 50,
        default: {
          width: 1024,
          height: 1024,
          aspect_ratio: "1:1",
        },
      },
      "recraft-ai/recraft-v3": {
        id: "recraft-ai/recraft-v3",
        label: "Recraft V3",
        deprecated: true,
        short_description:
          "Recraft V3 (code-named red_panda) is a text-to-image model with the ability to generate long texts, and images in a wide list of styles. As of today, it is SOTA in image generation, proven by the Text-to-Image Benchmark by Artificial Analysis",
        vendor: "recraft-ai",
        provider: "replicate",
        speed_label: "slow",
        speed_max: "30s",
        styles: [
          "any",
          "realistic_image",
          "digital_illustration",
          "digital_illustration/pixel_art",
          "digital_illustration/hand_drawn",
          "digital_illustration/grain",
          "digital_illustration/infantile_sketch",
          "digital_illustration/2d_art_poster",
          "digital_illustration/handmade_3d",
          "digital_illustration/hand_drawn_outline",
          "digital_illustration/engraving_color",
          "digital_illustration/2d_art_poster_2",
          "realistic_image/b_and_w",
          "realistic_image/hard_flash",
          "realistic_image/hdr",
          "realistic_image/natural_light",
          "realistic_image/studio_portrait",
          "realistic_image/enterprise",
          "realistic_image/motion_blur",
        ] as RecraftV3Style[],
        sizes: [
          [1024, 1024, "1:1"],
          [1365, 1024, "4:3"],
          [1024, 1365, "3:4"],
          [1536, 1024, "3:2"],
          [1024, 1536, "2:3"],
          [1820, 1024, "16:9"],
          [1024, 1820, "9:16"],
          [1024, 2048, "1:2"],
          [2048, 1024, "2:1"],
          [1434, 1024, "7:5"],
          [1024, 1434, "5:7"],
          [1024, 1280, "4:5"],
          [1280, 1024, "5:4"],
          [1024, 1707, "3:5"],
          [1707, 1024, "5:3"],
        ],
        min_width: 1024,
        max_width: 1820,
        min_height: 1024,
        max_height: 1820,
        avg_ppi: 0.04,
        avg_credit: 25,
        default: {
          width: 1024,
          height: 1024,
          aspect_ratio: "1:1",
        },
      },
      // https://replicate.com/black-forest-labs/flux-kontext-max/api/schema
      "black-forest-labs/flux-kontext-max": {
        id: "black-forest-labs/flux-kontext-max",
        label: "Flux Kontext Max",
        deprecated: false,
        short_description:
          "The fastest image generation model tailored for local development and personal use",
        vendor: "black-forest-labs",
        provider: "replicate",
        speed_label: "fastest",
        speed_max: "10s",
        styles: null,
        sizes: null,
        min_width: 0,
        min_height: 0,
        max_width: 1820,
        max_height: 1820,
        avg_ppi: 0.08,
        avg_credit: 50,
        default: {
          width: 1024,
          height: 1024,
          aspect_ratio: "1:1",
        },
      },
      "black-forest-labs/flux-1.1-pro": {
        id: "black-forest-labs/flux-1.1-pro",
        label: "Flux Pro 1.1",
        deprecated: false,
        short_description:
          "Faster, better FLUX Pro. Text-to-image model with excellent image quality, prompt adherence, and output diversity.",
        vendor: "black-forest-labs",
        provider: "replicate",
        speed_label: "slow",
        speed_max: "30s",
        styles: null,
        sizes: null,
        min_width: 256,
        max_width: 1440,
        min_height: 256,
        max_height: 1440,
        avg_ppi: 0.04,
        avg_credit: 25,
        default: {
          width: 1024,
          height: 1024,
          aspect_ratio: "1:1",
        },
      },
      "black-forest-labs/flux-schnell": {
        id: "black-forest-labs/flux-schnell",
        label: "Flux Schnell",
        deprecated: true,
        short_description:
          "The fastest image generation model tailored for local development and personal use",
        vendor: "black-forest-labs",
        provider: "replicate",
        speed_label: "fastest",
        speed_max: "3s",
        styles: null,
        // flux-schnell does not take wxh, but aspect ratio (the w/h is based on 1mp request)
        sizes: [
          [1024, 1024, "1:1"],
          [1344, 768, "16:9"],
          [1536, 640, "21:9"],
          [1216, 832, "3:2"],
          [832, 1216, "2:3"],
          [896, 1088, "4:5"],
          [1088, 896, "5:4"],
          [896, 1152, "3:4"],
          [1152, 896, "4:3"],
          [768, 1344, "9:16"],
          [640, 1536, "9:21"],
        ],
        min_width: 320,
        max_width: 1536,
        min_height: 320,
        max_height: 1536,
        avg_ppi: 0.003,
        avg_credit: 2,
        default: {
          width: 1024,
          height: 1024,
          aspect_ratio: "1:1",
        },
      },
    } as const;

    export const image_model_ids = Object.keys(models) as ImageModelId[];

    /**
     * @param model - the model identifier
     * @returns {ImageModel} to be piped into api
     */
    export function getSDKImageModel(
      model: ai.image.ProviderModel | ai.image.ImageModelId | string
    ): {
      card: ai.image.ImageModelCard;
      model: ImageModel;
    } | null {
      if (!model) return null;

      if (typeof model === "string") {
        let card: ai.image.ImageModelCard | null = null;
        // select card
        {
          if (model.includes("/")) {
            card = ai.image.models[model] ?? null;
          } else {
            // if no provider is specified, search id with input
            const searches = Object.values(ai.image.models).filter((card) =>
              card!.id.includes(model)
            );
            if (searches.length === 1) {
              card = searches[0]!;
            }
          }
        }

        if (!card) return null;
        switch (card.provider) {
          case "openai":
            return { model: openai.image(card.id), card };
          case "replicate":
            return { model: replicate.image(card.id), card };
          default:
            return null;
        }
      } else {
        const card = ai.image.models[model.modelId];
        if (!card) return null;
        switch (model.provider) {
          case "openai":
            return { model: openai.image(model.modelId), card };
          case "replicate":
            return { model: replicate.image(model.modelId), card };
          default:
            return null;
        }
      }
    }
  }
}
