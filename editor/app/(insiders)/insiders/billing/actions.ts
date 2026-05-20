"use server";

// GRIDA-SEC-002 —
// see editor/proxy.ts and /SECURITY.md. Every action in this file accepts
// an attacker-supplied `organizationId` and performs privileged Metronome /
// Stripe operations against it without checking caller membership. That is
// only safe because the `(insiders)` route group is gated to local
// development by the proxy + the route-group layout. Do NOT import any of
// these actions from production code paths — that bypass would defeat the
// gate (server-action hashes are addressable from any page that imports
// them, regardless of the URL the action originally lived under).

// Insiders dev harness server actions for the Metronome lifecycle.
// Thin wrappers over `lib/billing/metronome` service functions.
// All ops take an `organizationId: number` (the bigint PK on `public.organization`).

import { stripe, resolveOrCreateStripeCustomer } from "@/lib/billing";
import { service_role } from "@/lib/supabase/server";
import {
  addComplimentaryCommit,
  addStripeChargedCommit,
  disableAutoReload,
  getAccount,
  getAccountView,
  getAlertsStatus,
  getEntitlement,
  getInvoicePdfBase64,
  getInvoices,
  getOrgBalance,
  getTransactions,
  ingestUsageEvent,
  ingestUsageEventGated,
  provisionLowBalanceAlert,
  provisionOrg,
  refreshBalance,
  revokeUnusedOnCommit,
  setAutoReload,
} from "@/lib/billing/metronome";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function wrap<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  // GRIDA-SEC-002: defense-in-depth. Server actions are addressable by their
  // generated hash from any page that imports them, regardless of route group;
  // the proxy + (insiders) layout `notFound()` are the primary gates, but this
  // runtime guard ensures these unauthenticated mutators refuse to execute
  // outside local development even if an import accidentally crosses the
  // boundary.
  if (process.env.NODE_ENV !== "development") {
    return { ok: false, error: "insiders actions are dev-only" };
  }
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// -- account / state -------------------------------------------------------

/**
 * Live account view for the dev page: DB cache + Metronome live + drift.
 * The UI should display `live.*` as the source of truth and surface drift
 * when present (= dropped webhook).
 */
export async function actionGetAccountView(organizationId: number) {
  return wrap(() => getAccountView(organizationId));
}

export async function actionGetEntitlement(organizationId: number) {
  return wrap(() => getEntitlement(organizationId));
}

export async function actionGetBalance(organizationId: number) {
  return wrap(() => getOrgBalance(organizationId));
}

export async function actionRefreshBalance(organizationId: number) {
  return wrap(() => refreshBalance(organizationId));
}

// -- user-facing translations (transactions + invoices) -------------------

export async function actionGetTransactions(organizationId: number) {
  return wrap(() => getTransactions(organizationId));
}

export async function actionGetInvoices(organizationId: number) {
  return wrap(() => getInvoices(organizationId));
}

export async function actionGetAlertsStatus(organizationId: number) {
  return wrap(() => getAlertsStatus(organizationId));
}

/**
 * Fetch the Metronome-rendered PDF for one invoice. Returns base64 + a
 * suggested filename; the UI is expected to decode and trigger a
 * download via Blob + object URL.
 */
export async function actionGetInvoicePdf(
  organizationId: number,
  invoiceId: string
) {
  return wrap(() => getInvoicePdfBase64(organizationId, invoiceId));
}

// -- provisioning ----------------------------------------------------------

export async function actionProvisionOrg(organizationId: number) {
  return wrap(() => provisionOrg(organizationId));
}

/**
 * Provision a low-balance alert at an arbitrary threshold (cents).
 * Use 0 for the depletion-tier alert (flips entitlement off).
 * Use any positive value for warning tiers (refresh balance only).
 */
export async function actionProvisionLowBalanceAlert(
  organizationId: number,
  thresholdCents: number,
  name?: string
) {
  return wrap(() =>
    provisionLowBalanceAlert(organizationId, thresholdCents, { name })
  );
}

// -- commits ---------------------------------------------------------------

export async function actionAddComplimentaryCommit(
  organizationId: number,
  amountCents: number,
  name?: string,
  priority?: number
) {
  return wrap(() =>
    addComplimentaryCommit(organizationId, amountCents, { name, priority })
  );
}

export async function actionAddStripeChargedCommit(
  organizationId: number,
  amountCents: number,
  name?: string
) {
  return wrap(() =>
    addStripeChargedCommit(organizationId, amountCents, { name })
  );
}

export async function actionRevokeUnused(
  organizationId: number,
  commitId: string
) {
  return wrap(() => revokeUnusedOnCommit(organizationId, commitId));
}

// -- auto-reload -----------------------------------------------------------

export async function actionSetAutoReload(
  organizationId: number,
  thresholdCents: number,
  rechargeAmountCents: number
) {
  return wrap(() =>
    setAutoReload(organizationId, thresholdCents, rechargeAmountCents)
  );
}

export async function actionDisableAutoReload(organizationId: number) {
  return wrap(() => disableAutoReload(organizationId));
}

// -- ingest (manual usage event for QA) -----------------------------------

export async function actionIngest(organizationId: number, costMills: number) {
  return wrap(() => ingestUsageEvent(organizationId, costMills));
}

export async function actionIngestGated(
  organizationId: number,
  costMills: number
) {
  return wrap(() => ingestUsageEventGated(organizationId, costMills));
}

// -- webhook log (recent events from grida_billing.metronome_event) -------

export type WebhookEventRow = {
  event_id: string;
  event_type: string;
  received_at: string;
  processed_at: string | null;
  failure_reason: string | null;
  customer_id: string | null;
  payment_status: string | null;
};

export async function actionListWebhookEvents(
  organizationId: number,
  limit: number = 20
) {
  return wrap(async (): Promise<WebhookEventRow[]> => {
    const { data, error } = await service_role.workspace.rpc(
      "fn_billing_list_metronome_events" as never,
      { p_org: organizationId, p_limit: limit } as never
    );
    if (error) throw new Error(error.message);
    return (data ?? []) as WebhookEventRow[];
  });
}

// -- one-click Stripe customer + test payment method (insiders QA only) ----

export type LinkStripeResult = {
  stripeCustomerId: string;
  paymentMethodId: string;
  alreadyLinked: boolean;
};

/**
 * Insiders-only convenience: ensure the org has a Stripe customer, attach
 * a Stripe test payment method (`pm_card_visa`), and set it as default.
 *
 * Refuses to run if STRIPE_SECRET_KEY is not a test key.
 */
export async function actionLinkStripeAndAttachTestCard(
  organizationId: number
) {
  return wrap(async (): Promise<LinkStripeResult> => {
    const sk = process.env.STRIPE_SECRET_KEY ?? "";
    if (!sk.startsWith("sk_test_")) {
      throw new Error(
        "Refusing: STRIPE_SECRET_KEY must start with 'sk_test_'."
      );
    }

    const before = await getAccount(organizationId);
    const alreadyLinked = !!before?.stripe_customer_id;

    const stripeCustomerId =
      await resolveOrCreateStripeCustomer(organizationId);

    // Attach pm_card_visa if not already there.
    const existing = await stripe.paymentMethods.list({
      customer: stripeCustomerId,
      type: "card",
      limit: 5,
    });
    let pm = existing.data[0];
    if (!pm) {
      pm = await stripe.paymentMethods.attach("pm_card_visa", {
        customer: stripeCustomerId,
      });
    }

    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: { default_payment_method: pm.id },
    });

    return { stripeCustomerId, paymentMethodId: pm.id, alreadyLinked };
  });
}
