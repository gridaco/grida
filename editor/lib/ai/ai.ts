export namespace ai {
  const grida_ai_credit_in_usd = 0.0016;

  export type Provider = "openai" | "replicate";
  export type Vendor =
    | "openai"
    | "recraft-ai"
    | "black-forest-labs"
    | "stability-ai";

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
      | (string & {});

    export type ReplicateImageModelId =
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

    export type ImageModelCard = {
      id: ImageModelId;
      label: string;
      short_description: string;
      vendor: Vendor;
      provider: Provider;
      styles: string[] | null;
      speed_label: "fast" | "medium" | "slow" | "slowest";
      speed_max: string;
      min_width: number;
      max_width: number;
      min_height: number;
      max_height: number;
      sizes: [number, number][] | null;
      avg_ppi: number;
      avg_credit: number;
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
        short_description: "State-of-the-art image generation model",
        vendor: "openai",
        provider: "openai",
        speed_label: "slowest",
        speed_max: "1m",
        styles: null,
        sizes: [
          [1024, 1024],
          [1024, 1536],
          [1536, 1024],
        ],
        min_width: 1024,
        max_width: 1536,
        min_height: 1024,
        max_height: 1536,
        avg_ppi: 0.0975,
        avg_credit: 62,
      },
      "recraft-ai/recraft-v3": {
        id: "recraft-ai/recraft-v3",
        label: "Recraft V3",
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
          [1024, 1024],
          [1365, 1024],
          [1024, 1365],
          [1536, 1024],
          [1024, 1536],
          [1820, 1024],
          [1024, 1820],
          [1024, 2048],
          [2048, 1024],
          [1434, 1024],
          [1024, 1434],
          [1024, 1280],
          [1280, 1024],
          [1024, 1707],
          [1707, 1024],
        ],
        min_width: 1024,
        max_width: 1820,
        min_height: 1024,
        max_height: 1820,
        avg_ppi: 0.04,
        avg_credit: 25,
      },
      "black-forest-labs/flux-1.1-pro": {
        id: "black-forest-labs/flux-1.1-pro",
        label: "Flux Pro 1.1",
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
      },
    } as const;
  }
}
