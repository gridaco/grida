// Metronome integration — client + service layer.
//
//   Metronome: source of truth for credit balance + drain order.
//   Stripe:    source of truth for money. Metronome facilitates the charge.
//   Our DB:    source of truth for the gate decision (`customer_entitled`)
//              and a cached balance. Updated by webhooks; read by the gate.
//
// All service functions take `organizationId: number` and persist Metronome-
// side ids on `grida_billing.account`. Idempotent end-to-end.
//
// Architectural rationale: docs/wg/platform/billing/ai-credits.md.

import * as crypto from "node:crypto";
import Metronome from "@metronome/sdk";
import { service_role } from "../supabase/server";
import { stripe } from "./index";
import {
  AI_GATE_FLOOR_CENTS,
  AUTO_RELOAD_RECHARGE_MAX_CENTS,
  AUTO_RELOAD_RECHARGE_MIN_CENTS,
  AUTO_RELOAD_THRESHOLD_MIN_CENTS,
  TOPUP_MAX_CENTS,
  TOPUP_MIN_CENTS,
} from "./fees";

// ---------------------------------------------------------------------------
// lazy client (mirrors the lazy Stripe Proxy in `index.ts`)
// ---------------------------------------------------------------------------

let _client: Metronome | null = null;

function getClient(): Metronome {
  if (_client) return _client;
  const token = process.env.METRONOME_API_TOKEN;
  if (!token) {
    throw new Error("METRONOME_API_TOKEN is required.");
  }
  _client = new Metronome({ bearerToken: token });
  return _client;
}

export const metronome: Metronome = new Proxy({} as Metronome, {
  get(_target, prop) {
    return Reflect.get(getClient(), prop);
  },
}) as Metronome;

export type { Metronome };

// ---------------------------------------------------------------------------
// errors
// ---------------------------------------------------------------------------

export class BillingMetronomeError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number = 500
  ) {
    super(message);
    this.name = "BillingMetronomeError";
  }
}

// ---------------------------------------------------------------------------
// substrate (named resources created out-of-band by cli.ts setup:metronome)
// ---------------------------------------------------------------------------

const SUBSTRATE_NAMES = {
  metric: "Grida AI Usage",
  usageProduct: "Grida AI Usage",
  creditProduct: "Grida AI Credits",
  rateCard: "Grida AI Sandbox",
  eventType: "ai.usage",
  costProperty: "cost_mills",
} as const;

type Substrate = {
  metricId: string;
  usageProductId: string;
  creditProductId: string;
  rateCardId: string;
  /** USD-cents credit type id (used by alerts API). Discovered from rate card. */
  creditTypeId: string;
  eventType: string;
  costProperty: string;
};

let _substrate: Substrate | null = null;

export async function getSubstrate(): Promise<Substrate> {
  if (_substrate) return _substrate;

  let metricId: string | undefined;
  for await (const m of metronome.v1.billableMetrics.list()) {
    if (m.name === SUBSTRATE_NAMES.metric) {
      metricId = m.id;
      break;
    }
  }

  let usageProductId: string | undefined;
  let creditProductId: string | undefined;
  for await (const p of metronome.v1.contracts.products.list({
    archive_filter: "NOT_ARCHIVED",
  })) {
    if (
      p.current?.name === SUBSTRATE_NAMES.usageProduct &&
      p.type === "USAGE"
    ) {
      usageProductId = p.id;
    } else if (
      p.current?.name === SUBSTRATE_NAMES.creditProduct &&
      p.type === "FIXED"
    ) {
      creditProductId = p.id;
    }
  }

  let rateCardId: string | undefined;
  let creditTypeId: string | undefined;
  for await (const r of metronome.v1.contracts.rateCards.list({ body: {} })) {
    if (r.name === SUBSTRATE_NAMES.rateCard) {
      rateCardId = r.id;
      // Each rate card declares a fiat credit type (USD = 2714e483-…).
      // The SDK type doesn't expose this field; the API does.
      const r2 = r as unknown as {
        fiat_credit_type?: { id?: string };
        fiat_credit_type_id?: string;
        credit_type?: { id?: string };
      };
      creditTypeId =
        r2.fiat_credit_type?.id ?? r2.fiat_credit_type_id ?? r2.credit_type?.id;
      break;
    }
  }

  if (!metricId || !usageProductId || !creditProductId || !rateCardId) {
    throw new BillingMetronomeError(
      "Metronome substrate missing. Run editor/scripts/billing/cli.ts setup:metronome.",
      "substrate_missing"
    );
  }
  if (!creditTypeId) {
    // USD (cents) — the universal Metronome fiat credit type.
    creditTypeId = "2714e483-4ff1-48e4-9e25-ac732e8f24f2";
  }

  _substrate = {
    metricId,
    usageProductId,
    creditProductId,
    rateCardId,
    creditTypeId,
    eventType: SUBSTRATE_NAMES.eventType,
    costProperty: SUBSTRATE_NAMES.costProperty,
  };
  return _substrate;
}

// ---------------------------------------------------------------------------
// drain-order priorities (see docs/wg/platform/billing/ai-credits.md)
// ---------------------------------------------------------------------------

export const COMMIT_PRIORITY = {
  /** Promo / refund / manual grant. Drains first. */
  PROMO: 50,
  /** Stripe-charged top-up. Drains last; never expires. */
  TOPUP: 90,
} as const;

// ---------------------------------------------------------------------------
// Stripe Checkout `metadata.kind` discriminants. The webhook handler
// dispatches on these strings; both producers (in `_actions.ts`) and the
// consumer (`handleAiCreditCheckoutCompleted` below) MUST agree.
// ---------------------------------------------------------------------------

export const AI_CHECKOUT_KIND = {
  TOPUP: "ai_topup",
  AUTO_RELOAD_ENABLE: "ai_auto_reload_enable",
} as const;
export type AiCheckoutKind =
  (typeof AI_CHECKOUT_KIND)[keyof typeof AI_CHECKOUT_KIND];

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Sentinel "never expires" timestamp on commit access schedules. */
export const FAR_FUTURE = new Date(Date.UTC(2099, 0, 1)).toISOString();

/** Round down to top of hour. Metronome wants schedule-item starts aligned. */
export function hourFloor(d: Date = new Date()): string {
  const t = new Date(d);
  t.setUTCMinutes(0, 0, 0);
  return t.toISOString();
}

// Metronome ingest_alias. Composing in `provisioning_uid` makes orphan
// cloud-side customers from prior `supabase db reset` runs inert.
function aliasFor(organizationId: number, provisioningUid: string): string {
  return `grida-org-${organizationId}-${provisioningUid}`;
}

