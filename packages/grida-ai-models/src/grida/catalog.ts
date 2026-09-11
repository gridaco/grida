import { models as facts } from "../models";
import { TIER_MODEL_IDS, type ModelTier } from "./tiers";
import { preferences } from "./preferences";

// Keep the imported value lookup outside the namespace that exports `models`.
// The declaration bundler otherwise shadows the import with that local value.
type FactualThreeDModels = typeof facts.three_d.models;
type FactualModelGenerationModels =
  typeof facts.three_d.model_generation.models;
type FactualImageBinding = typeof facts.image.binding;
type FactualImageBackground = typeof facts.image.supportsTransparentBackground;
type FactualVideoInput = typeof facts.video.input;
type FactualVideoBinding = typeof facts.video.binding;

/** Copy the input before freezing so no caller or producer loses ownership. */
function own<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(own)) as T;
  if (value && typeof value === "object") {
    return Object.freeze(
      Object.fromEntries(Object.entries(value).map(([k, v]) => [k, own(v)]))
    ) as T;
  }
  return value;
}

function specByIdOver<T extends facts.text.ModelSpec>(
  specs: readonly T[],
  id: string
): T | undefined {
  return facts.text.modelSpecById(id, specs) as T | undefined;
}

function resolveOver(
  specs: readonly facts.text.ModelSpec[],
  id: string,
  custom?: readonly facts.text.registry.CustomModelSpec[]
) {
  return facts.text.registry.resolve(id, custom, specs);
}

function cardByIdOver<Card extends { id: string }>(
  cards: Record<string, Card | undefined>,
  id: string
): Card | undefined {
  if (!id) return undefined;
  if (id.includes("/")) return Object.hasOwn(cards, id) ? cards[id] : undefined;
  return Object.values(cards).find(
    (card) => card && card.id.slice(card.id.indexOf("/") + 1) === id
  );
}

function listedOver<
  Card extends {
    id: string;
    label: string;
    listed: boolean;
    deprecated?: boolean;
  },
>(
  cards: Record<string, Card | undefined>,
  preferences?: catalog.policy.Preferences
): readonly Card[] {
  const defined = Object.values(cards).filter((card): card is Card => !!card);
  const policy = {
    members: Object.fromEntries(
      defined.map((card) => [
        card.id,
        {
          status: card.listed ? ("listed" as const) : ("staged" as const),
          legacy: card.deprecated,
        },
      ])
    ),
    ...preferences,
  };
  return Object.freeze(
    catalog.policy
      .resolve(cards, policy)
      .listed()
      .map((card) => cards[card.id]!)
  );
}

/** Grida's service choices joined to canonical model facts. No I/O or credentials. */
export namespace catalog {
  export type Provider = facts.Provider;
  export type Vendor = facts.Vendor;
  export type ISODate = facts.ISODate;
  export type ModelRelease = facts.ModelRelease;
  export type ModelReleaseBasis = facts.ModelReleaseBasis;
  export type CatalogueStatus = "listed" | "staged";

  export namespace policy {
    export interface Preferences<Id extends string = string> {
      /** An explicit recommendation. Absence stays absent. */
      readonly default_id?: Id;
      /** Partial order, independent of declaration order. */
      readonly order?: readonly Id[];
    }
    export interface Member {
      readonly status: CatalogueStatus;
      /** Service lifecycle only; never upstream retirement. */
      readonly legacy?: boolean;
      readonly reason?: string;
    }
    export interface Definition<
      Id extends string = string,
      Entry extends Member = Member,
    > extends Preferences<Id> {
      readonly members: Readonly<Partial<Record<Id, Entry>>>;
    }
    export interface View<Card> {
      readonly models: Readonly<Record<string, Card>>;
      readonly default_id?: string;
      listed(): readonly Card[];
      staged(): readonly Card[];
      all(): readonly Card[];
    }

    /** Validate and join a product's membership with facts, returning an owned immutable view. */
    export function resolve<
      Card extends { id: string; label: string },
      Entry extends Member,
    >(
      facts: Readonly<Record<string, Card | undefined>>,
      definition: Definition<string, Entry>
    ): View<Card & Member> {
      const members = Object.entries(definition.members) as [string, Entry][];
      const order = definition.order ?? [];
      const seen = new Set<string>();
      for (const id of order) {
        if (seen.has(id)) throw new Error(`Duplicate order id: ${id}`);
        if (!Object.hasOwn(definition.members, id))
          throw new Error(`Order id is not a member: ${id}`);
        seen.add(id);
      }
      const cards: (Card & Member)[] = members.map(([id, member]) => {
        const fact = facts[id] as Card | undefined;
        if (!Object.hasOwn(facts, id) || !fact || fact.id !== id)
          throw new Error(`Unknown model id: ${id}`);
        if (
          !member ||
          (member.status !== "listed" && member.status !== "staged")
        )
          throw new Error(`Invalid membership status: ${id}`);
        if (member.legacy !== undefined && typeof member.legacy !== "boolean")
          throw new Error(`Invalid legacy value: ${id}`);
        return own({
          ...fact,
          status: member.status,
          legacy: member.legacy,
          reason: member.reason,
        });
      });
      const default_id = definition.default_id;
      if (default_id !== undefined) {
        const member = definition.members[default_id];
        if (!member || member.status !== "listed" || member.legacy)
          throw new Error(
            `Default must be a listed, active member: ${default_id}`
          );
      }
      const ranks = new Map(order.map((id, index) => [id, index]));
      const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
      cards.sort(
        (a, b) =>
          Number(b.id === default_id) - Number(a.id === default_id) ||
          Number(!!a.legacy) - Number(!!b.legacy) ||
          (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity) ||
          compare(a.label, b.label) ||
          compare(a.id, b.id)
      );
      const all = Object.freeze(cards);
      const listed = Object.freeze(
        cards.filter((card) => card.status === "listed")
      );
      const staged = Object.freeze(
        cards.filter((card) => card.status === "staged")
      );
      return Object.freeze({
        models: Object.freeze(
          Object.fromEntries(cards.map((card) => [card.id, card]))
        ),
        ...(default_id === undefined ? {} : { default_id }),
        listed: () => listed,
        staged: () => staged,
        all: () => all,
      });
    }
  }

