"use server";

/**
 * Server actions exposed by the AI credits module.
 *
 * Top-level `"use server"` so every export is an RPC stub when imported
 * from a client module. Deliberately NOT decorated with `import
 * "server-only"` — that directive prevents the client-side reachability
 * of these symbols, which we explicitly want for the React provider's
 * `refresh()` flow.
 *
 * Server consumers (route-group layouts, `page.tsx`) import directly
 * from this file. Client consumers reach `refreshAiCredits` indirectly
 * through `useAiCredits().refresh`.
 */

import { withAiAuth, type AiActionResult } from "@/lib/ai/server";
import { refreshBalance, getEntitlement } from "@/lib/billing/metronome";
import { createClient } from "@/lib/supabase/server";
import { resolveSessionOrganizationId } from "@/lib/auth/organization";

export type AiCreditsPreload = {
  cents: number | null;
  allowed: boolean;
};

const EMPTY: AiCreditsPreload = { cents: null, allowed: false };

/**
 * Read live balance + entitlement for an org. Called from a server
 * `page.tsx` or route-group `layout.tsx` that has already resolved an
 * `orgId`. Returns `{cents: null, allowed: false}` for unauth visitors;
 * the caller decides whether to invoke this at all.
 */
export async function preloadAiCredits(
  orgId: number
): Promise<AiCreditsPreload> {
  const [{ cents }, ent] = await Promise.all([
    refreshBalance(orgId),
    getEntitlement(orgId),
  ]);
  return { cents, allowed: ent.allowed };
}

/**
 * Resolve initial credits state for the current Supabase session, using
 * the same "current organization" priority as the dashboard route
 * (last-accessed project's org → first membership). Used by route-group
 * layouts to seed `<AiCredits.Provider initial={…}>`.
 */
export async function resolveInitialAiCredits(): Promise<AiCreditsPreload> {
  const client = await createClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return EMPTY;
  const orgId = await resolveSessionOrganizationId(auth.user.id);
  if (orgId === null) return EMPTY;
  return preloadAiCredits(orgId);
}

/**
 * Force-sync the org's balance from Metronome via the AI seam. Returns
 * the standard `AiActionResult` envelope — `balanceCents` is appended
 * by `withAiAuth`. Used by `useAiCredits().refresh()`.
 */
export async function refreshAiCredits(): Promise<AiActionResult<{}>> {
  return withAiAuth("ai/credits/refresh", undefined, async () => ({}));
}
