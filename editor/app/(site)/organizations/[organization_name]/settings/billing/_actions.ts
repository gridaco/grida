"use server";

// Reads use `createClient()` (user-authed, RLS-aware) against `v_billing_*`.
// Mutations and Stripe-side reads go through `service_role.workspace`.

import { createClient } from "@/lib/supabase/server";
import {
  stripe,
  BillingError,
  assertOrgMember,
  assertOrgOwner,
  resolveOrCreateStripeCustomer,
  getCatalogueStripeIds,
  getActivePaidSubscription,
  getCustomerId,
  assertAllowedRedirect,
} from "@/lib/billing";
import {
  AUTO_RELOAD_RECHARGE_MAX_CENTS,
  AUTO_RELOAD_RECHARGE_MIN_CENTS,
  AUTO_RELOAD_THRESHOLD_MIN_CENTS,
  TOPUP_MAX_CENTS,
  TOPUP_MIN_CENTS,
  totalChargeForCredit,
} from "@/lib/billing/fees";
import {
  price_catalogue_id,
  type Interval,
  type PaidPlanId,
  type PlanId,
} from "@/lib/billing/plans";
import { headers } from "next/headers";

function asPlanId(raw: string | null | undefined): PlanId {
  return raw === "pro" || raw === "team" ? raw : "free";
}

async function requireUserId(): Promise<string> {
  const sb = await createClient();
  const { data } = await sb.auth.getUser();
  if (!data.user) {
    throw new BillingError("unauthorized", "unauthorized", 401);
  }
  return data.user.id;
}

async function getOrigin(): Promise<string> {
  const h = await headers();
  const fromHeader = h.get("origin");
  if (fromHeader) return fromHeader;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) return `${proto}://${host}`;
  const base = process.env.NEXT_PUBLIC_BASE_URL;
  if (base) return new URL(base).origin;
  throw new Error("could not determine request origin");
}

// ---------------------------------------------------------------------------
// getBillingSummary
// ---------------------------------------------------------------------------

export type BillingSummary = {
  org_id: number;
  plan: PlanId;
  status: string;
  is_free: boolean;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  has_active_subscription: boolean;
  /** "month" | "year" for paid subs; null for free. Read from Stripe. */
  interval: Interval | null;
  /** Server-side test-mode signal (BILLING_TEST_MODE env). Drives the sandbox
   *  disclaimer on the billing page — never default to true client-side. */
  is_test_mode: boolean;
};

export async function getBillingSummary(
  org_id: number
): Promise<BillingSummary> {
  const user_id = await requireUserId();
  await assertOrgMember(user_id, org_id);

  const sb = await createClient();
  const subRes = await sb
    .from("v_billing_subscription")
    .select("*")
    .eq("organization_id", org_id)
    .maybeSingle();
  if (subRes.error) {
    throw new Error(`v_billing_subscription: ${subRes.error.message}`);
  }

  const sub = subRes.data;
  let interval: Interval | null = null;
  if (sub?.stripe_subscription_id) {
    const stripeSub = await stripe.subscriptions
      .retrieve(sub.stripe_subscription_id)
      .catch(() => null);
    const i = stripeSub?.items.data[0]?.price.recurring?.interval;
    if (i === "month" || i === "year") interval = i;
  }

  return {
    org_id,
    plan: asPlanId(sub?.plan),
    status: sub?.status ?? "active",
    is_free: sub?.is_free ?? true,
    current_period_start: sub?.current_period_start ?? null,
    current_period_end: sub?.current_period_end ?? null,
    cancel_at_period_end: sub?.cancel_at_period_end ?? false,
    has_active_subscription:
      !!sub?.stripe_subscription_id && sub.status !== "canceled",
    interval,
    is_test_mode: process.env.BILLING_TEST_MODE === "true",
  };
}

// ---------------------------------------------------------------------------
// listInvoices
// ---------------------------------------------------------------------------

type PaymentMethodSummary = {
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
} | null;

type UpcomingSummary = {
  amount_due_cents: number;
  period_end_unix: number | null;
  line_count: number;
} | null;

type PastInvoice = {
  id: string;
  status: string;
  amount_paid_cents: number;
  created_unix: number;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
};

export type InvoicesPayload = {
  upcoming: UpcomingSummary;
  past: PastInvoice[];
  payment_method: PaymentMethodSummary;
  billing_email: string | null;
};

const TTL_MS = 30_000;
const invoicesCache = new Map<number, { at: number; data: InvoicesPayload }>();