  export const definitions = own({
    text: {
      members: {
        "openai/gpt-5.5": {
          status: "listed",
          legacy: true,
        },
        "openai/gpt-5.5-pro": {
          status: "listed",
        },
        "openai/gpt-5.6-sol": {
          status: "listed",
        },
        "openai/gpt-5.6-terra": {
          status: "listed",
        },
        "openai/gpt-5.6-luna": {
          status: "listed",
        },
        "openai/gpt-6-astra": {
          status: "listed",
        },
        "anthropic/claude-sonnet-5": {
          status: "listed",
        },
        "anthropic/claude-fable-5.1": {
          status: "listed",
        },
        "anthropic/claude-fable-5": {
          status: "listed",
          legacy: true,
        },
        "anthropic/claude-opus-5": {
          status: "listed",
        },
        "anthropic/claude-opus-4.8": {
          status: "listed",
          legacy: true,
        },
        "google/gemini-3.8-flash": {
          status: "listed",
        },
        "google/gemini-3.7-flash": {
          status: "listed",
          legacy: true,
        },
        "google/gemini-3.1-pro-preview": {
          status: "listed",
        },
      },
      ...preferences.text,
    },
    image: {
      members: {
        "openai/gpt-image-2": {
          status: "listed",
          legacy: true,
          primary_provider: "vercel",
          request_defaults: {
            width: 1024,
            height: 1024,
            aspect_ratio: "1:1",
          },
        },
        "openai/gpt-image-2.5-flare": {
          status: "listed",
          primary_provider: "vercel",
          request_defaults: {
            width: 1024,
            height: 1024,
            aspect_ratio: "1:1",
          },
        },
        "openai/gpt-image-2.5-sunburst": {
          status: "listed",
          primary_provider: "vercel",
          request_defaults: {
            width: 1024,
            height: 1024,
            aspect_ratio: "1:1",
          },
        },
        "openai/gpt-image-1.5": {
          status: "staged",
          legacy: true,
          reason: "Previous-generation model, superseded by GPT Image 2.",
          primary_provider: "vercel",
          request_defaults: {
            width: 1024,
            height: 1024,
            aspect_ratio: "1:1",
          },
        },
        "openai/gpt-image-1-mini": {
          status: "staged",
          reason:
            "Cost-tier model, not part of the curated flagship/SOTA list.",
          primary_provider: "vercel",
          request_defaults: {
            width: 1024,
            height: 1024,
            aspect_ratio: "1:1",
          },
        },
        "google/gemini-3.1-flash-image-preview": {
          status: "listed",
          primary_provider: "vercel",
          request_defaults: {
            width: 1024,
            height: 1024,
            aspect_ratio: "1:1",
          },
        },
        "google/gemini-3-pro-image": {
          status: "listed",
          primary_provider: "vercel",
          request_defaults: {
            width: 1024,
            height: 1024,
            aspect_ratio: "1:1",
          },
        },
        "google/gemini-3.1-flash-lite-image": {
          status: "staged",
          reason:
            "Cost-tier model, not part of the curated flagship/SOTA list.",
          primary_provider: "vercel",
          request_defaults: {
            width: 1024,
            height: 1024,
            aspect_ratio: "1:1",
          },
        },
        "bfl/flux-2-pro": {
          status: "listed",
          primary_provider: "vercel",
          request_defaults: {
            width: 1024,
            height: 1024,
            aspect_ratio: "1:1",
          },
        },
        "bfl/flux-2-max": {
          status: "listed",
          primary_provider: "vercel",
          request_defaults: {
            width: 1024,
            height: 1024,
            aspect_ratio: "1:1",
          },
        },
        "bfl/flux-kontext-max": {
          status: "staged",
          reason:
            "Image-editing model; not on OpenRouter, so not universal (one-key) coverage.",
          primary_provider: "vercel",
          request_defaults: {
            width: 1024,
            height: 1024,
            aspect_ratio: "1:1",
          },
        },
        "bfl/flux-kontext-pro": {
          status: "staged",
          reason:
            "Image-editing model; superseded by Flux 2 and not on OpenRouter, so not universal.",
          primary_provider: "vercel",
          request_defaults: {
            width: 1024,
            height: 1024,
            aspect_ratio: "1:1",
          },
        },
        "bfl/flux-pro-1.1": {
          status: "staged",
          reason: "Superseded by Flux 2 Pro; not universal.",
          primary_provider: "vercel",
          request_defaults: {
            width: 1024,
            height: 1024,
            aspect_ratio: "1:1",
          },
        },
        "bytedance/seedream-5.0-pro": {
          status: "listed",
          primary_provider: "vercel",
          request_defaults: {
            width: 1024,
            height: 1024,
            aspect_ratio: "1:1",
          },
        },
        "bytedance/seedream-5.0-lite": {
          status: "listed",
          primary_provider: "vercel",
          request_defaults: {
            width: 2048,
            height: 2048,
            aspect_ratio: "1:1",
          },
        },
        "bytedance/seedream-4.5": {
          status: "staged",
          legacy: true,
          reason: "Previous-generation model, superseded by Seedream 5.0.",
          primary_provider: "vercel",
          request_defaults: {
            width: 1024,
            height: 1024,
            aspect_ratio: "1:1",
          },
        },
        "xai/grok-imagine-image-2.0": {
          status: "listed",
          primary_provider: "vercel",
          request_defaults: {
            width: 1024,
            height: 1024,
            aspect_ratio: "1:1",
          },
        },
        "meta/muse-image-1.0": {
          status: "staged",
          reason:
            "OpenRouter lists it without a serving endpoint, so not universal (one-key) coverage.",
          primary_provider: "vercel",
          request_defaults: {
            width: 1024,
            height: 1024,
            aspect_ratio: "1:1",
          },
        },
        "recraft/recraft-v4.1": {
          status: "listed",
          primary_provider: "vercel",
          request_defaults: {
            width: 1024,
            height: 1024,
            aspect_ratio: "1:1",
          },
        },
        "recraft/recraft-v3": {
          status: "staged",
          legacy: true,
          reason: "Previous-generation model, superseded by Recraft V4.1.",
          primary_provider: "vercel",
          request_defaults: {
            width: 1024,
            height: 1024,
            aspect_ratio: "1:1",
          },
        },
      },
      ...preferences.image,
    },
    "audio.music": {
      members: {
        "google/lyria-3": {
          status: "listed",
        },
        "google/lyria-3-pro": {
          status: "listed",
        },
      },
      ...preferences["audio.music"],
    },
    "audio.sound_effects": {
      members: {
        eleven_text_to_sound_v2: {
          status: "staged",
        },
      },
      ...preferences["audio.sound_effects"],
    },
    "audio.text_to_speech": {
      members: {
        eleven_v3: {
          status: "staged",
        },
      },
      ...preferences["audio.text_to_speech"],
    },
    three_d: {
      members: {
        "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d": {
          status: "staged",
        },
        "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d": {
          status: "staged",
        },
        "fal-ai/trellis-2": {
          status: "staged",
        },
      },
      ...preferences["three_d"],
    },
    "three_d.model_generation": {
      members: {
        "tripo/h3.1": { status: "listed" },
        "tripo/p1": { status: "listed" },
        "tripo/p2": { status: "listed" },
      },
      ...preferences["three_d.model_generation"],
    },
    video: {
      members: {
        "google/veo-3.1": {
          status: "listed",
          request_defaults: {
            resolution: "1080p",
            aspect_ratio: "16:9",
            duration: 8,
            audio: true,
          },
        },
        "google/veo-3.1-fast": {
          status: "listed",
          request_defaults: {
            resolution: "1080p",
            aspect_ratio: "16:9",
            duration: 8,
            audio: true,
          },
        },
        "google/veo-3.1-lite": {
          status: "listed",
          request_defaults: {
            resolution: "1080p",
            aspect_ratio: "16:9",
            duration: 8,
            audio: true,
          },
        },
        "alibaba/wan-3.0": {
          status: "listed",
          request_defaults: {
            resolution: "1080p",
            aspect_ratio: "16:9",
            duration: 5,
            audio: true,
          },
        },
        "bytedance/seedance-2.0": {
          status: "listed",
          request_defaults: {
            resolution: "720p",
            aspect_ratio: "16:9",
            duration: 5,
            audio: true,
          },
        },
        "bytedance/seedance-2.5": {
          status: "listed",
          request_defaults: {
            resolution: "720p",
            aspect_ratio: "16:9",
            duration: 5,
            audio: true,
          },
        },
        "xai/grok-imagine-video-1.5": {
          status: "listed",
          request_defaults: {
            resolution: "720p",
            aspect_ratio: "16:9",
            duration: 5,
            audio: true,
          },
        },
      },
      ...preferences["video"],
    },
    image_tools: {
      members: {
        "recraft-ai/recraft-remove-background": {
          status: "listed",
        },
        "851-labs/background-remover": {
          status: "listed",
        },
        "bria/remove-background": {
          status: "listed",
        },
        "nightmareai/real-esrgan": {
          status: "listed",
        },
      },
      ...preferences["image_tools"],
    },
  } as const satisfies {
    text: policy.Definition<facts.text.CatalogId>;
    image: policy.Definition<facts.image.ImageModelId, image.Member>;
    video: policy.Definition<facts.video.VideoModelId, video.Member>;
    "audio.music": policy.Definition<facts.audio.music.ModelId>;
    "audio.sound_effects": policy.Definition<facts.audio.sound_effects.ModelId>;
    "audio.text_to_speech": policy.Definition<facts.audio.text_to_speech.ModelId>;
    three_d: policy.Definition<facts.three_d.ThreeDModelId>;
    "three_d.model_generation": policy.Definition<facts.three_d.model_generation.ModelId>;
    image_tools: policy.Definition<facts.image_tools.ImageToolModelId>;
  });
  export namespace text {
    export type ModelCostPerMillion = facts.text.ModelCostPerMillion;
    export type ImageInputMime = facts.text.ImageInputMime;
    export type CatalogId = keyof typeof definitions.text.members;
    export const displayLabel = facts.text.displayLabel;
    export type ModelSpec = facts.text.ModelSpec & { deprecated?: boolean };
    const resolved = policy.resolve(facts.text.catalog, definitions.text);
    export const catalog: Record<
      CatalogId,
      ModelSpec & { release: ModelRelease }
    > = own(
      Object.fromEntries(
        resolved.all().map((card) => {
          const { status: _status, legacy, reason: _reason, ...fact } = card;
          return [
            card.id,
            { ...fact, ...(legacy ? { deprecated: true } : {}) },
          ];
        })
      )
    ) as Record<CatalogId, ModelSpec & { release: ModelRelease }>;
    export const default_id: CatalogId | undefined =
      definitions.text.default_id;
    for (const id of Object.values(TIER_MODEL_IDS)) {
      if (
        !Object.hasOwn(catalog, id) ||
        definitions.text.members[id].status !== "listed"
      )
        throw new Error(`Tier model is not a listed service member: ${id}`);
    }
    export const byTier: Readonly<
      Record<ModelTier, ModelSpec & { release: ModelRelease }>
    > = own({
      nano: catalog[TIER_MODEL_IDS.nano],
      mini: catalog[TIER_MODEL_IDS.mini],
      pro: catalog[TIER_MODEL_IDS.pro],
      max: catalog[TIER_MODEL_IDS.max],
    });
    export function listed_models(): readonly ModelSpec[] {
      return Object.freeze(
        resolved.listed().map((card) => catalog[card.id as CatalogId])
      );
    }
    export function ordered_models(): readonly ModelSpec[] {
      return Object.freeze(
        resolved.all().map((card) => catalog[card.id as CatalogId])
      );
    }
    export function modelSpecById(id: string): ModelSpec | undefined {
      return specByIdOver(Object.values(catalog), id);
    }
    export namespace registry {
      export type CustomModelSpec = facts.text.registry.CustomModelSpec;
      export type ResolvedModelSpec = facts.text.registry.ResolvedModelSpec & {
        deprecated?: boolean;
      };
      export const CUSTOM_MODEL_DEFAULTS =
        facts.text.registry.CUSTOM_MODEL_DEFAULTS;
      export const normalize = facts.text.registry.normalize;
      export function resolve(
        id: string,
        custom?: readonly CustomModelSpec[]
      ): ResolvedModelSpec | undefined {
        return resolveOver(Object.values(catalog), id, custom);
      }
    }
  }
  export namespace image {
    export type ProviderModel = facts.image.ProviderModel;
    export type ImageModelId = facts.image.ImageModelId;
    export type AspectRatioString = facts.image.AspectRatioString;
    export type SizeString = facts.image.SizeString;
    export type SizeSpec = facts.image.SizeSpec;
    export type SpeedLabel = facts.image.SpeedLabel;
    export type PerTokenRates = facts.image.PerTokenRates;
    export type PerImageTieredPricing = facts.image.PerImageTieredPricing;
    export type PerImageFlatPricing = facts.image.PerImageFlatPricing;
    export type PerTokenPricing = facts.image.PerTokenPricing;
    export type ImageModelPricing = facts.image.ImageModelPricing;
    export const providers = facts.image.providers;
    export type ImageProvider = facts.image.ImageProvider;
    export type ImageProviderBinding = facts.image.ImageProviderBinding;
    export type ImageSizeConstraints = facts.image.ImageSizeConstraints;
    export const binding: FactualImageBinding = facts.image.binding;
    export const supportsTransparentBackground: FactualImageBackground =
      facts.image.supportsTransparentBackground;
    export type RequestDefaults = {
      width: number;
      height: number;
      aspect_ratio: AspectRatioString;
    };
    export interface Member extends policy.Member {
      readonly primary_provider: ImageProvider;
      readonly request_defaults: RequestDefaults;
    }
    export type ImageModelCard = facts.image.ImageModelCard & {
      deprecated: boolean;
      listed: boolean;
      listed_reason?: string;
      provider: ImageProvider;
      pricing: ImageModelPricing;
      avg_cost_usd: number;
      default: RequestDefaults;
    };
    export type ImageModelCardCompact = Pick<
      ImageModelCard,
      | "id"
      | "label"
      | "deprecated"
      | "short_description"
      | "release"
      | "speed_label"
      | "pricing"
    >;
    const resolved = policy.resolve(facts.image.models, definitions.image);
    export const models: Partial<
      Record<ImageModelId, ImageModelCard & { release: ModelRelease }>
    > = own(
      Object.fromEntries(
        resolved.all().map((card) => {
          const member =
            definitions.image.members[
              card.id as keyof typeof definitions.image.members
            ];
          const route = facts.image.binding(card, member.primary_provider);
          if (!route)
            throw new Error(
              "Primary provider has no factual binding: " + card.id
            );
          const { status, legacy, reason, ...fact } = card;
          return [
            card.id,
            {
              ...fact,
              deprecated: !!legacy,
              listed: status === "listed",
              ...(reason ? { listed_reason: reason } : {}),
              provider: member.primary_provider,
              default: member.request_defaults,
            },
          ];
        })
      )
    );
    export const default_id: ImageModelId | undefined =
      definitions.image.default_id;
    export function listed_models(): readonly ImageModelCard[] {
      return Object.freeze(
        resolved.listed().map((card) => models[card.id as ImageModelId]!)
      );
    }
    export function ordered_models(): readonly ImageModelCard[] {
      return Object.freeze(
        resolved.all().map((card) => models[card.id as ImageModelId]!)
      );
    }
    export function staged_models(): readonly ImageModelCard[] {
      return Object.freeze(
        resolved.staged().map((card) => models[card.id as ImageModelId]!)
      );
    }
    export function findImageModelCard(
      model: ProviderModel | ImageModelId
    ): ImageModelCard | null {
      if (!model) return null;
      return (
        cardByIdOver(
          models,
          typeof model === "string" ? model : model.modelId
        ) ?? null
      );
    }
    export function toCompact(card: ImageModelCard): ImageModelCardCompact {
      const {
        id,
        label,
        deprecated,
        short_description,
        release,
        speed_label,
        pricing,
      } = card;
      return own({
        id,
        label,
        deprecated,
        short_description,
        release,
        speed_label,
        pricing,
      });
    }
  }
  export namespace video {
    export const providers = facts.video.providers;
    export type VideoProvider = facts.video.VideoProvider;
    export type VideoModelId = facts.video.VideoModelId;
    export type ResolutionLabel = facts.video.ResolutionLabel;
    export type AudioMode = facts.video.AudioMode;
    export type PerSecondPricing = facts.video.PerSecondPricing;
    export type VideoModelPricing = facts.video.VideoModelPricing;
    export type VideoProviderBinding = facts.video.VideoProviderBinding;
    export type VideoInput = facts.video.VideoInput;
    export const input: FactualVideoInput = facts.video.input;

