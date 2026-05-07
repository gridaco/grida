import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertSuiteSafety } from "../fixtures/safety";
import {
  provisionEphemeralOrg,
  teardownOrg,
  type EphemeralOrg,
} from "../fixtures/org";
import {
  awaitDb,
  getProPriceId,
  readActiveSubscription,
  readCustomerId,
} from "../fixtures/db";
import { deliverEvent } from "../fixtures/deliver-event";
import { stripe } from "../../..";

describe("E2E — subscription lifecycle via real Stripe webhooks", () => {
  let org: EphemeralOrg;

  beforeAll(() => assertSuiteSafety());
  afterAll(async () => {
    if (org) await teardownOrg(org);
  });

  it("customer.created → subscription.created → subscription.deleted mirrors locally", async () => {
    org = await provisionEphemeralOrg();
    const priceId = await getProPriceId();

    const customer = await stripe.customers.create({
      metadata: { grida_organization_id: String(org.org_id) },
    });
    const r1 = await deliverEvent("customer.created", customer);
    expect(r1.status).toBe(200);

    await awaitDb(
      () => readCustomerId(org.org_id),
      (id) => id === customer.id,
      { label: "account.stripe_customer_id mirrors" }
    );

    // `pm_card_visa` is a token Stripe expands at attach time into a real
    // pm_… id; the returned id is what `default_payment_method` accepts.
    const pm = await stripe.paymentMethods.attach("pm_card_visa", {
      customer: customer.id,
    });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: pm.id },
    });
    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId, quantity: 1 }],
    });
    const r2 = await deliverEvent("customer.subscription.created", sub);
    expect(r2.status).toBe(200);

    const subRow = await awaitDb(
      () => readActiveSubscription(org.org_id),
      (row) => row?.stripe_subscription_id === sub.id,
      { label: "active subscription mirrors" }
    );
    expect(subRow!.plan).toBe("pro");
    expect(subRow!.quantity).toBe(1);
    expect(["active", "trialing", "incomplete", "past_due"]).toContain(
      subRow!.status
    );

    const canceled = await stripe.subscriptions.cancel(sub.id);
    const r3 = await deliverEvent("customer.subscription.deleted", canceled);
    expect(r3.status).toBe(200);

    await awaitDb(
      () => readActiveSubscription(org.org_id),
      (row) => row === null,
      { label: "no active subscription after cancel" }
    );
  }, 60_000);
});
