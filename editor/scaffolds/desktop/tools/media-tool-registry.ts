import { catalog as models } from "@grida/ai-models/grida";

export type DesktopMediaToolId =
  | "image-generator"
  | "video-generator"
  | "3d-generator"
  | "model-generation"
  | "rigging"
  | "text-to-music"
  | "text-to-sound-effects"
  | "text-to-speech"
  | "image-viewer"
  | "video-viewer"
  | "3d-viewer"
  | "audio-player";

export type DesktopMediaToolGroupId = "create" | "inspect";

export type DesktopMediaToolSpec = Readonly<{
  id: DesktopMediaToolId;
  group: DesktopMediaToolGroupId;
  label: string;
  description: string;
  /** Exact model ids accepted by this tool. Empty for viewer-only tools. */
  modelIds: readonly string[];
  /** Service recommendation, independent of the presentation order. */
  defaultModelId?: string;
}>;

export type DesktopMediaToolSelection = Readonly<{
  tool: DesktopMediaToolSpec;
  initialModelId: string | null;
}>;

const TOOL_SPECS = Object.freeze([
  {
    id: "image-generator",
    group: "create",
    label: "Images",
    description: "Create images from a written prompt.",
    modelIds: models.image.listed_models().map((card) => card.id),
    defaultModelId: models.image.default_id,
  },
  {
    id: "video-generator",
    group: "create",
    label: "Video",
    description: "Create a video from a written prompt.",
    modelIds: models.video.listed_models().map((card) => card.id),
    defaultModelId: models.video.default_id,
  },
  {
    id: "3d-generator",
    group: "create",
    label: "3D model",
    description: "Create a 3D model from text or a reference image.",
    modelIds: [
      ...models.three_d.ordered_models().map((card) => card.id),
      ...models.three_d.model_generation
        .ordered_models()
        .map((card) => card.id),
    ],
  },
  {
    id: "rigging",
    group: "create",
    label: "Rigging",
    description: "Add a skeleton to an existing 3D model.",
    modelIds: models.three_d.rigging.listed_models().map((card) => card.id),
  },
  {
    id: "text-to-music",
    group: "create",
    label: "Music",
    description: "Create a music track from genre, mood, and arrangement.",
    modelIds: models.audio.music.listed_models().map((card) => card.id),
    defaultModelId: models.audio.music.default_id,
  },
  {
    id: "text-to-sound-effects",
    group: "create",
    label: "SFX",
    description: "Create a short sound effect from a written cue.",
    modelIds: models.audio.sound_effects
      .ordered_models()
      .map((card) => card.id),
  },
  {
    id: "text-to-speech",
    group: "create",
    label: "Voice",
    description: "Turn dialogue with expression cues into spoken audio.",
    modelIds: models.audio.text_to_speech
      .ordered_models()
      .map((card) => card.id),
  },
  {
    id: "image-viewer",
    group: "inspect",
    label: "Image viewer",
    description: "Open a saved image result.",
    modelIds: [],
  },
  {
    id: "video-viewer",
    group: "inspect",
    label: "Video viewer",
    description: "Open and play a saved video result.",
    modelIds: [],
  },
  {
    id: "3d-viewer",
    group: "inspect",
    label: "3D viewer",
    description: "Open GLB files or experimental glTF bundles locally.",
    modelIds: [],
  },
  {
    id: "audio-player",
    group: "inspect",
    label: "Audio player",
    description: "Open and play common audio formats locally.",
    modelIds: [],
  },
] as const satisfies readonly DesktopMediaToolSpec[]);

const TOOL_BY_ID = new Map<DesktopMediaToolId, DesktopMediaToolSpec>(
  TOOL_SPECS.map((tool) => [tool.id, tool])
);
const VISIBLE_TOOL_SPECS = Object.freeze(
  TOOL_SPECS.filter(
    (tool) =>
      tool.group === "create" ||
      tool.id === "3d-viewer" ||
      tool.id === "audio-player"
  )
);

/**
 * Closed registry for the one-shot Desktop media tools surface.
 *
 * The URL persists the visible tool and may carry an initial model or one
 * opaque saved-media id. Prompts and user-opened files remain local component
 * state; durable generated results are owned by the optional Desktop media
 * library, not this registry.
 */
