// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: gateway — see docs/wg/platform/hosted-ai.md
// GRIDA-EE: billing — see ee-billing
/**
 * Hosted-model allowlist — the single availability source for the
 * `/api/v1/ai/*` endpoints, composed from the ONE catalog
 * (`@grida/ai-models/grida`) so nothing drifts:
 *
 * - text: exact listed service members. Staged members remain reference
 *   data and cannot run through the hosted gateway. Listed legacy entries
 *   stay callable and are flagged on `/models`; removing a model from the
 *   listed set withdraws its hosted availability.
 * - image/video: listed cards carrying a `vercel` binding (what the
 *   seam can serve through the gateway).
 *
 * Deliberately NO pricing in the payload — pricing is a billing-page
 * concern; exposing per-token USD here invites client-side cost math
 * that drifts from Metronome.
 */
import {
  catalog as models,
  TIER_MODEL_IDS,
  type ModelTier,
} from "@grida/ai-models/grida";

const HOSTED_TEXT_MODELS = models.text.listed_models();
const HOSTED_TEXT_MODEL_IDS = new Set(
  HOSTED_TEXT_MODELS.map((model) => model.id)
);

export type HostedModelEntry = {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
  grida: {
    modality: "text" | "image" | "video";
    tier: ModelTier | null;
    label: string;
    deprecated: boolean;
  };
};

export function isHostedTextModel(modelId: string): boolean {
  return HOSTED_TEXT_MODEL_IDS.has(modelId);
}

/** Ascending capability order — lowest tier first. */
const TIER_ORDER = [
  "nano",
  "mini",
  "pro",
  "max",
] as const satisfies readonly ModelTier[];

/**
 * Reverse of `TIER_MODEL_IDS`.
 *
 * Tiers can collapse onto one id, although the current capability ladder
 * assigns a distinct model to every tier.
 *
 * The payload carries one tier per model, so a collapsed id is reported
 * at the LOWEST tier it serves. Walking `TIER_ORDER` ascending with
 * first-write-wins makes that explicit rather than leaving it to
 * `Object.fromEntries` last-write-wins, which would silently report the
 * highest instead. Selection is unaffected either way — every collapsed
 * tier resolves through `TIER_MODEL_IDS` to this same id.
 */
const TIER_BY_MODEL_ID: Readonly<Record<string, ModelTier>> = (() => {
  const out: Record<string, ModelTier> = {};
  for (const tier of TIER_ORDER) out[TIER_MODEL_IDS[tier]] ??= tier;
  return out;
})();

function ownerOf(modelId: string): string {
  const slash = modelId.indexOf("/");
  return slash > 0 ? modelId.slice(0, slash) : "grida";
}

let _hostedModelList: readonly HostedModelEntry[] | null = null;

/**
 * The `/models` listing. Derived purely from static catalog constants, so
 * it is built once and cached — every request returns the same array.
 */
export function hostedModelList(): readonly HostedModelEntry[] {
  return (_hostedModelList ??= buildHostedModelList());
}

function buildHostedModelList(): HostedModelEntry[] {
  const entries: HostedModelEntry[] = [];

  for (const spec of HOSTED_TEXT_MODELS) {
    entries.push({
      id: spec.id,
      object: "model",
      created: 0,
      owned_by: ownerOf(spec.id),
      grida: {
        modality: "text",
        tier: TIER_BY_MODEL_ID[spec.id] ?? null,
        label: spec.label,
        deprecated: spec.deprecated === true,
      },
    });
  }

  for (const card of models.image.listed_models()) {
    if (!models.image.binding(card, "vercel")) continue;
    entries.push({
      id: card.id,
      object: "model",
      created: 0,
      owned_by: ownerOf(card.id),
      grida: {
        modality: "image",
        tier: null,
        label: card.label,
        deprecated: card.deprecated,
      },
    });
  }

  for (const card of models.video.listed_models()) {
    if (!models.video.binding(card, "vercel")) continue;
    entries.push({
      id: card.id,
      object: "model",
      created: 0,
      owned_by: ownerOf(card.id),
      grida: {
        modality: "video",
        tier: null,
        label: card.label,
        deprecated: card.deprecated,
      },
    });
  }

  return entries;
}