    export const binding: FactualVideoBinding = facts.video.binding;
    export type RequestDefaults = {
      resolution: ResolutionLabel;
      aspect_ratio: image.AspectRatioString;
      duration: number;
      audio: boolean;
    };
    export interface Member extends policy.Member {
      readonly request_defaults: RequestDefaults;
    }
    export type VideoModelCard = facts.video.VideoModelCard & {
      deprecated: boolean;
      listed: boolean;
      default: RequestDefaults;
    };
    const resolved = policy.resolve(facts.video.models, definitions.video);
    export const models: Partial<
      Record<VideoModelId, VideoModelCard & { release: ModelRelease }>
    > = own(
      Object.fromEntries(
        resolved.all().map((card) => {
          const { status, legacy, reason: _reason, ...fact } = card;
          const member =
            definitions.video.members[
              card.id as keyof typeof definitions.video.members
            ];
          return [
            card.id,
            {
              ...fact,
              deprecated: !!legacy,
              listed: status === "listed",
              default: member.request_defaults,
            },
          ];
        })
      )
    );
    export const video_model_ids = Object.freeze(
      Object.keys(models) as VideoModelId[]
    );
    export const default_id = (
      preferences.video as policy.Preferences<VideoModelId>
    ).default_id;
    export function listed_models(): readonly VideoModelCard[] {
      return Object.freeze(
        resolved.listed().map((card) => models[card.id as VideoModelId]!)
      );
    }
    export function ordered_models(): readonly VideoModelCard[] {
      return Object.freeze(
        resolved.all().map((card) => models[card.id as VideoModelId]!)
      );
    }
  }
  export namespace audio {
    export namespace music {
      export type ModelId = facts.audio.music.ModelId;
      export type Input = facts.audio.music.Input;
      export type Duration = facts.audio.music.Duration;
      export type Output = facts.audio.music.Output;
      export type Pricing = facts.audio.music.Pricing;

      export type ModelCard = facts.audio.music.ModelCard & {
        deprecated: boolean;
        status: CatalogueStatus;
      };
      const resolved = policy.resolve(
        facts.audio.music.models,
        definitions["audio.music"]
      );
      export const models: Record<ModelId, ModelCard> = own(
        Object.fromEntries(
          resolved.all().map((card) => {
            const { legacy, reason: _reason, ...fact } = card;
            return [card.id, { ...fact, deprecated: !!legacy }];
          })
        )
      ) as unknown as Record<ModelId, ModelCard>;
      export const model_ids = Object.freeze(Object.keys(models) as ModelId[]);
      export const default_id = (
        preferences["audio.music"] as policy.Preferences<ModelId>
      ).default_id;
      export function is_model_id(id: string): id is ModelId {
        return Object.hasOwn(models, id);
      }
      export function listed_models(): readonly ModelCard[] {
        return Object.freeze(
          resolved.listed().map((card) => models[card.id as ModelId])
        );
      }
      export function ordered_models(): readonly ModelCard[] {
        return Object.freeze(
          resolved.all().map((card) => models[card.id as ModelId])
        );
      }
      export function staged_models(): readonly ModelCard[] {
        return Object.freeze(
          resolved.staged().map((card) => models[card.id as ModelId])
        );
      }
    }
    export namespace sound_effects {
      export type ModelId = facts.audio.sound_effects.ModelId;
      export type Input = facts.audio.sound_effects.Input;
      export type Output = facts.audio.sound_effects.Output;
      export type Pricing = facts.audio.sound_effects.Pricing;