export namespace DesktopMediaTool {
  export const defaultId: DesktopMediaToolId = "3d-generator";
  export const list: readonly DesktopMediaToolSpec[] = VISIBLE_TOOL_SPECS;
  export const groups = Object.freeze([
    { id: "create", label: "Create" },
    { id: "inspect", label: "Inspect" },
  ] as const satisfies readonly Readonly<{
    id: DesktopMediaToolGroupId;
    label: string;
  }>[]);

  export function resolve(
    value: string | null | undefined
  ): DesktopMediaToolSpec {
    if (!value) return TOOL_BY_ID.get(defaultId)!;
    if (
      value === "text-to-3d" ||
      value === "image-to-3d" ||
      value === "model-generation"
    ) {
      return TOOL_BY_ID.get("3d-generator")!;
    }
    return (
      TOOL_BY_ID.get(value as DesktopMediaToolId) ?? TOOL_BY_ID.get(defaultId)!
    );
  }

  export function resolveSelection(
    toolValue: string | null | undefined,
    modelValue: string | null | undefined
  ): DesktopMediaToolSelection {
    const inferredTool = !toolValue ? inferFromModel(modelValue) : null;
    const tool = inferredTool ?? resolve(toolValue);
    if (tool.modelIds.length === 0) {
      return { tool, initialModelId: null };
    }

    const initialModelId = resolveRequestedModel(tool, toolValue, modelValue);
    return { tool, initialModelId };
  }

  export function href(id: DesktopMediaToolId, modelId?: string): string {
    const tool = resolve(id);
    const query = `tool=${encodeURIComponent(tool.id)}`;
    const selectedModel =
      modelId ??
      (id === "model-generation"
        ? models.three_d.model_generation.default_id
        : undefined);
    return selectedModel
      ? `/desktop/tools?${query}&model=${encodeURIComponent(selectedModel)}`
      : `/desktop/tools?${query}`;
  }

  export function hrefForModel(modelId: string): string {
    const tool = inferFromModel(modelId);
    if (!tool) return "/desktop/tools";
    return href(tool.id, modelId);
  }

  function inferFromModel(
    modelId: string | null | undefined
  ): DesktopMediaToolSpec | null {
    if (!modelId) return null;
    if (models.image.models[modelId]?.listed) {
      return resolve("image-generator");
    }
    if (models.video.models[modelId]?.listed) {
      return resolve("video-generator");
    }
    if (resolve("3d-generator").modelIds.includes(modelId)) {
      return resolve("3d-generator");
    }
    if (resolve("rigging").modelIds.includes(modelId)) {
      return resolve("rigging");
    }
    if (resolve("text-to-music").modelIds.includes(modelId)) {
      return resolve("text-to-music");
    }
    if (resolve("text-to-sound-effects").modelIds.includes(modelId)) {
      return resolve("text-to-sound-effects");
    }
    if (resolve("text-to-speech").modelIds.includes(modelId)) {
      return resolve("text-to-speech");
    }
    return null;
  }

  function resolveRequestedModel(
    tool: DesktopMediaToolSpec,
    toolValue: string | null | undefined,
    modelValue: string | null | undefined
  ): string {
    if (
      modelValue &&
      (tool.modelIds as readonly string[]).includes(modelValue)
    ) {
      return modelValue;
    }
    if (toolValue === "model-generation") {
      return (
        models.three_d.model_generation.default_id ??
        models.three_d.model_generation.model_ids[0] ??
        tool.modelIds[0]!
      );
    }
    if (
      tool.id === "3d-generator" &&
      (toolValue === "text-to-3d" || toolValue === "image-to-3d")
    ) {
      const input = toolValue === "text-to-3d" ? "text" : "image";
      const model = models.three_d
        .ordered_models()
        .find((card) => card.input.type === input);
      if (model) return model.id;
    }
    if (tool.defaultModelId && tool.modelIds.includes(tool.defaultModelId)) {
      return tool.defaultModelId;
    }
    return tool.modelIds[0]!;
  }
}
