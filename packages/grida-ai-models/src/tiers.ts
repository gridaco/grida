/**
 * Capability-tier vocabulary for selecting a text model.
 *
 * Four tiers (`nano`, `mini`, `pro`, `max`) map to canonical model
 * ids. Consumers pick a tier; the same tier resolves to the same
 * model id everywhere the table is imported.
 *
 * The tier→id table type-uses `models.text.CatalogId` from `./models`,
 * so the compiler enforces that every tier-mapped id has a matching
 * entry in the text-model catalogue. The dependency is type-only —
 * there is no runtime cycle, and `./models` runtime-imports
 * `TIER_MODEL_IDS` from this file to build `models.text.byTier`.
 *
 * @module
 */

import type { models } from "./models";

/**
 * Model tier — capability bracket.
 *
 * | Tier   | Typical use                                          |
 * |--------|------------------------------------------------------|
 * | `nano` | title generation, summarisation, lightweight extraction |
 * | `mini` | general chat / agent loops; multimodal capable        |
 * | `pro`  | larger context, stronger reasoning; multimodal capable |
 * | `max`  | heaviest tasks; multimodal capable                    |
 */
export type ModelTier = "nano" | "mini" | "pro" | "max";

/**
 * Tier → catalogued text-model id.
 *
 * Constrained to `models.text.CatalogId` so the compiler rejects any
 * tier mapped to an id that lacks a matching entry in the text
 * catalogue (see `./models`).
 *
 * `nano` is a floor, not a price point: it holds the cheapest model
 * still good enough for background work. So it is **never more
 * expensive than `mini`**, but it is *not* guaranteed to be strictly
 * cheaper — when one model is both the lowest reasonable choice and
 * the best value at `mini`, the two tiers collapse onto the same id.
 *
 * That is the state today. OpenAI's 2026-07-30 cut dropped GPT-5.6
 * Luna to $0.20 in / $1.20 out, past the older GPT-5.4 Nano ($0.20 in
 * / $1.25 out) while carrying 1.05M context against Nano's 400K —
 * leaving nothing that is both cheaper and adequate. OpenAI positions
 * Luna as the 5.6 generation's nano-class model, so this is one model
 * serving two tiers, not a tier being over-served.
 * See https://github.com/gridaco/grida/pull/1009.
 *
 * Expect the tiers to separate again as new models land. The invariant
 * that survives either way is `nano <= mini` on every cost bucket,
 * pinned by a catalogue test in `__tests__/models.test.ts`.
 */
export const TIER_MODEL_IDS = {
  nano: "openai/gpt-5.6-luna",
  mini: "openai/gpt-5.6-luna",
  pro: "openai/gpt-5.6-terra",
  max: "openai/gpt-5.6-sol",
} as const satisfies Record<ModelTier, models.text.CatalogId>;

/** Literal union of tier-mapped model ids (values of {@link TIER_MODEL_IDS}). */
export type TierModelId = (typeof TIER_MODEL_IDS)[ModelTier];
