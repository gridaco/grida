// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: gateway — see docs/wg/platform/hosted-ai.md
// GRIDA-EE: billing — see ee-billing
/**
 * Hosted-model allowlist — the single availability source for the
 * `/api/v1/ai/*` endpoints, composed from the ONE catalog
 * (`@grida/ai-models`) so nothing drifts:
 *
 * - text: every catalog entry (a catalog entry IS hosted-servable by
 *   construction — the seam's cost math resolves from it). Deprecated
 *   entries stay CALLABLE (a pinned client id must not break the day a
 *   sibling supersedes it; removal from the catalog is the kill
 *   switch) and are flagged on `/models`.
 * - image/video: listed cards carrying a `vercel` binding (what the
 *   seam can serve through the gateway).
 *
 * Deliberately NO pricing in the payload — pricing is a billing-page
 * concern; exposing per-token USD here invites client-side cost math
 * that drifts from Metronome.
 */
import { models, TIER_MODEL_IDS, type ModelTier } from "@grida/ai-models";
import { catalog } from "../models";

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
  return Object.prototype.hasOwnProperty.call(catalog, modelId);
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
 * Tiers can collapse onto one id: `nano` is a floor (the cheapest model
 * still good enough), so when that model is also the best value at
 * `mini`, both tiers name it — the state today. See `TIER_MODEL_IDS` in
 * `@grida/ai-models` for why.
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

  for (const spec of Object.values(catalog)) {
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
        deprecated: false,
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
        deprecated: false,
      },
    });
  }

  return entries;
}