export async function listInvoices(org_id: number): Promise<InvoicesPayload> {
  const user_id = await requireUserId();
  await assertOrgMember(user_id, org_id);

  const now = Date.now();
  const cached = invoicesCache.get(org_id);
  if (cached && now - cached.at < TTL_MS) return cached.data;

  const customerId = await getCustomerId(org_id);
  if (!customerId) {
    const empty: InvoicesPayload = {
      upcoming: null,
      past: [],
      payment_method: null,
      billing_email: null,
    };
    invoicesCache.set(org_id, { at: now, data: empty });
    return empty;
  }

  const [upcoming, pastList, customer] = await Promise.all([
    stripe.invoices
      .createPreview({ customer: customerId })
      .then(
        (inv): UpcomingSummary => ({
          amount_due_cents: inv.amount_due ?? 0,
          period_end_unix: inv.period_end ?? null,
          line_count: inv.lines?.data?.length ?? 0,
        })
      )
      .catch(() => null),
    stripe.invoices
      .list({ customer: customerId, limit: 10 })
      .then((res) =>
        res.data.map(
          (inv): PastInvoice => ({
            id: inv.id ?? "",
            status: inv.status ?? "unknown",
            amount_paid_cents: inv.amount_paid ?? 0,
            created_unix: inv.created ?? 0,
            hosted_invoice_url: inv.hosted_invoice_url ?? null,
            invoice_pdf: inv.invoice_pdf ?? null,
          })
        )
      )
      .catch((): PastInvoice[] => []),
    stripe.customers
      .retrieve(customerId, {
        expand: ["invoice_settings.default_payment_method"],
      })
      .catch(() => null),
  ]);

  let payment_method: PaymentMethodSummary = null;
  let billing_email: string | null = null;

  if (customer && !("deleted" in customer && customer.deleted)) {
    billing_email = customer.email ?? null;
    const def = customer.invoice_settings?.default_payment_method;
    if (def && typeof def !== "string" && def.card) {
      payment_method = {
        brand: def.card.brand ?? "card",
        last4: def.card.last4 ?? "",
        exp_month: def.card.exp_month ?? 0,
        exp_year: def.card.exp_year ?? 0,
      };
    }
  }

  const data: InvoicesPayload = {
    upcoming,
    past: pastList,
    payment_method,
    billing_email,
  };
  invoicesCache.set(org_id, { at: now, data });
  return data;
}

// ---------------------------------------------------------------------------
// Portal-flow helpers
//
// Every portal session we create is a deep-link `flow_data` session — the
// user lands on a single Stripe-hosted screen scoped to one intent (update
// card, change plan, etc). We deliberately do not expose the generic
// portal dashboard.
// ---------------------------------------------------------------------------

async function v1ConfigId(): Promise<string | undefined> {
  const list = await stripe.billingPortal.configurations.list({ limit: 100 });
  return list.data.find((c) => c.metadata?.grida_billing_id === "portal.v1")
    ?.id;
}

export type PortalFlowResult = { portal_url: string };

export async function startPaymentMethodUpdate(
  org_id: number,
  params: { return_url: string }
): Promise<PortalFlowResult> {
  const user_id = await requireUserId();
  await assertOrgOwner(user_id, org_id);

  const origin = await getOrigin();
  const return_url = assertAllowedRedirect(params.return_url, origin);

  const customerId = await getCustomerId(org_id);
  if (!customerId) {
    throw new BillingError(
      "No Stripe customer for this organization yet.",
      "no_stripe_customer",
      400,
      "billing/upgrade"
    );
  }

  const configuration = await v1ConfigId();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url,
    ...(configuration ? { configuration } : {}),
    flow_data: {
      type: "payment_method_update",
      after_completion: {
        type: "redirect",
        redirect: { return_url },
      },
    },
  });

  return { portal_url: session.url };
}

// ---------------------------------------------------------------------------
// startPlanChangeConfirm
//
// Existing-subscription mutation via Stripe Portal's `flow_data` deep link.
// Server picks the target price; Stripe shows a single confirm page (no
// plan picker) with the prorated total. After completion, redirects back.
// Used for paid→paid transitions: plan switch (Pro↔Team) and/or interval
// switch (monthly↔annual).
// ---------------------------------------------------------------------------

export type PlanChangeConfirmResult = { portal_url: string };

