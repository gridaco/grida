// Client-safe constants for the SVG agent's model tier.
//
// Lives in its own file (rather than `server-agent.ts`) because the latter
// imports `@/lib/ai/server`, which transitively pulls `next/headers` — that
// crashes any client component that imports from it. Client code (provider,
// `<TierSelect />`) should import from here; the route + agent re-export
// these values from `server-agent.ts` for convenience on the server side.

import type { ModelTier } from "@/lib/ai/models";

/** Default tier when the client doesn't specify one (or sends an unknown id). */
export const SVG_AGENT_DEFAULT_TIER: ModelTier = "pro";

/** The four tiers the SVG agent exposes — same set the `/ai` picker offers. */
export const SVG_AGENT_TIERS: readonly ModelTier[] = [
  "nano",
  "mini",
  "pro",
  "max",
] as const;
