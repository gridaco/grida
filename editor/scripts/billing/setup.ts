// Idempotent substrate setup for Stripe (test mode) and Metronome.
// Both match-or-create by stable id; safe to re-run after `supabase db reset`.
//
// Env loading + the explicit confirmation prompt live in `cli.ts`. These
// functions assume `process.env` is already populated.

import { requireEnv, requireStripeTestKey } from "./_env";

// ---------------------------------------------------------------------------
// Stripe — products + prices + Customer Portal config
//
// One Stripe product per plan; two prices per product (monthly + annual).
// Annual prices encode the 20% discount in `unit_amount` (no separate
// coupon line). Catalogue gets one row per (plan, interval) pair, keyed
// `plan.<name>` for monthly and `plan.<name>.annual` for annual.
// ---------------------------------------------------------------------------

export async function setupStripe(): Promise<void> {
  requireStripeTestKey();

  const { stripe } = await import("../../lib/billing");
  const { service_role } = await import("../../lib/supabase/server");
  const { PAID_PLAN_LIST, price_catalogue_id } =
    await import("../../lib/billing/plans");
  type Interval = "month" | "year";
  type CatalogueId =
    | "plan.pro"
    | "plan.team"
    | "plan.pro.annual"
    | "plan.team.annual";

  const PRODUCTS = Object.fromEntries(
    PAID_PLAN_LIST.map((p) => [
      p.id,
      {
        name: `Grida ${p.name}`,
        description: `Grida ${p.name}: $${p.monthly_cents / 100}/mo or $${p.annual_cents / 100}/yr (20% off).`,
        product_grida_id: `plan.${p.id}` as `plan.${"pro" | "team"}`,
      },
    ])
  ) as Record<
    "pro" | "team",
    {
      name: string;
      description: string;
      product_grida_id: `plan.${"pro" | "team"}`;
    }
  >;

  const PRICES = PAID_PLAN_LIST.flatMap((p) => [
    {
      product: PRODUCTS[p.id],
      catalogue_id: price_catalogue_id(p.id, "month") as CatalogueId,
      interval: "month" as Interval,
      unit_amount_cents: p.monthly_cents,
      nickname: `${p.name} monthly`,
    },
    {
      product: PRODUCTS[p.id],
      catalogue_id: price_catalogue_id(p.id, "year") as CatalogueId,
      interval: "year" as Interval,
      unit_amount_cents: p.annual_cents,
      nickname: `${p.name} annual`,
    },
  ]);

  // We list+filter rather than products.search because search is eventually
  // consistent and can miss a product we created seconds ago.
  const ensureProduct = async (
    p: (typeof PRODUCTS)["pro"]
  ): Promise<string> => {
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
    spec: (typeof PRICES)[number]
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
  const setupPortal = async (wired: {
    pro: {
      product_id: string;
      monthly_price_id: string;
      annual_price_id: string;
    };
    team: {
      product_id: string;
      monthly_price_id: string;
      annual_price_id: string;
    };
  }): Promise<string> => {
    const config = {
      business_profile: { headline: "Grida billing" },
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
          products: [
            {
              product: wired.pro.product_id,
              prices: [wired.pro.monthly_price_id, wired.pro.annual_price_id],
            },
            {
              product: wired.team.product_id,
              prices: [wired.team.monthly_price_id, wired.team.annual_price_id],
            },
          ],
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
  const [pro_product_id, team_product_id] = await Promise.all([
    ensureProduct(PRODUCTS.pro),
    ensureProduct(PRODUCTS.team),
  ]);
  const productIdFor = (p: (typeof PRODUCTS)["pro"]) =>
    p === PRODUCTS.pro ? pro_product_id : team_product_id;

  const priceIds = await Promise.all(
    PRICES.map(async (spec) => {
      const id = await ensurePrice(productIdFor(spec.product), spec);
      await writeCatalogue(spec.catalogue_id, productIdFor(spec.product), id);
      return { catalogue_id: spec.catalogue_id, price_id: id };
    })
  );

  const idByCatalogue = (id: CatalogueId) => {
    const found = priceIds.find((p) => p.catalogue_id === id);
    if (!found) throw new Error(`missing price for ${id}`);
    return found.price_id;
  };

  const wired = {
    pro: {
      product_id: pro_product_id,
      monthly_price_id: idByCatalogue("plan.pro"),
      annual_price_id: idByCatalogue("plan.pro.annual"),
    },
    team: {
      product_id: team_product_id,
      monthly_price_id: idByCatalogue("plan.team"),
      annual_price_id: idByCatalogue("plan.team.annual"),
    },
  };

  const portal_config_id = await setupPortal(wired);
  console.log("[stripe] done");
  console.log(JSON.stringify({ ...wired, portal_config_id }, null, 2));
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