export async function startPlanChangeConfirm(
  org_id: number,
  params: {
    plan: PaidPlanId;
    interval: Interval;
    return_url: string;
  }
): Promise<PlanChangeConfirmResult> {
  const user_id = await requireUserId();
  await assertOrgOwner(user_id, org_id);

  if (params.plan !== "pro" && params.plan !== "team") {
    throw new BillingError(
      `plan must be 'pro' or 'team' (got '${params.plan}').`,
      "invalid_plan",
      400
    );
  }
  if (params.interval !== "month" && params.interval !== "year") {
    throw new BillingError(
      `interval must be 'month' or 'year' (got '${params.interval}').`,
      "invalid_interval",
      400
    );
  }

  const origin = await getOrigin();
  const return_url = assertAllowedRedirect(params.return_url, origin);

  const sub = await getActivePaidSubscription(org_id);
  if (!sub) {
    throw new BillingError(
      "No active paid subscription to change. Upgrade first.",
      "not_subscribed",
      400,
      "billing/upgrade"
    );
  }
  // Mirror the UI's `isDegraded` gate: never open the plan-change Portal flow
  // for a sub that is past_due / unpaid / paused / incomplete*. The recovery
  // path is "Update payment method" — surface that, don't let Stripe's Portal
  // be the final defender.
  if (sub.status !== "active" && sub.status !== "trialing") {
    throw new BillingError(
      "Resolve the current billing issue before changing plans.",
      "subscription_degraded",
      409,
      "billing"
    );
  }

  const customerId = await getCustomerId(org_id);
  if (!customerId) {
    throw new BillingError(
      "This organization does not have a Stripe customer.",
      "no_stripe_customer",
      400,
      "billing/upgrade"
    );
  }

  const id = price_catalogue_id(params.plan, params.interval);
  const cat = await getCatalogueStripeIds(id);
  if (!cat) {
    throw new BillingError(
      `Stripe price for ${id} is not yet wired.`,
      "billing_not_provisioned",
      500
    );
  }

  // Fetch the current subscription's first item — Portal flow_data
  // requires its id to know which item to update, and we preserve the
  // existing quantity (v1 = 1) so a plan/interval change doesn't reset it.
  const stripeSub = await stripe.subscriptions.retrieve(
    sub.stripe_subscription_id
  );
  const item = stripeSub.items.data[0];
  if (!item) {
    throw new Error(
      `Stripe subscription ${sub.stripe_subscription_id} has no items`
    );
  }

  const configuration = await v1ConfigId();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url,
    ...(configuration ? { configuration } : {}),
    flow_data: {
      type: "subscription_update_confirm",
      subscription_update_confirm: {
        subscription: sub.stripe_subscription_id,
        items: [
          {
            id: item.id,
            price: cat.stripe_price_id,
            quantity: item.quantity ?? 1,
          },
        ],
      },
      after_completion: {
        type: "redirect",
        redirect: { return_url },
      },
    },
  });

  return { portal_url: session.url };
}

// ---------------------------------------------------------------------------
// startSubscribeCheckout
// ---------------------------------------------------------------------------

export type SubscribeCheckoutResult = {
  checkout_url: string | null;
  session_id: string;
};

export async function startSubscribeCheckout(
  org_id: number,
  params: {
    plan: PaidPlanId;
    interval?: Interval;
    success_url: string;
    cancel_url: string;
  }
): Promise<SubscribeCheckoutResult> {
  const user_id = await requireUserId();
  await assertOrgOwner(user_id, org_id);

  if (params.plan !== "pro" && params.plan !== "team") {
    throw new BillingError(
      `plan must be 'pro' or 'team' (got '${params.plan}').`,
      "invalid_plan",
      400
    );
  }
  const interval: Interval = params.interval ?? "month";
  if (interval !== "month" && interval !== "year") {
    throw new BillingError(
      `interval must be 'month' or 'year' (got '${params.interval}').`,
      "invalid_interval",
      400
    );
  }

  if (await getActivePaidSubscription(org_id)) {
    throw new BillingError(
      "Organization already has an active paid subscription.",
      "already_subscribed",
      409
    );
  }

  const origin = await getOrigin();
  const success_url = assertAllowedRedirect(params.success_url, origin);
  const cancel_url = assertAllowedRedirect(params.cancel_url, origin);

  const id = price_catalogue_id(params.plan, interval);
  const cat = await getCatalogueStripeIds(id);
  if (!cat) {
    throw new BillingError(
      `Stripe price for ${id} is not yet wired.`,
      "billing_not_provisioned",
      500
    );
  }

  // v1 ships single-seat only. Multi-seat billing is deferred — when it
  // lands, the quantity will come from a "Manage seats" UI that pushes
  // through Stripe, never inferred from member count here.
  const quantity = 1;

  // KNOWN ISSUE (TC-BILLING-SUB-059): the local-only check above does not
  // prevent two concurrent `startSubscribeCheckout` calls (e.g. user opens
  // Checkout in two tabs and pays in both) from producing two live Stripe
  // subscriptions. The second `customer.subscription.created` webhook is
  // rejected by `subscription_one_active_per_org_idx`, so locally we see one
  // sub while Stripe has two. Acceptable for v1 — risk is to Grida (we
  // refund manually), not the customer. Closure tracked in GRIDA-60.

  const customer = await resolveOrCreateStripeCustomer(org_id);
  const idempotencyKey = `subscribe:${org_id}:${params.plan}:${interval}:${Math.floor(Date.now() / 60000)}`;

  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      customer,
      line_items: [{ price: cat.stripe_price_id, quantity }],
      subscription_data: {
        metadata: {
          grida_organization_id: String(org_id),
          grida_plan: params.plan,
          grida_interval: interval,
        },
      },
      success_url,
      cancel_url,
      metadata: {
        grida_organization_id: String(org_id),
        kind: "subscribe",
        plan: params.plan,
        interval,
      },
      allow_promotion_codes: true,
    },
    { idempotencyKey }
  );

  return {
    checkout_url: session.url,
    session_id: session.id,
  };
}

