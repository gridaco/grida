import type { models } from "../models";
import type { catalog } from "./catalog";

/** Independent service recommendations. Omit a default to make no recommendation. */
export const preferences = {
  text: { default_id: "openai/gpt-5.6-terra" },
  image: {
    default_id: "openai/gpt-image-2.5-flare",
    order: ["openai/gpt-image-2.5-sunburst"],
  },
  video: { default_id: "google/veo-3.1" },
  "audio.music": { default_id: "google/lyria-3" },
  "audio.sound_effects": {},
  "audio.text_to_speech": {},
  // Staged playgrounds retain their initial order without claiming a listed default.
  three_d: {
    order: [
      "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d",
      "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d",
      "fal-ai/trellis-2",
    ],
  },
  "three_d.model_generation": {
    default_id: "tripo/h3.1",
    order: ["tripo/p1", "tripo/p2"],
  },
  image_tools: { order: ["recraft-ai/recraft-remove-background"] },
} as const satisfies {
  text: catalog.policy.Preferences<models.text.CatalogId>;
  image: catalog.policy.Preferences<models.image.ImageModelId>;
  video: catalog.policy.Preferences<models.video.VideoModelId>;
  "audio.music": catalog.policy.Preferences<models.audio.music.ModelId>;
  "audio.sound_effects": catalog.policy.Preferences<models.audio.sound_effects.ModelId>;
  "audio.text_to_speech": catalog.policy.Preferences<models.audio.text_to_speech.ModelId>;
  three_d: catalog.policy.Preferences<models.three_d.ThreeDModelId>;
  "three_d.model_generation": catalog.policy.Preferences<models.three_d.model_generation.ModelId>;
  image_tools: catalog.policy.Preferences<models.image_tools.ImageToolModelId>;
};
