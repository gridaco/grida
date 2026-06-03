/**
 * Client-safe constants for the agent's model tier.
 *
 * Lives in its own file so client components (provider, tier picker)
 * can import them without pulling the agent factory or any server-side
 * code. Hosted routes and local AgentHost instances import the same
 * constants from here.
 *
 * The tier set and the tier→model id table live in
 * [@grida/ai-models](../../grida-ai-models). This file only adds the
 * agent's own defaults on top.
 */

import type { ModelTier } from "@grida/ai-models";

export type { ModelTier };

/** Default tier when the client doesn't specify one (or sends an unknown id). */
export const AGENT_DEFAULT_TIER: ModelTier = "pro";

/** The four tiers the agent exposes — same set the `/ai` picker offers. */
export const AGENT_TIERS: readonly ModelTier[] = [
  "nano",
  "mini",
  "pro",
  "max",
] as const;
