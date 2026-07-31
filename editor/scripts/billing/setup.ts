// Idempotent substrate setup for Stripe (test mode) and Metronome.
// GRIDA-EE: billing — test-only external billing substrate setup.
// Both match-or-create by stable id; safe to re-run after `supabase db reset`.
//
// Env loading + the explicit confirmation prompt live in `cli.ts`. These
// functions assume `process.env` is already populated.

import type {
  CatalogueId,
  Interval,
  PaidPlanId,
} from "../../lib/billing/plans";
import { requireEnv, requireStripeTestKey } from "./_env";

// ---------------------------------------------------------------------------
// Stripe — products + prices + Customer Portal config
//
// Provision only offers that are saleable now. Historical Team / annual
// definitions remain readable through `plans.ts`, existing Stripe resources,
// and existing catalogue rows; setup never archives or deletes them.
// ---------------------------------------------------------------------------

export async function setupStripe(): Promise<void> {
  requireStripeTestKey();

  const { stripe } = await import("../../lib/billing");
  const { service_role } = await import("../../lib/supabase/server");
  const { BillingOffers } = await import("../../lib/billing/offers");
  const { PAID_PLANS, price_cents } = await import("../../lib/billing/plans");
  type ProductSpec = {
    plan: PaidPlanId;
    name: string;
    description: string;
    product_grida_id: `plan.${PaidPlanId}`;
  };
  type PriceSpec = {
    offer_id: string;
    plan: PaidPlanId;
    catalogue_id: CatalogueId;
    interval: Interval;
    unit_amount_cents: number;
    nickname: string;
  };

  const saleablePlans = [
    ...new Set(BillingOffers.saleable.map((offer) => offer.plan)),
  ];
  const PRODUCTS: ProductSpec[] = saleablePlans.map((planId) => {
    const plan = PAID_PLANS[planId];
    return {
      plan: plan.id,
      name: `Grida ${plan.name}`,
      description: `Grida ${plan.name} subscription.`,
      product_grida_id: `plan.${plan.id}`,
    };
  });

  const PRICES: PriceSpec[] = BillingOffers.saleable.map((offer) => ({
    offer_id: offer.id,
    plan: offer.plan,
    catalogue_id: offer.catalogue_id,
    interval: offer.interval,
    unit_amount_cents: price_cents(offer.plan, offer.interval),
    nickname: `${PAID_PLANS[offer.plan].name} ${offer.interval === "month" ? "monthly" : "annual"}`,
  }));

  // We list+filter rather than products.search because search is eventually
  // consistent and can miss a product we created seconds ago.
  const ensureProduct = async (p: ProductSpec): Promise<string> => {
    const list = await stripe.products.list({ active: true, limit: 100 });
    const existing = list.data.find(
      (x) => x.metadata?.grida_billing_id === p.product_grida_id
    );
    if (existing) {
      console.log(
        `[stripe] reusing product ${existing.id} (${p.product_grida_id})`
      );
      return existing.id;
    }
    const created = await stripe.products.create({
      name: p.name,
      description: p.description,
      metadata: { grida_billing_id: p.product_grida_id },
    });
    console.log(
      `[stripe] created product ${created.id} (${p.product_grida_id})`
    );
    return created.id;
  };

  const ensurePrice = async (
    product_id: string,
    spec: PriceSpec
  ): Promise<string> => {
    const list = await stripe.prices.list({
      product: product_id,
      active: true,
      limit: 100,
    });
    const existing = list.data.find(
      (p) =>
        p.unit_amount === spec.unit_amount_cents &&
        p.currency === "usd" &&
        p.recurring?.interval === spec.interval &&
        p.recurring?.usage_type === "licensed"
    );
    if (existing) {
      console.log(
        `[stripe] reusing price ${existing.id} (${spec.catalogue_id} $${spec.unit_amount_cents / 100}/${spec.interval})`
      );
      return existing.id;
    }
    const created = await stripe.prices.create({
      product: product_id,
      currency: "usd",
      unit_amount: spec.unit_amount_cents,
      recurring: { interval: spec.interval, usage_type: "licensed" },
      nickname: spec.nickname,
      metadata: { grida_billing_id: spec.catalogue_id },
    });
    console.log(
      `[stripe] created price ${created.id} (${spec.catalogue_id} $${spec.unit_amount_cents / 100}/${spec.interval})`
    );
    return created.id;
  };

  const writeCatalogue = async (
    catalogue_id: CatalogueId,
    product_id: string,
    price_id: string
  ): Promise<void> => {
    const { error } = await service_role.workspace.rpc(
      "fn_billing_setup_product",
      {
        p_grida_billing_id: catalogue_id,
        p_stripe_product_id: product_id,
        p_stripe_price_id: price_id,
      }
    );
    if (error)
      throw new Error(`writeCatalogue ${catalogue_id}: ${error.message}`);
  };

  // `proration_behavior=always_invoice` immediately invoices the prorated
  // difference on a price change rather than deferring to next invoice.
  const setupPortal = async (
    wired: Array<{
      product_id: string;
      price_id: string;
    }>
  ): Promise<string> => {
    const portalProducts: Array<{ product: string; prices: string[] }> = [];
    for (const offer of wired) {
      const existing = portalProducts.find(
        (product) => product.product === offer.product_id
      );
      if (existing) {
        existing.prices.push(offer.price_id);
      } else {
        portalProducts.push({
          product: offer.product_id,
          prices: [offer.price_id],
        });
      }
    }

    const config = {
      business_profile: { headline: "Grida billing" },
      // Disable Stripe's shareable no-code login URL. Portal access must start
      // from an owner-authorized, intent-scoped app action so Custom agreement
      // lifecycle cannot bypass the server-side `custom_managed` guard.
      login_page: { enabled: false },
      features: {
        // Every portal session we open is a deep-link `flow_data` session
        // scoped to one intent — the user never reaches the dashboard.
        // The features below must be `enabled` for their flow_data types
        // to work; with no generic entry point, it doesn't matter.
        subscription_cancel: {
          enabled: true,
          mode: "at_period_end" as const,
          proration_behavior: "none" as const,
        },
        customer_update: { enabled: false },
        payment_method_update: { enabled: true },
        invoice_history: { enabled: true },
        subscription_update: {
          enabled: true,
          default_allowed_updates: ["price" as const],
          proration_behavior: "always_invoice" as const,
          products: portalProducts,
        },
      },
      metadata: { grida_billing_id: "portal.v1" },
    };

    const list = await stripe.billingPortal.configurations.list({ limit: 100 });
    const existing = list.data.find(
      (c) => c.metadata?.grida_billing_id === "portal.v1"
    );
    if (existing) {
      const updated = await stripe.billingPortal.configurations.update(
        existing.id,
        config as Parameters<
          typeof stripe.billingPortal.configurations.update
        >[1]
      );
      console.log(`[stripe] updated portal config ${updated.id}`);
      return updated.id;
    }
    const created = await stripe.billingPortal.configurations.create(
      config as Parameters<typeof stripe.billingPortal.configurations.create>[0]
    );
    console.log(`[stripe] created portal config ${created.id}`);
    return created.id;
  };

  console.log("[stripe] starting");
  const productIds = new Map<PaidPlanId, string>();
  await Promise.all(
    PRODUCTS.map(async (product) => {
      productIds.set(product.plan, await ensureProduct(product));
    })
  );
  const productIdFor = (plan: PaidPlanId): string => {
    const id = productIds.get(plan);
    if (!id) throw new Error(`missing Stripe product for ${plan}`);
    return id;
  };

  const wiredOffers = await Promise.all(
    PRICES.map(async (spec) => {
      const product_id = productIdFor(spec.plan);
      const price_id = await ensurePrice(product_id, spec);
      await writeCatalogue(spec.catalogue_id, product_id, price_id);
      return {
        offer_id: spec.offer_id,
        plan: spec.plan,
        catalogue_id: spec.catalogue_id,
        product_id,
        price_id,
      };
    })
  );

  const portal_config_id = await setupPortal(wiredOffers);
  console.log("[stripe] done");
  console.log(
    JSON.stringify({ offers: wiredOffers, portal_config_id }, null, 2)
  );
}

