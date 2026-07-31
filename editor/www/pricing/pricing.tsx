// GRIDA-EE: billing — public pricing acquisition surface.

import React from "react";
import { PricingCard, PricingCardButton } from "@/www/pricing/pricing-card";
import { plans, proPlan } from "@/lib/billing/marketing-plans";
import Link from "next/link";

export function Pricing() {
  return (
    <section>
      <div className="pt-12 pb-20 flex flex-col items-center gap-7">
        <h1 className="text-4xl font-semibold text-center">Simple pricing</h1>
        <p className="text-muted-foreground text-center max-w-xl">
          Start free, upgrade to Pro for {proPlan.priceMonthly} a month, or talk
          to us about a Custom plan.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-10 w-full max-w-6xl mx-auto">
        {plans.map((plan) => (
          <PricingCard
            key={plan.id}
            plan={plan.name}
            price={{
              primary: plan.priceMonthly,
              secondary: plan.costUnit,
            }}
            features={plan.features}
            excerpt={plan.description}
            highlight={plan.highlight}
            action={
              <PricingCardButton asChild inverted={plan.highlight}>
                <Link href={plan.href} className="w-full">
                  {plan.cta}
                </Link>
              </PricingCardButton>
            }
          />
        ))}
      </div>
    </section>
  );
}
