// Client-safe: editor-only AI helpers + re-aggregation of the shared
// catalogue from `@grida/ai-models`. Anything seam-dependent lives in
// `./methods.ts` (server-only) so client bundles that import cost-card
// data don't drag in `next/headers` via the billing transitive chain.

import _catalog from "@grida/ai-models";

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

  // Re-aggregate the media catalogues from `@grida/ai-models` under
  // their original editor-side dotted path. Consumers continue to
  // write `ai.image.X`, `ai.audio.X`, `ai.image_tools.X` unchanged.
  export import image = _catalog.image;
  export import audio = _catalog.audio;
  export import image_tools = _catalog.image_tools;

  export type Provider = _catalog.Provider;
  export type Vendor = _catalog.Vendor;

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

      // Background-remover model id constants. `satisfies` pins each to a
      // real catalogue entry so a rename in `@grida/ai-models` fails the
      // build here instead of silently drifting.
      export const MODEL_ID_BRIA_REMOVE_BACKGROUND =
        "bria/remove-background" satisfies image_tools.ImageToolModelId;
      export const MODEL_ID_851_LABS_BACKGROUND_REMOVER =
        "851-labs/background-remover" satisfies image_tools.ImageToolModelId;
      export const MODEL_ID_RECRAFT_REMOVE_BACKGROUND =
        "recraft-ai/recraft-remove-background" satisfies image_tools.ImageToolModelId;

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

      export type AudioGenerationModelId = audio.AudioModelId;

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
}
