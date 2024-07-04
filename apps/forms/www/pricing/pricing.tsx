"use client";

import { PricingCard, PricingCardButton } from "@/www/pricing/pricing-card";
import { plans as nosave_plans, save_plans } from "@/www/data/plans";
import Link from "next/link";
import { useState } from "react";
import PricingComparisonTable from "./pricing-comparison-table";
import { Switch } from "@/components/ui/switch";

export function Pricing() {
  const [save, setSave] = useState(true);

  const plans = save ? save_plans : nosave_plans;

  return (
    <>
      <section>
        <div className="pt-12 pb-20 flex flex-col items-center gap-7">
          <h2 className="text-4xl font-semibold text-center">Pricing</h2>
          <p className="opacity-50 text-center max-w-md">
            Begin your creation at no cost, join forces with your team, and then
            expand to reach millions.
          </p>
          <label className="inline-flex items-center cursor-pointer">
            <span className="me-3 text-sm text-gray-900 dark:text-gray-300">
              Monthly
            </span>
            <Switch checked={save} onCheckedChange={setSave} />
            <span className="ms-3 text-sm text-gray-900 dark:text-gray-300">
              Annual Billing
            </span>
          </label>
        </div>
        <div className="columns-1 lg:columns-2 2xl:columns-4 gap-10 space-y-10 w-full">
          {plans.map((plan) => (
            <PricingCard
              key={plan.id}
              plan={plan.name}
              price={{
                primary: `$${plan.priceMonthly}`,
                secondary: plan.costUnit,
              }}
              features={plan.features}
              excerpt={plan.description}
              highlight={plan.highlight}
              action={
                <Link href={plan.href} className="w-full">
                  <PricingCardButton inverted={plan.highlight}>
                    {plan.cta}
                  </PricingCardButton>
                </Link>
              }
            />
          ))}
        </div>
      </section>
      <PricingComparisonTable plans={plans} />
    </>
  );
}