// ---------------------------------------------------------------------------
// startCancelSubscription
//
// Stripe Portal `subscription_cancel` flow_data — single confirm screen,
// "Cancel at period end" by config. After completion, Stripe fires
// `customer.subscription.updated` with `cancel_at_period_end=true`, which
// the projector mirrors to the local subscription row.
// ---------------------------------------------------------------------------

export async function startCancelSubscription(
  org_id: number,
  params: { return_url: string }
): Promise<PortalFlowResult> {
  const user_id = await requireUserId();
  await assertOrgOwner(user_id, org_id);

  const origin = await getOrigin();
  const return_url = assertAllowedRedirect(params.return_url, origin);

  const sub = await getActivePaidSubscription(org_id);
  if (!sub) {
    throw new BillingError(
      "No active paid subscription to cancel.",
      "not_subscribed",
      400,
      "billing"
    );
  }

  const customerId = await getCustomerId(org_id);
  if (!customerId) {
    throw new BillingError(
      "This organization does not have a Stripe customer.",
      "no_stripe_customer",
      400
    );
  }

  const configuration = await v1ConfigId();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url,
    ...(configuration ? { configuration } : {}),
    flow_data: {
      type: "subscription_cancel",
      subscription_cancel: { subscription: sub.stripe_subscription_id },
      after_completion: {
        type: "redirect",
        redirect: { return_url },
      },
    },
  });

  return { portal_url: session.url };
}

// ---------------------------------------------------------------------------
// resumeSubscription
//
// Undoes a `cancel_at_period_end=true` flag set by an earlier cancellation,
// while the period is still active. Stripe charges nothing — the existing
// subscription simply continues on its current schedule.
//
// No Portal flow exists for this (Stripe ships `subscription_cancel`,
// `subscription_update_confirm`, `payment_method_update`, but no
// `subscription_resume`), so this is the one Stripe-mutation server action
// that bypasses the Portal. The webhook (`customer.subscription.updated`
// with `cancel_at_period_end=false`) projects the flip back into the local
// row, keeping the "webhook is sole source of truth" rule intact for state.
// ---------------------------------------------------------------------------

export async function resumeSubscription(org_id: number): Promise<void> {
  const user_id = await requireUserId();
  await assertOrgOwner(user_id, org_id);

  const sub = await getActivePaidSubscription(org_id);
  if (!sub) {
    throw new BillingError(
      "No active subscription to resume.",
      "not_subscribed",
      400,
      "billing"
    );
  }

  await stripe.subscriptions.update(sub.stripe_subscription_id, {
    cancel_at_period_end: false,
  });
}

// ---------------------------------------------------------------------------
// listBillingAudit
//
// Owner-only paginated read of the audit feed. Backed by `v_billing_audit`
// which RLS-filters to the org's owner.
// ---------------------------------------------------------------------------

export type AuditRow = {
  id: number;
  organization_id: number;
  user_id: string | null;
  operation: string;
  amount_cents: number | null;
  stripe_event_id: string | null;
  stripe_subscription_id: string | null;
  stripe_invoice_id: string | null;
  event_type: string | null;
  plan: string | null;
  status: string | null;
  note: string | null;
  created_at: string;
};

export type AuditListResult = {
  rows: AuditRow[];
  next_cursor: string | null;
  limit: number;
};

