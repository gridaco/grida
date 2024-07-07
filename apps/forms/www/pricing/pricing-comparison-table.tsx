"use client";

// The original code is from supabase/www (Licensed under Apache 2.0)
import clsx from "clsx";
import React, { useState } from "react";
import { Component1Icon } from "@radix-ui/react-icons";
import { pricing } from "../data/pricing";
import { PricingInformation } from "../data/plans";
import {
  PricingTableRowDesktop,
  PricingTableRowMobile,
} from "./pricing-table-row";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  CloudUploadIcon,
  MessageCircleIcon,
  MessageCircleQuestionIcon,
  PlugZapIcon,
  ShoppingBagIcon,
  TicketIcon,
} from "lucide-react";

const PricingComparisonTable = ({ plans }: { plans: PricingInformation[] }) => {
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
        <Button className="mt-2">{selectedPlan.cta}</Button>
      </div>
    );
  };

  return (
    <div
      id="compare-plans"
      className="sm:pb-18 container relative top-48 mx-auto px-0 pb-16 md:pb-16 lg:px-16 xl:px-20"
    >
      {/* <!-- xs to lg --> */}
      <div className="lg:hidden">
        {/* Free - Mobile  */}
        <div className="bg-background p-2 sticky top-0 z-10 pt-4">
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
              category={pricing.highlight}
              plan={"free"}
              icon={<Component1Icon className="w-4 h-4" />}
              sectionId="highlight"
            />
            <PricingTableRowMobile
              category={pricing.storage}
              plan={"free"}
              icon={<CloudUploadIcon className="w-4 h-4" />}
              sectionId="storage"
            />
            <PricingTableRowMobile
              category={pricing.integrations}
              plan={"free"}
              icon={<PlugZapIcon className="w-4 h-4" />}
              sectionId="integrations"
            />
            <PricingTableRowMobile
              category={pricing.commerce}
              plan={"free"}
              icon={<ShoppingBagIcon className="w-4 h-4" />}
            />
            <PricingTableRowMobile
              category={pricing.ticketing}
              plan={"free"}
              icon={<TicketIcon className="w-4 h-4" />}
            />
            <PricingTableRowMobile
              category={pricing.channels}
              plan={"free"}
              icon={<MessageCircleIcon className="w-4 h-4" />}
            />
            <PricingTableRowMobile
              category={pricing.support}
              plan={"free"}
              icon={<MessageCircleQuestionIcon className="w-4 h-4" />}
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
              category={pricing.highlight}
              plan={"pro"}
              icon={<Component1Icon className="w-4 h-4" />}
            />
            <PricingTableRowMobile
              category={pricing.storage}
              plan={"pro"}
              icon={<CloudUploadIcon className="w-4 h-4" />}
            />
            <PricingTableRowMobile
              category={pricing.integrations}
              plan={"pro"}
              icon={<PlugZapIcon className="w-4 h-4" />}
            />
            <PricingTableRowMobile
              category={pricing.commerce}
              plan={"pro"}
              icon={<ShoppingBagIcon className="w-4 h-4" />}
            />
            <PricingTableRowMobile
              category={pricing.ticketing}
              plan={"pro"}
              icon={<TicketIcon className="w-4 h-4" />}
            />
            <PricingTableRowMobile
              category={pricing.channels}
              plan={"pro"}
              icon={<MessageCircleIcon className="w-4 h-4" />}
            />
            <PricingTableRowMobile
              category={pricing.support}
              plan={"pro"}
              icon={<MessageCircleQuestionIcon className="w-4 h-4" />}
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
              category={pricing.highlight}
              plan={"team"}
              icon={<Component1Icon className="w-4 h-4" />}
            />
            <PricingTableRowMobile
              category={pricing.storage}
              plan={"team"}
              icon={<CloudUploadIcon className="w-4 h-4" />}
            />
            <PricingTableRowMobile
              category={pricing.integrations}
              plan={"team"}
              icon={<PlugZapIcon className="w-4 h-4" />}
            />
            <PricingTableRowMobile
              category={pricing.commerce}
              plan={"team"}
              icon={<ShoppingBagIcon className="w-4 h-4" />}
            />
            <PricingTableRowMobile
              category={pricing.ticketing}
              plan={"team"}
              icon={<TicketIcon className="w-4 h-4" />}
            />
            <PricingTableRowMobile
              category={pricing.channels}
              plan={"team"}
              icon={<MessageCircleIcon className="w-4 h-4" />}
            />
            <PricingTableRowMobile
              category={pricing.support}
              plan={"team"}
              icon={<MessageCircleQuestionIcon className="w-4 h-4" />}
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
              category={pricing.highlight}
              plan={"enterprise"}
              icon={<Component1Icon className="w-4 h-4" />}
            />
            <PricingTableRowMobile
              category={pricing.storage}
              plan={"enterprise"}
              icon={<CloudUploadIcon className="w-4 h-4" />}
            />
            <PricingTableRowMobile
              category={pricing.integrations}
              plan={"enterprise"}
              icon={<PlugZapIcon className="w-4 h-4" />}
            />
            <PricingTableRowMobile
              category={pricing.commerce}
              plan={"enterprise"}
              icon={<ShoppingBagIcon className="w-4 h-4" />}
            />
            <PricingTableRowMobile
              category={pricing.ticketing}
              plan={"enterprise"}
              icon={<TicketIcon className="w-4 h-4" />}
            />
            <PricingTableRowMobile
              category={pricing.channels}
              plan={"enterprise"}
              icon={<MessageCircleIcon className="w-4 h-4" />}
            />
            <PricingTableRowMobile
              category={pricing.support}
              plan={"enterprise"}
              icon={<MessageCircleQuestionIcon className="w-4 h-4" />}
            />
          </>
        )}
      </div>

      {/* <!-- lg+ --> */}
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

              {plans.map((plan: PricingInformation) => (
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
                    <Link href={plan.href} className="w-full">
                      <Button className="mt-2 w-full">{plan.cta}</Button>
                    </Link>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="border-default divide-border dark:divide-white dark:divide-opacity-25 divide-y first:divide-y-0">
            <PricingTableRowDesktop
              category={pricing.highlight}
              icon={<Component1Icon className="w-4 h-4" />}
              sectionId="highlight"
            />
            <PricingTableRowDesktop
              category={pricing.storage}
              icon={<CloudUploadIcon className="w-4 h-4" />}
              sectionId="storage"
            />
            <PricingTableRowDesktop
              category={pricing.integrations}
              icon={<PlugZapIcon className="w-4 h-4" />}
              sectionId="integrations"
            />
            <PricingTableRowDesktop
              category={pricing.commerce}
              icon={<ShoppingBagIcon className="w-4 h-4" />}
              sectionId="commerce"
            />
            <PricingTableRowDesktop
              category={pricing.ticketing}
              icon={<TicketIcon className="w-4 h-4" />}
              sectionId="ticketing"
            />
            <PricingTableRowDesktop
              category={pricing.support}
              icon={<MessageCircleQuestionIcon className="w-4 h-4" />}
              sectionId="support"
            />
            <PricingTableRowDesktop
              category={pricing.channels}
              icon={<MessageCircleIcon className="w-4 h-4" />}
              sectionId="channels"
            />
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PricingComparisonTable;
