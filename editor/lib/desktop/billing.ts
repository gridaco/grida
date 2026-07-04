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
 * Deliberate divergences from the web billing page's summary action
 * (`getAiCreditsSummary`): this is a passive READ — it never lazily
 * provisions a Metronome account, and it exposes no drift/auto-reload/
 * Stripe fields. The desktop card is thin by design; every control
 * delegates to the web billing page (`manage_path`).
 */
import "server-only";

import { resolveSessionOrganization } from "@/lib/auth/organization";
import { getEntitlement, refreshBalance } from "@/lib/billing/metronome";
import type { PlanId } from "@/lib/billing/plans";
import { createClient } from "@/lib/supabase/server";

export type { PlanId } from "@/lib/billing/plans";

export type DesktopBillingCredits = {
  /** `null` ⇔ org not provisioned in Metronome — render "—", never "$0.00". */
  balance_cents: number | null;
  /** The gate decision the AI seam would make right now. */
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
      plan: PlanId;
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
 * open latency bounded when Metronome is slow or unreachable — the cached
 * balance (webhooks + hourly reconcile cron keep it honest) is the
 * fallback, same data the AI gate itself reads.
 */
export const LIVE_REFRESH_TIMEOUT_MS = 2_000;

/**
 * Read-only credits summary for the user's session organization — the
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
  const [cached, orgRow, subRow] = await Promise.all([
    getEntitlement(org.id),
    // RLS member-read; display-only fields. Deliberately not widening the
    // GRIDA-SEC-003-tagged resolver's select.
    client
      .from("organization")
      .select("display_name")
      .eq("id", org.id)
      .maybeSingle(),
    client
      .from("v_billing_subscription")
      .select("plan")
      .eq("organization_id", org.id)
      .maybeSingle(),
  ]);

  // Best-effort live sync, bounded. Skipped for unprovisioned orgs (there
  // is nothing to sync). On success, re-read the entitlement so the card
  // shows the canonical post-refresh gate decision; on timeout or failure
  // (e.g. no METRONOME_API_TOKEN on contributor machines) the cached
  // values stand. Never provisions — a passive read must not mutate.
  let ent = cached;
  if (cached.reason !== "not_provisioned") {
    const refreshed = await tryLiveRefresh(
      org.id,
      opts.liveRefreshTimeoutMs ?? LIVE_REFRESH_TIMEOUT_MS
    );
    if (refreshed) ent = await getEntitlement(org.id);
  }

  const rawPlan = subRow.data?.plan;
  const plan: PlanId =
    rawPlan === "pro" || rawPlan === "team" ? rawPlan : "free";

  return {
    state: "ready",
    organization: {
      id: org.id,
      name: org.name,
      display_name: orgRow.data?.display_name || org.name,
    },
    plan,
    credits: {
      balance_cents:
        ent.reason === "not_provisioned" ? null : ent.cachedBalanceCents,
      entitled: ent.allowed,
      blocked_reason: ent.allowed ? null : (ent.reason ?? null),
      as_of: ent.cachedAt,
    },
    manage_path: `/organizations/${org.name}/settings/billing`,
  };
}

async function tryLiveRefresh(
  organizationId: number,
  timeoutMs: number
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      refreshBalance(organizationId).then(() => true as const),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } catch {
    return false;
  } finally {
    // A timed-out refresh may still complete later; that's a harmless
    // idempotent cache write. The timer must not outlive the call.
    if (timer !== undefined) clearTimeout(timer);
  }
}
