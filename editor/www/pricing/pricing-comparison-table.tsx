// GRIDA-EE: billing — responsive public plan comparison.

"use client";

import React, { useState } from "react";
import { pricing } from "../data/pricing";
import type { PricingInformation } from "@/lib/billing/marketing-plans";
import {
  PricingTableRowDesktop,
  PricingTableRowMobile,
} from "./pricing-table-row";
import { Button } from "@app/ui/components/button";
import Link from "next/link";
import {
  ArrowLeftRightIcon,
  Building2Icon,
  DatabaseIcon,
  ListChecksIcon,
  MonitorDownIcon,
  PresentationIcon,
  SparklesIcon,
} from "lucide-react";

function PricingMobileHeader({
  plans,
  priceDescription,
  price,
  plan,
  showDollarSign = true,
  from = false,
}: {
  plans: PricingInformation[];
  description: string;
  priceDescription: string;
  price: string;
  plan: string;
  showDollarSign?: boolean;
  from?: boolean;
}) {
  const selectedPlan = plans.find((candidate) => candidate.name === plan)!;

  return (
    <div className="mt-8 px-4 mobile-header">
      <h2 className="text-foreground text-3xl font-medium uppercase font-mono">
        {plan}
      </h2>
      <div className="flex items-baseline gap-2">
        {from && <span className="text-foreground text-base">From</span>}
        {price ? (
          showDollarSign ? (
            <span className="h1 font-mono">{price}</span>
          ) : (
            <span className="text-foreground-light">{price}</span>
          )
        ) : null}

        <p className="p opacity-50">{priceDescription}</p>
      </div>
      <Button asChild className="mt-2">
        <Link href={selectedPlan.href}>{selectedPlan.cta}</Link>
      </Button>
    </div>
  );
}

