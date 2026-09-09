// GRIDA-SEC-004 — effective operation inputs and output limits, shared with discovery.
import { models } from "@grida/ai-models";
import { InputSchema as S } from "./input-schema";
import type { ImageClient } from "./image-client";
import type { VideoClient } from "./video-client";
import type { MusicClient } from "./music-client";
import type { SoundEffectClient } from "./sound-effect-client";
import type { TextToSpeechClient } from "./text-to-speech-client";
import type { ThreeDClient } from "./three-d-client";

/** Named built-in definitions; native and JSON callers use these same rules. */
export namespace MediaInputs {
  export const limits = Object.freeze({
    image: 64 * 1024 * 1024,
    image_items: 16,
    video: 64 * 1024 * 1024,
    video_items: 16,
    music: 32 * 1024 * 1024,
    sound_effect: 16 * 1024 * 1024,
    speech: 16 * 1024 * 1024,
    three_d_image: 8 * 1024 * 1024,
    glb: 64 * 1024 * 1024,
  });
  export const voice = S.string({
    trim: true,
    nonblank: true,
    max: 256,
    voice: true,
  });
  export function image(
    descriptor: Pick<
      ImageClient.Descriptor,
      "references_max" | "native_background" | "provider_id" | "binding_id"
    >
  ): S.Rule<
    Omit<ImageClient.Input, "references"> & { n: number; references?: string[] }
  > {
    // Exact researched endpoint contracts; the internal adapters independently
    // reject these unsupported controls rather than letting providers ignore them.
    const fal25 =
      descriptor.provider_id === "fal" &&
      /^openai\/gpt-image-2\.5\/(?:flare|sunburst)\/(?:text-to-image|edit)$/.test(
        descriptor.binding_id
      );
    const openrouter25 =
      descriptor.provider_id === "openrouter" &&
      /^openai\/gpt-image-2\.5-(?:flare|sunburst)$/.test(descriptor.binding_id);
    return S.object({
      prompt: S.string({ nonblank: true }),
      n: S.optional(
        S.number({ integer: true, min: 1, max: limits.image_items }),
        1
      ),
      size: S.optional(S.pair("x")),
      ...(fal25 ? {} : { aspect_ratio: S.optional(S.pair(":", false)) }),
      ...(fal25 || openrouter25
        ? {}
        : { seed: S.optional(S.number({ integer: true })) }),
      quality: S.optional(S.string({ max: 128, unit: "utf16" })),
      background: S.optional(
        S.enumeration(
          descriptor.native_background
            ? ["auto", "opaque", "transparent"]
            : ["auto"]
        )
      ),
      ...(descriptor.references_max === undefined
        ? {}
        : {
            references: S.array(S.url(true, true), descriptor.references_max),
          }),
    }) as S.Rule<
      Omit<ImageClient.Input, "references"> & {
        n: number;
        references?: string[];
      }
    >;
  }
  export function video(
    image: boolean,
    provider: VideoClient.Provider
  ): S.Rule<VideoClient.Input> {
    return S.object({
      prompt: S.string({ nonblank: true }),
      aspect_ratio: S.optional(S.pair(":")),
      resolution: S.optional(S.pair("x")),
      duration: S.optional(S.number({ exclusiveMin: 0 })),
      fps: S.optional(S.number({ exclusiveMin: 0 })),
      seed: S.optional(
        S.number({
          integer: true,
          ...(provider === "vercel" ? { exclude: 0 } : {}),
        })
      ),
      ...(image ? { image_url: S.url() } : {}),
    }) as S.Rule<VideoClient.Input>;
  }
  export const music = S.object({
    prompt: S.string({ trim: true, nonblank: true, max: 4096, unit: "utf16" }),
    seed: S.optional(S.number({ integer: true })),
  }) satisfies S.Rule<MusicClient.Input>;
  const soundDuration =
    models.audio.sound_effects.models.eleven_text_to_sound_v2.output.duration;
  export const soundEffect = S.object({
    prompt: S.string({ trim: true, nonblank: true, max: 450 }),
    duration_seconds: S.optional(
      S.number({
        min: soundDuration.min_seconds,
        max: soundDuration.max_seconds,
      })
    ),
    loop: S.optional(S.boolean),
    prompt_influence: S.optional(S.number({ min: 0, max: 1 })),
  }) satisfies S.Rule<SoundEffectClient.Input>;
  const speechText = S.string({
    nonblank: true,
    max: models.audio.text_to_speech.models.eleven_v3.input.max_characters,
  });
  export const speech = S.object({
    text: speechText,
  }) satisfies S.Rule<TextToSpeechClient.Input>;
  export const speechJson = S.object({ voice_id: voice, text: speechText });
  export const threeDText = S.object({
    prompt: S.string({
      trim: true,
      nonblank: true,
      max: models.three_d.models["fal-ai/hunyuan-3d/v3.1/pro/text-to-3d"].input
        .max_utf8_characters,
    }),
  }) satisfies S.Rule<
    ThreeDClient.Input<"fal-ai/hunyuan-3d/v3.1/pro/text-to-3d">
  >;
  export const threeDImage = S.object({
    image: S.object({
      data: S.bytes(limits.three_d_image),
      media_type: S.enumeration(["image/png", "image/jpeg", "image/webp"]),
    }),
  }) satisfies S.Rule<ThreeDClient.Input<"fal-ai/trellis-2">>;
  export function threeD(
    id: ThreeDClient.ModelId
  ): S.Rule<{ prompt?: string; image?: ThreeDClient.Image }> {
    switch (id) {
      case "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d":
        return threeDText;
      case "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d":
      case "fal-ai/trellis-2":
        return threeDImage;
      default: {
        const _unreachable: never = id;
        throw _unreachable;
      }
    }
  }
}
