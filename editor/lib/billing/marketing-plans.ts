// Marketing-shaped plan data for the public pricing page (`/pricing`).
// Lives next to `plans.ts` so that any change to numbers (`plans.ts`)
// surfaces to a developer also touching the marketing surface — the two
// representations of the same plan should never silently drift.
//
// Numbers come from `plans.ts`. Copy (feature bullets, CTAs, badges,
// Free/Enterprise tiers that don't have a runtime billing row) lives
// here because the marketing surface naturally needs more than the
// runtime billing surface does.

import {
  PAID_PLANS,
  price_monthly_equivalent_dollars,
  price_dollars,
} from "./plans";

export interface PricingInformation {
  id: string;
  name: string;
  nameBadge?: string;
  costUnit?: string;
  href: string;
  priceLabel?: string;
  priceMonthly: number | string;
  /** Small note under price (e.g. "Starts from $599/mo" for Enterprise) */
  priceNote?: string;
  warning?: string;
  warningTooltip?: string;
  description: string;
  highlight?: boolean;
  features: {
    name: string;
    trail?: string;
  }[];
  cta: string;
}

const proMonthlyDollars = price_dollars(PAID_PLANS.pro.id, "month");
const teamMonthlyDollars = price_dollars(PAID_PLANS.team.id, "month");
const proAnnualMonthlyEquivDollars = price_monthly_equivalent_dollars(
  PAID_PLANS.pro.id,
  "year"
);
const teamAnnualMonthlyEquivDollars = price_monthly_equivalent_dollars(
  PAID_PLANS.team.id,
  "year"
);

export const plans: PricingInformation[] = [
  {
    id: "tier_free",
    name: "Free",
    nameBadge: "",
    href: "/dashboard/new?plan=free",
    priceLabel: "",
    priceMonthly: "$0",
    description: "Perfect for hobby projects.",
    features: [
      { name: "1,000 monthly active users" },
      { name: "Projects & Sites", trail: "3" },
      { name: "AI Credits", trail: "500" },
      { name: "Designs", trail: "♾️" },
      { name: "Forms", trail: "♾️" },
      { name: "Seats", trail: "1" },
      { name: "1GB Storage" },
    ],
    cta: "Start for free",
  },
  {
    id: "tier_pro",
    name: "Pro",
    highlight: true,
    nameBadge: "Most Popular",
    costUnit: "per seat/month",
    href: "/dashboard/new?plan=pro",
    priceLabel: "From",
    warning: "$10 in compute credits included",
    priceMonthly: `$${proMonthlyDollars}`,
    description: "For teams with creative workflows.",
    features: [
      { name: "10,000 monthly active users" },
      { name: "Unlimited Projects & Sites" },
      { name: "AI Credits", trail: "10,000" },
      { name: "Designs", trail: "♾️" },
      { name: "Forms", trail: "♾️" },
      { name: "Seats", trail: "♾️" },
      { name: "30GB Storage" },
      { name: "Email support" },
    ],
    cta: "Get Started",
  },
  {
    id: "tier_team",
    name: "Team",
    nameBadge: "",
    costUnit: "per seat/month",
    href: "/dashboard/new?plan=team",
    priceLabel: "From",
    warning: "$10 in compute credits included",
    priceMonthly: `$${teamMonthlyDollars}`,
    description: "Pro, plus more automated process",
    features: [
      { name: "50,000 monthly active users" },
      { name: "Unlimited Projects & Sites" },
      { name: "AI Credits", trail: "35,000" },
      { name: "Designs", trail: "♾️" },
      { name: "Forms", trail: "♾️" },
      { name: "Seats", trail: "♾️" },
      { name: "500GB Storage" },
      { name: "Chat support" },
    ],
    cta: "Get Started",
  },
  {
    id: "tier_enterprise",
    name: "Enterprise",
    href: "https://grida.co/d/e/c3cf8937-f4f3-4c69-81f3-8d3b9e109013",
    priceLabel: "",
    priceMonthly: "Custom",
    priceNote: "Starts from $599/mo",
    description:
      "Dedicated support and managed experience. We run it, you ship.",
    features: [
      { name: "Direct Slack access to engineers" },
      { name: "Managed platform—no fork needed" },
      { name: "Cloud or On-premises deployment" },
      { name: "Custom features tailored to you" },
    ],
    cta: "Contact Sales",
  },
];

export const save_plans: PricingInformation[] = [
  plans[0],
  {
    ...plans[1],
    priceMonthly: `$${proAnnualMonthlyEquivDollars}`,
    href: "/dashboard/new?plan=pro&period=yearly",
  },
  {
    ...plans[2],
    priceMonthly: `$${teamAnnualMonthlyEquivDollars}`,
    href: "/dashboard/new?plan=team&period=yearly",
  },
  plans[3],
];
