// GRIDA-SEC-004 / GRIDA-SEC-006 — credential-free eligibility shared by discovery and execution.
// GRIDA-GG: provider — GG is an explicit route, never account authority or readiness.
import { catalog as models } from "@grida/ai-models/grida";
import type { ImageClient } from "./image-client";
import type { VideoClient } from "./video-client";
import type { MusicClient } from "./music-client";
import type { ThreeDClient } from "./three-d-client";

export namespace MediaRoutes {
  export function imageModel(
    card: models.image.ImageModelCard | null | undefined
  ): card is models.image.ImageModelCard {
    return card?.listed === true;
  }
  export function videoModel(
    card: models.video.VideoModelCard | null | undefined
  ): card is models.video.VideoModelCard {
    return card?.listed === true;
  }
  export function image(
    card: models.image.ImageModelCard,
    provider: ImageClient.Provider,
    references: boolean,
    background?: ImageClient.Background
  ): ImageClient.Descriptor | null {
    if (!imageModel(card)) return null;
    const native_background = models.image.supportsTransparentBackground(
      card,
      provider === "gg" ? "vercel" : provider
    );
    if (background && background !== "auto" && !native_background) return null;
    const capability = native_background
      ? { native_background: true as const }
      : {};
    if (provider === "gg")
      return !references && models.image.binding(card, "vercel")
        ? {
            model_id: card.id,
            binding_id: card.id,
            provider_id: "gg",
            ...capability,
          }
        : null;
    const binding = models.image.binding(card, provider);
    if (!binding || (references && !binding.references)) return null;
    return {
      model_id: card.id,
      provider_id: provider,
      ...capability,
      binding_id: references ? binding.references!.id : binding.id,
      ...(references ? { references_max: binding.references!.max } : {}),
    };
  }
  export function video(
    card: models.video.VideoModelCard,
    provider: VideoClient.Provider,
    image: boolean
  ): VideoClient.Descriptor | null {
    if (!videoModel(card)) return null;
    const byok = provider === "gg" ? "vercel" : provider;
    const binding = models.video.binding(card, byok);
    const mode = models.video.input(card, byok);
    if (
      !binding ||
      (provider === "gg" && image) ||
      !(mode === "text-or-image" || mode === (image ? "image" : "text"))
    )
      return null;
    return {
      model_id: card.id,
      provider_id: provider,
      binding_id: provider === "gg" ? card.id : binding.id,
      input: provider === "gg" ? "text" : mode,
    };
  }
  export function music(id: string): id is MusicClient.ModelId {
    if (!models.audio.music.is_model_id(id)) return false;
    const card = models.audio.music.models[id];
    return (
      card.status === "listed" &&
      card.input.modalities.includes("text") &&
      card.output.default_format === "mp3"
    );
  }
  export const soundEffectId = "eleven_text_to_sound_v2";
  export function soundEffect(id: string): id is typeof soundEffectId {
    const card = models.audio.sound_effects.models[soundEffectId];
    return (
      id === soundEffectId &&
      card.provider === "elevenlabs" &&
      card.input.type === "text" &&
      card.output.default_format === "mp3"
    );
  }
  export const speechId = "eleven_v3";
  export function speech(id: string): id is typeof speechId {
    const card = models.audio.text_to_speech.models[speechId];
    return (
      id === speechId &&
      card.provider === "elevenlabs" &&
      card.input.type === "text" &&
      card.output.default_format === "mp3"
    );
  }
  export const threeDIds = [
    "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d",
    "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d",
    "fal-ai/trellis-2",
  ] as const;
  export function threeDInput(id: ThreeDClient.ModelId): "text" | "image" {
    switch (id) {
      case "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d":
        return "text";
      case "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d":
      case "fal-ai/trellis-2":
        return "image";
      default: {
        const _unreachable: never = id;
        throw _unreachable;
      }
    }
  }
  export function threeD(id: string): id is ThreeDClient.ModelId {
    if (!(threeDIds as readonly string[]).includes(id)) return false;
    const card = models.three_d.models[id as ThreeDClient.ModelId];
    return (
      card.id === id &&
      card.provider === "fal" &&
      !card.deprecated &&
      card.output.primary === "glb" &&
      card.input.type === threeDInput(id as ThreeDClient.ModelId)
    );
  }
}