// ---------------------------------------------------------------------------
// live state — read from Metronome (source of truth)
// ---------------------------------------------------------------------------

// Live contract snapshot from Metronome. DB is never ahead of this.
export type ContractLiveState = {
  contractId: string;
  customerId: string;
  autoReload: {
    enabled: boolean;
    thresholdCents: number | null;
    rechargeToCents: number | null;
  } | null;
  balanceCents: number;
  stripeBillingConfigured: boolean;
};

export async function readContractLive(
  customerId: string,
  contractId: string
): Promise<ContractLiveState> {
  const contract = await metronome.v2.contracts.retrieve({
    customer_id: customerId,
    contract_id: contractId,
  });
  // Both fields below exist on the API response but aren't in the SDK type.
  const data = contract.data as unknown as {
    prepaid_balance_threshold_configuration?: {
      is_enabled?: boolean;
      threshold_amount?: number;
      recharge_to_amount?: number;
    };
    customer_billing_provider_configuration?: { billing_provider?: string };
  };

  const cfg = data.prepaid_balance_threshold_configuration;
  const autoReload = cfg
    ? {
        enabled: !!cfg.is_enabled,
        thresholdCents:
          typeof cfg.threshold_amount === "number"
            ? cfg.threshold_amount
            : null,
        rechargeToCents:
          typeof cfg.recharge_to_amount === "number"
            ? cfg.recharge_to_amount
            : null,
      }
    : null;

  const stripeBillingConfigured =
    data.customer_billing_provider_configuration?.billing_provider === "stripe";

  let balanceCents = 0;
  for await (const b of metronome.v1.contracts.listBalances({
    customer_id: customerId,
    covering_date: new Date().toISOString(),
    include_balance: true,
  })) {
    balanceCents += (b as unknown as { balance?: number }).balance ?? 0;
  }

  return {
    contractId,
    customerId,
    autoReload,
    balanceCents,
    stripeBillingConfigured,
  };
}

// ---------------------------------------------------------------------------
// account row helpers
// ---------------------------------------------------------------------------

type AccountRow = {
  organization_id: number;
  stripe_customer_id: string | null;
  metronome_customer_id: string | null;
  metronome_contract_id: string | null;
  customer_entitled: boolean;
  cached_balance_cents: number;
  cached_balance_at: string | null;
  auto_reload_enabled: boolean;
  auto_reload_threshold_cents: number | null;
  auto_reload_amount_cents: number | null;
  provisioning_uid: string;
};

// `grida_billing` is intentionally not REST-exposed (see supabase/config.toml).
// All read/write goes through `public.fn_billing_*` RPCs, mirroring how
// `grida_billing.account` is otherwise accessed in this repo.

export async function getAccount(
  organizationId: number
): Promise<AccountRow | null> {
  const { data, error } = await service_role.workspace.rpc(
    "fn_billing_get_metronome_account" as never,
    { p_org: organizationId } as never
  );
  if (error) {
    throw new BillingMetronomeError(`getAccount: ${error.message}`, "db_error");
  }
  const rows = (data ?? []) as AccountRow[];
  return rows[0] ?? null;
}

async function rpcOrThrow(
  label: string,
  fn: string,
  params: Record<string, unknown>
): Promise<void> {
  const { error } = await service_role.workspace.rpc(
    fn as never,
    params as never
  );
  if (error) {
    throw new BillingMetronomeError(`${label}: ${error.message}`, "db_error");
  }
}

const setMetronomeIds = (org: number, customer: string, contract: string) =>
  rpcOrThrow("setMetronomeIds", "fn_billing_set_metronome_ids", {
    p_org: org,
    p_customer_id: customer,
    p_contract_id: contract,
  });

const setBalanceCache = (org: number, cents: number, entitled: boolean) =>
  rpcOrThrow("setBalanceCache", "fn_billing_set_balance_cache", {
    p_org: org,
    p_balance_cents: cents,
    p_entitled: entitled,
  });

const setAutoReloadCache = (
  org: number,
  enabled: boolean,
  thresholdCents: number | null,
  amountCents: number | null
) =>
  rpcOrThrow("setAutoReloadCache", "fn_billing_set_auto_reload", {
    p_org: org,
    p_enabled: enabled,
    p_threshold_cents: thresholdCents,
    p_amount_cents: amountCents,
  });

// ---------------------------------------------------------------------------
// provisioning
// ---------------------------------------------------------------------------

export type ProvisionResult = {
  customerId: string;
  contractId: string;
  alias: string;
  created: { customer: boolean; contract: boolean };
};

