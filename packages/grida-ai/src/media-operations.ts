// GRIDA-SEC-004 / GRIDA-SEC-006 — discovery grants no provider or GG authority.
// GRIDA-GG: provider — executable route facts do not establish scoped access or credits.
import { models } from "@grida/ai-models";
import { InputSchema, type InputJsonSchema } from "./input-schema";
import { MediaInputs } from "./media-inputs";
import { MediaRoutes } from "./media-routes";
import type { ImageClient } from "./image-client";
import type { VideoClient } from "./video-client";
import type { MusicClient } from "./music-client";
import type { SoundEffectClient } from "./sound-effect-client";
import type { TextToSpeechClient } from "./text-to-speech-client";
import type { ThreeDClient } from "./three-d-client";

/** Immutable bundled/pinned operation facts and the explicit JSON input contract. */
export class MediaOperations {
  readonly #descriptors: readonly MediaOperations.Descriptor[];
  constructor(options: { snapshot?: models.snapshot.Snapshot } = {}) {
    try {
      InputSchema.exact(options, ["snapshot"]);
      let snapshot: models.snapshot.Snapshot | undefined;
      if (options.snapshot !== undefined) {
        // Own the pinned data. Invalid supplied sections must never restore the seed.
        const raw = JSON.parse(JSON.stringify(options.snapshot));
        const parsed = models.snapshot.parse(raw);
        if (
          !parsed ||
          (raw.image !== undefined && !parsed.image) ||
          (raw.video !== undefined && !parsed.video)
        )
          throw 0;
        snapshot = parsed;
      }
      this.#descriptors = InputSchema.freeze(
        descriptors(models.snapshot.view(snapshot))
      );
    } catch {
      throw new MediaOperations.Failure("invalid_input");
    }
  }

  /** No refresh, key reader, token source, transport or host construction is involved. */
  list(
    filter: MediaOperations.Filter = {}
  ): readonly MediaOperations.Descriptor[] {
    try {
      InputSchema.exact(filter, ["kind", "model_id", "provider"]);
      const { kind, model_id, provider } = filter;
      validateFilter({ kind, model_id, provider });
      return Object.freeze(
        this.#descriptors.filter(
          (entry) =>
            (kind === undefined || entry.kind === kind) &&
            (model_id === undefined || entry.model_id === model_id) &&
            (provider === undefined || entry.provider_id === provider)
        )
      );
    } catch {
      throw new MediaOperations.Failure("invalid_input");
    }
  }

  inspect(selector: MediaOperations.Selector): MediaOperations.Descriptor {
    let requested: MediaOperations.Selector;
    try {
      InputSchema.exact(selector, ["kind", "model_id", "provider", "variant"]);
      const { kind, model_id, provider, variant } = selector;
      validateFilter({ kind, model_id, provider });
      if (
        !kind ||
        !model_id ||
        !provider ||
        (variant !== undefined &&
          !["text", "references", "image"].includes(variant))
      )
        throw 0;
      requested = { kind, model_id, provider, variant };
    } catch {
      throw new MediaOperations.Failure("invalid_input");
    }
    const candidates = this.#descriptors.filter(
      (entry) =>
        entry.kind === requested.kind &&
        entry.model_id === requested.model_id &&
        entry.provider_id === requested.provider
    );
    const variant =
      requested.variant ??
      (requested.kind === "three-d" ? candidates[0]?.variant : "text");
    const result = candidates.find((entry) => entry.variant === variant);
    if (!result) throw new MediaOperations.Failure("operation_unavailable");
    return result;
  }

  /** Parse JSON data into native arguments. AbortSignal is a separate caller-owned control. */
  parseInput(
    selector: MediaOperations.Selector,
    value: unknown
  ): MediaOperations.Parsed {
    const descriptor = this.inspect(selector);
    try {
      const { kind, model_id, provider_id, variant } = descriptor;
      switch (kind) {
        case "image":
          return {
            kind,
            model_id,
            selection: {
              model_id,
              provider: provider_id as ImageClient.Provider,
              references: variant === "references",
            },
            input: imageRule(descriptor).parse(value, true),
          };
        case "video":
          return {
            kind,
            model_id,
            selection: {
              model_id,
              provider: provider_id as VideoClient.Provider,
              image: variant === "image",
            },
            input: MediaInputs.video(
              variant === "image",
              provider_id as VideoClient.Provider
            ).parse(value, true),
          };
        case "music":
          return {
            kind,
            model_id,
            selection: { model_id, provider: "gg" },
            input: MediaInputs.music.parse(value, true),
          };
        case "sound-effect":
          return {
            kind,
            model_id,
            selection: { model_id, provider: "elevenlabs" },
            input: MediaInputs.soundEffect.parse(value, true),
          };
        case "text-to-speech": {
          const { voice_id, text } = MediaInputs.speechJson.parse(value, true);
          return {
            kind,
            model_id,
            selection: { model_id, provider: "elevenlabs", voice_id },
            input: { text },
          };
        }
        case "three-d": {
          switch (model_id) {
            case "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d":
              return {
                kind,
                model_id,
                selection: { model_id, provider: "fal" },
                input: MediaInputs.threeDText.parse(value, true),
              };
            case "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d":
              return {
                kind,
                model_id,
                selection: { model_id, provider: "fal" },
                input: MediaInputs.threeDImage.parse(value, true),
              };
            case "fal-ai/trellis-2":
              return {
                kind,
                model_id,
                selection: { model_id, provider: "fal" },
                input: MediaInputs.threeDImage.parse(value, true),
              };
            default:
              throw 0;
          }
        }
      }
    } catch {
      throw new MediaOperations.Failure("invalid_input");
    }
  }
}

