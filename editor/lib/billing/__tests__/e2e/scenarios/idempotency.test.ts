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

describe("E2E — webhook idempotency", () => {
  let org: EphemeralOrg;

  beforeAll(() => assertSuiteSafety());
  afterAll(async () => {
    if (org) await teardownOrg(org);
  });

  it("replaying the same event 3× yields handled+replayed+replayed", async () => {
    org = await provisionEphemeralOrg();
    const priceId = await getProPriceId();

    const customer = await stripe.customers.create({
      metadata: { grida_organization_id: String(org.org_id) },
    });
    await deliverEvent("customer.created", customer);
    await awaitDb(
      () => readCustomerId(org.org_id),
      (id) => id === customer.id
    );

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

    // Stable event id across 3 deliveries forces the dedupe path.
    const eventId = `evt_test_idem_${Date.now()}`;

    const r1 = await deliverEvent("customer.subscription.created", sub, {
      eventId,
    });
    const r2 = await deliverEvent("customer.subscription.created", sub, {
      eventId,
    });
    const r3 = await deliverEvent("customer.subscription.created", sub, {
      eventId,
    });

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(200);
    expect("handler" in r1.body).toBe(true);
    expect("replayed" in r2.body && r2.body.replayed).toBe(true);
    expect("replayed" in r3.body && r3.body.replayed).toBe(true);

    const row = await awaitDb(
      () => readActiveSubscription(org.org_id),
      (r) => r?.stripe_subscription_id === sub.id
    );
    expect(row!.quantity).toBe(1);
  }, 60_000);
});