// Match-or-create the Metronome customer + contract for an org. Idempotent.
// If the org has a stripe_customer_id (or one is passed), it's wired into the
// Metronome customer's `customer_billing_provider_configurations`.
export async function provisionOrg(
  organizationId: number,
  opts: { stripeCustomerId?: string } = {}
): Promise<ProvisionResult> {
  const sub = await getSubstrate();
  const account = await getAccount(organizationId);
  if (!account) {
    throw new BillingMetronomeError(
      `No grida_billing.account row for org ${organizationId}.`,
      "account_missing"
    );
  }
  const alias = aliasFor(organizationId, account.provisioning_uid);

  const stripeCustomerId =
    opts.stripeCustomerId ?? account.stripe_customer_id ?? undefined;

  let customerId = account.metronome_customer_id ?? undefined;
  let createdCustomer = false;
  if (!customerId) {
    // Look up by alias before create — survives partial-state from earlier runs.
    for await (const c of metronome.v1.customers.list({
      ingest_alias: alias,
    })) {
      customerId = c.id;
      break;
    }
  }
  if (!customerId) {
    const created = await metronome.v1.customers.create({
      name: alias,
      ingest_aliases: [alias],
      ...(stripeCustomerId
        ? {
            customer_billing_provider_configurations: [
              {
                billing_provider: "stripe",
                delivery_method: "direct_to_billing_provider",
                configuration: {
                  stripe_customer_id: stripeCustomerId,
                  stripe_collection_method: "charge_automatically",
                },
              },
            ],
          }
        : {}),
    });
    customerId = created.data.id;
    createdCustomer = true;
  }

  let contractId = account.metronome_contract_id ?? undefined;
  let createdContract = false;
  if (!contractId) {
    const list = await metronome.v2.contracts.list({ customer_id: customerId });
    const contracts = (list.data ?? []) as Array<{
      id: string;
      archived_at?: string | null;
    }>;
    const open = contracts.find((c) => !c.archived_at);
    if (open) contractId = open.id;
  }
  if (!contractId) {
    const now = hourFloor();
    const created = await metronome.v1.contracts.create({
      customer_id: customerId,
      rate_card_id: sub.rateCardId,
      starting_at: now,
      name: `Grida AI L1 contract`,
      ...(stripeCustomerId
        ? {
            billing_provider_configuration: {
              billing_provider: "stripe",
              delivery_method: "direct_to_billing_provider",
            },
          }
        : {}),
    });
    contractId = created.data.id;
    createdContract = true;
  }

  if (
    customerId !== account.metronome_customer_id ||
    contractId !== account.metronome_contract_id
  ) {
    await setMetronomeIds(organizationId, customerId, contractId);
  }

  // Backfill the Stripe billing-provider config for customers + contracts
  // created before Stripe was linked. Both are required for Stripe-gated
  // commits. setBillingConfigurations + add_billing_provider_configuration_update
  // are both idempotent on existing config (treated as "already exists").
  if (stripeCustomerId) {
    try {
      await metronome.v1.customers.setBillingConfigurations({
        data: [
          {
            customer_id: customerId,
            billing_provider: "stripe",
            delivery_method: "direct_to_billing_provider",
            configuration: {
              stripe_customer_id: stripeCustomerId,
              stripe_collection_method: "charge_automatically",
            },
          },
        ],
      });
    } catch (err) {
      const msg = (err as Error).message;
      if (!/already|exists|configured/i.test(msg)) throw err;
    }

    if (!createdContract) {
      try {
        await metronome.v2.contracts.edit({
          customer_id: customerId,
          contract_id: contractId,
          add_billing_provider_configuration_update: {
            billing_provider_configuration: {
              billing_provider: "stripe",
              delivery_method: "direct_to_billing_provider",
            },
            schedule: { effective_at: "START_OF_CURRENT_PERIOD" },
          },
        });
      } catch (err) {
        const msg = (err as Error).message;
        // Doc: "Currently only supports adding a billing provider
        // configuration to a contract that does not already have one."
        if (!/already|exists|configured/i.test(msg)) throw err;
      }
    }
  }

  // Cookbook-mandated $0 depletion alert. Best-effort — don't fail
  // provision if the alert provision errors (we can re-attempt manually).
  try {
    await provisionLowBalanceAlert(organizationId, 0);
  } catch (err) {
    console.warn(
      `[billing.provisionOrg] depletion alert provisioning failed: ${(err as Error).message}`
    );
  }

  return {
    customerId,
    contractId,
    alias,
    created: { customer: createdCustomer, contract: createdContract },
  };
}

// ---------------------------------------------------------------------------
// commits — top-up flows
// ---------------------------------------------------------------------------

// PREPAID commit with no Stripe charge — dev / promo / refund / manual grant.
export async function addComplimentaryCommit(
  organizationId: number,
  amountCents: number,
  opts: { name?: string; priority?: number } = {}
): Promise<{ contractId: string }> {
  const sub = await getSubstrate();
  const { customerId, contractId } = await provisionOrg(organizationId);
  const now = hourFloor();

  await metronome.v2.contracts.edit({
    customer_id: customerId,
    contract_id: contractId,
    add_commits: [
      {
        product_id: sub.creditProductId,
        applicable_product_ids: [sub.usageProductId],
        type: "PREPAID",
        name: opts.name ?? `Promo $${(amountCents / 100).toFixed(2)}`,
        priority: opts.priority ?? COMMIT_PRIORITY.PROMO,
        access_schedule: {
          schedule_items: [
            {
              amount: amountCents,
              starting_at: now,
              ending_before: FAR_FUTURE,
            },
          ],
        },
      },
    ],
  });

  return { contractId };
}

// Stripe-charged PREPAID commit. Metronome charges the customer's default
// payment method; on success the commit balance becomes available. Webhook
// fires the outcome. Default priority is TOPUP (drains last after promos).
export async function addStripeChargedCommit(
  organizationId: number,
  amountCents: number,
  opts: { name?: string; priority?: number } = {}
): Promise<{ contractId: string }> {
  if (amountCents < TOPUP_MIN_CENTS || amountCents > TOPUP_MAX_CENTS) {
    throw new BillingMetronomeError(
      `Top-up must be between $${TOPUP_MIN_CENTS / 100} and $${TOPUP_MAX_CENTS / 100}.`,
      "invalid_amount",
      400
    );
  }
  const sub = await getSubstrate();
  const account = await getAccount(organizationId);
  if (!account?.stripe_customer_id) {
    throw new BillingMetronomeError(
      "Org has no linked Stripe customer; cannot Stripe-charge a commit.",
      "stripe_customer_missing",
      409
    );
  }
  const { customerId, contractId } = await provisionOrg(organizationId, {
    stripeCustomerId: account.stripe_customer_id,
  });
  const now = hourFloor();

  await metronome.v2.contracts.edit({
    customer_id: customerId,
    contract_id: contractId,
    add_commits: [
      {
        product_id: sub.creditProductId,
        applicable_product_ids: [sub.usageProductId],
        type: "PREPAID",
        name: opts.name ?? `Top-up $${(amountCents / 100).toFixed(2)}`,
        priority: opts.priority ?? COMMIT_PRIORITY.TOPUP,
        access_schedule: {
          schedule_items: [
            {
              amount: amountCents,
              starting_at: now,
              ending_before: FAR_FUTURE,
            },
          ],
        },
        invoice_schedule: {
          schedule_items: [{ amount: amountCents, timestamp: now }],
        },
        payment_gate_config: {
          payment_gate_type: "STRIPE",
          stripe_config: { payment_type: "PAYMENT_INTENT" },
          tax_type: "NONE",
        },
      },
    ],
  });

  return { contractId };
}

// ---------------------------------------------------------------------------
// auto-reload (threshold-based recharge)
// ---------------------------------------------------------------------------

