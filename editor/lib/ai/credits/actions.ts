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

import { withAiAuth, isByokActive, type AiActionResult } from "@/lib/ai/server";
import { getEntitlement } from "@/lib/billing/metronome";
import { createClient } from "@/lib/supabase/server";
import { resolveSessionOrganizationId } from "@/lib/auth/organization";

export type AiCreditsPreload = {
  cents: number | null;
  allowed: boolean;
  /**
   * Server-side BYOK key is set → billing is bypassed and the balance is
   * meaningless. Instance-global (resolved at module load), so it is
   * surfaced even on the unauth/no-org path. Only this boolean crosses
   * to the client — never the key (GRIDA-SEC-003).
   */
  byok: boolean;
};

const EMPTY: AiCreditsPreload = {
  cents: null,
  allowed: false,
  byok: isByokActive(),
};

/**
 * Cache-first read of balance + entitlement for an org. Called from a
 * server `page.tsx` or route-group `layout.tsx` that has already resolved
 * an `orgId`.
 *
 * Reads `grida_billing.account` (sub-100ms RPC, never touches Metronome).
 * The cache is the source of truth for first-paint chip rendering;
 * webhooks (Stripe + Metronome) keep it fresh, and `useAiCredits().refresh()`
 * re-syncs from Metronome on demand if a user wants the absolute latest.
 *
 * Tradeoff: a chip rendered immediately after a balance change (top-up,
 * spend) may be a few seconds stale until the webhook lands. Acceptable —
 * the post-action `withAiAuth` envelope's `balanceCents` updates the chip
 * via the controller, and the explicit refresh button covers manual cases.
 *
 * Returns `{cents: null, allowed: false}` for unauth visitors; the caller
 * decides whether to invoke this at all.
 */
export async function preloadAiCredits(
  orgId: number
): Promise<AiCreditsPreload> {
  const ent = await getEntitlement(orgId);
  // Unprovisioned orgs return `cachedBalanceCents: 0` from getEntitlement;
  // surface as `null` so the chip renders "—" instead of "$0.00".
  const cents =
    ent.reason === "not_provisioned" ? null : ent.cachedBalanceCents;
  return { cents, allowed: ent.allowed, byok: isByokActive() };
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
