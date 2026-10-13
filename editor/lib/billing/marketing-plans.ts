// GRIDA-EE: billing — public presentation of the current commercial offer.

// Public presentation data for `/pricing`. Commercial policy lives in Platform.

export interface PricingInformation {
  id: string;
  name: string;
  href: string;
  priceMonthly: string;
  priceNote?: string;
  description: string;
  /** Short highlights shown on the plan card. */
  features?: string[];
  cta: string;
}

export const freePlan: PricingInformation = {
  id: "tier_free",
  name: "Free",
  href: "/dashboard",
  priceMonthly: "Free",
  priceNote: "Open source under Apache 2.0.",
  description:
    "Grida is free and open source, with every feature included and no subscription.",
  features: [
    "Every feature included",
    "Open source under Apache 2.0",
    "Desktop apps for macOS, Windows, and Linux",
    "Bring your own AI keys or local models",
  ],
  cta: "Start for free",
};

export const customPlan: PricingInformation = {
  id: "tier_custom",
  name: "Custom",
  href: "/contact",
  priceMonthly: "Custom",
  priceNote: "Pricing by agreement.",
  description: "Commercial and operational terms shaped around your needs.",
  cta: "Contact Sales",
};

/** Columns of the public comparison table. */
export const plans: PricingInformation[] = [freePlan, customPlan];