// Enable auto-reload. Write → read → reconcile pattern so the DB cache is
// never ahead of Metronome. Returns the live state for the caller to verify.
//
// Whole-dollar amounts: smaller recharges are dominated by the markup
// formula's fixed-cost component; larger ones exceed the safe envelope of
// `lib/billing/fees.ts > totalChargeForCredit`.
export async function setAutoReload(
  organizationId: number,
  thresholdCents: number,
  rechargeAmountCents: number
): Promise<ContractLiveState> {
  if (
    thresholdCents < AUTO_RELOAD_THRESHOLD_MIN_CENTS ||
    thresholdCents % 100 !== 0
  ) {
    throw new BillingMetronomeError(
      `Auto-reload threshold must be a whole number of dollars and at least $${AUTO_RELOAD_THRESHOLD_MIN_CENTS / 100}.`,
      "invalid_amount",
      400
    );
  }
  if (
    rechargeAmountCents < AUTO_RELOAD_RECHARGE_MIN_CENTS ||
    rechargeAmountCents > AUTO_RELOAD_RECHARGE_MAX_CENTS ||
    rechargeAmountCents % 100 !== 0
  ) {
    throw new BillingMetronomeError(
      `Auto-reload recharge target must be a whole number of dollars between $${AUTO_RELOAD_RECHARGE_MIN_CENTS / 100} and $${AUTO_RELOAD_RECHARGE_MAX_CENTS / 100}.`,
      "invalid_amount",
      400
    );
  }
  if (rechargeAmountCents <= thresholdCents) {
    throw new BillingMetronomeError(
      "Recharge target must be greater than the threshold.",
      "invalid_amount",
      400
    );
  }
  const sub = await getSubstrate();
  const account = await getAccount(organizationId);
  if (!account?.stripe_customer_id) {
    throw new BillingMetronomeError(
      "Org has no linked Stripe customer; cannot enable auto-reload.",
      "stripe_customer_missing",
      409
    );
  }
  const { customerId, contractId } = await provisionOrg(organizationId, {
    stripeCustomerId: account.stripe_customer_id,
  });

  // First call uses `add_*`; re-enable after disable must use `update_*`.
  // Both branches set `payment_type: "INVOICE"` so Stripe creates a real
  // Invoice object for each silent recharge — without it, the recharge
  // routes via raw PaymentIntent and never appears in `stripe.invoices.list`.
  // The edit branch also (re-)pushes payment_gate_config so any pre-existing
  // contract still on PAYMENT_INTENT migrates the next time the user touches
  // their auto-reload settings.
  const stripePaymentGate = {
    payment_gate_type: "STRIPE" as const,
    stripe_config: { payment_type: "INVOICE" as const },
    tax_type: "NONE" as const,
  };
  const before = await readContractLive(customerId, contractId);

  if (before.autoReload) {
    await metronome.v2.contracts.edit({
      customer_id: customerId,
      contract_id: contractId,
      update_prepaid_balance_threshold_configuration: {
        is_enabled: true,
        threshold_amount: thresholdCents,
        recharge_to_amount: rechargeAmountCents,
        payment_gate_config: stripePaymentGate,
      },
    });
  } else {
    // SDK type for `add_prepaid_balance_threshold_configuration.commit` is
    // narrower than the API accepts (priority/name on a threshold-recharge
    // commit are valid but not in the type). Cast through unknown.
    type EditParams = Parameters<typeof metronome.v2.contracts.edit>[0];
    await metronome.v2.contracts.edit({
      customer_id: customerId,
      contract_id: contractId,
      add_prepaid_balance_threshold_configuration: {
        threshold_amount: thresholdCents,
        recharge_to_amount: rechargeAmountCents,
        is_enabled: true,
        payment_gate_config: stripePaymentGate,
        commit: {
          product_id: sub.creditProductId,
          applicable_product_ids: [sub.usageProductId],
          priority: COMMIT_PRIORITY.TOPUP,
          name: "Auto-reload top-up",
        },
      } as unknown as EditParams["add_prepaid_balance_threshold_configuration"],
    });
  }

  const after = await readContractLive(customerId, contractId);
  await reconcileAccountFromLive(organizationId, after);
  return after;
}

export async function disableAutoReload(
  organizationId: number
): Promise<ContractLiveState | null> {
  const account = await getAccount(organizationId);
  if (!account?.metronome_contract_id || !account?.metronome_customer_id) {
    // Nothing on Metronome side; keep local cache as-is (already null/false).
    return null;
  }
  try {
    await metronome.v2.contracts.edit({
      customer_id: account.metronome_customer_id,
      contract_id: account.metronome_contract_id,
      update_prepaid_balance_threshold_configuration: {
        is_enabled: false,
      },
    });
  } catch {
    // Best-effort: if there's no config to update, fall through.
  }
  const after = await readContractLive(
    account.metronome_customer_id,
    account.metronome_contract_id
  );
  await reconcileAccountFromLive(organizationId, after);
  return after;
}

// Single place that projects Metronome's view of the contract into the DB
// cache. Called after every mutation and from the webhook projector.
export async function reconcileAccountFromLive(
  organizationId: number,
  live: ContractLiveState
): Promise<void> {
  // `cached_balance_cents` is `bigint` in the DB — the cache exists to
  // serve sub-100ms gate checks at integer-cent precision. Metronome's
  // live balance can be fractional (we ingest fractional `cost_mills`),
  // so floor to the nearest integer cent here. Round DOWN, not up:
  // overstating the cache could push a borderline account below the
  // floor and gate it prematurely. Display surfaces still use the
  // exact `live.balanceCents` directly.
  const balanceCentsInt = Math.floor(live.balanceCents);
  await setBalanceCache(
    organizationId,
    balanceCentsInt,
    balanceCentsInt >= AI_GATE_FLOOR_CENTS
  );
  await setAutoReloadCache(
    organizationId,
    live.autoReload?.enabled ?? false,
    live.autoReload?.thresholdCents ?? null,
    live.autoReload?.rechargeToCents ?? null
  );
}

// ---------------------------------------------------------------------------
// alerts ($0 balance signal — drives entitlement-flip-to-false)
// ---------------------------------------------------------------------------