export namespace MediaOperations {
  export type Kind =
    | "image"
    | "video"
    | "music"
    | "sound-effect"
    | "text-to-speech"
    | "three-d";
  export type Provider =
    | ImageClient.Provider
    | VideoClient.Provider
    | "elevenlabs";
  export type Variant = "text" | "references" | "image";
  export type Filter = { kind?: Kind; model_id?: string; provider?: Provider };
  export type Selector = {
    kind: Kind;
    model_id: string;
    provider: Provider;
    variant?: Variant;
  };
  export type Schema = InputJsonSchema;
  export type Output = Readonly<{
    representation: "native";
    field: "images" | "videos" | "audio" | "glb";
    cardinality: "one" | "many";
    data: "Uint8Array";
    media_types: readonly string[];
    max_items: number | "n";
    max_total_bytes: number;
  }>;
  export type Descriptor = Readonly<{
    kind: Kind;
    model_id: string;
    provider_id: Provider;
    binding_id: string;
    variant: Variant;
    status: "listed" | "staged";
    references_max?: number;
    input_schema: Schema;
    output: Output;
  }>;
  export type Parsed =
    | {
        kind: "image";
        model_id: string;
        selection: ImageClient.Selection;
        input: ImageClient.Input;
      }
    | {
        kind: "video";
        model_id: string;
        selection: VideoClient.Selection;
        input: VideoClient.Input;
      }
    | {
        kind: "music";
        model_id: string;
        selection: MusicClient.Selection;
        input: MusicClient.Input;
      }
    | {
        kind: "sound-effect";
        model_id: string;
        selection: SoundEffectClient.Selection;
        input: SoundEffectClient.Input;
      }
    | {
        kind: "text-to-speech";
        model_id: string;
        selection: TextToSpeechClient.Selection;
        input: TextToSpeechClient.Input;
      }
    | {
        [K in ThreeDClient.ModelId]: {
          kind: "three-d";
          model_id: K;
          selection: ThreeDClient.Selection<K>;
          input: ThreeDClient.Input<K>;
        };
      }[ThreeDClient.ModelId];
  export class Failure extends Error {
    readonly code: "invalid_input" | "operation_unavailable";
    constructor(code: "invalid_input" | "operation_unavailable") {
      const safe = code === "operation_unavailable" ? code : "invalid_input";
      super(safe);
      this.name = "MediaOperationsFailure";
      this.code = safe;
    }
    toJSON() {
      return { code: this.code, message: this.code };
    }
  }
}

