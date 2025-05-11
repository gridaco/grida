"use client";

import React, { useState } from "react";
import { PricingCard, PricingCardButton } from "@/www/pricing/pricing-card";
import { plans as nosave_plans, save_plans } from "@/www/data/plans";
import PricingComparisonTable from "./pricing-comparison-table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";

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
            <Tabs
              defaultValue="monthly"
              value={save ? "yearly" : "monthly"}
              onValueChange={(t) => {
                setSave(t === "yearly");
              }}
            >
              <TabsList>
                <TabsTrigger value="monthly" className="font-semibold">
                  Pay monthly
                </TabsTrigger>
                <TabsTrigger value="yearly" className="font-semibold">
                  Pay yearly
                  <span
                    data-active={save ? "true" : "false"}
                    className="ms-1 text-xs font-normal text-foreground data-[active='true']:text-blue-500"
                  >
                    save 20%
                  </span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </label>
        </div>
        <div className="columns-1 md:columns-2 xl:columns-4 gap-6 space-y-10 w-full">
          {plans.map((plan) => (
            <PricingCard
              key={plan.id}
              plan={plan.name}
              price={{
                primary: `${plan.priceMonthly}`,
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