// Configure a low-balance alert at the given threshold. Idempotent — skips
// create if an alert with the same threshold already exists. The projector
// flips entitlement off only on threshold ≤ 0 (depletion).
export async function provisionLowBalanceAlert(
  organizationId: number,
  thresholdCents: number = 0,
  opts: { name?: string } = {}
): Promise<{ created: boolean; alertId?: string }> {
  const account = await getAccount(organizationId);
  if (!account?.metronome_customer_id) {
    throw new BillingMetronomeError(
      "Org has no Metronome customer; provision first.",
      "customer_missing",
      409
    );
  }
  // `customers.alerts.list` returns wrapper objects of the form
  // `{ alert: {id, threshold, type, ...}, customer_status, ... }`. The SDK's
  // public type doesn't expose the customers.alerts namespace yet.
  type AlertWrapper = {
    alert?: { id: string; threshold: number; type: string; name?: string };
    customer_status?: "ok" | "in_alarm" | "evaluating";
    triggered_by?: string | null;
  };
  type AlertsList = {
    list(p: { customer_id: string }): AsyncIterable<AlertWrapper>;
  };
  const customerAlerts = (
    metronome as unknown as { v1: { customers: { alerts: AlertsList } } }
  ).v1.customers.alerts;

  const existing: Array<{ id: string; threshold: number; type: string }> = [];
  try {
    for await (const ca of customerAlerts.list({
      customer_id: account.metronome_customer_id,
    })) {
      const a = ca.alert;
      if (!a) continue;
      existing.push({ id: a.id, threshold: a.threshold, type: a.type });
      if (existing.length >= 50) break;
    }
  } catch {
    // tolerate listing failures; we'll just create
  }
  const match = existing.find(
    (a) =>
      a.threshold === thresholdCents &&
      a.type?.includes("low_remaining") &&
      a.type === "low_remaining_contract_credit_and_commit_balance_reached"
  );
  if (match) return { created: false, alertId: match.id };

  const name =
    opts.name ??
    (thresholdCents === 0
      ? "AI credit balance depleted"
      : `AI credit balance below $${(thresholdCents / 100).toFixed(2)}`);
  const sub = await getSubstrate();
  const created = await metronome.v1.alerts.create({
    name,
    alert_type: "low_remaining_contract_credit_and_commit_balance_reached",
    threshold: thresholdCents,
    customer_id: account.metronome_customer_id,
    credit_type_id: sub.creditTypeId,
  });
  return {
    created: true,
    alertId: (created as unknown as { data?: { id?: string } })?.data?.id,
  };
}

// ---------------------------------------------------------------------------
// alert status read (display)
// ---------------------------------------------------------------------------

export type AlertStatus = {
  id: string;
  name: string;
  /** Numeric threshold in cents (for low_remaining alerts). */
  thresholdCents: number;
  /** Metronome's alert_type string. */
  alertType: string;
  /** Whether the alert is currently above (ok) or below (in_alarm) threshold. */
  status: "ok" | "in_alarm" | "evaluating" | null;
  /** Reason text from Metronome when triggered. */
  triggeredBy?: string | null;
};

// Low-balance alerts attached to the org with current evaluation status.
// Used by the insiders dev page to show which alerts have fired.
export async function getAlertsStatus(
  organizationId: number
): Promise<AlertStatus[]> {
  const account = await getAccount(organizationId);
  if (!account?.metronome_customer_id) return [];

  // SDK gap — same as in provisionLowBalanceAlert.
  type AlertWrapper = {
    alert?: { id: string; threshold: number; type: string; name: string };
    customer_status?: "ok" | "in_alarm" | "evaluating";
    triggered_by?: string | null;
  };
  type AlertsList = {
    list(p: { customer_id: string }): AsyncIterable<AlertWrapper>;
  };
  const customerAlerts = (
    metronome as unknown as { v1: { customers: { alerts: AlertsList } } }
  ).v1.customers.alerts;

  const out: AlertStatus[] = [];
  try {
    for await (const ca of customerAlerts.list({
      customer_id: account.metronome_customer_id,
    })) {
      const a = ca.alert;
      if (!a) continue;
      // Only surface low-remaining-balance alerts (the ones we provision).
      if (!a.type?.includes("low_remaining")) continue;
      out.push({
        id: a.id,
        name: a.name,
        thresholdCents: a.threshold,
        alertType: a.type,
        status: ca.customer_status ?? null,
        triggeredBy: ca.triggered_by ?? null,
      });
      if (out.length >= 50) break;
    }
  } catch {
    // tolerate listing failures
  }
  out.sort((a, b) => a.thresholdCents - b.thresholdCents);
  return out;
}

// ---------------------------------------------------------------------------
// gate primitive — the seam will call this before every AI request
// ---------------------------------------------------------------------------

export type Entitlement = {
  /** Permitted to call AI. False below floor or before any commit. */
  allowed: boolean;
  reason?: "no_balance" | "below_floor" | "not_provisioned";
  cachedBalanceCents: number;
  cachedAt: string | null;
};

// Sub-100ms gate primitive. Reads grida_billing.account; never calls
// Metronome. Cache is updated by webhooks + the refreshBalance cron.
export async function getEntitlement(
  organizationId: number
): Promise<Entitlement> {
  const account = await getAccount(organizationId);
  if (!account?.metronome_customer_id) {
    return {
      allowed: false,
      reason: "not_provisioned",
      cachedBalanceCents: 0,
      cachedAt: null,
    };
  }
  if (account.cached_balance_cents < AI_GATE_FLOOR_CENTS) {
    return {
      allowed: false,
      reason: "below_floor",
      cachedBalanceCents: account.cached_balance_cents,
      cachedAt: account.cached_balance_at,
    };
  }
  if (!account.customer_entitled) {
    return {
      allowed: false,
      reason: "no_balance",
      cachedBalanceCents: account.cached_balance_cents,
      cachedAt: account.cached_balance_at,
    };
  }
  return {
    allowed: true,
    cachedBalanceCents: account.cached_balance_cents,
    cachedAt: account.cached_balance_at,
  };
}

// Force-sync the local cache from Metronome. Called from webhook handlers
// and from the UI's "refresh" affordance.
export async function refreshBalance(
  organizationId: number
): Promise<{ cents: number; live: ContractLiveState | null }> {
  const account = await getAccount(organizationId);
  if (!account?.metronome_customer_id || !account?.metronome_contract_id) {
    return { cents: 0, live: null };
  }
  const live = await readContractLive(
    account.metronome_customer_id,
    account.metronome_contract_id
  );
  await reconcileAccountFromLive(organizationId, live);
  return { cents: live.balanceCents, live };
}

// ---------------------------------------------------------------------------
// account view (UI primitive — DB cache + live merge + drift)
// ---------------------------------------------------------------------------

export type AccountView = {
  /** DB cache — what the gate reads. */
  db: AccountRow | null;
  /** Live Metronome state — what the UI displays. */
  live: ContractLiveState | null;
  /** Field-level diff. Any `true` = dropped webhook. */
  drift: {
    autoReloadEnabled: boolean;
    autoReloadThresholdCents: boolean;
    autoReloadAmountCents: boolean;
    balanceCents: boolean;
  };
  cacheAgeSeconds: number | null;
};

