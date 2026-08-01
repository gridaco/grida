// GRIDA-EE: billing — public pricing acquisition surface.

import React from "react";
import { PricingCard, PricingCardButton } from "@/www/pricing/pricing-card";
import { plans, proPlan } from "@/lib/billing/marketing-plans";
import PricingComparisonTable from "./pricing-comparison-table";
import Link from "next/link";

export function Pricing() {
  return (
    <>
      <section>
        <div className="pt-12 pb-20 flex flex-col items-center gap-7">
          <h1 className="text-4xl font-semibold text-center">Pricing</h1>
          <p className="opacity-50 text-center max-w-md">
            Start free, upgrade to Pro for {proPlan.priceMonthly} per
            organization each month, or talk to us about a Custom plan.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-10 w-full">
          {plans.map((plan) => (
            <PricingCard
              key={plan.id}
              plan={plan.name}
              price={{
                primary: plan.priceMonthly,
                secondary: plan.costUnit,
                note: plan.priceNote,
              }}
              features={plan.features}
              excerpt={plan.description}
              highlight={plan.highlight}
              action={
                <PricingCardButton asChild inverted={plan.highlight}>
                  <Link href={plan.href}>{plan.cta}</Link>
                </PricingCardButton>
              }
            />
          ))}
        </div>
      </section>
      <PricingComparisonTable plans={plans} />
    </>
  );
}
