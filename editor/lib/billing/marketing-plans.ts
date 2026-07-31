// GRIDA-EE: billing — public presentation of the current commercial offer.

// Public presentation data for `/pricing`.
//
// This is deliberately separate from `plans.ts`: the billing catalogue must
// continue to understand historical subscriptions, while this file describes
// only the plans a visitor can choose today. Pro's displayed price still comes
// from the billing catalogue so the public and checkout amounts cannot drift.

import { PAID_PLANS, price_dollars } from "./plans";

export interface PricingInformation {
  id: string;
  name: string;
  costUnit?: string;
  href: string;
  priceMonthly: string;
  description: string;
  highlight?: boolean;
  features: {
    name: string;
    trail?: string;
  }[];
  cta: string;
}

const proMonthlyDollars = price_dollars(PAID_PLANS.pro.id, "month");

export const plans: PricingInformation[] = [
  {
    id: "tier_free",
    name: "Free",
    href: "/dashboard",
    priceMonthly: "$0",
    description: "Create and publish with Grida at no cost.",
    features: [
      { name: "Core editor, projects, and sites" },
      { name: "File uploads" },
      { name: "AI models with prepaid credit" },
    ],
    cta: "Start for free",
  },
  {
    id: "tier_pro",
    name: "Pro",
    highlight: true,
    costUnit: "per month",
    href: "/_/settings/billing/upgrade",
    priceMonthly: `$${proMonthlyDollars}`,
    description: "Keep AI credit ready for ongoing work.",
    features: [
      { name: "Everything available on Free" },
      { name: "AI credit auto-reload" },
      { name: "Organization billing and invoices" },
    ],
    cta: "Upgrade to Pro",
  },
  {
    id: "tier_custom",
    name: "Custom",
    href: "/contact",
    priceMonthly: "Custom",
    description: "Tailored terms for your organization.",
    features: [
      { name: "Bespoke pricing" },
      { name: "Deployment and integrations" },
      { name: "Security, limits, and support" },
    ],
    cta: "Contact Sales",
  },
];