      export type ModelCard = facts.audio.sound_effects.ModelCard & {
        deprecated: boolean;
        status: CatalogueStatus;
      };
      const resolved = policy.resolve(
        facts.audio.sound_effects.models,
        definitions["audio.sound_effects"]
      );
      export const models: Record<ModelId, ModelCard> = own(
        Object.fromEntries(
          resolved.all().map((card) => {
            const { legacy, reason: _reason, ...fact } = card;
            return [card.id, { ...fact, deprecated: !!legacy }];
          })
        )
      ) as unknown as Record<ModelId, ModelCard>;
      export const model_ids = Object.freeze(Object.keys(models) as ModelId[]);
      export const default_id = (
        preferences["audio.sound_effects"] as policy.Preferences<ModelId>
      ).default_id;
      export function is_model_id(id: string): id is ModelId {
        return Object.hasOwn(models, id);
      }
      export function listed_models(): readonly ModelCard[] {
        return Object.freeze(
          resolved.listed().map((card) => models[card.id as ModelId])
        );
      }
      export function ordered_models(): readonly ModelCard[] {
        return Object.freeze(
          resolved.all().map((card) => models[card.id as ModelId])
        );
      }
      export function staged_models(): readonly ModelCard[] {
        return Object.freeze(
          resolved.staged().map((card) => models[card.id as ModelId])
        );
      }
    }
    export namespace text_to_speech {
      export type ModelId = facts.audio.text_to_speech.ModelId;
      export type Input = facts.audio.text_to_speech.Input;
      export type Output = facts.audio.text_to_speech.Output;
      export type Pricing = facts.audio.text_to_speech.Pricing;

      export type ModelCard = facts.audio.text_to_speech.ModelCard & {
        deprecated: boolean;
        status: CatalogueStatus;
      };
      const resolved = policy.resolve(
        facts.audio.text_to_speech.models,
        definitions["audio.text_to_speech"]
      );
      export const models: Record<ModelId, ModelCard> = own(
        Object.fromEntries(
          resolved.all().map((card) => {
            const { legacy, reason: _reason, ...fact } = card;
            return [card.id, { ...fact, deprecated: !!legacy }];
          })
        )
      ) as unknown as Record<ModelId, ModelCard>;
      export const model_ids = Object.freeze(Object.keys(models) as ModelId[]);
      export const default_id = (
        preferences["audio.text_to_speech"] as policy.Preferences<ModelId>
      ).default_id;
      export function is_model_id(id: string): id is ModelId {
        return Object.hasOwn(models, id);
      }
      export function listed_models(): readonly ModelCard[] {
        return Object.freeze(
          resolved.listed().map((card) => models[card.id as ModelId])
        );
      }
      export function ordered_models(): readonly ModelCard[] {
        return Object.freeze(
          resolved.all().map((card) => models[card.id as ModelId])
        );
      }
      export function staged_models(): readonly ModelCard[] {
        return Object.freeze(
          resolved.staged().map((card) => models[card.id as ModelId])
        );
      }
    }
  }
  export namespace three_d {
    export namespace model_generation {
      export type ModelId =
        keyof (typeof definitions)["three_d.model_generation"]["members"];
      export type InputVariant = facts.three_d.model_generation.InputVariant;
      export type TextureQuality =
        facts.three_d.model_generation.TextureQuality;
      export type GeometryQuality =
        facts.three_d.model_generation.GeometryQuality;
      export type ModelCard = facts.three_d.model_generation.ModelCard & {
        deprecated: boolean;
        status: CatalogueStatus;
      };
      type CatalogModels = {
        [Id in ModelId]: FactualModelGenerationModels[Id] & {
          deprecated: boolean;
          status: CatalogueStatus;
        };
      };
      const resolved = policy.resolve(
        facts.three_d.model_generation.models,
        definitions["three_d.model_generation"]
      );
      export const models: CatalogModels = own(
        Object.fromEntries(
          resolved.all().map((card) => {
            const { legacy, reason: _reason, ...fact } = card;
            return [card.id, { ...fact, deprecated: !!legacy }];
          })
        )
      ) as unknown as CatalogModels;
      export const model_ids = Object.freeze(Object.keys(models) as ModelId[]);
      export const default_id = (
        preferences["three_d.model_generation"] as policy.Preferences<ModelId>
      ).default_id;
      export function is_model_id(id: string): id is ModelId {
        return Object.hasOwn(models, id);
      }
      export function listed_models(): readonly ModelCard[] {
        return Object.freeze(
          resolved.listed().map((card) => models[card.id as ModelId])
        );
      }
      export function ordered_models(): readonly ModelCard[] {
        return Object.freeze(
          resolved.all().map((card) => models[card.id as ModelId])
        );
      }
      export function staged_models(): readonly ModelCard[] {
        return Object.freeze(
          resolved.staged().map((card) => models[card.id as ModelId])
        );
      }
    }
    export type TextToThreeDModelId = facts.three_d.TextToThreeDModelId;
    export type ImageToThreeDModelId = facts.three_d.ImageToThreeDModelId;
    export type ThreeDModelId = facts.three_d.ThreeDModelId;
    export type ThreeDModelCategory = facts.three_d.ThreeDModelCategory;
    export type ThreeDInput = facts.three_d.ThreeDInput;
    export type ThreeDOutputFormat = facts.three_d.ThreeDOutputFormat;
    export type ThreeDOutput = facts.three_d.ThreeDOutput;
    export type HunyuanSurcharge = facts.three_d.HunyuanSurcharge;
    export type PerGenerationBasePlusSurchargesPricing =
      facts.three_d.PerGenerationBasePlusSurchargesPricing;
    export type TrellisResolution = facts.three_d.TrellisResolution;
    export type PerGenerationByResolutionPricing =
      facts.three_d.PerGenerationByResolutionPricing;
    export type ThreeDModelPricing = facts.three_d.ThreeDModelPricing;
    export type ThreeDModelCard = facts.three_d.ThreeDModelCard & {
      deprecated: boolean;
      status: CatalogueStatus;
    };
    type CatalogModels = {
      [Id in keyof typeof definitions.three_d.members]: FactualThreeDModels[Id] & {
        deprecated: boolean;
        status: CatalogueStatus;
      };
    };
    const resolved = policy.resolve(facts.three_d.models, definitions.three_d);
    export const models: CatalogModels = own(
      Object.fromEntries(
        resolved.all().map((card) => {
          const { legacy, reason: _reason, ...fact } = card;
          return [card.id, { ...fact, deprecated: !!legacy }];
        })
      )
    ) as unknown as CatalogModels;
    export const three_d_model_ids = Object.freeze(
      Object.keys(models) as ThreeDModelId[]
    );
    export const text_to_three_d_model_ids = Object.freeze(
      three_d_model_ids.filter(
        (id): id is TextToThreeDModelId => models[id].input.type === "text"
      )
    );
    export const image_to_three_d_model_ids = Object.freeze(
      three_d_model_ids.filter(
        (id): id is ImageToThreeDModelId => models[id].input.type === "image"
      )
    );
    export function is_text_to_three_d_model_id(
      id: string
    ): id is TextToThreeDModelId {
      return (text_to_three_d_model_ids as readonly string[]).includes(id);
    }
    export function is_image_to_three_d_model_id(
      id: string
    ): id is ImageToThreeDModelId {
      return (image_to_three_d_model_ids as readonly string[]).includes(id);
    }
    export const default_id = (
      preferences.three_d as policy.Preferences<ThreeDModelId>
    ).default_id;
    export function listed_models(): readonly ThreeDModelCard[] {
      return Object.freeze(
        resolved.listed().map((card) => models[card.id as ThreeDModelId])
      );
    }
    export function ordered_models(): readonly ThreeDModelCard[] {
      return Object.freeze(
        resolved.all().map((card) => models[card.id as ThreeDModelId])
      );
    }
    export function staged_models(): readonly ThreeDModelCard[] {
      return Object.freeze(
        resolved.staged().map((card) => models[card.id as ThreeDModelId])
      );
    }
  }
  export namespace image_tools {
    export type ImageToolModelId = facts.image_tools.ImageToolModelId;
    export type ImageToolModelCategory =
      facts.image_tools.ImageToolModelCategory;
    export type ImageToolModelCard = facts.image_tools.ImageToolModelCard;
    const resolved = policy.resolve(
      facts.image_tools.models,
      definitions.image_tools
    );
    export const models: Record<ImageToolModelId, ImageToolModelCard> = own(
      Object.fromEntries(
        resolved.all().map((card) => {
          const {
            status: _status,
            legacy: _legacy,
            reason: _reason,
            ...fact
          } = card;
          return [card.id, fact];
        })
      )
    ) as Record<ImageToolModelId, ImageToolModelCard>;
    export function listed_models(): readonly ImageToolModelCard[] {
      return Object.freeze(
        resolved.listed().map((card) => models[card.id as ImageToolModelId])
      );
    }
    export function ordered_models(): readonly ImageToolModelCard[] {
      return Object.freeze(
        resolved.all().map((card) => models[card.id as ImageToolModelId])
      );
    }
  }
  export namespace snapshot {
    /**
     * Wire schema major. {@link parse} rejects anything else.
     *
     * Additive evolution does NOT bump this — v1 parsers ignore fields
     * they do not know, so publishing a new optional field is safe. A
     * breaking shape change publishes at a NEW route path and bumps this,
     * leaving old clients on the old path (or rejecting the body and
     * falling back to the seed — fail-safe either way).
     */
    export const SCHEMA = 1;

