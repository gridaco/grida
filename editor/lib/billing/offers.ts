// GRIDA-EE: billing — current saleability policy over the readable catalogue.

import type { CatalogueId, Interval, PaidPlanId } from "./plans";

type BillingOffer = Readonly<{
  id: string;
  plan: PaidPlanId;
  interval: Interval;
  catalogue_id: CatalogueId;
}>;

const SALEABLE = [
  {
    id: "pro-monthly",
    plan: "pro",
    interval: "month",
    catalogue_id: "plan.pro",
  },
] as const satisfies readonly BillingOffer[];

/**
 * The offers Grida sells now.
 *
 * This is deliberately narrower than `plans.ts`: the plan catalogue remains
 * able to describe historical Team and annual subscriptions, while this
 * policy controls which plan/interval pairs can start a new Stripe mutation.
 */
export namespace BillingOffers {
  export type Saleable = (typeof SALEABLE)[number];
  export type Id = Saleable["id"];

  export const saleable: readonly Saleable[] = SALEABLE;

  export function resolve(id: unknown): Saleable | null {
    return saleable.find((offer) => offer.id === id) ?? null;
  }

  export function find(plan: unknown, interval: unknown): Saleable | null {
    return (
      saleable.find(
        (offer) => offer.plan === plan && offer.interval === interval
      ) ?? null
    );
  }
}