// UI should prefer `live.*` over `db.*`. The `db` half is exposed for
// diagnostics and to surface drift.
export async function getAccountView(
  organizationId: number
): Promise<AccountView> {
  const db = await getAccount(organizationId);
  let live: ContractLiveState | null = null;
  if (db?.metronome_customer_id && db.metronome_contract_id) {
    try {
      live = await readContractLive(
        db.metronome_customer_id,
        db.metronome_contract_id
      );
    } catch {
      // Surface as null live; UI shows DB cache + a warning.
      live = null;
    }
  }

  const drift = {
    autoReloadEnabled: false,
    autoReloadThresholdCents: false,
    autoReloadAmountCents: false,
    balanceCents: false,
  };
  if (db && live) {
    drift.autoReloadEnabled =
      db.auto_reload_enabled !== (live.autoReload?.enabled ?? false);
    drift.autoReloadThresholdCents =
      (db.auto_reload_threshold_cents ?? null) !==
      (live.autoReload?.thresholdCents ?? null);
    drift.autoReloadAmountCents =
      (db.auto_reload_amount_cents ?? null) !==
      (live.autoReload?.rechargeToCents ?? null);
    drift.balanceCents = db.cached_balance_cents !== live.balanceCents;
  }

  let cacheAgeSeconds: number | null = null;
  if (db?.cached_balance_at) {
    cacheAgeSeconds = Math.max(
      0,
      Math.round((Date.now() - new Date(db.cached_balance_at).getTime()) / 1000)
    );
  }

  return { db, live, drift, cacheAgeSeconds };
}

// ---------------------------------------------------------------------------
// ingest (called from the AI seam after a successful provider call)
// ---------------------------------------------------------------------------

export type IngestResult = { transactionId: string };

// Gate-checked ingest — what the AI seam will call. Throws on gate refusal.
export async function ingestUsageEventGated(
  organizationId: number,
  costMills: number,
  opts: { transactionId?: string } = {}
): Promise<IngestResult & { allowedReason?: string }> {
  const e = await getEntitlement(organizationId);
  if (!e.allowed) {
    throw new BillingMetronomeError(
      `gate: ${e.reason ?? "blocked"} (cache=${e.cachedBalanceCents}¢)`,
      "blocked",
      402
    );
  }
  return ingestUsageEvent(organizationId, costMills, opts);
}

// Ingest a usage event. Metronome dedupes on transactionId for 34 days; the
// seam should pass the provider request id. Optimistic local debit narrows
// the cache-staleness window from "until next webhook" to sub-second. The
// debit RPC also flips entitlement off when crossing the floor.
export async function ingestUsageEvent(
  organizationId: number,
  costMills: number,
  opts: { transactionId?: string } = {}
): Promise<IngestResult> {
  if (costMills < 0) {
    throw new BillingMetronomeError(
      "cost_mills must be non-negative.",
      "invalid_cost",
      400
    );
  }
  const sub = await getSubstrate();
  const account = await getAccount(organizationId);
  if (!account?.metronome_customer_id) {
    throw new BillingMetronomeError(
      `Org ${organizationId} has no Metronome customer; provision first.`,
      "not_provisioned",
      409
    );
  }
  const transactionId = opts.transactionId ?? crypto.randomUUID();
  await metronome.v1.usage.ingest({
    usage: [
      {
        transaction_id: transactionId,
        // Send the canonical UUID rather than an alias — robust to alias
        // namespace changes and one fewer string lookup server-side.
        customer_id: account.metronome_customer_id,
        event_type: sub.eventType,
        timestamp: new Date().toISOString(),
        properties: { [sub.costProperty]: costMills },
      },
    ],
  });

  // Optimistic local debit. mills → cents (round up to avoid under-debiting
  // sub-cent costs that aggregate to real money). Don't fail the ingest
  // if the cache debit fails — webhook reconcile will catch up.
  //
  // Supabase RPC does NOT throw on Postgres errors — it returns
  // `{ data, error }`. We destructure explicitly so PG-level failures
  // (function missing, permission denied, schema mismatch) are logged
  // instead of silently swallowed.
  const costCents = Math.ceil(costMills / 10);
  if (costCents > 0) {
    const { error } = await service_role.workspace.rpc(
      "fn_billing_debit_balance_cache" as never,
      {
        p_org: organizationId,
        p_cents: costCents,
        p_floor_cents: AI_GATE_FLOOR_CENTS,
      } as never
    );
    if (error) {
      console.warn(
        `[billing.ingestUsageEvent] cache debit failed for org=${organizationId}: ${error.message}`
      );
    }
  }

  return { transactionId };
}

// ---------------------------------------------------------------------------
// refund / revoke
// ---------------------------------------------------------------------------

// Shrink a commit's access schedule to already-consumed. For voluntary refunds.
export async function revokeUnusedOnCommit(
  organizationId: number,
  commitId: string
): Promise<{ shrunkTo: number }> {
  const account = await getAccount(organizationId);
  if (!account?.metronome_customer_id) {
    throw new BillingMetronomeError(
      "Org not provisioned in Metronome.",
      "not_provisioned",
      409
    );
  }
  const customerId = account.metronome_customer_id;

  let scheduleItemId: string | undefined;
  let consumed = 0;
  for await (const b of metronome.v1.contracts.listBalances({
    customer_id: customerId,
    include_balance: true,
  })) {
    if (b.id !== commitId) continue;
    const bx = b as unknown as {
      balance?: number;
      access_schedule?: {
        schedule_items?: Array<{ id?: string; amount?: number }>;
      };
    };
    const item = bx.access_schedule?.schedule_items?.[0];
    scheduleItemId = item?.id;
    const initial = item?.amount ?? 0;
    consumed = initial - (bx.balance ?? 0);
    break;
  }
  if (!scheduleItemId) {
    throw new BillingMetronomeError(
      `commit ${commitId} not found`,
      "commit_not_found",
      404
    );
  }

  await metronome.v2.contracts.editCommit({
    customer_id: customerId,
    commit_id: commitId,
    access_schedule: {
      update_schedule_items: [{ id: scheduleItemId, amount: consumed }],
    },
  });

  return { shrunkTo: consumed };
}

// ---------------------------------------------------------------------------
// balance read (display)
// ---------------------------------------------------------------------------

export type Balance = {
  totalCents: number;
  commits: Array<{
    id: string;
    name?: string;
    priority?: number;
    balance: number;
    initial?: number;
    /** Commit creation timestamp (ISO). The user-facing "when did this
     *  happen" — distinct from `startingAt` which is the schedule-item
     *  start (we hour-floor that for billing alignment). */
    createdAt?: string;
    /** Schedule-item start (ISO). Hour-floored. */
    startingAt?: string;
    /** Schedule-item end (ISO). Far-future for top-ups. */
    endingBefore?: string;
  }>;
};