    /** Text catalogue + tier map. Replaces the seed's wholesale. */
    export interface TextSection {
      /**
       * Full replacement for `catalog.text.catalog`. Each key equals its
       * entry's `id`. Deliberately NOT merged with the seed: removing a
       * model from the catalogue is the kill switch, and a merge would
       * defeat it on every installed client.
       */
      catalog: Record<string, text.ModelSpec>;
      /** Full replacement for `TIER_MODEL_IDS`. Every id is a `catalog` key. */
      tier_model_ids: Record<ModelTier, string>;
    }

    /**
     * A published catalogue.
     *
     * Sections are independent: a media section that fails validation is
     * dropped on its own and the rest of the snapshot still applies. Only
     * `text` is load-bearing enough to reject the whole payload, because a
     * host with no text catalogue cannot run a turn at all.
     */
    export interface Snapshot {
      /** Always {@link SCHEMA} on a parsed value. */
      schema: number;
      /** Opaque publisher version (a deploy sha; `"seed"` for the bundle). */
      version: string;
      /** Informational only; never drives resolution. */
      generated_at?: string;
      text: TextSection;
      /** Absent ⇒ the consumer keeps its bundled image catalogue. */
      image?: ImageSection;
      /** Absent ⇒ the consumer keeps its bundled video catalogue. */
      video?: VideoSection;
      /** Additive service recommendations. Older schema-1 readers ignore them. */
      preferences?: Preferences;
    }

    export interface Preferences {
      text?: policy.Preferences;
      image?: policy.Preferences;
      video?: policy.Preferences;
    }

    /** Image catalogue. Replaces `catalog.image.models` wholesale. */
    export interface ImageSection {
      models: Record<string, image.ImageModelCard>;
    }

    /** Video catalogue. Replaces `catalog.video.models` wholesale. */
    export interface VideoSection {
      models: Record<string, video.VideoModelCard>;
    }

    /**
     * The read surface for one media catalogue. Mirrors the lookups the
     * corresponding namespace exports, so a call site reads the same
     * whether it is on the bundled catalogue or a published one.
     */
    export interface MediaView<Card, Provider extends string, Binding> {
      readonly models: Readonly<Record<string, Card>>;
      readonly default_id?: string;
      /** Cards in the curated user-facing list (`listed: true`). */
      listed(): readonly Card[];
      /** Exact namespaced id, or a bare post-slash name. No date tolerance. */
      cardById(modelId: string): Card | undefined;
      /** That provider's binding, or `null` if it does not serve the model. */
      binding(card: Card, provider: Provider): Binding | null;
    }

    export type ImageView = MediaView<
      image.ImageModelCard,
      image.ImageProvider,
      image.ImageProviderBinding
    >;

    export type VideoView = MediaView<
      video.VideoModelCard,
      video.VideoProvider,
      video.VideoProviderBinding
    >;

    /**
     * Resolution surface over one snapshot — the read API a host swaps
     * atomically on refresh. Mirrors the `catalog.text.*` shape so a call
     * site reads the same either way.
     *
     * Build only from {@link seed} or a {@link parse} result: `by_tier`
     * assumes tier ids resolve, which is exactly what `parse` validates.
     */
    export interface View {
      readonly catalog: Readonly<Record<string, text.ModelSpec>>;
      readonly default_id?: string;
      /** Listed text members in service order. */
      listed(): readonly text.ModelSpec[];
      readonly tier_model_ids: Readonly<Record<ModelTier, string>>;
      readonly by_tier: Readonly<Record<ModelTier, text.ModelSpec>>;
      /**
       * Exact catalogue membership — `catalog[modelId] !== undefined`.
       *
       * This, NOT {@link modelSpecById}, is what a gate asks. The two
       * differ on purpose: `modelSpecById` also matches a bare name and a
       * date suffix, which is right when you want a model's LIMITS or
       * RATES (a near-miss id is still that model), and wrong when you
       * are deciding what id to forward to a provider — a provider is
       * given the id the caller sent, and only an exact catalogue id is
       * one it will recognize.
       */
      has(modelId: string): boolean;
      /** Same matching rules as {@link catalog.text.modelSpecById}. */
      modelSpecById(modelId: string): text.ModelSpec | undefined;
      /** Same precedence as {@link catalog.text.registry.resolve}. */
      resolve(
        modelId: string,
        custom?: readonly text.registry.CustomModelSpec[]
      ): text.registry.ResolvedModelSpec | undefined;
      readonly image: ImageView;
      readonly video: VideoView;
    }

    const TIERS: readonly ModelTier[] = ["nano", "mini", "pro", "max"];

    /** Bounds on untrusted input. Generous — the real catalogue is ~15. */
    const MAX_CATALOG_ENTRIES = 256;

    /**
     * Plausible model-id shape. Also the reason a catalogue key can never
     * be `__proto__`: assigning that key to an object literal would
     * mutate its prototype instead of adding an entry.
     */
    const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

    function isRecord(v: unknown): v is Record<string, unknown> {
      return typeof v === "object" && v !== null && !Array.isArray(v);
    }

    function isText(v: unknown): v is string {
      return typeof v === "string" && v.length > 0;
    }

    function isISODate(v: unknown): v is ISODate {
      if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        return false;
      }
      const parsed = new Date(`${v}T00:00:00.000Z`);
      return (
        !Number.isNaN(parsed.valueOf()) &&
        parsed.toISOString().slice(0, 10) === v
      );
    }

    function isHttpsUrl(v: unknown): v is string {
      return isText(v) && /^https:\/\/[^\s]+$/.test(v);
    }

    /**
     * `undefined` means the additive field is absent on an older snapshot;
     * `null` means it was present but malformed and the containing record must
     * be rejected.
     */
    function parseRelease(v: unknown): ModelRelease | null | undefined {
      if (v === undefined) return undefined;
      if (!isRecord(v) || !isHttpsUrl(v.source_url)) return null;
      if (v.basis !== "model" && v.basis !== "provider_endpoint") return null;
      if (v.date === null) {
        return v.basis === "provider_endpoint"
          ? { date: null, basis: v.basis, source_url: v.source_url }
          : null;
      }
      if (!isISODate(v.date)) return null;
      return { date: v.date, basis: v.basis, source_url: v.source_url };
    }

    /** A token count: positive and exactly representable. */
    function isCount(v: unknown): v is number {
      return typeof v === "number" && Number.isSafeInteger(v) && v > 0;
    }

    /** A price or multiplier: finite and non-negative (free is legal). */
    function isRate(v: unknown): v is number {
      return typeof v === "number" && Number.isFinite(v) && v >= 0;
    }

    function parseCost(v: unknown): text.ModelCostPerMillion | undefined {
      if (!isRecord(v) || !isRate(v.input) || !isRate(v.output)) {
        return undefined;
      }
      const cost: text.ModelCostPerMillion = {
        input: v.input,
        output: v.output,
      };
      if (v.cacheRead !== undefined) {
        if (!isRate(v.cacheRead)) return undefined;
        cost.cacheRead = v.cacheRead;
      }
      if (v.cacheWrite !== undefined) {
        if (!isRate(v.cacheWrite)) return undefined;
        cost.cacheWrite = v.cacheWrite;
      }
      if (v.longContext !== undefined) {
        const lc = v.longContext;
        if (
          !isRecord(lc) ||
          !isCount(lc.inputTokensAbove) ||
          !isRate(lc.inputMultiplier) ||
          !isRate(lc.outputMultiplier)
        ) {
          return undefined;
        }
        cost.longContext = {
          inputTokensAbove: lc.inputTokensAbove,
          inputMultiplier: lc.inputMultiplier,
          outputMultiplier: lc.outputMultiplier,
        };
      }
      return cost;
    }

    function parseSpec(key: string, v: unknown): text.ModelSpec | undefined {
      if (!MODEL_ID_PATTERN.test(key)) return undefined;
      if (!isRecord(v) || v.id !== key) return undefined;
      if (!isText(v.label)) return undefined;
      if (typeof v.multimodal !== "boolean") return undefined;
      if (typeof v.tool_call !== "boolean") return undefined;
      if (!isCount(v.contextWindow) || !isCount(v.outputLimit))
        return undefined;
      if (!Array.isArray(v.imageInputMimes)) return undefined;
      const imageInputMimes: text.ImageInputMime[] = [];
      for (const mime of v.imageInputMimes) {
        if (typeof mime !== "string" || !mime.startsWith("image/")) {
          return undefined;
        }
        imageInputMimes.push(mime as text.ImageInputMime);
      }
      const cost = parseCost(v.cost);
      if (!cost) return undefined;
      const release = parseRelease(v.release);
      if (release === null) return undefined;

      const spec: text.ModelSpec = {
        id: key,
        label: v.label,
        multimodal: v.multimodal,
        imageInputMimes,
        tool_call: v.tool_call,
        contextWindow: v.contextWindow,
        outputLimit: v.outputLimit,
        cost,
      };
      if (release) spec.release = release;
      if (v.short_label !== undefined) {
        if (!isText(v.short_label)) return undefined;
        spec.short_label = v.short_label;
      }
      if (v.deprecated !== undefined) {
        if (typeof v.deprecated !== "boolean") return undefined;
        spec.deprecated = v.deprecated;
      }
      return spec;
    }