export async function listBillingAudit(
  org_id: number,
  params: { cursor?: string; limit?: number } = {}
): Promise<AuditListResult> {
  const user_id = await requireUserId();
  await assertOrgOwner(user_id, org_id);

  const cursor = params.cursor ?? null;
  const limitRaw = Number(params.limit ?? 50);
  const limit = Math.max(
    1,
    Math.min(Number.isFinite(limitRaw) ? limitRaw : 50, 200)
  );

  // Composite cursor "<created_at>|<id>" — pure created_at would skip rows
  // sharing a boundary timestamp because the page filter would race with the
  // `(created_at DESC, id DESC)` order.
  let cursorAt: string | null = null;
  let cursorId: number | null = null;
  if (cursor) {
    const sep = cursor.indexOf("|");
    if (sep > 0) {
      cursorAt = cursor.slice(0, sep);
      const parsed = Number(cursor.slice(sep + 1));
      cursorId = Number.isFinite(parsed) ? parsed : null;
    }
  }

  const sb = await createClient();
  let q = sb
    .from("v_billing_audit")
    .select(
      "id, organization_id, user_id, operation, amount_cents, stripe_event_id, stripe_subscription_id, stripe_invoice_id, event_type, plan, status, note, created_at"
    )
    .eq("organization_id", org_id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (cursorAt && cursorId !== null) {
    // (created_at, id) lexicographic seek: strictly older timestamp, OR same
    // timestamp with strictly smaller id. Expressed as a postgrest `or`.
    q = q.or(
      `created_at.lt.${cursorAt},and(created_at.eq.${cursorAt},id.lt.${cursorId})`
    );
  } else if (cursorAt) {
    q = q.lt("created_at", cursorAt);
  }

  const { data, error } = await q;
  if (error) throw new Error(`audit list: ${error.message}`);

  const rows = (data ?? []) as AuditRow[];
  const last = rows[rows.length - 1];
  const next_cursor =
    rows.length === limit && last ? `${last.created_at}|${last.id}` : null;

  return { rows, next_cursor, limit };
}

// ===========================================================================
// AI Credits — Metronome-backed pre-charged credit + auto-reload.
//
// Reads expose live balance + gate decision + auto-reload state. Mutations
// (top-up, auto-reload config) are owner-only and resolve a Stripe customer
// + Metronome contract on demand (idempotent).
// ===========================================================================

import {
  AI_CHECKOUT_KIND,
  addStripeChargedCommit,
  disableAutoReload,
  getAccount,
  getAccountView,
  getEntitlement,
  getTransactions,
  provisionOrg,
  refreshBalance,
  setAutoReload,
  type Transaction,
} from "@/lib/billing/metronome";

export type AiCreditsSummary = {
  /** Live balance from Metronome (cents). null if substrate not provisioned. */
  balance_cents: number | null;
  /** Gate decision the AI seam will read. */
  entitled: boolean;
  /** Reason when blocked: "below_floor" | "no_account" | etc. */
  blocked_reason: string | null;
  /** Auto-reload — null when off. */
  auto_reload: {
    enabled: boolean;
    threshold_cents: number;
    recharge_to_cents: number;
  } | null;
  /** Whether a Stripe customer is on file (required for top-up). */
  has_stripe_customer: boolean;
  /** True when Metronome customer + contract are wired. */
  provisioned: boolean;
  /** ISO timestamp of the cache row's last update — drives "X ago" UI. */
  cached_balance_at: string | null;
  /** True when local cache disagrees with the live read. */
  drifted: boolean;
  /** True when the org has an active paid (Pro/Team) subscription. Drives the
   *  auto-reload gate — see docs/wg/platform/billing-known-issues.md "Auto-reload
   *  markup gap". Manual top-up is always available. */
  has_active_subscription: boolean;
};

/**
 * One-shot read for the user-facing AI Credits panel. Lazily provisions
 * the Metronome contract on first call so newly-billed orgs don't see a
 * "not provisioned" empty state.
 *
 * Hot-path note: this is polled every 15s by the open billing tab. Skip the
 * provisionOrg round-trip entirely when the account is already wired —
 * `provisionOrg` does several Metronome calls even on the happy path
 * (`setBillingConfigurations`, `contracts.edit`, `provisionLowBalanceAlert`)
 * and would otherwise hammer the API per poll per tab.
 */
export async function getAiCreditsSummary(
  org_id: number
): Promise<AiCreditsSummary> {
  const user_id = await requireUserId();
  await assertOrgMember(user_id, org_id);

  // Lazy-provision only on cold start. Best-effort: a Metronome outage
  // shouldn't break the billing page.
  const account = await getAccount(org_id).catch(() => null);
  const needsProvision =
    !account?.metronome_customer_id || !account?.metronome_contract_id;
  if (needsProvision) {
    try {
      await provisionOrg(org_id);
    } catch (e) {
      console.warn(
        `[ai-credits] lazy provision failed for org=${org_id}:`,
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  const [view, ent, sub] = await Promise.all([
    getAccountView(org_id).catch(() => null),
    getEntitlement(org_id).catch(() => null),
    getActivePaidSubscription(org_id).catch(() => null),
  ]);

  const live = view?.live ?? null;
  const db = view?.db ?? null;
  const drift = view?.drift;

  return {
    balance_cents: live?.balanceCents ?? null,
    entitled: ent?.allowed ?? false,
    blocked_reason: ent?.allowed ? null : (ent?.reason ?? null),
    auto_reload: live?.autoReload?.enabled
      ? {
          enabled: true,
          threshold_cents: live.autoReload.thresholdCents ?? 0,
          recharge_to_cents: live.autoReload.rechargeToCents ?? 0,
        }
      : null,
    has_stripe_customer: !!db?.stripe_customer_id,
    provisioned: !!db?.metronome_customer_id && !!db?.metronome_contract_id,
    cached_balance_at: db?.cached_balance_at ?? null,
    drifted: !!drift && Object.values(drift).some(Boolean),
    has_active_subscription:
      !!sub?.stripe_subscription_id &&
      sub.status !== "canceled" &&
      sub.status !== "incomplete_expired",
  };
}

export async function listAiCreditTransactions(
  org_id: number,
  limit: number = 12
): Promise<Transaction[]> {
  const user_id = await requireUserId();
  await assertOrgMember(user_id, org_id);
  const all = await getTransactions(org_id);
  return all.slice(0, Math.max(1, Math.min(limit, 50)));
}

/**
 * Force a live read from Metronome and update the cache. Member-callable
 * because the read is non-mutating beyond syncing local cache to live.
 */
export async function refreshAiCreditsBalance(org_id: number): Promise<void> {
  const user_id = await requireUserId();
  await assertOrgMember(user_id, org_id);
  await refreshBalance(org_id);
}

/**
 * Owner-only top-up via direct Metronome charge against the saved card.
 * Used internally (e.g., from the post-Checkout return callback to land
 * the credit when Stripe already collected). End-user Buy Credit flows
 * go through `startTopUpCheckout` instead.
 */
export async function topUpAiCredits(
  org_id: number,
  amount_cents: number
): Promise<{ ok: true }> {
  const user_id = await requireUserId();
  await assertOrgOwner(user_id, org_id);

  if (!Number.isFinite(amount_cents) || amount_cents <= 0) {
    throw new BillingError("invalid amount", "invalid_amount", 400);
  }
  const stripeCustomerId = await resolveOrCreateStripeCustomer(org_id);
  await provisionOrg(org_id, { stripeCustomerId });
  await addStripeChargedCommit(org_id, amount_cents);
  return { ok: true };
}

/**
 * Owner-only: edit-in-place auto-reload (already enabled). Lib enforces
 * threshold > 0 and recharge >= $5. The card is already authorized from
 * the original enable Checkout, so this is a direct apply (no Checkout).
 *
 * NEW enables go through `startEnableAutoReloadCheckout`, not this fn.
 *
 * Requires an active paid subscription — see assertAutoReloadAllowed.
 */
export async function setAiAutoReload(
  org_id: number,
  threshold_cents: number,
  recharge_to_cents: number
): Promise<{ ok: true }> {
  const user_id = await requireUserId();
  await assertOrgOwner(user_id, org_id);
  await assertAutoReloadAllowed(org_id);
  const stripeCustomerId = await resolveOrCreateStripeCustomer(org_id);
  await provisionOrg(org_id, { stripeCustomerId });
  await setAutoReload(org_id, threshold_cents, recharge_to_cents);
  return { ok: true };
}

/**
 * Auto-reload is gated behind an active paid subscription.
 *
 * Why: Metronome's `prepaid_balance_threshold_configuration` runs silent
 * recharges at-cost (the primitive can't separate "charged amount" from
 * "credited amount", so we can't apply the markup envelope from
 * `lib/billing/fees.ts`). On free orgs this would leak ~$1.75–$2.75 per
 * silent fire indefinitely. Restricting to subscribers caps the loss
 * surface to a population whose base-plan margin already covers it.
 *
 * Manual top-up does NOT need this gate — it always goes through Checkout
 * and pays the full markup. See docs/wg/platform/billing-known-issues.md.
 */
async function assertAutoReloadAllowed(org_id: number): Promise<void> {
  const sub = await getActivePaidSubscription(org_id);
  const ok =
    !!sub?.stripe_subscription_id &&
    sub.status !== "canceled" &&
    sub.status !== "incomplete_expired";
  if (!ok) {
    throw new BillingError(
      "Auto-reload requires an active paid plan. Manual top-ups remain available without a subscription.",
      "subscription_required",
      403,
      "billing/upgrade"
    );
  }
}

export async function disableAiAutoReload(
  org_id: number
): Promise<{ ok: true }> {
  const user_id = await requireUserId();
  await assertOrgOwner(user_id, org_id);
  await disableAutoReload(org_id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Checkout-based authorization flows (every NEW commitment goes through
// Stripe Checkout — see docs/wg/platform/metronome.md "card authorization").
//
// Why: Stripe doesn't expose a perfect "PM ready for off-session?" signal,
// and any cached PM can fail tomorrow (expiry, dispute, SCA invalidation).
// Every Checkout is a fresh on-session authorization that satisfies SCA,
// (re)applies `setup_future_usage: 'off_session'`, and confirms intent.
//
// The existing Stripe webhook receiver picks up `checkout.session.completed`
// with our metadata.kind and routes to the right service-function tail.
// ---------------------------------------------------------------------------

export type AiCheckoutResult = { checkout_url: string };

/**
 * Owner-only. Returns a Stripe Checkout URL for buying $X of AI credit.
 * Payment-mode session: charges immediately + saves card with
 * `setup_future_usage: 'off_session'` for future direct charges
 * (Metronome's silent auto-recharges and edit-in-place auto-reload).
 */
export async function startTopUpCheckout(
  org_id: number,
  params: { cents: number; success_url: string; cancel_url: string }
): Promise<AiCheckoutResult> {
  const user_id = await requireUserId();
  await assertOrgOwner(user_id, org_id);

  if (
    !Number.isFinite(params.cents) ||
    params.cents < TOPUP_MIN_CENTS ||
    params.cents > TOPUP_MAX_CENTS
  ) {
    throw new BillingError(
      `Top-up must be between $${TOPUP_MIN_CENTS / 100} and $${TOPUP_MAX_CENTS / 100}.`,
      "invalid_amount",
      400
    );
  }

  const origin = await getOrigin();
  const success_url = assertAllowedRedirect(params.success_url, origin);
  const cancel_url = assertAllowedRedirect(params.cancel_url, origin);

  const stripeCustomerId = await resolveOrCreateStripeCustomer(org_id);
  // Provision Metronome too — the webhook needs the contract to land the commit.
  await provisionOrg(org_id, { stripeCustomerId });

  // Pass through Stripe's processing fee — user pays $X plus the fee,
  // receives exactly $X of credit. See lib/billing/fees.ts and
  // docs/wg/platform/ai-credits.md "Money model".
  const totalCents = totalChargeForCredit(params.cents);
  const idempotencyKey = `ai_topup:${org_id}:${params.cents}:${Math.floor(Date.now() / 60000)}`;

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      customer: stripeCustomerId,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: totalCents,
            product_data: {
              name: "Grida AI Credit",
              description: `$${(params.cents / 100).toFixed(2)} of credit · includes Stripe processing fee.`,
            },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        setup_future_usage: "off_session",
        metadata: {
          grida_organization_id: String(org_id),
          kind: AI_CHECKOUT_KIND.TOPUP,
          // `cents` = credit amount landed on Metronome (NOT the total
          // charged via Stripe). The fee delta is already in our Stripe
          // payout — we owe the customer exactly this much credit.
          cents: String(params.cents),
          total_cents: String(totalCents),
        },
      },
      // Generate a post-payment Stripe Invoice. Without this, payment-mode
      // Checkout produces only a PaymentIntent + Charge — no Invoice ever
      // appears in `stripe.invoices.list`, so the "Past Invoices" panel
      // misses every top-up. This flag is a no-op on payment failure.
      invoice_creation: { enabled: true },
      // Session-level metadata is what `checkout.session.completed` carries.
      metadata: {
        grida_organization_id: String(org_id),
        kind: AI_CHECKOUT_KIND.TOPUP,
        cents: String(params.cents),
        total_cents: String(totalCents),
      },
      success_url,
      cancel_url,
    },
    { idempotencyKey }
  );

  if (!session.url) {
    throw new BillingError(
      "Stripe did not return a Checkout URL.",
      "checkout_failed",
      500
    );
  }
  return { checkout_url: session.url };
}

/**
 * Owner-only. Returns a Stripe Checkout URL for enabling auto-reload.
 * The Checkout charges the recharge amount upfront (= initial top-up)
 * AND saves the card. Post-Checkout, the webhook applies the threshold
 * config so future drains trigger silent auto-recharges against the
 * saved card.
 *
 * Used for: first-time enable AND re-enable after disable / Metronome
 * auto-disable from a failed silent charge. Edit-in-place (already
 * enabled, just changing threshold/amount) goes through `setAiAutoReload`.
 */
export async function startEnableAutoReloadCheckout(
  org_id: number,
  params: {
    threshold_cents: number;
    recharge_to_cents: number;
    success_url: string;
    cancel_url: string;
  }
): Promise<AiCheckoutResult> {
  const user_id = await requireUserId();
  await assertOrgOwner(user_id, org_id);
  await assertAutoReloadAllowed(org_id);

  if (
    !Number.isFinite(params.threshold_cents) ||
    params.threshold_cents < AUTO_RELOAD_THRESHOLD_MIN_CENTS ||
    params.threshold_cents % 100 !== 0
  ) {
    throw new BillingError(
      `Threshold must be a whole number of dollars and at least $${AUTO_RELOAD_THRESHOLD_MIN_CENTS / 100}.`,
      "invalid_amount",
      400
    );
  }
  if (
    !Number.isFinite(params.recharge_to_cents) ||
    params.recharge_to_cents < AUTO_RELOAD_RECHARGE_MIN_CENTS ||
    params.recharge_to_cents > AUTO_RELOAD_RECHARGE_MAX_CENTS ||
    params.recharge_to_cents % 100 !== 0
  ) {
    throw new BillingError(
      `Recharge target must be a whole number of dollars between $${AUTO_RELOAD_RECHARGE_MIN_CENTS / 100} and $${AUTO_RELOAD_RECHARGE_MAX_CENTS / 100}.`,
      "invalid_amount",
      400
    );
  }
  if (params.recharge_to_cents <= params.threshold_cents) {
    throw new BillingError(
      "Recharge target must be greater than the threshold.",
      "invalid_amount",
      400
    );
  }

  const origin = await getOrigin();
  const success_url = assertAllowedRedirect(params.success_url, origin);
  const cancel_url = assertAllowedRedirect(params.cancel_url, origin);

  const stripeCustomerId = await resolveOrCreateStripeCustomer(org_id);
  await provisionOrg(org_id, { stripeCustomerId });

  // Markup is applied to the user-initiated initial recharge (this
  // Checkout). Subsequent silent recharges via Metronome's
  // prepaid_balance_threshold_configuration run at-cost. v1 mitigation
  // is the subscription gate above; full fix is tracked as KI-BILL-001
  // in docs/wg/platform/billing-known-issues.md.
  const totalCents = totalChargeForCredit(params.recharge_to_cents);
  const idempotencyKey = `ai_auto_reload:${org_id}:${params.threshold_cents}:${params.recharge_to_cents}:${Math.floor(Date.now() / 60000)}`;

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      customer: stripeCustomerId,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: totalCents,
            product_data: {
              name: "Grida AI Credit (auto-reload setup)",
              description: `Initial $${(params.recharge_to_cents / 100).toFixed(2)} of credit · includes Stripe processing fee. Auto-reload will keep your balance topped up to this level when it falls below $${(params.threshold_cents / 100).toFixed(2)}.`,
            },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        setup_future_usage: "off_session",
        metadata: {
          grida_organization_id: String(org_id),
          kind: AI_CHECKOUT_KIND.AUTO_RELOAD_ENABLE,
          threshold_cents: String(params.threshold_cents),
          // `recharge_to_cents` = credit amount landed on Metronome.
          recharge_to_cents: String(params.recharge_to_cents),
          total_cents: String(totalCents),
        },
      },
      // Generate a post-payment Stripe Invoice (see startTopUpCheckout).
      invoice_creation: { enabled: true },
      metadata: {
        grida_organization_id: String(org_id),
        kind: AI_CHECKOUT_KIND.AUTO_RELOAD_ENABLE,
        threshold_cents: String(params.threshold_cents),
        recharge_to_cents: String(params.recharge_to_cents),
        total_cents: String(totalCents),
      },
      success_url,
      cancel_url,
    },
    { idempotencyKey }
  );

  if (!session.url) {
    throw new BillingError(
      "Stripe did not return a Checkout URL.",
      "checkout_failed",
      500
    );
  }
  return { checkout_url: session.url };
}
