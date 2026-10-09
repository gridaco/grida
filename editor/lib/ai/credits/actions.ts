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
import { billingOwner, platformBilling } from "@/lib/platform/billing-consumer";
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
 * Reads only the selected owner's cached projection. With infra ownership,
 * failures leave the display unavailable and never consult source financial
 * tables. Each paid execution obtains a separate fresh admission; this chip
 * cannot authorize work. The post-action envelope updates it after a request.
 *
 * Returns `{cents: null, allowed: false}` for unauth visitors; the caller
 * decides whether to invoke this at all.
 */
export async function preloadAiCredits(
  orgId: number
): Promise<AiCreditsPreload> {
  if (billingOwner() === "infra") {
    // Display only: paid execution separately acquires fresh admission. An
    // unavailable balance must not prevent unrelated product pages rendering.
    try {
      const client = await createClient();
      const { data } = await client.auth.getSession();
      if (!data.session?.access_token) return EMPTY;
      const observed = await platformBilling().credits(
        orgId,
        data.session.access_token
      );
      return {
        cents: observed.balance_cents,
        allowed: observed.billing_gate.allowed,
        byok: isByokActive(),
      };
    } catch {
      return EMPTY;
    }
  }
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