    // ── media validation ──────────────────────────────────────────────

    /** Bounds on the free-form key maps inside media pricing. */
    const MAX_PRICE_KEYS = 64;

    /**
     * Keys that mutate an object instead of adding an entry.
     *
     * Media pricing carries FREE-FORM key maps — image `tiers`
     * (`"medium/1024x1024"`) and video `usd_per_second` (`"720p"`) — which
     * {@link MODEL_ID_PATTERN} does not cover. Copying a JSON-parsed
     * `__proto__` key onto a plain object replaces that object's prototype
     * rather than adding a key, and a later lookup then resolves through
     * the prototype chain: `tiers["anything"]` would return an
     * attacker-chosen number while `Object.keys(tiers)` still looks clean.
     * That reads as a real price to a `!== undefined` billing guard.
     */
    const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    /** A bounded map of free-form keys to validated values, or undefined. */
    function parseKeyedMap<T>(
      v: unknown,
      parseValue: (value: unknown) => T | undefined
    ): Record<string, T> | undefined {
      if (!isRecord(v)) return undefined;
      const entries = Object.entries(v);
      if (entries.length === 0 || entries.length > MAX_PRICE_KEYS) {
        return undefined;
      }
      const out: Record<string, T> = {};
      for (const [key, value] of entries) {
        if (!isText(key) || UNSAFE_KEYS.has(key)) return undefined;
        const parsed = parseValue(value);
        if (parsed === undefined) return undefined;
        out[key] = parsed;
      }
      return out;
    }

    function parseRate(v: unknown): number | undefined {
      return isRate(v) ? v : undefined;
    }

    /** Copy `key` from `src` onto `dst` only when present and valid. */
    function optional<T extends object>(
      dst: T,
      src: Record<string, unknown>,
      key: string & keyof T,
      ok: (v: unknown) => boolean
    ): boolean {
      const value = src[key];
      if (value === undefined) return true;
      if (!ok(value)) return false;
      // Conditional assign, never `{ k: src[k] }` — an own key holding
      // `undefined` is dropped by JSON.stringify and breaks round-trip.
      (dst as Record<string, unknown>)[key] = value;
      return true;
    }

    function parsePerTokenRates(
      v: Record<string, unknown>,
      into: Record<string, unknown>
    ): boolean {
      if (!isRate(v.input) || !isRate(v.output)) return false;
      into.input = v.input;
      into.output = v.output;
      for (const key of [
        "cached_input",
        "image_input",
        "cached_image_input",
        "text_output",
      ]) {
        if (v[key] === undefined) continue;
        if (!isRate(v[key])) return false;
        into[key] = v[key];
      }
      return true;
    }

    function parseImagePricing(
      v: unknown
    ): image.ImageModelPricing | undefined {
      if (!isRecord(v)) return undefined;
      if (v.type === "per_image_flat") {
        // Free is legal — `image-cost.ts` distinguishes an absent tier
        // from a $0 one.
        return isRate(v.usd)
          ? { type: "per_image_flat", usd: v.usd }
          : undefined;
      }
      if (v.type === "per_token") {
        const out: Record<string, unknown> = { type: "per_token" };
        return parsePerTokenRates(v, out)
          ? (out as image.PerTokenPricing)
          : undefined;
      }
      if (v.type === "per_image_tiered") {
        const tiers = parseKeyedMap(v.tiers, parseRate);
        if (!tiers) return undefined;
        const out: image.PerImageTieredPricing = {
          type: "per_image_tiered",
          tiers,
        };
        if (v.tokens !== undefined) {
          if (!isRecord(v.tokens)) return undefined;
          const tokens: Record<string, unknown> = {};
          if (!parsePerTokenRates(v.tokens, tokens)) return undefined;
          out.tokens = tokens as image.PerTokenRates;
        }
        return out;
      }
      // An arm this client cannot price. `image-cost.ts` switches on the
      // three known ones and would fall through to `undefined`.
      return undefined;
    }

    function parseVideoPricing(v: unknown): video.PerSecondPricing | undefined {
      if (!isRecord(v) || v.type !== "per_second") return undefined;
      const usd_per_second = parseKeyedMap(v.usd_per_second, (modes) => {
        if (!isRecord(modes)) return undefined;
        const out: Partial<Record<video.AudioMode, number>> = {};
        for (const mode of ["audio", "silent"] as const) {
          if (modes[mode] === undefined) continue;
          if (!isRate(modes[mode])) return undefined;
          out[mode] = modes[mode];
        }
        // Absence IS the capability statement, but an empty entry states
        // nothing and would make a resolution label unpriceable.
        return Object.keys(out).length > 0 ? out : undefined;
      });
      if (!usd_per_second) return undefined;
      const pricing: video.PerSecondPricing = {
        type: "per_second",
        usd_per_second,
      };
      if (!optional(pricing, v, "usd_per_input_image", isRate))
        return undefined;
      return pricing;
    }

    /**
     * Provider bindings, keyed by provider.
     *
     * UNKNOWN PROVIDER KEYS ARE DROPPED rather than rejecting the card.
     * A provider this client has no adapter for is not an error — it is a
     * route it cannot take — and rejecting would make adding a provider a
     * breaking publish. (The AI SDK gateway learned this the hard way: it
     * validated its model-kind field as a hard enum, so the day a new kind
     * shipped the whole listing failed to parse; it now accepts loosely
     * and filters unknown rows.)
     */
    function parseBindings<P extends string, B>(
      v: unknown,
      known: readonly P[],
      parseBinding: (provider: P, value: unknown) => B | undefined
    ): Partial<Record<P, B>> | undefined {
      if (!isRecord(v)) return undefined;
      const out: Partial<Record<P, B>> = {};
      for (const provider of known) {
        const value = v[provider];
        if (value === undefined) continue;
        const binding = parseBinding(provider, value);
        if (!binding) return undefined;
        out[provider] = binding;
      }
      // Every card must be servable by something.
      return Object.keys(out).length > 0 ? out : undefined;
    }

    /**
     * The half of a binding both media modalities share: the routing id, the
     * meter, and the two optional labels. Stated once so `url`, `deprecated`,
     * and `avg_cost_usd` cannot end up validated two different ways.
     */
    type MediaBinding<P extends string, Pricing> = {
      provider: P;
      id: string;
      pricing: Pricing;
      avg_cost_usd: number;
      deprecated?: boolean;
      url?: string;
    };

    function parseMediaBinding<P extends string, Pricing>(
      provider: P,
      v: unknown,
      parsePricing: (value: unknown) => Pricing | undefined
    ): MediaBinding<P, Pricing> | undefined {
      if (!isRecord(v)) return undefined;
      // The `provider` field is redundant with its key by design; validate
      // the redundancy rather than normalising it away.
      if (v.provider !== provider) return undefined;
      if (!isText(v.id) || !isRate(v.avg_cost_usd)) return undefined;
      const pricing = parsePricing(v.pricing);
      if (!pricing) return undefined;
      const out: MediaBinding<P, Pricing> = {
        provider,
        id: v.id,
        pricing,
        avg_cost_usd: v.avg_cost_usd,
      };
      if (!optional(out, v, "deprecated", (x) => typeof x === "boolean")) {
        return undefined;
      }
      if (!optional(out, v, "url", isText)) return undefined;
      return out;
    }

    function parseImageBinding(
      provider: image.ImageProvider,
      v: unknown
    ): image.ImageProviderBinding | undefined {
      const out = parseMediaBinding(provider, v, parseImagePricing);
      if (!out) return undefined;
      const card: image.ImageProviderBinding = out;
      if (
        !optional(
          card,
          v as Record<string, unknown>,
          "transparent_background",
          (value) => value === null || typeof value === "boolean"
        )
      ) {
        return undefined;
      }
      const refs = (v as Record<string, unknown>).references;
      if (refs !== undefined) {
        // Dropping this silently disables image-to-image routing.
        if (!isRecord(refs) || !isText(refs.id) || !isCount(refs.max)) {
          return undefined;
        }
        card.references = { id: refs.id, max: refs.max };
      }
      return card;
    }

