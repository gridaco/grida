// GRIDA-SEC-006 — current GG offerings joined to this host's implemented wires.
import { GGDiscoveryStore, type GGModel } from "@grida/ai/discovery";
import { catalog, TIER_MODEL_IDS, type ModelTier } from "@grida/ai/catalogue";
import { ggConfig } from "@/lib/gg/config";

export type HostedModelEntry = {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
  grida: {
    modality: "text" | "image" | "video" | "music" | "three-d";
    feature?: "model-generation" | "rigging";
    tier: ModelTier | null;
    label: string;
    deprecated: boolean;
  };
};
const TIERS = ["nano", "mini", "pro", "max"] as const;
let reader: GGDiscoveryStore | undefined;
let origin: string | undefined;
export function hostedDiscovery(): GGDiscoveryStore {
  const config = ggConfig.publicModels();
  if (origin !== config.origin || !reader) {
    reader?.dispose();
    reader = new GGDiscoveryStore({ origin: config.origin });
    origin = config.origin;
  }
  return reader;
}
/** No provider key, account selector or per-generation network read. */
export async function hostedModel(
  modelId: string
): Promise<GGModel | undefined> {
  const store = hostedDiscovery();
  await store.ready();
  return store.model(modelId);
}
export async function isHostedTextModel(modelId: string): Promise<boolean> {
  return (
    (await hostedModel(modelId))?.interfaces.includes("chat.completions") ===
    true
  );
}
/** These native routes implement only the listed interfaces, not every GG operation. */
export async function hostedModelList(): Promise<readonly HostedModelEntry[]> {
  const store = hostedDiscovery();
  await store.ready();
  return store.list().flatMap((model) => {
    const modality = model.interfaces.includes("chat.completions")
      ? "text"
      : model.interfaces.includes("images.generations") &&
          catalog.image.findImageModelCard(model.id)?.listed
        ? "image"
        : model.interfaces.includes("videos") && legacyVideo(model.id)
          ? "video"
          : model.kind === "music" &&
              model.interfaces.includes("endpoints") &&
              catalog.audio.music.is_model_id(model.id)
            ? "music"
            : model.kind === "three-d" &&
                model.interfaces.includes("endpoints") &&
                (catalog.three_d.model_generation.is_model_id(model.id) ||
                  catalog.three_d.rigging.is_model_id(model.id))
              ? "three-d"
              : null;
    if (!modality) return [];
    return [
      {
        id: model.id,
        object: "model" as const,
        created: model.created,
        owned_by: model.owned_by,
        grida: {
          modality,
          tier: TIERS.find((tier) => TIER_MODEL_IDS[tier] === model.id) ?? null,
          label: model.label,
          deprecated:
            catalog.text.modelSpecById(model.id)?.deprecated === true ||
            catalog.image.models[model.id]?.deprecated === true ||
            catalog.video.models[model.id]?.deprecated === true,
          ...(modality === "three-d"
            ? {
                feature: catalog.three_d.rigging.is_model_id(model.id)
                  ? ("rigging" as const)
                  : ("model-generation" as const),
              }
            : {}),
        },
      },
    ];
  });
}

/** Compatibility for the installed native video codec, not current GG availability. */
function legacyVideo(id: string): boolean {
  const card = catalog.video.models[id];
  if (!card?.listed) return false;
  const input = catalog.video.input(card, "vercel");
  return (
    !!catalog.video.binding(card, "vercel") &&
    (input === "text" || input === "text-or-image")
  );
}