export async function getOrgBalance(organizationId: number): Promise<Balance> {
  const account = await getAccount(organizationId);
  if (!account?.metronome_customer_id) {
    return { totalCents: 0, commits: [] };
  }
  // SDK type for listBalances is a union (Commit | Credit) that doesn't
  // expose `balance`, `name`, `priority`, `created_at` consistently.
  type BalanceRow = {
    id: string;
    balance?: number;
    name?: string;
    priority?: number;
    created_at?: string;
    access_schedule?: {
      schedule_items?: Array<{
        amount?: number;
        starting_at?: string;
        ending_before?: string;
      }>;
    };
  };
  const commits: Balance["commits"] = [];
  for await (const b of metronome.v1.contracts.listBalances({
    customer_id: account.metronome_customer_id,
    covering_date: new Date().toISOString(),
    include_balance: true,
  })) {
    const bx = b as unknown as BalanceRow;
    const item = bx.access_schedule?.schedule_items?.[0];
    commits.push({
      id: bx.id,
      name: bx.name,
      priority: bx.priority,
      balance: bx.balance ?? 0,
      initial: item?.amount,
      createdAt: bx.created_at,
      startingAt: item?.starting_at,
      endingBefore: item?.ending_before,
    });
  }
  const totalCents = commits.reduce((sum, c) => sum + (c.balance ?? 0), 0);
  return { totalCents, commits };
}

// ---------------------------------------------------------------------------
// user-facing translations — Metronome primitives → customer vocabulary
// ---------------------------------------------------------------------------

export type TransactionKind =
  | "topup" // Stripe-charged top-up commit
  | "auto_reload" // Stripe-charged auto-reload commit
  | "promo" // Complimentary / refund / manual grant
  | "unknown";

export type Transaction = {
  /** Source commit id (Metronome). Internal — UI may show or hide. */
  sourceId: string;
  kind: TransactionKind;
  at: string | null;
  /** Money-in amount in cents. Always positive. */
  amountCents: number;
  /** Remaining balance on this transaction's bucket. For "money in" entries. */
  remainingCents: number;
  /** User-facing label, e.g., "Top-up", "Auto-reload", "Promo". */
  description: string;
  /** Whether the customer paid for this entry (true for top-up/auto-reload). */
  paid: boolean;
};

function classifyCommit(
  name: string | undefined,
  priority: number | undefined
): TransactionKind {
  const n = (name ?? "").toLowerCase();
  if (n.includes("auto-reload") || n.includes("auto reload"))
    return "auto_reload";
  if (priority !== undefined) {
    if (priority >= 80) return "topup";
    return "promo";
  }
  if (n.includes("top-up") || n.includes("topup")) return "topup";
  return "unknown";
}

function descriptionFor(kind: TransactionKind, name?: string): string {
  switch (kind) {
    case "topup":
      return "Top-up";
    case "auto_reload":
      return "Auto-reload";
    case "promo":
      return name ?? "Promo";
    default:
      return name ?? "Credit";
  }
}

// Money-in feed derived from commits. Most-recent first.
export async function getTransactions(
  organizationId: number
): Promise<Transaction[]> {
  const { commits } = await getOrgBalance(organizationId);
  const txns = commits.map<Transaction>((c) => {
    const kind = classifyCommit(c.name, c.priority);
    return {
      sourceId: c.id,
      kind,
      // Prefer the commit's actual `created_at`; fall back to schedule-item
      // start. The latter is hour-floored for Metronome billing alignment
      // and would render every fresh transaction as up to 59m old.
      at: c.createdAt ?? c.startingAt ?? null,
      amountCents: c.initial ?? 0,
      remainingCents: c.balance,
      description: descriptionFor(kind, c.name),
      paid: kind === "topup" || kind === "auto_reload",
    };
  });
  txns.sort((a, b) => {
    const ta = a.at ? Date.parse(a.at) : 0;
    const tb = b.at ? Date.parse(b.at) : 0;
    return tb - ta;
  });
  return txns;
}

// ---------------------------------------------------------------------------
// invoices (Metronome — payer side; carries Stripe linkage in external_invoice)
// ---------------------------------------------------------------------------

export type InvoiceView = {
  id: string;
  status: string;
  type: string;
  totalCents: number;
  subtotalCents: number | null;
  issuedAt: string | null;
  startTimestamp: string | null;
  endTimestamp: string | null;
  /** Top line items (truncated). */
  lineItems: Array<{ name: string; totalCents: number }>;
  /** Stripe link if Metronome routed this invoice to Stripe. */
  external?: {
    provider: string;
    status?: string;
    paymentId?: string;
    /** PDF from the billing provider (rare for PaymentIntent flow). */
    pdfUrl?: string;
    /** Public, signed Stripe receipt URL (downloadable PDF for the user). */
    receiptUrl?: string;
    /** Stripe Dashboard deep link (admin/dev only). */
    dashboardUrl?: string;
  };
};