    function parseVideoBinding(
      provider: video.VideoProvider,
      v: unknown
    ): video.VideoProviderBinding | undefined {
      const out = parseMediaBinding(provider, v, parseVideoPricing);
      if (!out) return undefined;
      const card: video.VideoProviderBinding = out;
      if (Object.prototype.hasOwnProperty.call(v, "input")) {
        const input = (v as Record<string, unknown>).input;
        // A malformed present fact must remain unknown, never restore bundled capabilities.
        card.input =
          input === "text" || input === "image" || input === "text-or-image"
            ? input
            : null;
      }
      return card;
    }

    /** `T | null` — null is meaningful here, a missing key is not. */
    function nullable<T>(
      v: unknown,
      parseValue: (value: unknown) => T | undefined
    ): T | null | undefined {
      if (v === null) return null;
      return parseValue(v);
    }

    function parseSizes(v: unknown): image.SizeSpec[] | undefined {
      if (!Array.isArray(v)) return undefined;
      const out: image.SizeSpec[] = [];
      for (const size of v) {
        if (
          !Array.isArray(size) ||
          size.length !== 3 ||
          !isCount(size[0]) ||
          !isCount(size[1]) ||
          typeof size[2] !== "string" ||
          !/^\d+:\d+$/.test(size[2])
        ) {
          return undefined;
        }
        out.push([size[0], size[1], size[2] as image.AspectRatioString]);
      }
      return out;
    }

    function parseConstraints(
      v: unknown
    ): image.ImageSizeConstraints | undefined {
      if (!isRecord(v)) return undefined;
      const out: image.ImageSizeConstraints = {};
      for (const key of [
        "step",
        "min_edge",
        "max_edge",
        "min_pixels",
        "max_pixels",
      ] as const) {
        if (v[key] === undefined) continue;
        if (!isCount(v[key])) return undefined;
        out[key] = v[key];
      }
      if (v.aspect_ratio !== undefined) {
        const ar = v.aspect_ratio;
        if (!isRecord(ar)) return undefined;
        const bounds: { min?: number; max?: number } = {};
        for (const key of ["min", "max"] as const) {
          if (ar[key] === undefined) continue;
          if (!isRate(ar[key])) return undefined;
          bounds[key] = ar[key];
        }
        out.aspect_ratio = bounds;
      }
      return out;
    }

    function isAspectRatio(v: unknown): v is image.AspectRatioString {
      return typeof v === "string" && /^\d+:\d+$/.test(v);
    }

    function parseImageCard(
      key: string,
      v: unknown
    ): image.ImageModelCard | undefined {
      if (!MODEL_ID_PATTERN.test(key)) return undefined;
      if (!isRecord(v) || v.id !== key) return undefined;
      if (!isText(v.label) || !isText(v.short_description)) return undefined;
      // `vendor` and `speed_label` are closed unions in TypeScript but are
      // validated as text on the wire: a model from a new vendor must not
      // require a client release, which is the whole point of publishing.
      if (!isText(v.vendor) || !isText(v.speed_label)) return undefined;
      if (!isText(v.speed_max)) return undefined;
      if (typeof v.deprecated !== "boolean") return undefined;
      if (typeof v.listed !== "boolean") return undefined;
      if (!isRate(v.avg_cost_usd)) return undefined;
      const release = parseRelease(v.release);
      if (release === null) return undefined;

      const pricing = parseImagePricing(v.pricing);
      if (!pricing) return undefined;

      const styles = nullable(v.styles, (x) =>
        Array.isArray(x) && x.every(isText) ? (x as string[]) : undefined
      );
      if (styles === undefined) return undefined;
      const sizes = nullable(v.sizes, parseSizes);
      if (sizes === undefined) return undefined;
      const constraints = nullable(v.constraints, parseConstraints);
      if (constraints === undefined) return undefined;

      if (!isRecord(v.default)) return undefined;
      if (!isCount(v.default.width) || !isCount(v.default.height)) {
        return undefined;
      }
      if (!isAspectRatio(v.default.aspect_ratio)) return undefined;

      const providers = parseBindings(
        v.providers,
        image.providers,
        parseImageBinding
      );
      if (!providers) return undefined;
      // A listed model can launch on one provider first. Its primary route
      // must be known and bound; runtime selection intersects the available
      // bindings with connected keys, and hosted calls still require Vercel.
      if (!image.providers.includes(v.provider as image.ImageProvider)) {
        return undefined;
      }
      const primary = v.provider as image.ImageProvider;
      if (!providers[primary]) {
        return undefined;
      }

      const card: image.ImageModelCard = {
        id: key,
        label: v.label,
        deprecated: v.deprecated,
        short_description: v.short_description,
        vendor: v.vendor as Vendor,
        provider: primary,
        listed: v.listed,
        providers,
        styles,
        speed_label: v.speed_label as image.SpeedLabel,
        speed_max: v.speed_max,
        sizes,
        constraints,
        pricing,
        avg_cost_usd: v.avg_cost_usd,
        default: {
          width: v.default.width,
          height: v.default.height,
          aspect_ratio: v.default.aspect_ratio,
        },
      };
      if (
        !optional(
          card,
          v,
          "transparent_background",
          (value) => typeof value === "boolean"
        )
      ) {
        return undefined;
      }
      if (v.quality !== undefined) {
        const quality = v.quality;
        if (
          !isRecord(quality) ||
          !Array.isArray(quality.options) ||
          quality.options.length === 0 ||
          !quality.options.every(isText) ||
          !isText(quality.default) ||
          !quality.options.includes(quality.default)
        ) {
          return undefined;
        }
        card.quality = {
          options: [...quality.options],
          default: quality.default,
        };
      }
      if (release) card.release = release;
      if (!optional(card, v, "listed_reason", isText)) return undefined;
      return card;
    }

    function parseVideoCard(
      key: string,
      v: unknown
    ): video.VideoModelCard | undefined {
      if (!MODEL_ID_PATTERN.test(key)) return undefined;
      if (!isRecord(v) || v.id !== key) return undefined;
      if (!isText(v.label) || !isText(v.short_description)) return undefined;
      if (!isText(v.vendor) || !isText(v.speed_label) || !isText(v.url)) {
        return undefined;
      }
      if (typeof v.deprecated !== "boolean") return undefined;
      // Not `typeof === "boolean"`: a video card exists ONLY for a model in
      // Grida selection, so the type pins `listed: true`. A payload saying
      // otherwise is malformed, not a hidden card.
      if (v.listed !== true) return undefined;
      if (typeof v.audio !== "boolean") return undefined;
      const release = parseRelease(v.release);
      if (release === null) return undefined;
      if (!isCount(v.min_duration) || !isCount(v.max_duration))
        return undefined;
      if (v.min_duration > v.max_duration) return undefined;
      if (
        !Array.isArray(v.aspect_ratios) ||
        !v.aspect_ratios.every(isAspectRatio)
      ) {
        return undefined;
      }

      if (!isRecord(v.default)) return undefined;
      const dflt = v.default;
      if (!isText(dflt.resolution) || !isAspectRatio(dflt.aspect_ratio)) {
        return undefined;
      }
      if (!isCount(dflt.duration) || typeof dflt.audio !== "boolean") {
        return undefined;
      }
      if (dflt.duration < v.min_duration || dflt.duration > v.max_duration) {
        return undefined;
      }

      const providers = parseBindings(
        v.providers,
        video.providers,
        parseVideoBinding
      );
      if (!providers) return undefined;
      // Provider selection is deferred to the runtime, so the contract is
      // route-agnostic: whichever provider it later picks must be able to
      // serve the model's DEFAULT config. Deliberately NOT the image
      // one-key rule — the video ecosystem is fragmented and no model is
      // on every provider.
      const mode: video.AudioMode = dflt.audio ? "audio" : "silent";
      for (const binding of Object.values(providers)) {
        const rate = binding.pricing.usd_per_second[dflt.resolution]?.[mode];
        if (!(typeof rate === "number" && rate > 0)) return undefined;
      }

      const card: video.VideoModelCard = {
        id: key,
        label: v.label,
        deprecated: v.deprecated,
        short_description: v.short_description,
        vendor: v.vendor as Vendor,
        listed: true,
        aspect_ratios: v.aspect_ratios as image.AspectRatioString[],
        min_duration: v.min_duration,
        max_duration: v.max_duration,
        audio: v.audio,
        speed_label: v.speed_label as image.SpeedLabel,
        default: {
          resolution: dflt.resolution,
          aspect_ratio: dflt.aspect_ratio,
          duration: dflt.duration,
          audio: dflt.audio,
        },
        url: v.url,
        providers,
      };
      if (release) card.release = release;
      return card;
    }

    /**
     * A media section, or `undefined` when absent or unusable.
     *
     * Unusable is not fatal: the caller drops just this section and keeps
     * the rest of the snapshot, so a bad image catalogue can never take
     * the text catalogue — or the whole daemon — down with it.
     */
    function parseMediaSection<Card>(
      v: unknown,
      parseCard: (key: string, value: unknown) => Card | undefined
    ): { models: Record<string, Card> } | undefined {
      if (!isRecord(v) || !isRecord(v.models)) return undefined;
      const entries = Object.entries(v.models);
      if (entries.length === 0 || entries.length > MAX_CATALOG_ENTRIES) {
        return undefined;
      }
      const out: Record<string, Card> = {};
      for (const [key, value] of entries) {
        const card = parseCard(key, value);
        if (!card) return undefined;
        out[key] = card;
      }
      return { models: out };
    }