// ---------------------------------------------------------------------------
// Metronome — billable metric, products, rate card, rate
//
// Substrate only. Customers/contracts/commits are created per-org at runtime.
// ---------------------------------------------------------------------------

const METRONOME_NAMES = {
  billableMetric: "Grida AI Usage",
  usageProduct: "Grida AI Usage",
  creditProduct: "Grida AI Credits", // FIXED product used as commit.product_id
  rateCard: "Grida AI Sandbox",
  eventType: "ai.usage",
  costProperty: "cost_mills",
};

export async function setupMetronome(): Promise<void> {
  requireEnv("METRONOME_API_TOKEN");
  const { metronome } = await import("../../lib/billing/metronome");
  const N = METRONOME_NAMES;

  // 1. billable metric
  let metricId: string | undefined;
  for await (const m of metronome.v1.billableMetrics.list()) {
    if (m.name === N.billableMetric) {
      metricId = m.id;
      break;
    }
  }
  if (metricId) {
    console.log(`billable_metric: reusing ${metricId}  (${N.billableMetric})`);
  } else {
    const r = await metronome.v1.billableMetrics.create({
      name: N.billableMetric,
      aggregation_type: "SUM",
      aggregation_key: N.costProperty,
      event_type_filter: { in_values: [N.eventType] },
      property_filters: [{ name: N.costProperty, exists: true }],
    });
    metricId = r.data.id;
    console.log(`billable_metric: created ${metricId}  (${N.billableMetric})`);
  }

  // 2. usage + credit products
  let usageProductId: string | undefined;
  let creditProductId: string | undefined;
  for await (const p of metronome.v1.contracts.products.list({
    archive_filter: "NOT_ARCHIVED",
  })) {
    if (p.current?.name === N.usageProduct && p.type === "USAGE") {
      usageProductId = p.id;
    } else if (p.current?.name === N.creditProduct && p.type === "FIXED") {
      creditProductId = p.id;
    }
  }
  if (usageProductId) {
    console.log(
      `usage_product:    reusing ${usageProductId}  (${N.usageProduct})`
    );
  } else {
    const r = await metronome.v1.contracts.products.create({
      name: N.usageProduct,
      type: "USAGE",
      billable_metric_id: metricId,
    });
    usageProductId = r.data.id;
    console.log(
      `usage_product:    created ${usageProductId}  (${N.usageProduct})`
    );
  }
  if (creditProductId) {
    console.log(
      `credit_product:   reusing ${creditProductId}  (${N.creditProduct})`
    );
  } else {
    const r = await metronome.v1.contracts.products.create({
      name: N.creditProduct,
      type: "FIXED",
    });
    creditProductId = r.data.id;
    console.log(
      `credit_product:   created ${creditProductId}  (${N.creditProduct})`
    );
  }

  // 3. rate card
  let rateCardId: string | undefined;
  for await (const r of metronome.v1.contracts.rateCards.list({ body: {} })) {
    if (r.name === N.rateCard) {
      rateCardId = r.id;
      break;
    }
  }
  if (rateCardId) {
    console.log(`rate_card:        reusing ${rateCardId}  (${N.rateCard})`);
  } else {
    const r = await metronome.v1.contracts.rateCards.create({
      name: N.rateCard,
    });
    rateCardId = r.data.id;
    console.log(`rate_card:        created ${rateCardId}  (${N.rateCard})`);
  }

  // 4. rate (FLAT @ 0.1 cents/unit = $0.001/mill — at cost)
  let rateExists = false;
  for await (const r of metronome.v1.contracts.rateCards.rates.list({
    rate_card_id: rateCardId,
    at: new Date().toISOString(),
    selectors: [{ product_id: usageProductId }],
  })) {
    if (r.product_id === usageProductId) {
      rateExists = true;
      break;
    }
  }
  if (rateExists) {
    console.log(
      `rate:             already present for usage product ${usageProductId}`
    );
  } else {
    await metronome.v1.contracts.rateCards.rates.add({
      rate_card_id: rateCardId,
      product_id: usageProductId,
      entitled: true,
      rate_type: "FLAT",
      starting_at: new Date(Date.UTC(2026, 0, 1)).toISOString(),
      price: 0.1,
    });
    console.log(`rate:             added FLAT @ 0.1 cents/unit ($0.001/mill)`);
  }

  console.log("\nok.");
  console.log(`  billable_metric_id = ${metricId}`);
  console.log(`  usage_product_id   = ${usageProductId}`);
  console.log(`  credit_product_id  = ${creditProductId}`);
  console.log(`  rate_card_id       = ${rateCardId}`);
}
