// GRIDA-EE: billing — public pricing acquisition surface.

import React from "react";
import { PricingWideCard } from "@/www/pricing/pricing-card";
import { freePlan, plans } from "@/lib/billing/marketing-plans";
import PricingComparisonTable from "./pricing-comparison-table";

export function Pricing() {
  return (
    <>
      <section>
        <div className="pt-12 pb-20 flex flex-col items-center gap-3">
          <h1 className="text-4xl font-semibold text-center">Pricing</h1>
          <p className="text-sm text-muted-foreground text-center">
            Pay only for Grida-hosted AI, or bring your own models.
          </p>
        </div>
        <PricingWideCard
          plan={freePlan.priceMonthly}
          excerpt={freePlan.description}
          features={freePlan.features}
        />
      </section>
      <PricingComparisonTable plans={plans} />
    </>
  );
}
