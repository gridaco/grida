// GRIDA-SEC-004 — neutral input contracts, shared by native parsing and discovery.
import contracts from "../schemas/inputs.generated.json";
import { InputSchema as S } from "./input-schema";
import type { ImageClient } from "./image-client";
import type { VideoClient } from "./video-client";
import type { MusicClient } from "./music-client";
import type { SoundEffectClient } from "./sound-effect-client";
import type { TextToSpeechClient } from "./text-to-speech-client";
import type { ThreeDClient } from "./three-d-client";

const contract = (name: keyof typeof contracts): S.Schema =>
  structuredClone(contracts[name]) as S.Schema;
/** Named built-in definitions; fields and limits are authored in data/ai/inputs.json at the repository root. */
export namespace MediaInputs {
  export const limits = Object.freeze({
    image: 64 * 1024 * 1024,
    image_items: 16,
    video: 64 * 1024 * 1024,
    video_items: 16,
    video_image: 8_000_000,
    music: 32 * 1024 * 1024,
    sound_effect: 16 * 1024 * 1024,
    speech: 16 * 1024 * 1024,
    three_d_image: 8 * 1024 * 1024,
    glb: 64 * 1024 * 1024,
  });
  export const voice = S.fromJson<string>(
    contracts.speech_json.properties.voice_id
  );
  export function image(
    descriptor: Pick<
      ImageClient.Descriptor,
      "references_max" | "native_background" | "provider_id" | "binding_id"
    >
  ): S.Rule<
    Omit<ImageClient.Input, "references"> & { n: number; references?: string[] }
  > {
    const schema = S.mutableObject(contract("image"));
    const fal25 =
      descriptor.provider_id === "fal" &&
      /^openai\/gpt-image-2\.5\/(?:flare|sunburst)\/(?:text-to-image|edit)$/.test(
        descriptor.binding_id
      );
    const openrouter25 =
      descriptor.provider_id === "openrouter" &&
      /^openai\/gpt-image-2\.5-(?:flare|sunburst)$/.test(descriptor.binding_id);
    if (fal25) delete schema.properties.aspect_ratio;
    if (fal25 || openrouter25) delete schema.properties.seed;
    schema.properties.background.enum = descriptor.native_background
      ? ["auto", "opaque", "transparent"]
      : ["auto"];
    if (descriptor.references_max !== undefined) {
      schema.properties.references = {
        ...structuredClone(contracts.image_references),
        maxItems: descriptor.references_max,
      };
      schema.required.push("references");
    }
    return S.fromJson(schema);
  }
  export const falVeoLite = S.freeze({
    binding_id: "fal-ai/veo3.1/lite/image-to-video",
    resolutions: {
      "1280x720": { resolution: "720p", aspect_ratio: "16:9" },
      "720x1280": { resolution: "720p", aspect_ratio: "9:16" },
      "1920x1080": { resolution: "1080p", aspect_ratio: "16:9" },
      "1080x1920": { resolution: "1080p", aspect_ratio: "9:16" },
    },
  } as const);
  export function video(
    image: boolean,
    descriptor: Pick<VideoClient.Descriptor, "provider_id" | "binding_id">
  ): S.Rule<VideoClient.Input> {
    const lite =
      descriptor.provider_id === "fal" &&
      descriptor.binding_id === falVeoLite.binding_id;
    const schema = S.mutableObject(
      contract(lite ? "video_lite" : image ? "video_image" : "video")
    );
    if (descriptor.provider_id === "vercel")
      schema.properties.seed.not = { const: 0 };
    if (lite && !image) {
      delete schema.properties.image;
      delete schema.properties.image_url;
      delete schema.oneOf;
    }
    return S.fromJson(schema);
  }
  export const music = S.fromJson<MusicClient.Input>(contract("music"));
  export const soundEffect = S.fromJson<SoundEffectClient.Input>(
    contract("sound_effect")
  );
  export const speechJson = S.fromJson<{ voice_id: string; text: string }>(
    contract("speech_json")
  );
  export const speech = S.object({
    text: S.fromJson<string>(contracts.speech_json.properties.text),
  }) satisfies S.Rule<TextToSpeechClient.Input>;
  export const threeDText = S.fromJson<
    ThreeDClient.Input<"fal-ai/hunyuan-3d/v3.1/pro/text-to-3d">
  >(contract("three_d_text"));
  export const threeDImage = S.fromJson<ThreeDClient.Input<"fal-ai/trellis-2">>(
    contract("three_d_image")
  );
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
        const unreachable: never = id;
        throw unreachable;
      }
    }
  }
}