const PricingComparisonTable = ({ plans }: { plans: PricingInformation[] }) => {
  const [activeMobilePlan, setActiveMobilePlan] = useState("Free");
  const proPlan = plans.find((plan) => plan.name === "Pro")!;
  const customPlan = plans.find((plan) => plan.name === "Custom")!;

  return (
    <div
      id="compare-plans"
      className="sm:pb-18 container relative mt-48 mx-auto px-0 pb-16 md:pb-16 lg:px-16 xl:px-20"
    >
      {/* xs to lg */}
      <div className="lg:hidden">
        <div className="bg-background p-2 sticky top-0 z-10 pt-4">
          <div className="bg-surface-100 rounded-lg border dark:border-white/25 py-2 px-4 flex justify-between items-center">
            <label className="text-foreground-lighter" htmlFor="change-plan">
              Change plan
            </label>
            <select
              id="change-plan"
              name="Change plan"
              value={activeMobilePlan}
              className="bg-transparent min-w-[120px]"
              onChange={(event) => setActiveMobilePlan(event.target.value)}
            >
              <option value="Free">Free</option>
              <option value="Pro">Pro</option>
              <option value="Custom">Custom</option>
            </select>
          </div>
        </div>

        {activeMobilePlan === "Free" && (
          <>
            <PricingMobileHeader
              plans={plans}
              plan="Free"
              price="$0"
              priceDescription=""
              description="Create and publish with Grida at no cost."
            />
            <PricingTableRowMobile
              category={pricing.desktop}
              plan="free"
              icon={<MonitorDownIcon className="size-4" />}
              sectionId="desktop"
            />
            <PricingTableRowMobile
              category={pricing.design}
              plan="free"
              icon={<PresentationIcon className="size-4" />}
              sectionId="design"
            />
            <PricingTableRowMobile
              category={pricing.forms}
              plan="free"
              icon={<ListChecksIcon className="size-4" />}
              sectionId="forms"
            />
            <PricingTableRowMobile
              category={pricing.database}
              plan="free"
              icon={<DatabaseIcon className="size-4" />}
              sectionId="database"
            />
            <PricingTableRowMobile
              category={pricing.developer}
              plan="free"
              icon={<ArrowLeftRightIcon className="size-4" />}
              sectionId="developer"
            />
            <PricingTableRowMobile
              category={pricing.ai}
              plan="free"
              icon={<SparklesIcon className="size-4" />}
              sectionId="ai"
            />
            <PricingTableRowMobile
              category={pricing.custom}
              plan="free"
              icon={<Building2Icon className="size-4" />}
              sectionId="custom"
            />
          </>
        )}

        {activeMobilePlan === "Pro" && (
          <>
            <PricingMobileHeader
              plans={plans}
              plan="Pro"
              price={proPlan.priceMonthly}
              priceDescription="per organization / month"
              description={proPlan.description}
            />
            <PricingTableRowMobile
              category={pricing.desktop}
              plan="pro"
              icon={<MonitorDownIcon className="size-4" />}
              sectionId="desktop"
            />
            <PricingTableRowMobile
              category={pricing.design}
              plan="pro"
              icon={<PresentationIcon className="size-4" />}
              sectionId="design"
            />
            <PricingTableRowMobile
              category={pricing.forms}
              plan="pro"
              icon={<ListChecksIcon className="size-4" />}
              sectionId="forms"
            />
            <PricingTableRowMobile
              category={pricing.database}
              plan="pro"
              icon={<DatabaseIcon className="size-4" />}
              sectionId="database"
            />
            <PricingTableRowMobile
              category={pricing.developer}
              plan="pro"
              icon={<ArrowLeftRightIcon className="size-4" />}
              sectionId="developer"
            />
            <PricingTableRowMobile
              category={pricing.ai}
              plan="pro"
              icon={<SparklesIcon className="size-4" />}
              sectionId="ai"
            />
            <PricingTableRowMobile
              category={pricing.custom}
              plan="pro"
              icon={<Building2Icon className="size-4" />}
              sectionId="custom"
            />
          </>
        )}

        {activeMobilePlan === "Custom" && (
          <>
            <PricingMobileHeader
              plans={plans}
              plan="Custom"
              price=""
              priceDescription={customPlan.priceNote ?? ""}
              description={customPlan.description}
              showDollarSign={false}
            />
            <PricingTableRowMobile
              category={pricing.desktop}
              plan="custom"
              icon={<MonitorDownIcon className="size-4" />}
              sectionId="desktop"
            />
            <PricingTableRowMobile
              category={pricing.design}
              plan="custom"
              icon={<PresentationIcon className="size-4" />}
              sectionId="design"
            />
            <PricingTableRowMobile
              category={pricing.forms}
              plan="custom"
              icon={<ListChecksIcon className="size-4" />}
              sectionId="forms"
            />
            <PricingTableRowMobile
              category={pricing.database}
              plan="custom"
              icon={<DatabaseIcon className="size-4" />}
              sectionId="database"
            />
            <PricingTableRowMobile
              category={pricing.developer}
              plan="custom"
              icon={<ArrowLeftRightIcon className="size-4" />}
              sectionId="developer"
            />
            <PricingTableRowMobile
              category={pricing.ai}
              plan="custom"
              icon={<SparklesIcon className="size-4" />}
              sectionId="ai"
            />
            <PricingTableRowMobile
              category={pricing.custom}
              plan="custom"
              icon={<Building2Icon className="size-4" />}
              sectionId="custom"
            />
          </>
        )}
      </div>

      {/* lg+ */}
      <div className="hidden lg:block">
        <table className="h-px w-full table-fixed">
          <caption className="sr-only">Pricing plan comparison</caption>
          <thead className="bg-background sticky top-0 z-10">
            <tr>
              <th
                className="text-foreground w-1/3 px-6 pt-2 pb-2 text-left text-sm font-normal"
                scope="col"
              >
                <span className="sr-only">Feature by</span>
                <span
                  className="h-0.25 absolute bottom-0 left-0 w-full"
                  style={{ height: "1px" }}
                />
              </th>

              {plans.map((plan) => (
                <th
                  className="text-foreground w-1/4 px-0 text-left text-sm font-normal"
                  scope="col"
                  key={plan.name}
                >
                  <span className="flex flex-col px-6 pr-2 pt-2 gap-1 items-start">
                    <div className="flex flex-row items-center gap-2">
                      <h3 className="text-lg xl:text-xl 2xl:text-2xl leading-5 uppercase font-mono font-normal">
                        {plan.name}
                      </h3>
                      {plan.name !== "Custom" && (
                        <span className="text-foreground-lighter font-mono text-lg tracking-tighter">
                          {plan.priceMonthly}
                        </span>
                      )}
                    </div>
                    <div className="h-5">
                      {plan.name === "Pro" && plan.costUnit && (
                        <span className="text-[13px] opacity-50 leading-4">
                          {plan.costUnit}
                        </span>
                      )}
                      {plan.name === "Custom" && plan.priceNote && (
                        <span className="text-[13px] opacity-50 leading-4">
                          {plan.priceNote}
                        </span>
                      )}
                    </div>
                    <Button asChild className="mt-2 w-full">
                      <Link href={plan.href}>{plan.cta}</Link>
                    </Button>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="border-default divide-border dark:divide-white/25 divide-y first:divide-y-0">
            <PricingTableRowDesktop
              category={pricing.desktop}
              icon={<MonitorDownIcon className="size-4" />}
              sectionId="desktop"
            />
            <PricingTableRowDesktop
              category={pricing.design}
              icon={<PresentationIcon className="size-4" />}
              sectionId="design"
            />
            <PricingTableRowDesktop
              category={pricing.forms}
              icon={<ListChecksIcon className="size-4" />}
              sectionId="forms"
            />
            <PricingTableRowDesktop
              category={pricing.database}
              icon={<DatabaseIcon className="size-4" />}
              sectionId="database"
            />
            <PricingTableRowDesktop
              category={pricing.developer}
              icon={<ArrowLeftRightIcon className="size-4" />}
              sectionId="developer"
            />
            <PricingTableRowDesktop
              category={pricing.ai}
              icon={<SparklesIcon className="size-4" />}
              sectionId="ai"
            />
            <PricingTableRowDesktop
              category={pricing.custom}
              icon={<Building2Icon className="size-4" />}
              sectionId="custom"
            />
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PricingComparisonTable;