export async function getInvoices(
  organizationId: number,
  limit: number = 25
): Promise<InvoiceView[]> {
  const account = await getAccount(organizationId);
  if (!account?.metronome_customer_id) return [];
  // Public SDK type misses several fields the API does return.
  type InvoiceExtra = {
    external_invoice?: {
      billing_provider_type: string;
      external_status?: string;
      external_payment_id?: string;
      pdf_url?: string;
    };
    start_timestamp?: string;
    end_timestamp?: string;
  };
  type LineItemExtra = { name: string; total: number };

  const out: InvoiceView[] = [];
  for await (const inv of metronome.v1.customers.invoices.list({
    customer_id: account.metronome_customer_id,
  })) {
    const invx = inv as unknown as InvoiceExtra;
    const ext = invx.external_invoice;
    out.push({
      id: inv.id,
      status: inv.status,
      type: inv.type,
      totalCents: inv.total ?? 0,
      subtotalCents: inv.subtotal ?? null,
      issuedAt: inv.issued_at ?? null,
      startTimestamp: invx.start_timestamp ?? null,
      endTimestamp: invx.end_timestamp ?? null,
      lineItems: (inv.line_items ?? []).slice(0, 10).map((li) => {
        const lx = li as unknown as LineItemExtra;
        return { name: lx.name, totalCents: lx.total };
      }),
      external: ext
        ? {
            provider: ext.billing_provider_type,
            status: ext.external_status,
            paymentId: ext.external_payment_id,
            pdfUrl: ext.pdf_url,
          }
        : undefined,
    });
    if (out.length >= limit) break;
  }

  // Enrich Stripe-routed invoices with the receipt URL (public PDF) and
  // a Dashboard deep link. Stripe round-trips in parallel; failures are
  // swallowed so a single bad invoice doesn't break the listing.
  const isLive = !(process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
  const dashRoot = isLive
    ? "https://dashboard.stripe.com"
    : "https://dashboard.stripe.com/test";

  await Promise.all(
    out.map(async (v) => {
      const ext = v.external;
      if (!ext || ext.provider !== "stripe" || !ext.paymentId) return;
      try {
        if (ext.paymentId.startsWith("pi_")) {
          const pi = await stripe.paymentIntents.retrieve(ext.paymentId, {
            expand: ["latest_charge"],
          });
          // `latest_charge` is `string | Charge` after expansion.
          const ch = pi.latest_charge as
            | { receipt_url?: string | null }
            | string
            | null
            | undefined;
          ext.receiptUrl =
            ch && typeof ch !== "string"
              ? (ch.receipt_url ?? undefined)
              : undefined;
          ext.dashboardUrl = `${dashRoot}/payments/${ext.paymentId}`;
        } else if (ext.paymentId.startsWith("ch_")) {
          const ch = await stripe.charges.retrieve(ext.paymentId);
          ext.receiptUrl = ch.receipt_url ?? undefined;
          ext.dashboardUrl = `${dashRoot}/payments/${ext.paymentId}`;
        } else if (ext.paymentId.startsWith("in_")) {
          // Stripe Invoice (Metronome with payment_type=INVOICE).
          const sinv = await stripe.invoices.retrieve(ext.paymentId);
          ext.receiptUrl = sinv.hosted_invoice_url ?? undefined;
          ext.pdfUrl = ext.pdfUrl ?? sinv.invoice_pdf ?? undefined;
          ext.dashboardUrl = `${dashRoot}/invoices/${ext.paymentId}`;
        }
      } catch {
        // Best-effort enrichment; leave as-is on failure.
      }
    })
  );

  return out;
}

// Metronome-rendered invoice PDF as base64. Server-action friendly: caller
// decodes and triggers the download client-side.
export async function getInvoicePdfBase64(
  organizationId: number,
  invoiceId: string
): Promise<{ filename: string; dataB64: string }> {
  const account = await getAccount(organizationId);
  if (!account?.metronome_customer_id) {
    throw new BillingMetronomeError(
      "Org not provisioned in Metronome.",
      "not_provisioned",
      409
    );
  }
  const res = await metronome.v1.customers.invoices.retrievePdf({
    customer_id: account.metronome_customer_id,
    invoice_id: invoiceId,
  });
  const ab = await res.arrayBuffer();
  return {
    filename: `invoice-${invoiceId.slice(0, 8)}.pdf`,
    dataB64: Buffer.from(ab).toString("base64"),
  };
}

// ---------------------------------------------------------------------------
// Stripe Checkout post-processor for AI credit flows.
//
// User-facing AI credit buys (top-up, auto-reload enable) go through Stripe
// Checkout: Stripe collects, our webhook lands the equivalent Metronome
// credit. Idempotency via event_id dedup; we name the commit with the
// Stripe payment_intent id so a manual replay is visible.
// ---------------------------------------------------------------------------

export async function handleAiCreditCheckoutCompleted(session: {
  id?: string;
  payment_intent?: string | null;
  payment_status?: string | null;
  metadata?: Record<string, string | undefined> | null;
  amount_total?: number | null;
}): Promise<{ result: "applied" | "skipped" | "noop"; detail?: string }> {
  const meta = session.metadata ?? {};
  const kind = meta.kind;
  if (
    kind !== AI_CHECKOUT_KIND.TOPUP &&
    kind !== AI_CHECKOUT_KIND.AUTO_RELOAD_ENABLE
  ) {
    return { result: "noop", detail: `kind=${kind ?? "(none)"}` };
  }
  if (session.payment_status !== "paid") {
    return {
      result: "skipped",
      detail: `payment_status=${session.payment_status}`,
    };
  }
  const orgIdRaw = meta.grida_organization_id;
  const orgId = orgIdRaw ? parseInt(orgIdRaw, 10) : NaN;
  if (!Number.isFinite(orgId)) {
    return { result: "skipped", detail: "missing org id" };
  }

  const piTag = session.payment_intent
    ? ` (pi:${session.payment_intent.slice(0, 12)})`
    : "";

  if (kind === AI_CHECKOUT_KIND.TOPUP) {
    const cents = parseInt(meta.cents ?? "", 10);
    if (!Number.isFinite(cents) || cents <= 0) {
      return { result: "skipped", detail: "invalid cents" };
    }
    // Stripe already collected the money — credit Metronome with a
    // priority-TOPUP commit (drains last) but no payment_gate (we
    // don't want Metronome to double-charge).
    await addComplimentaryCommit(orgId, cents, {
      name: `Top-up $${(cents / 100).toFixed(2)}${piTag}`,
      priority: COMMIT_PRIORITY.TOPUP,
    });
    // Reconcile the local cache inline so the gate flips before the user
    // returns from Stripe Checkout. Without this, customer_entitled stays
    // false until the Metronome `commit.create` webhook propagates back —
    // and the return page's polling races that delivery.
    await refreshBalance(orgId);
    return { result: "applied", detail: `topup $${(cents / 100).toFixed(2)}` };
  }

  // kind === AI_CHECKOUT_KIND.AUTO_RELOAD_ENABLE
  const threshold = parseInt(meta.threshold_cents ?? "", 10);
  const recharge = parseInt(meta.recharge_to_cents ?? "", 10);
  if (
    !Number.isFinite(threshold) ||
    threshold < AUTO_RELOAD_THRESHOLD_MIN_CENTS ||
    !Number.isFinite(recharge) ||
    recharge < AUTO_RELOAD_RECHARGE_MIN_CENTS
  ) {
    return { result: "skipped", detail: "invalid auto-reload params" };
  }
  // Initial $recharge credit (Stripe collected it via Checkout) +
  // configure the threshold for future silent auto-recharges via the
  // saved card.
  await addComplimentaryCommit(orgId, recharge, {
    name: `Auto-reload initial $${(recharge / 100).toFixed(2)}${piTag}`,
    priority: COMMIT_PRIORITY.TOPUP,
  });
  await setAutoReload(orgId, threshold, recharge);
  return {
    result: "applied",
    detail: `auto_reload threshold=$${(threshold / 100).toFixed(2)} recharge=$${(recharge / 100).toFixed(2)}`,
  };
}
