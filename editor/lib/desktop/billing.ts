// GRIDA-EE: billing — see ee-billing
/**
 * Desktop AI-credits summary — server-only seam for the same-origin
 * `/desktop/billing/summary` route.
 *
 * Lives in `@/lib/desktop` because `app/desktop/**` is lint-barred from
 * `@/lib/billing/**` (GRIDA-SEC-004 renderer boundary) — including type
 * imports — but not from `@/lib/desktop`. Server-side precedent: `csp.ts`;
 * rationale precedent: `auth-deeplink.ts`. The renderer may import the
 * TYPES from this module; the `server-only` guard breaks the build if a
 * value import ever reaches client code.
 *
 * This display read never provisions a credit account, and it exposes no
 * drift/auto-reload/Stripe fields. The desktop card is thin by design; every control
 * delegates to the web billing page (`manage_path`).
 */
import "server-only";

import { resolveSessionOrganization } from "@/lib/auth/organization";
import {
  platformBilling,
  BillingConsumerError,
} from "@/lib/platform/billing-consumer";
import type { PlanId } from "@/lib/billing/plans";
import { createClient } from "@/lib/supabase/server";

export type { PlanId } from "@/lib/billing/plans";

/**
 * Plan identifier presented by Desktop. Custom agreements overlay the
 * commercial plan; Team remains readable only for historical subscriptions.
 */
export type DesktopPlanId = PlanId | "custom";

export type DesktopBillingCredits = {
  /** `null` means unprovisioned or unobserved — render "—", never "$0.00". */
  balance_cents: number | null;
  /** Cached display eligibility; each paid execution needs fresh admission. */
  entitled: boolean;
  blocked_reason: "no_balance" | "below_floor" | "not_provisioned" | null;
  /** Cache timestamp of the balance shown (post-refresh when it succeeded). */
  as_of: string | null;
};

export type DesktopBillingSummary =
  | { state: "no_organization" }
  | {
      state: "ready";
      organization: { id: number; name: string; display_name: string };
      plan: DesktopPlanId;
      credits: DesktopBillingCredits;
      /** Web billing page for the org — built from the slug `name`. */
      manage_path: string;
    };

/**
 * Wire shape of `GET /desktop/billing/summary` — the route adds the
 * signed-out discriminant (auth is the route's concern, not the seam's).
 */
export type DesktopBillingSummaryResponse =
  | { state: "signed_out" }
  | DesktopBillingSummary;

/**
 * Ceiling on the best-effort live balance sync. Keeps the settings page
 * open latency bounded when Platform is slow or unreachable — the cached
 * balance is retained when the owner refresh is unavailable. A cached display is never paid execution authority.
 */
export const LIVE_REFRESH_TIMEOUT_MS = 2_000;

/**
 * Display credits summary for the user's session organization — the
 * same org-resolution fallback the AI billing path uses
 * (last-accessed project's org → first membership), so the number shown
 * is the balance AI calls would actually drain.
 */
export async function getDesktopBillingSummary(
  user_id: string,
  opts: { liveRefreshTimeoutMs?: number } = {}
): Promise<DesktopBillingSummary> {
  const org = await resolveSessionOrganization(user_id);
  if (!org) return { state: "no_organization" };

  const client = await createClient();
  const { data: session } = await client.auth.getSession();
  if (!session.session?.access_token)
    throw new BillingConsumerError("unauthorized");
  const bearer = session.session.access_token;
  const platform = platformBilling();
  const [summary, cached, identity] = await Promise.all([
    platform.summary(org.id, bearer),
    platform.credits(org.id, bearer),
    client
      .from("organization")
      .select("display_name")
      .eq("id", org.id)
      .maybeSingle(),
  ]);
  if (identity.error || !identity.data) throw new BillingConsumerError();
  let projection = cached;
  if (cached.state !== "not_provisioned") {
    try {
      await platform.refresh(
        org.id,
        bearer,
        opts.liveRefreshTimeoutMs ?? LIVE_REFRESH_TIMEOUT_MS
      );
      projection = await platform.credits(org.id, bearer);
    } catch {
      /* A denied/unavailable refresh preserves the observed cache. */
    }
  }
  return {
    state: "ready",
    organization: {
      id: org.id,
      name: org.name,
      display_name: identity.data.display_name || org.name,
    },
    plan: summary.plan,
    credits: {
      balance_cents: projection.balance_cents,
      entitled: projection.billing_gate.allowed,
      blocked_reason: projection.billing_gate.reason,
      as_of: projection.cache_updated_at,
    },
    manage_path: `/organizations/${org.name}/settings/billing`,
  };
}
