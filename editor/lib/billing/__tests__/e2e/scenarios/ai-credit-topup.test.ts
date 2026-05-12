// E2E coverage for the post-Checkout AI credit top-up handler.
//
// Drives `handleAiCreditCheckoutCompleted` directly with a synthetic Stripe
// session payload — same shape the real Stripe webhook produces. This is the
// path that fired the user-visible bugs:
//
//   - the return-page race ("took too long" toast)            — covered by
//     asserting `customer_entitled` is `true` immediately after the handler
//     returns, so the return page settles on first poll instead of waiting
//     for the Metronome `commit.create` webhook.
//   - the stale-DB-cache amber banner                          — covered by
//     asserting `cached_balance_cents >= cents` (not just live read).
//   - the "59m ago" mis-display                                — covered by
//     asserting `getTransactions` exposes a `createdAt`-derived `at` that
//     is within a few seconds of wall clock, not hour-floored.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertSuiteSafety } from "../fixtures/safety";
import {
  provisionEphemeralOrg,
  teardownOrg,
  type EphemeralOrg,
} from "../fixtures/org";
import {
  AI_CHECKOUT_KIND,
  getAccount,
  getTransactions,
  handleAiCreditCheckoutCompleted,
  provisionOrg,
} from "@/lib/billing/metronome";
import { stripe } from "../../..";

describe("E2E — AI credit top-up post-Checkout handler", () => {
  let org: EphemeralOrg;

  beforeAll(() => assertSuiteSafety());
  afterAll(async () => {
    if (org) await teardownOrg(org);
  });

  it("lands credit, flips entitlement, and exposes a fresh createdAt", async () => {
    org = await provisionEphemeralOrg();

    // Mint a Stripe customer + attach to the org so `provisionOrg` wires
    // billing-provider config (mirrors the real flow where the user has
    // a Stripe customer by the time they hit Checkout).
    const customer = await stripe.customers.create({
      metadata: { grida_organization_id: String(org.org_id) },
    });
    const { error: attachErr } = await (
      await import("@/lib/supabase/server")
    ).service_role.workspace.rpc("fn_billing_attach_stripe_customer", {
      p_org_id: org.org_id,
      p_stripe_customer_id: customer.id,
    });
    if (attachErr) throw new Error(`attach: ${attachErr.message}`);
    await provisionOrg(org.org_id, { stripeCustomerId: customer.id });

    // Pre-handler baseline. New ephemeral org → all zero, not entitled.
    const before = await getAccount(org.org_id);
    expect(before?.customer_entitled).toBe(false);
    expect(before?.cached_balance_cents).toBe(0);

    const t0 = Date.now();
    const CENTS = 1000; // $10
    const TOTAL = 1080; // includes mock processing fee

    const result = await handleAiCreditCheckoutCompleted({
      id: `cs_test_${t0}`,
      payment_intent: `pi_test_${t0}`,
      payment_status: "paid",
      amount_total: TOTAL,
      metadata: {
        grida_organization_id: String(org.org_id),
        kind: AI_CHECKOUT_KIND.TOPUP,
        cents: String(CENTS),
        total_cents: String(TOTAL),
      },
    });
    expect(result.result).toBe("applied");

    // The handler MUST reconcile the DB cache inline so the return page
    // settles on its first poll. Without this, `customer_entitled` waits
    // for the Metronome `commit.create` webhook (unbounded delay).
    const after = await getAccount(org.org_id);
    expect(after?.customer_entitled).toBe(true);
    expect(after?.cached_balance_cents).toBeGreaterThanOrEqual(CENTS);

    // Transactions feed should expose the commit's actual `created_at`,
    // not the hour-floored `schedule_items[0].starting_at`. We can't pin
    // the exact wall clock (Metronome stamps it server-side), but a few
    // seconds of skew is fine and an hour of skew is the bug.
    const txns = await getTransactions(org.org_id);
    const topup = txns.find((t) => t.kind === "topup");
    expect(topup).toBeDefined();
    expect(topup!.amountCents).toBe(CENTS);
    expect(topup!.at).not.toBeNull();
    const ageMs = Date.now() - Date.parse(topup!.at!);
    expect(ageMs).toBeGreaterThanOrEqual(0);
    expect(ageMs).toBeLessThan(5 * 60_000); // < 5 min (covers any test slowness)
  }, 60_000);
});
