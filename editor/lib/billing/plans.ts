// Readable catalogue for standard paid-plan records in the editor billing
// surface. This deliberately retains Team and annual definitions so existing
// subscriptions, invoices, and webhook events remain intelligible.
//
// Saleability is a separate policy owned by `./offers`: only offers accepted
// there may be used by checkout, plan-change flows, or Stripe setup. Stripe is
// the runtime authority for existing charges. The public pricing page reads
// from `./marketing-plans`, which derives the current Pro price from here.

export type PaidPlanId = "pro" | "team";
export type PlanId = "free" | PaidPlanId;
export type Interval = "month" | "year";

/**
 * `grida_billing.product_catalogue.id` keys. Monthly is `plan.<name>`;
 * annual is `plan.<name>.annual`. The webhook projector reads the plan
 * out of this id, so the wire format matters.
 */
export type CatalogueId =
  | "plan.pro"
  | "plan.pro.annual"
  | "plan.team"
  | "plan.team.annual";

export type PaidPlanDefinition = {
  id: PaidPlanId;
  name: string;
  description: string;
  /** Sticker monthly price in cents. */
  monthly_cents: number;
  /** Historical annual price in cents; annual offers are no longer saleable. */
  annual_cents: number;
  features: ReadonlyArray<string>;
};

export const PAID_PLANS: Readonly<Record<PaidPlanId, PaidPlanDefinition>> = {
  pro: {
    id: "pro",
    name: "Pro",
    description: "For solo builders shipping production work.",
    monthly_cents: 2000,
    annual_cents: 19200,
    features: [
      "Stripe-managed billing & invoices",
      "Cancel or switch plans anytime via the Customer Portal",
    ],
  },
  team: {
    id: "team",
    name: "Team (legacy)",
    description: "More headroom for heavier workflows.",
    monthly_cents: 6000,
    annual_cents: 57600,
    features: [
      "Everything in Pro",
      "More storage & monthly active users",
      "Chat support",
    ],
  },
};

/** @deprecated Historical ordering only; do not use as a saleable offer list. */
export const PAID_PLAN_LIST: ReadonlyArray<PaidPlanDefinition> = [
  PAID_PLANS.pro,
  PAID_PLANS.team,
];

/** @deprecated Historical comparison only; Custom is outside this hierarchy. */
export const PLAN_RANK: Readonly<Record<PlanId, number>> = {
  free: 0,
  pro: 1,
  team: 2,
};

export function price_catalogue_id(
  plan: PaidPlanId,
  interval: Interval
): CatalogueId {
  return interval === "year" ? `plan.${plan}.annual` : `plan.${plan}`;
}

export function price_cents(plan: PaidPlanId, interval: Interval): number {
  return interval === "year"
    ? PAID_PLANS[plan].annual_cents
    : PAID_PLANS[plan].monthly_cents;
}

export function price_dollars(plan: PaidPlanId, interval: Interval): number {
  return price_cents(plan, interval) / 100;
}

/** Effective monthly equivalent — useful for "$/mo" labels under annual prices. */
export function price_monthly_equivalent_dollars(
  plan: PaidPlanId,
  interval: Interval
): number {
  return interval === "year"
    ? PAID_PLANS[plan].annual_cents / 12 / 100
    : PAID_PLANS[plan].monthly_cents / 100;
}
