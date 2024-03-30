"use client";

// The original code is from supabase/www (Licensed under Apache 2.0)
import clsx from "clsx";
import React, { useState } from "react";
import { pricing } from "../data/pricing";
import { plans } from "../data/plans";
import {
  PricingTableRowDesktop,
  PricingTableRowMobile,
} from "./pricing-table-row";

const PricingComparisonTable = () => {
  const [activeMobilePlan, setActiveMobilePlan] = useState("Free");

  const MobileHeader = ({
    description,
    priceDescription,
    price,
    plan,
    showDollarSign = true,
    from = false,
  }: {
    description: string;
    priceDescription: string;
    price: string;
    plan: string;
    showDollarSign?: boolean;
    from?: boolean;
  }) => {
    const selectedPlan = plans.find((p: any) => p.name === plan)!;

    return (
      <div className="mt-8 px-4 mobile-header">
        <h2 className="text-foreground text-3xl font-medium uppercase font-mono">
          {plan}
        </h2>
        <div className="flex items-baseline gap-2">
          {from && <span className="text-foreground text-base">From</span>}
          {showDollarSign ? (
            <span className="h1 font-mono">
              {plan !== "Enterprise" ? "$" : ""}
              {price}
            </span>
          ) : (
            <span className="text-foreground-light">{price}</span>
          )}

          <p className="p opacity-50">{priceDescription}</p>
        </div>
        <button className=" text-white flex flex-col bg-neutral-800 rounded justify-between h-full py-2 px-6 mt-2 hover:invert transition-all">
          {selectedPlan.cta}
        </button>
      </div>
    );
  };

  return (
    <div
      id="compare-plans"
      className="sm:pb-18 container relative top-48 mx-auto px-4 pb-16 md:pb-16 lg:px-16 xl:px-20"
    >
      {/* <!-- xs to lg --> */}
      <div className="lg:hidden">
        {/* Free - Mobile  */}
        <div className="bg-background p-2 sticky top-14 z-10 pt-4">
          <div className="bg-surface-100 rounded-lg border dark:border-white dark:border-opacity-25 py-2 px-4 flex justify-between items-center">
            <label className="text-foreground-lighter">Change plan</label>
            <select
              id="change-plan"
              name="Change plan"
              value={activeMobilePlan}
              className="bg-transparent min-w-[120px]"
              onChange={(e) => setActiveMobilePlan(e.target.value)}
            >
              <option value="Free">Free</option>
              <option value="Pro">Pro</option>
              <option value="Team">Team</option>
              <option value="Enterprise">Enterprise</option>
            </select>
          </div>
        </div>
        {activeMobilePlan === "Free" && (
          <>
            <MobileHeader
              plan="Free"
              price={"0"}
              priceDescription={"/month"}
              description={"Perfect for hobby projects and experiments"}
            />

            <PricingTableRowMobile
              category={pricing.storage}
              plan={"free"}
              icon={<>icon</>}
              sectionId="storage"
            />
            <PricingTableRowMobile
              category={pricing.highlight}
              plan={"free"}
              icon={pricing.highlight.icon}
              sectionId="highlight"
            />
            <PricingTableRowMobile
              category={pricing.integrations}
              plan={"free"}
              icon={pricing.integrations.icon}
              sectionId="integrations"
            />
            <PricingTableRowMobile
              category={pricing.support}
              plan={"free"}
              icon={pricing.support.icon}
              sectionId="support"
            />
            <PricingTableRowMobile
              category={pricing.commingsoon}
              plan={"free"}
              icon={pricing.commingsoon.icon}
              sectionId="commingsoon"
            />
          </>
        )}

        {activeMobilePlan === "Pro" && (
          <>
            <MobileHeader
              plan="Pro"
              from={false}
              price={"20"}
              priceDescription={"/month"}
              description={
                "Everything you need to scale your project into production"
              }
            />

            <PricingTableRowMobile
              category={pricing.storage}
              plan={"pro"}
              icon={<>icon</>}
            />
            <PricingTableRowMobile
              category={pricing.highlight}
              plan={"pro"}
              icon={pricing.highlight.icon}
            />
            <PricingTableRowMobile
              category={pricing.integrations}
              plan={"pro"}
              icon={pricing.integrations.icon}
            />
            <PricingTableRowMobile
              category={pricing.support}
              plan={"pro"}
              icon={pricing.support.icon}
            />
            <PricingTableRowMobile
              category={pricing.commingsoon}
              plan={"pro"}
              icon={pricing.commingsoon.icon}
            />
          </>
        )}

        {activeMobilePlan === "Team" && (
          <>
            <MobileHeader
              plan="Team"
              from={false}
              price={"60"}
              priceDescription={"/month"}
              description={
                "Collaborate with different permissions and access patterns"
              }
            />

            <PricingTableRowMobile
              category={pricing.storage}
              plan={"team"}
              icon={<>icon</>}
            />
            <PricingTableRowMobile
              category={pricing.highlight}
              plan={"team"}
              icon={pricing.highlight.icon}
            />
            <PricingTableRowMobile
              category={pricing.integrations}
              plan={"team"}
              icon={pricing.integrations.icon}
            />
            <PricingTableRowMobile
              category={pricing.support}
              plan={"team"}
              icon={pricing.support.icon}
            />
            <PricingTableRowMobile
              category={pricing.commingsoon}
              plan={"team"}
              icon={pricing.commingsoon.icon}
            />
          </>
        )}

        {activeMobilePlan === "Enterprise" && (
          <>
            <MobileHeader
              plan="Enterprise"
              price={"Contact us"}
              priceDescription={""}
              description={
                "Designated support team, account manager and technical specialist"
              }
              showDollarSign={false}
            />

            <PricingTableRowMobile
              category={pricing.storage}
              plan={"enterprise"}
              icon={<>icon</>}
            />
            <PricingTableRowMobile
              category={pricing.highlight}
              plan={"enterprise"}
              icon={pricing.highlight.icon}
            />
            <PricingTableRowMobile
              category={pricing.integrations}
              plan={"enterprise"}
              icon={pricing.integrations.icon}
            />
            <PricingTableRowMobile
              category={pricing.support}
              plan={"enterprise"}
              icon={pricing.support.icon}
            />
            <PricingTableRowMobile
              category={pricing.commingsoon}
              plan={"enterprise"}
              icon={pricing.commingsoon.icon}
            />
          </>
        )}
      </div>

      {/* <!-- lg+ --> */}
      <div className="hidden lg:block">
        <table className="h-px w-full table-fixed">
          <caption className="sr-only">Pricing plan comparison</caption>
          <thead className="bg-white dark:bg-black sticky top-0 z-10">
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

              {plans.map((plan: any) => (
                <th
                  className="text-foreground w-1/4 px-0 text-left text-sm font-normal"
                  scope="col"
                  key={plan.name}
                >
                  <span className="flex flex-col px-6 pr-2 pt-2 gap-1.5">
                    <span className="flex flex-col xl:flex-row xl:items-end gap-1">
                      <h3 className="text-lg xl:text-xl 2xl:text-2xl leading-5 uppercase font-mono font-normal flex items-center">
                        {plan.name}
                      </h3>
                      <p
                        className={clsx(
                          "text-foreground-lighter -my-1 xl:m-0",
                          plan.name === "Enterprise" && "xl:opacity-0"
                        )}
                      >
                        <span className="text-foreground-lighter font-mono text-xl mr-1 tracking-tighter">
                          {plan.name !== "Enterprise" && "$"}
                          {plan.priceMonthly}
                        </span>
                        {["Free", "Pro", "Team"].includes(plan.name) && (
                          <span className="text-[13px] opacity-50 leading-4 mt-1">
                            {plan.costUnit}
                          </span>
                        )}
                      </p>
                    </span>
                    <span className="flex flex-col bg-neutral-800 rounded justify-between h-full py-2 mt-2 hover:invert transition-all">
                      {
                        <button className="text-sm text-white">
                          {plan.cta}
                        </button>
                      }
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="border-default divide-border dark:divide-white dark:divide-opacity-25 divide-y first:divide-y-0">
            <PricingTableRowDesktop
              category={pricing.storage}
              icon={<>icon</>}
              sectionId="storage"
            />
            <PricingTableRowDesktop
              category={pricing.highlight}
              icon={pricing.highlight.icon}
              sectionId="highlight"
            />
            <PricingTableRowDesktop
              category={pricing.integrations}
              icon={pricing.integrations.icon}
              sectionId="integrations"
            />
            <PricingTableRowDesktop
              category={pricing.support}
              icon={pricing.support.icon}
              sectionId="support"
            />
            <PricingTableRowDesktop
              category={pricing.commingsoon}
              icon={pricing.commingsoon.icon}
              sectionId="commingsoon"
            />
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PricingComparisonTable;