const kinds = [
  "image",
  "video",
  "music",
  "sound-effect",
  "text-to-speech",
  "three-d",
];
const providers = ["openrouter", "vercel", "fal", "gg", "elevenlabs"];
function validateFilter(value: MediaOperations.Filter) {
  if (
    (value.kind !== undefined && !kinds.includes(value.kind)) ||
    (value.provider !== undefined && !providers.includes(value.provider)) ||
    (value.model_id !== undefined &&
      (typeof value.model_id !== "string" ||
        !value.model_id ||
        value.model_id.length > 256))
  )
    throw 0;
}
function imageRule(
  descriptor: Pick<MediaOperations.Descriptor, "references_max">
) {
  return MediaInputs.image(descriptor);
}
function descriptors(view: models.snapshot.View): MediaOperations.Descriptor[] {
  const result: MediaOperations.Descriptor[] = [];
  function add(
    kind: MediaOperations.Kind,
    metadata: {
      model_id: string;
      provider_id: MediaOperations.Provider;
      binding_id: string;
      references_max?: number;
    },
    variant: MediaOperations.Variant,
    status: "listed" | "staged",
    rule: InputSchema.Rule<unknown>
  ) {
    result.push({
      kind,
      model_id: metadata.model_id,
      provider_id: metadata.provider_id,
      binding_id: metadata.binding_id,
      ...(metadata.references_max === undefined
        ? {}
        : { references_max: metadata.references_max }),
      variant,
      status,
      input_schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        ...rule.schema,
      },
      output: output(kind),
    });
  }
  for (const card of Object.values(view.image.models)) {
    for (const provider of [...models.image.providers, "gg"] as const) {
      for (const references of [false, true]) {
        const route = MediaRoutes.image(card, provider, references);
        if (route)
          add(
            "image",
            route,
            references ? "references" : "text",
            "listed",
            imageRule(route)
          );
      }
    }
  }
  for (const card of Object.values(view.video.models)) {
    for (const provider of [...models.video.providers, "gg"] as const) {
      for (const image of [false, true]) {
        const route = MediaRoutes.video(card, provider, image);
        if (route)
          add(
            "video",
            route,
            image ? "image" : "text",
            "listed",
            MediaInputs.video(image, provider)
          );
      }
    }
  }
  for (const card of Object.values(models.audio.music.models)) {
    if (MediaRoutes.music(card.id))
      add(
        "music",
        { model_id: card.id, binding_id: card.id, provider_id: "gg" },
        "text",
        card.status,
        MediaInputs.music
      );
  }
  if (MediaRoutes.soundEffect(MediaRoutes.soundEffectId))
    add(
      "sound-effect",
      {
        model_id: MediaRoutes.soundEffectId,
        binding_id: MediaRoutes.soundEffectId,
        provider_id: "elevenlabs",
      },
      "text",
      models.audio.sound_effects.models[MediaRoutes.soundEffectId].status,
      MediaInputs.soundEffect
    );
  if (MediaRoutes.speech(MediaRoutes.speechId))
    add(
      "text-to-speech",
      {
        model_id: MediaRoutes.speechId,
        binding_id: MediaRoutes.speechId,
        provider_id: "elevenlabs",
      },
      "text",
      models.audio.text_to_speech.models[MediaRoutes.speechId].status,
      MediaInputs.speechJson
    );
  for (const id of MediaRoutes.threeDIds) {
    if (MediaRoutes.threeD(id))
      add(
        "three-d",
        { model_id: id, binding_id: id, provider_id: "fal" },
        MediaRoutes.threeDInput(id),
        models.three_d.models[id].status,
        MediaInputs.threeD(id)
      );
  }
  return result.sort((a, b) => {
    const first = `${a.kind}/${a.model_id}/${a.provider_id}/${a.variant}`;
    const second = `${b.kind}/${b.model_id}/${b.provider_id}/${b.variant}`;
    return first < second ? -1 : first > second ? 1 : 0;
  });
}
function output(kind: MediaOperations.Kind): MediaOperations.Output {
  const common = {
    representation: "native" as const,
    data: "Uint8Array" as const,
  };
  switch (kind) {
    case "image":
      return {
        ...common,
        field: "images",
        cardinality: "many",
        media_types: ["image/*"],
        max_items: "n",
        max_total_bytes: MediaInputs.limits.image,
      };
    case "video":
      return {
        ...common,
        field: "videos",
        cardinality: "many",
        media_types: ["video/*"],
        max_items: MediaInputs.limits.video_items,
        max_total_bytes: MediaInputs.limits.video,
      };
    case "music":
      return {
        ...common,
        field: "audio",
        cardinality: "one",
        media_types: ["audio/mpeg"],
        max_items: 1,
        max_total_bytes: MediaInputs.limits.music,
      };
    case "sound-effect":
      return {
        ...common,
        field: "audio",
        cardinality: "one",
        media_types: ["audio/mpeg"],
        max_items: 1,
        max_total_bytes: MediaInputs.limits.sound_effect,
      };
    case "text-to-speech":
      return {
        ...common,
        field: "audio",
        cardinality: "one",
        media_types: ["audio/mpeg"],
        max_items: 1,
        max_total_bytes: MediaInputs.limits.speech,
      };
    case "three-d":
      return {
        ...common,
        field: "glb",
        cardinality: "one",
        media_types: ["model/gltf-binary"],
        max_items: 1,
        max_total_bytes: MediaInputs.limits.glb,
      };
  }
}
