// GRIDA-SEC-004 — exact serving schemas own admitted controls and wire mapping.
import { InputSchema as S } from "./input-schema";
import type { ImageClient } from "./image-client";
import type { VideoClient } from "./video-client";

/** Named endpoint contracts verified against fal's queue OpenAPI, 2026-09-17.
 * Source: https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<id>
 * This is private serialization logic, never a host-supplied provider registry.
 */
export namespace FalInputs {
  const gpt25 =
    /^openai\/gpt-image-2\.5\/(?:flare|sunburst)\/(?:text-to-image|edit)$/;
  const bananaRatios = [
    "21:9",
    "16:9",
    "3:2",
    "4:3",
    "5:4",
    "1:1",
    "4:5",
    "3:4",
    "2:3",
    "9:16",
  ];
  const sizeRatios = ["1:1", "4:3", "3:4", "16:9", "9:16"];
  const sizePresets: Record<string, string> = {
    "1:1": "square_hd",
    "4:3": "landscape_4_3",
    "3:4": "portrait_4_3",
    "16:9": "landscape_16_9",
    "9:16": "portrait_16_9",
  };
  const grokRatios = [
    "2:1",
    "20:9",
    "19.5:9",
    "16:9",
    "4:3",
    "3:2",
    "1:1",
    "2:3",
    "3:4",
    "9:16",
    "9:19.5",
    "9:20",
    "1:2",
  ];
  export function imageSettings(id: string) {
    if (gpt25.test(id) || id === "fal-ai/gpt-image-2")
      return {
        family: "gpt",
        seed: false,
        batch: 4,
        qualities: gpt25.test(id)
          ? ["auto", "low", "medium", "high", "xhigh", "max"]
          : ["auto", "low", "medium", "high"],
      } as const;
    if (id === "fal-ai/nano-banana-2" || id === "fal-ai/nano-banana-pro")
      return {
        family: "banana",
        seed: true,
        batch: 4,
        aspects: id.endsWith("-2")
          ? [...bananaRatios, "4:1", "1:4", "8:1", "1:8"]
          : bananaRatios,
        sizes: id.endsWith("-2")
          ? ["512x512", "1024x1024", "2048x2048", "4096x4096"]
          : ["1024x1024", "2048x2048", "4096x4096"],
      } as const;
    if (id === "xai/grok-imagine-image/v2.0/text-to-image")
      return {
        family: "grok",
        seed: false,
        batch: 4,
        aspects: grokRatios,
        sizes: ["1024x1024", "2048x2048"],
        qualities: ["low", "medium"],
      } as const;
    if (id === "fal-ai/flux-2-pro" || id === "fal-ai/flux-2-max")
      return {
        family: "flux",
        seed: true,
        batch: 1,
        aspects: sizeRatios,
      } as const;
    if (id === "bytedance/seedream/v5/pro/text-to-image")
      return {
        family: "seedream-pro",
        seed: false,
        batch: 4,
        aspects: sizeRatios,
      } as const;
    if (id === "bytedance/seedream/v5/lite/text-to-image")
      return {
        family: "seedream-lite",
        seed: false,
        batch: 4,
        aspects: sizeRatios,
      } as const;
    if (id === "fal-ai/recraft/v4.1/text-to-image")
      return {
        family: "recraft",
        seed: false,
        batch: 1,
        aspects: sizeRatios,
      } as const;
    return null;
  }

  export function image(
    id: string,
    input: Omit<ImageClient.Input, "signal" | "references">
  ) {
    const settings = imageSettings(id);
    if (!settings) return null;
    const { size, aspect_ratio, seed, quality, background } = input;
    if (seed !== undefined && !settings.seed) throw 0;
    if (
      quality !== undefined &&
      !(
        "qualities" in settings &&
        (settings.qualities as readonly string[] | undefined)?.includes(quality)
      )
    )
      throw 0;
    if (
      background !== undefined &&
      background !== "auto" &&
      settings.family !== "gpt"
    )
      throw 0;
    if (
      aspect_ratio !== undefined &&
      !("aspects" in settings && settings.aspects?.includes(aspect_ratio))
    )
      throw 0;
    let dimension: Record<string, unknown> = {};
    if (settings.family === "banana" || settings.family === "grok") {
      // A square size has an unambiguous provider tier. Other WxH promises are
      // refused: tier+ratio providers do not accept arbitrary exact dimensions.
      if (
        size !== undefined &&
        !(settings.sizes as readonly string[]).includes(size)
      )
        throw 0;
      if (
        size !== undefined &&
        aspect_ratio !== undefined &&
        aspect_ratio !== "1:1"
      )
        throw 0;
      if (size) {
        const edge = Number(size.split("x")[0]);
        const resolution = edge === 512 ? "0.5K" : `${edge / 1024}K`;
        dimension = {
          resolution:
            settings.family === "grok" ? resolution.toLowerCase() : resolution,
          aspect_ratio: "1:1",
        };
      }
    } else if (size) {
      const [width, height] = size.split("x").map(Number);
      if (
        !Number.isSafeInteger(width) ||
        !Number.isSafeInteger(height) ||
        width! <= 0 ||
        height! <= 0
      )
        throw 0;
      if (aspect_ratio) {
        const [w, h] = aspect_ratio.split(":").map(Number);
        if (Math.abs(width! / height! - w! / h!) > 0.002) throw 0;
      }
      const area = width! * height!,
        ratio = Math.max(width! / height!, height! / width!);
      if (
        settings.family === "gpt" &&
        (width! % 16 ||
          height! % 16 ||
          Math.max(width!, height!) > 3840 ||
          ratio > 3 ||
          area < 655_360 ||
          area > 8_294_400)
      )
        throw 0;
      if (
        settings.family === "flux" &&
        (width! % 16 ||
          height! % 16 ||
          Math.min(width!, height!) < 256 ||
          Math.max(width!, height!) > 2560 ||
          area > 4_194_304)
      )
        throw 0;
      if (
        settings.family === "seedream-pro" &&
        (area < 1_048_576 || area > 4_194_304 || ratio > 16)
      )
        throw 0;
      if (
        settings.family === "seedream-lite" &&
        (area < 3_686_400 || area > 16_777_216)
      )
        throw 0;
      if (Math.max(width!, height!) > 14142) throw 0;
      dimension = { image_size: { width, height } };
    } else if (settings.family === "gpt") dimension = { image_size: "auto" };
    else if (aspect_ratio)
      dimension = { image_size: sizePresets[aspect_ratio] };
    return {
      prompt: input.prompt,
      ...(settings.batch > 1 ? { num_images: input.n ?? 1 } : {}),
      ...dimension,
      ...((settings.family === "banana" || settings.family === "grok") &&
      aspect_ratio
        ? { aspect_ratio }
        : {}),
      ...(seed !== undefined ? { seed } : {}),
      ...(quality !== undefined ? { quality } : {}),
      ...(background && background !== "auto"
        ? {
            background,
            ...(background === "transparent" ? { output_format: "png" } : {}),
          }
        : {}),
    };
  }

