export interface PricingInformation {
  id: string;
  name: string;
  nameBadge?: string;
  costUnit?: string;
  href: string;
  priceLabel?: string;
  priceMonthly: number | string;
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

export const plans: PricingInformation[] = [
  {
    id: "tier_free",
    name: "Free",
    nameBadge: "",
    costUnit: "/ month",
    href: "/dashboard/new?plan=free",
    priceLabel: "",
    priceMonthly: 0,
    description: "Perfect for hobby projects.",
    features: [
      {
        name: "Responses Included",
        trail: "100 / month",
      },
      {
        name: "Additional responses",
        trail: "X",
      },
      {
        name: "Number of forms",
        trail: "5",
      },
      {
        name: "Blocks per form",
        trail: "♾️",
      },
      {
        name: "Seats",
        trail: "1",
      },
    ],
    cta: "Start for free",
  },
  {
    id: "tier_pro",
    name: "Pro",
    highlight: true,
    nameBadge: "Most Popular",
    costUnit: "/ month",
    href: "/dashboard/new?plan=pro",
    priceLabel: "From",
    warning: "$10 in compute credits included",
    priceMonthly: 20,
    description: "For teams with the option to scale.",
    features: [
      {
        name: "Responses Included",
        trail: "1,000 / month",
      },
      {
        name: "Additional responses",
        trail: "$5 per 1K",
      },
      {
        name: "Number of forms",
        trail: "♾️",
      },
      {
        name: "Blocks per form",
        trail: "♾️",
      },
      {
        name: "Seats",
        trail: "♾️",
      },
    ],
    cta: "Get Started",
  },
  {
    id: "tier_team",
    name: "Team",
    nameBadge: "",
    costUnit: "/ month",
    href: "/dashboard/new?plan=team",
    priceLabel: "From",
    warning: "$10 in compute credits included",
    priceMonthly: 60,
    description: "Pro, plus commerce features and more responses.",
    features: [
      {
        name: "Responses Included",
        trail: "10,000 / month",
      },
      {
        name: "Additional responses",
        trail: "$1 per 1K",
      },
      {
        name: "Number of forms",
        trail: "♾️",
      },
      {
        name: "Blocks per form",
        trail: "♾️",
      },
      {
        name: "Seats",
        trail: "♾️",
      },
    ],
    cta: "Get Started",
  },
  {
    id: "tier_enterprise",
    name: "Enterprise",
    href: "/enterprise",
    description:
      "For large-scale and building custom solutions on top fo Grida Forms.",
    features: [
      {
        name: "Responses Included",
        trail: "♾️",
      },
      {
        name: "Additional responses",
        trail: "$1 per 1K",
      },
      {
        name: "Number of forms",
        trail: "♾️",
      },
      {
        name: "Blocks per form",
        trail: "♾️",
      },
      {
        name: "Seats",
        trail: "♾️",
      },
    ],
    priceLabel: "",
    priceMonthly: "Custom",
    cta: "Contact Sales",
  },
];

export const save_plans: PricingInformation[] = [
  plans[0],
  {
    ...plans[1],
    priceMonthly: 10,
    href: "/dashboard/new?plan=pro&period=yearly",
  },
  {
    ...plans[2],
    priceMonthly: 48,
    href: "/dashboard/new?plan=team&period=yearly",
  },
  plans[3],
];
