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
 */
export const TIER_MODEL_IDS = {
  nano: "openai/gpt-5.4-nano",
  mini: "openai/gpt-5.4-mini",
  pro: "anthropic/claude-sonnet-4.6",
  max: "anthropic/claude-opus-4.7",
} as const satisfies Record<ModelTier, models.text.CatalogId>;

/** Literal union of tier-mapped model ids (values of {@link TIER_MODEL_IDS}). */
export type TierModelId = (typeof TIER_MODEL_IDS)[ModelTier];