  const wide = ["16:9", "9:16"];
  const seedanceRatios = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];
  export function videoSettings(id: string) {
    if (id === "google/gemini-omni-flash/v1.1/text-to-video")
      return {
        family: "omni",
        aspects: wide,
        tiers: [360, 720, 1080, 2160],
        durations: [3, 4, 5, 6, 7, 8, 9, 10],
        seed: false,
      } as const;
    if (
      id === "bytedance/seedance-2.0/text-to-video" ||
      id === "bytedance/seedance-2.5/text-to-video"
    )
      return {
        family: "seedance",
        aspects: seedanceRatios,
        tiers: id.includes("2.0") ? [480, 720, 1080, 2160] : [480, 720, 1080],
        durations: Array.from(
          { length: id.includes("2.0") ? 12 : 27 },
          (_, i) => i + 4
        ),
        seed: false,
      } as const;
    if (
      ["fal-ai/veo3.1", "fal-ai/veo3.1/fast", "fal-ai/veo3.1/lite"].includes(id)
    )
      return {
        family: "veo",
        aspects: wide,
        tiers: id.endsWith("/lite") ? [720, 1080] : [720, 1080, 2160],
        durations: [4, 6, 8],
        seed: true,
      } as const;
    if (id === "alibaba/wan-3.0/text-to-video")
      return {
        family: "wan",
        aspects: ["16:9", "4:3", "1:1", "3:4", "9:16"],
        tiers: [480, 720, 1080],
        durations: Array.from({ length: 29 }, (_, i) => i + 2),
        seed: true,
      } as const;
    return null;
  }

  function resolution(id: string, value: string, aspect?: string) {
    const settings = videoSettings(id)!;
    const [width, height] = value.split("x").map(Number);
    const ratios = settings.aspects.filter((ratio) => {
      const [w, h] = ratio.split(":").map(Number);
      return Math.abs(width! / height! - w! / h!) < 0.002;
    });
    const tier = Math.min(width!, height!);
    if (
      !ratios.length ||
      (aspect && !ratios.includes(aspect)) ||
      !(settings.tiers as readonly number[]).includes(tier)
    )
      throw 0;
    return {
      resolution: tier === 2160 ? "4k" : `${tier}p`,
      aspect_ratio: ratios[0]!,
    };
  }

  export function videoRule(id: string): S.Rule<VideoClient.Input> | null {
    const settings = videoSettings(id);
    if (!settings) return null;
    const rule = S.object({
      prompt: S.string({ nonblank: true }),
      aspect_ratio: S.optional(S.enumeration(settings.aspects)),
      resolution: S.optional(S.pair("x")),
      duration: S.optional(S.enumeration(settings.durations)),
      ...(settings.seed
        ? {
            seed: S.optional(
              S.number({
                integer: true,
                ...(settings.family === "wan"
                  ? { min: 0, max: 2_147_483_647 }
                  : {}),
              })
            ),
          }
        : {}),
    }) as S.Rule<VideoClient.Input>;
    return {
      schema: rule.schema,
      parse(value, json) {
        const input = rule.parse(value, json);
        if (input.resolution)
          resolution(id, input.resolution, input.aspect_ratio);
        return input;
      },
    };
  }

  export function video(id: string, value: VideoClient.Input) {
    const rule = videoRule(id);
    if (!rule) return null;
    const { signal: _signal, ...fields } = value;
    const input = rule.parse(fields);
    const settings = videoSettings(id)!;
    return {
      prompt: input.prompt,
      ...(input.aspect_ratio ? { aspect_ratio: input.aspect_ratio } : {}),
      ...(input.resolution
        ? resolution(id, input.resolution, input.aspect_ratio)
        : {}),
      ...(input.duration !== undefined
        ? {
            duration:
              settings.family === "seedance"
                ? String(input.duration)
                : settings.family === "veo"
                  ? `${input.duration}s`
                  : input.duration,
          }
        : {}),
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
    };
  }
}
