#!/usr/bin/env -S pnpm tsx
// Idempotent Stripe test-mode setup: products, prices, and Customer
// Portal config. Match-or-create by `metadata.grida_billing_id`. Writes the
// resulting Stripe ids into `grida_billing.product_catalogue`.
//
// Run from the repo root:
//   pnpm tsx editor/scripts/billing/setup-stripe-test.ts
//
// Refuses to run unless STRIPE_SECRET_KEY starts with `sk_test_` and
// BILLING_TEST_MODE=true. Reads env from (in precedence order):
//   process.env > .env.test.local > .env.test > .env.local

import * as fs from "node:fs";
import * as path from "node:path";
// Type-only — erased at compile time, so no runtime touch of lib/billing.
import type { Stripe } from "../../lib/billing";

// Env must be loaded before any import touches `lib/billing`, which throws on
// missing STRIPE_SECRET_KEY / SUPABASE_* at module load.
function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
const editorDir = path.resolve(__dirname, "..", "..");
loadEnvFile(path.join(editorDir, ".env.test.local"));
loadEnvFile(path.join(editorDir, ".env.test"));
loadEnvFile(path.join(editorDir, ".env.local"));

async function main(): Promise<void> {
  const sk = process.env.STRIPE_SECRET_KEY ?? "";
  if (!sk.startsWith("sk_test_")) {
    throw new Error("Refusing: STRIPE_SECRET_KEY must start with 'sk_test_'.");
  }
  if (process.env.BILLING_TEST_MODE !== "true") {
    throw new Error("Refusing: BILLING_TEST_MODE must be 'true'.");
  }

  const { stripe } = await import("../../lib/billing");
  const { service_role } = await import("../../lib/supabase/server");

  // -----------------------------------------------------------------------
  // Plan products + prices (monthly + annual)
  // -----------------------------------------------------------------------
  //
  // One Stripe product per plan ("Grida Pro", "Grida Team"); two prices per
  // product (monthly + annual). Annual prices encode the 20% discount in
  // `unit_amount` directly (no separate coupon line). The catalogue gets
  // one row per (plan, interval) pair, keyed `plan.<name>` for monthly
  // and `plan.<name>.annual` for annual.
  //
  // Numeric prices come from `lib/billing/plans.ts` (single source of
  // truth) — never hardcode them here.

  const { PAID_PLAN_LIST, price_catalogue_id } =
    await import("../../lib/billing/plans");
  type Interval = "month" | "year";

  type PlanProduct = {
    name: string;
    description: string;
    product_grida_id: `plan.${"pro" | "team"}`;
  };

  type PriceSpec = {
    catalogue_id:
      | "plan.pro"
      | "plan.team"
      | "plan.pro.annual"
      | "plan.team.annual";
    interval: Interval;
    unit_amount_cents: number;
    nickname: string;
  };

  const PRODUCTS = Object.fromEntries(
    PAID_PLAN_LIST.map((p): [typeof p.id, PlanProduct] => [
      p.id,
      {
        name: `Grida ${p.name}`,
        description: `Grida ${p.name}: $${p.monthly_cents / 100}/mo or $${
          p.annual_cents / 100
        }/yr (20% off).`,
        product_grida_id: `plan.${p.id}`,
      },
    ])
  ) as Record<"pro" | "team", PlanProduct>;

  const PRICES: { product: PlanProduct; price: PriceSpec }[] =
    PAID_PLAN_LIST.flatMap((p) => [
      {
        product: PRODUCTS[p.id],
        price: {
          catalogue_id: price_catalogue_id(p.id, "month"),
          interval: "month" as const,
          unit_amount_cents: p.monthly_cents,
          nickname: `${p.name} monthly`,
        },
      },
      {
        product: PRODUCTS[p.id],
        price: {
          catalogue_id: price_catalogue_id(p.id, "year"),
          interval: "year" as const,
          unit_amount_cents: p.annual_cents,
          nickname: `${p.name} annual`,
        },
      },
    ]);

  // We list+filter instead of products.search because search is eventually
  // consistent and can miss a product we created seconds ago, breaking
  // idempotency on the second run.
  async function ensureProduct(p: PlanProduct): Promise<string> {
    const list = await stripe.products.list({ active: true, limit: 100 });
    const existing = list.data.find(
      (x) => x.metadata?.grida_billing_id === p.product_grida_id
    );
    if (existing) {
      console.log(
        `[stripe-setup] reusing product ${existing.id} (${p.product_grida_id})`
      );
      return existing.id;
    }
    const created = await stripe.products.create({
      name: p.name,
      description: p.description,
      metadata: { grida_billing_id: p.product_grida_id },
    });
    console.log(
      `[stripe-setup] created product ${created.id} (${p.product_grida_id})`
    );
    return created.id;
  }

  async function ensurePrice(
    product_id: string,
    spec: PriceSpec
  ): Promise<string> {
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
        `[stripe-setup] reusing price ${existing.id} (${spec.catalogue_id} $${spec.unit_amount_cents / 100}/${spec.interval})`
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
      `[stripe-setup] created price ${created.id} (${spec.catalogue_id} $${spec.unit_amount_cents / 100}/${spec.interval})`
    );
    return created.id;
  }

  async function writeCatalogue(
    catalogue_id: PriceSpec["catalogue_id"],
    product_id: string,
    price_id: string
  ): Promise<void> {
    const { error } = await service_role.workspace.rpc(
      "fn_billing_setup_product",
      {
        p_grida_billing_id: catalogue_id,
        p_stripe_product_id: product_id,
        p_stripe_price_id: price_id,
      }
    );
    if (error) {
      throw new Error(`writeCatalogue ${catalogue_id}: ${error.message}`);
    }
  }

  // -----------------------------------------------------------------------
  // Customer Portal config
  // -----------------------------------------------------------------------

  // `proration_behavior=always_invoice` immediately invoices the prorated
  // difference on a price change (including monthly ↔ annual on the same
  // plan) rather than deferring to the next invoice. Downgrades still
  // prorate (Stripe credits the unused portion to the Customer Balance).
  type ProductWired = {
    product_id: string;
    monthly_price_id: string;
    annual_price_id: string;
  };

  async function setupPortal(wired: {
    pro: ProductWired;
    team: ProductWired;
  }): Promise<string> {
    type ConfigParams = Stripe.BillingPortal.ConfigurationCreateParams;
    const config: ConfigParams = {
      business_profile: { headline: "Grida billing" },
      features: {
        // We never expose the generic portal dashboard. Every portal session
        // we open is a deep-link `flow_data` session scoped to one intent.
        // The features below have to be `enabled` for their corresponding
        // flow_data types to work, but with no generic portal entry point
        // the user never reaches the dashboard anyway.
        //
        // Disabled: customer_update (no flow_data type for email/profile
        // edits; we don't want a section the user can't control from our UI).
        subscription_cancel: {
          enabled: true,
          mode: "at_period_end",
          proration_behavior: "none",
        },
        customer_update: { enabled: false },
        payment_method_update: { enabled: true },
        invoice_history: { enabled: true },
        subscription_update: {
          enabled: true,
          default_allowed_updates: ["price"],
          proration_behavior: "always_invoice",
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
        config as Stripe.BillingPortal.ConfigurationUpdateParams
      );
      console.log(`[stripe-setup] updated portal config ${updated.id}`);
      return updated.id;
    }

    const created = await stripe.billingPortal.configurations.create(config);
    console.log(`[stripe-setup] created portal config ${created.id}`);
    return created.id;
  }

  console.log("[stripe-setup] starting");

  // Provision both products in parallel, then their 4 prices in parallel.
  const [pro_product_id, team_product_id] = await Promise.all([
    ensureProduct(PRODUCTS.pro),
    ensureProduct(PRODUCTS.team),
  ]);

  const productIdFor = (p: PlanProduct): string =>
    p === PRODUCTS.pro ? pro_product_id : team_product_id;

  const priceIds = await Promise.all(
    PRICES.map(async ({ product, price }) => {
      const id = await ensurePrice(productIdFor(product), price);
      await writeCatalogue(price.catalogue_id, productIdFor(product), id);
      return { catalogue_id: price.catalogue_id, price_id: id };
    })
  );

  const idByCatalogue = (id: PriceSpec["catalogue_id"]): string => {
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
  console.log("[stripe-setup] done");
  console.log(JSON.stringify({ ...wired, portal_config_id }, null, 2));
}

main().catch((err) => {
  console.error("[stripe-setup] failed:", err?.message ?? err);
  process.exit(1);
});
