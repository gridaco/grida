import { models } from "@grida/ai-models";
import type { ModelGenerationGenerateRequest } from "@/lib/desktop/bridge";

/** Converts the model-generation form into the native feature contract. */
export namespace ModelGenerationForm {
  export type ModelId = models.three_d.model_generation.ModelId;
  export type Variant = models.three_d.model_generation.InputVariant;
  export type View = "front" | "left" | "back" | "right";
  export type Settings = {
    texture: boolean;
    pbr: boolean;
    texture_quality: models.three_d.model_generation.TextureQuality;
    geometry_quality: models.three_d.model_generation.GeometryQuality;
    face_limit: string;
    seed: string;
  };
  export const views: readonly View[] = ["front", "left", "back", "right"];
  export const maxImageBytes = 8 * 1024 * 1024;
  export const mediaTypes = ["image/png", "image/jpeg"] as const;
  export const defaults: Settings = {
    texture: true,
    pbr: true,
    texture_quality: "standard",
    geometry_quality: "standard",
    face_limit: "",
    seed: "",
  };

  export function card(
    modelId: ModelId
  ): models.three_d.model_generation.ModelCard {
    return models.three_d.model_generation.models[modelId];
  }

  export function maxFaces(modelId: ModelId, settings: Settings): number {
    const model = card(modelId);
    return model.geometry_quality && settings.geometry_quality === "detailed"
      ? (model.face_limit.detailed_max ?? model.face_limit.max)
      : model.face_limit.max;
  }

  export function estimatedCredits(
    modelId: ModelId,
    variant: Variant,
    settings: Settings
  ): number {
    const model = card(modelId);
    return (
      model.pricing.base_credits[variant] +
      (settings.texture
        ? model.pricing.texture_credits[settings.texture_quality]
        : 0) +
      (model.geometry_quality && settings.geometry_quality === "detailed"
        ? (model.pricing.detailed_geometry_credits ?? 0)
        : 0)
    );
  }

  export function validateImage(file: File): void {
    if (!(mediaTypes as readonly string[]).includes(file.type)) {
      throw new Error("Choose a PNG or JPEG image.");
    }
    if (file.size === 0) throw new Error("The reference image is empty.");
    if (file.size > maxImageBytes) {
      throw new Error("Each reference image must be 8 MiB or smaller.");
    }
  }

  export async function request({
    modelId,
    variant,
    prompt,
    images,
    settings,
    provider = "tripo",
  }: {
    modelId: ModelId;
    variant: Variant;
    prompt: string;
    images: Partial<Record<View, File>>;
    settings: Settings;
    provider?: ModelGenerationGenerateRequest["provider"];
  }): Promise<ModelGenerationGenerateRequest> {
    const model = card(modelId);
    const faceLimit = optionalInteger(settings.face_limit, "Face limit");
    const seed = optionalInteger(settings.seed, "Seed");
    if (
      faceLimit !== undefined &&
      (faceLimit < model.face_limit.min ||
        faceLimit > maxFaces(modelId, settings))
    ) {
      throw new Error(
        `Face limit must be between ${model.face_limit.min.toLocaleString()} and ${maxFaces(modelId, settings).toLocaleString()}.`
      );
    }
    const options = {
      texture: settings.texture,
      pbr: settings.texture && settings.pbr,
      ...(settings.texture
        ? { texture_quality: settings.texture_quality }
        : {}),
      ...(model.geometry_quality
        ? { geometry_quality: settings.geometry_quality }
        : {}),
      ...(faceLimit === undefined ? {} : { face_limit: faceLimit }),
      ...(seed === undefined ? {} : { seed }),
    };
    // GRIDA-GG: desktop — funding is explicit; model/input semantics are shared.
    const selection = { model_id: modelId, provider };
    if (variant === "text") {
      const text = prompt.trim();
      if (!text) throw new Error("Describe the model to generate.");
      if ([...text].length > 1024)
        throw new Error("Use 1,024 characters or fewer.");
      return {
        ...selection,
        variant,
        input: { ...options, prompt: text },
      } as ModelGenerationGenerateRequest;
    }
    if (!images.front)
      throw new Error(
        variant === "image" ? "Add a reference image." : "Add the front view."
      );
    const selectedViews = views.filter((view) => images[view]);
    if (variant === "multiview" && selectedViews.length < 2) {
      throw new Error(
        "Add at least one left, back, or right view alongside the front view."
      );
    }
    // Validate all selected files before reading any of them.
    for (const view of variant === "image"
      ? ["front" as const]
      : selectedViews) {
      validateImage(images[view]!);
    }
    if (variant === "image") {
      return {
        ...selection,
        variant,
        input: { ...options, image: await encode(images.front) },
      } as ModelGenerationGenerateRequest;
    }
    const encoded = Object.fromEntries(
      await Promise.all(
        selectedViews.map(async (view) => [view, await encode(images[view]!)])
      )
    );
    return {
      ...selection,
      variant,
      input: { ...options, images: encoded },
    } as ModelGenerationGenerateRequest;
  }

  function optionalInteger(value: string, label: string): number | undefined {
    if (!value.trim()) return undefined;
    const number = Number(value);
    if (!Number.isSafeInteger(number))
      throw new Error(`${label} must be a whole number.`);
    return number;
  }

  async function encode(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const chunks: string[] = [];
    for (let offset = 0; offset < bytes.length; offset += 32 * 1024) {
      chunks.push(
        String.fromCharCode(...bytes.subarray(offset, offset + 32 * 1024))
      );
    }
    return {
      data: btoa(chunks.join("")),
      media_type: file.type as (typeof mediaTypes)[number],
    };
  }
}
