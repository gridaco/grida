// Single source of truth for paid-plan definitions in the editor billing
// surface. Used by:
//   • the upgrade UI (plan cards)
//   • the billing settings UI (current price line)
//   • the Stripe setup script (to provision products + prices)
//
// Stripe is the runtime authority for what gets charged — these constants
// are what the setup script *writes* to Stripe. The www marketing pricing
// page reads from `./marketing-plans` (sibling file) so price numbers
// can't drift between surfaces; only copy (descriptions, features, CTAs)
// lives there separately.

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
  /** Annual price in cents. By design = monthly_cents × 12 × 0.8 (20% off). */
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
    name: "Team",
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

export const PAID_PLAN_LIST: ReadonlyArray<PaidPlanDefinition> = [
  PAID_PLANS.pro,
  PAID_PLANS.team,
];

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
