/**
 * Agent-host **model preferences** — the explicit default model ids the host
 * picks when a caller doesn't choose one.
 *
 * This exists ON PURPOSE, as its own tracked surface, rather than letting the
 * default fall out of catalog ordering (`listed_models()[0]`). The catalog
 * (`@grida/ai-models`) DESCRIBES models; it does not decide which one is the
 * product default. That choice is a deliberate, change-tracked decision, so it
 * lives here — co-located with the resolver that consumes it (`resolve-image.ts`)
 * and outside the shared catalog package. Move a default by editing the pin
 * here; the change is reviewable in one place, decoupled from how cards happen
 * to sort in the catalog.
 */

import type { models } from "@grida/ai-models";

/**
 * Default model for `generate_image` (text-to-image and image-to-image).
 *
 * gpt-image-2 — chosen as the agent's default; a curated `listed` BYOK card, so
 * any connected image-provider key can serve it.
 */
export const DEFAULT_IMAGE_MODEL_ID: models.image.ImageModelId =
  "openai/gpt-image-2";
