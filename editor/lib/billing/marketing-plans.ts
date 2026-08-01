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
  priceNote?: string;
  description: string;
  highlight?: boolean;
  features: {
    name: string;
    trail?: string;
  }[];
  cta: string;
}

const proMonthlyDollars = price_dollars(PAID_PLANS.pro.id, "month");

const freePlan: PricingInformation = {
  id: "tier_free",
  name: "Free",
  href: "/dashboard",
  priceMonthly: "$0",
  priceNote: "AI credit is purchased separately.",
  description: "The Desktop-first creative workspace, with no subscription.",
  features: [
    { name: "Grida Desktop for macOS, Windows, and Linux" },
    { name: "AI agent for local workspace files" },
    { name: "Prompt-to-editable presentation decks" },
    { name: "Human-and-AI SVG editing with clean diffs" },
    { name: "Image generation with model controls" },
    { name: "Design, code, Markdown, and media workspace" },
    { name: "Hosted AI, provider keys, or local Ollama" },
    { name: "Buy hosted AI credit as needed", trail: "$10–$500" },
  ],
  cta: "Start for free",
};

export const proPlan: PricingInformation = {
  id: "tier_pro",
  name: "Pro",
  highlight: true,
  costUnit: "per organization / month",
  href: "/_/settings/billing/upgrade",
  priceMonthly: `$${proMonthlyDollars}`,
  priceNote: "AI credit is purchased separately.",
  description: "The same creative workspace, with automatic AI-credit reload.",
  features: [
    { name: "Grida Desktop for macOS, Windows, and Linux" },
    { name: "AI agent for local workspace files" },
    { name: "Prompt-to-editable presentation decks" },
    { name: "Human-and-AI SVG editing with clean diffs" },
    { name: "Image generation with model controls" },
    { name: "Design, code, Markdown, and media workspace" },
    { name: "Hosted AI, provider keys, or local Ollama" },
    { name: "Automatic AI credit reload" },
  ],
  cta: "Upgrade to Pro",
};

const customPlan: PricingInformation = {
  id: "tier_custom",
  name: "Custom",
  href: "/contact",
  priceMonthly: "Custom",
  priceNote: "Pricing by agreement.",
  description: "Commercial and operational terms shaped around your needs.",
  features: [
    { name: "Complete Grida Desktop and web product suite" },
    { name: "Workspace agent, SVG, and presentation workflows" },
    { name: "Forms, Database/CMS, and Supabase" },
    { name: "Figma import and open-source SDKs" },
    { name: "Custom pricing and billing schedule" },
    { name: "Deployment options by agreement" },
    { name: "Integrations by agreement" },
    { name: "Support, rollout, and AI terms by agreement" },
  ],
  cta: "Contact Sales",
};

export const plans: PricingInformation[] = [freePlan, proPlan, customPlan];