    /**
     * The bundled catalogue expressed as a snapshot — the seed a host
     * starts from and falls back to. Also what the publishing endpoint
     * serves, which is why `parse(JSON.parse(JSON.stringify(seed())))`
     * round-trips exactly (pinned in `__tests__/snapshot.test.ts`).
     */
    export function seed(opts?: { version?: string }): Snapshot {
      return JSON.parse(
        JSON.stringify({
          schema: SCHEMA,
          version: opts?.version ?? "seed",
          text: {
            catalog: Object.fromEntries(
              text.listed_models().map((card) => [card.id, card])
            ),
            tier_model_ids: { ...TIER_MODEL_IDS },
          },
          image: {
            models: {
              ...(image.models as Record<string, image.ImageModelCard>),
            },
          },
          video: {
            models: Object.fromEntries(
              video.listed_models().map((card) => [card.id, card])
            ),
          },
          preferences: {
            text: { ...preferences.text },
            image: { ...preferences.image },
            video: { ...preferences.video },
          },
        })
      );
    }

    /**
     * Validate an untrusted published catalogue. Returns `null` rather
     * than throwing — a host must be able to keep serving on a bad
     * payload, and whole-or-reject is what keeps a half-applied
     * catalogue from ever existing.
     *
     * Strict on shape and on the invariants resolution depends on;
     * lenient on unknown fields, so a newer publisher stays readable.
     */
    export function parse(data: unknown): Snapshot | null {
      if (!isRecord(data) || data.schema !== SCHEMA) return null;
      if (!isText(data.version)) return null;
      if (!isRecord(data.text) || !isRecord(data.text.catalog)) return null;

      const entries = Object.entries(data.text.catalog);
      if (entries.length === 0 || entries.length > MAX_CATALOG_ENTRIES) {
        return null;
      }
      const catalog: Record<string, text.ModelSpec> = {};
      for (const [key, value] of entries) {
        const spec = parseSpec(key, value);
        if (!spec) return null;
        catalog[key] = spec;
      }

      const rawTiers = data.text.tier_model_ids;
      if (!isRecord(rawTiers)) return null;
      const tier_model_ids = {} as Record<ModelTier, string>;
      for (const tier of TIERS) {
        const id = rawTiers[tier];
        // A tier pointing outside the catalogue would leave `by_tier`
        // dangling, which every compaction limit reads.
        if (!isText(id) || !Object.hasOwn(catalog, id)) return null;
        tier_model_ids[tier] = id;
      }

      const parsed: Snapshot = {
        schema: SCHEMA,
        version: data.version,
        text: { catalog, tier_model_ids },
      };
      if (data.generated_at !== undefined) {
        if (!isText(data.generated_at)) return null;
        parsed.generated_at = data.generated_at;
      }

      // Media sections are optional and independently fallible. An absent
      // one leaves the consumer on its bundled media catalogue; an invalid
      // one is dropped the same way, because a broken image catalogue must
      // not cost a host its text catalogue too.
      if (data.image !== undefined) {
        const section = parseMediaSection(data.image, parseImageCard);
        if (section) parsed.image = section;
      }
      if (data.video !== undefined) {
        const section = parseMediaSection(data.video, parseVideoCard);
        if (section) parsed.video = section;
      }
      if (data.preferences !== undefined) {
        if (!isRecord(data.preferences)) return null;
        const effective = { ...data.preferences };
        // Invalid media sections keep their bundled fallback, including its
        // absent remote recommendation. Do not let a rejected section's
        // preferences reject otherwise valid text.
        if (data.image !== undefined && parsed.image === undefined)
          delete effective.image;
        if (data.video !== undefined && parsed.video === undefined)
          delete effective.video;
        const preferences = parsePreferences(effective, parsed);
        if (!preferences) return null;
        parsed.preferences = preferences;
      }
      return parsed;
    }

    /** Validate recommendations against this snapshot's effective card tables. */
    function parsePreferences(
      value: unknown,
      snapshot: Snapshot
    ): Preferences | null {
      if (!isRecord(value)) return null;
      const result: Preferences = {};
      for (const family of ["text", "image", "video"] as const) {
        const entry = value[family];
        if (entry === undefined) continue;
        if (!isRecord(entry)) return null;
        const preference: policy.Preferences = {
          ...(entry.default_id === undefined
            ? {}
            : { default_id: entry.default_id as string }),
          ...(entry.order === undefined
            ? {}
            : { order: entry.order as string[] }),
        };
        if (entry.default_id !== undefined && !isText(entry.default_id))
          return null;
        if (
          entry.order !== undefined &&
          (!Array.isArray(entry.order) ||
            entry.order.length > MAX_CATALOG_ENTRIES ||
            !entry.order.every(isText))
        )
          return null;
        try {
          const cards =
            family === "text"
              ? Object.values(snapshot.text.catalog).map((card) => ({
                  ...card,
                  listed: true,
                }))
              : Object.values(
                  family === "image"
                    ? (snapshot.image?.models ?? image.models)
                    : (snapshot.video?.models ?? video.models)
                );
          const table = Object.fromEntries(
            cards.filter((card) => !!card).map((card) => [card!.id, card!])
          ) as Record<
            string,
            { id: string; label: string; listed: boolean; deprecated?: boolean }
          >;
          listedOver(table, preference);
        } catch {
          return null;
        }
        result[family] = own(preference);
      }
      return result;
    }

    /**
     * A media read surface over one card table.
     *
     * The `listed` memo lives HERE, on the view, not on the catalogue —
     * `catalog.image.listed_models()` memoizes over the bundled dict and
     * can never observe a published one, so a swappable catalogue has to
     * own its own lazily-computed list.
     */
    function buildMediaView<
      Card extends {
        id: string;
        label: string;
        listed: boolean;
        deprecated?: boolean;
        providers: object;
      },
      Provider extends string,
      Binding,
    >(
      models: Record<string, Card>,
      preferences?: policy.Preferences
    ): MediaView<Card, Provider, Binding> {
      let listed: readonly Card[] | undefined;
      return Object.freeze<MediaView<Card, Provider, Binding>>({
        models,
        ...(preferences?.default_id === undefined
          ? {}
          : { default_id: preferences.default_id }),
        listed: () => (listed ??= listedOver(models, preferences)),
        cardById: (modelId) => cardByIdOver(models, modelId),
        binding: (card, provider) =>
          (card.providers as Record<string, Binding>)[provider] ?? null,
      });
    }

    function build(s: Snapshot): View {
      s = own(s);
      const catalog = s.text.catalog;
      const specs = Object.values(catalog);
      const tier_model_ids = s.text.tier_model_ids;
      const ordered = listedOver(
        Object.fromEntries(
          specs.map((spec) => [spec.id, { ...spec, listed: true }])
        ),
        s.preferences?.text
      ).map((spec) => catalog[spec.id]);
      return Object.freeze<View>({
        catalog,
        ...(s.preferences?.text?.default_id === undefined
          ? {}
          : { default_id: s.preferences.text.default_id }),
        listed: () => Object.freeze(ordered),
        tier_model_ids,
        by_tier: Object.freeze({
          nano: catalog[tier_model_ids.nano],
          mini: catalog[tier_model_ids.mini],
          pro: catalog[tier_model_ids.pro],
          max: catalog[tier_model_ids.max],
        }),
        has: (modelId) => Object.hasOwn(catalog, modelId),
        modelSpecById: (modelId) => specByIdOver(specs, modelId),
        resolve: (modelId, custom) => resolveOver(specs, modelId, custom),
        // A snapshot without a media section falls back to the bundled
        // catalogue for that modality only.
        image: buildMediaView(
          s.image?.models ??
            (image.models as Record<string, image.ImageModelCard>),
          s.preferences?.image
        ),
        video: buildMediaView(
          s.video?.models ??
            (video.models as Record<string, video.VideoModelCard>),
          s.preferences?.video
        ),
      });
    }

    let seedView: View | undefined;

    /**
     * A resolution surface. With no argument, the bundled catalogue's —
     * built once, so a host that never fetches pays nothing.
     */
    export function view(s?: Snapshot): View {
      if (s) return build(s);
      return (seedView ??= build(seed()));
    }
  }
}

// Namespace objects are shared imports as well as the tables they contain.
for (const namespace of [
  catalog,
  catalog.policy,
  catalog.text,
  catalog.text.registry,
  catalog.image,
  catalog.video,
  catalog.audio,
  catalog.audio.music,
  catalog.audio.sound_effects,
  catalog.audio.text_to_speech,
  catalog.three_d,
  catalog.image_tools,
  catalog.snapshot,
])
  Object.freeze(namespace);
