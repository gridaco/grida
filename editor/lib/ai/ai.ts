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

    export type AspectRatioString = `${number}:${number}`;

    export type SizeString = `${number}x${number}`;

    export type SizeSpec = [number, number, AspectRatioString];

    export type ImageModelCard = {
      id: ImageModelId;
      label: string;
      short_description: string;
      vendor: Vendor;
      provider: Provider;
      styles: string[] | null;
      speed_label: "fastest" | "fast" | "medium" | "slow" | "slowest";
      speed_max: string;
      min_width: number;
      max_width: number;
      min_height: number;
      max_height: number;
      sizes: SizeSpec[] | null;
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
      "black-forest-labs/flux-schnell": {
        id: "black-forest-labs/flux-schnell",
        label: "Flux Schnell",
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
      },
    } as const;
  }
}
