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
    href: "/dashboard/new?plan=free",
    priceLabel: "",
    priceMonthly: "$0",
    description: "Perfect for hobby projects.",
    features: [
      {
        name: "1,000 monthly active users",
      },
      {
        name: "Projects & Sites",
        trail: "3",
      },
      {
        name: "AI Credits",
        trail: "500",
      },
      {
        name: "Designs",
        trail: "♾️",
      },
      {
        name: "Forms",
        trail: "♾️",
      },
      {
        name: "Seats",
        trail: "1",
      },
      {
        name: "1GB Storage",
      },
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
    priceMonthly: `$20`,
    description: "For teams with creative workflows.",
    features: [
      {
        name: "10,000 monthly active users",
      },
      {
        name: "Unlimited Projects & Sites",
      },
      {
        name: "AI Credits",
        trail: "10,000",
      },
      {
        name: "Designs",
        trail: "♾️",
      },
      {
        name: "Forms",
        trail: "♾️",
      },
      {
        name: "Seats",
        trail: "♾️",
      },
      {
        name: "30GB Storage",
      },
      {
        name: "Email support",
      },
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
    priceMonthly: `$60`,
    description: "Pro, plus more automated process",
    features: [
      {
        name: "50,000 monthly active users",
      },
      {
        name: "Unlimited Projects & Sites",
      },
      {
        name: "AI Credits",
        trail: "35,000",
      },
      {
        name: "Designs",
        trail: "♾️",
      },
      {
        name: "Forms",
        trail: "♾️",
      },
      {
        name: "Seats",
        trail: "♾️",
      },
      {
        name: "500GB Storage",
      },
      {
        name: "Chat support",
      },
    ],
    cta: "Get Started",
  },
  {
    id: "tier_enterprise",
    name: "Enterprise",
    href: "https://grida.co/d/e/c3cf8937-f4f3-4c69-81f3-8d3b9e109013",
    description:
      "For large-scale and building custom solutions on top fo Grida",
    features: [
      {
        name: "Dedicated support",
      },
      {
        name: "Dedicated instance",
      },
      {
        name: "Bulk operations",
      },
      {
        name: "Any Custom feature you need",
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
    priceMonthly: `$16`,
    href: "/dashboard/new?plan=pro&period=yearly",
  },
  {
    ...plans[2],
    priceMonthly: `$48`,
    href: "/dashboard/new?plan=team&period=yearly",
  },
  plans[3],
];
