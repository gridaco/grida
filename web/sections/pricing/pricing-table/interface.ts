/**
 * alias: "Authentication"
 * feature: "Phone Auth - US, Canada, and India (by requests)"
 * free: "100 / Mo"
 * team: "50,000 / Mo"
 * extra: "$1 / 2K"
 */
export interface FeaturePricingItemm {
  alias: string;
  feature: string;
  // not used for now
  helpContext?: string;
  free: PricingDescription;
  team: PricingDescription;
  extra: PricingDescription;
}

/**
 * "free" : "free"
 * "no": icon - X
 * "yes": icon - V
 */
type PricingDescription = PricingQuotaDescription | "free" | "no" | "yes";

/**
 * string: "$999/GB"
 */
type PricingQuotaDescription = string;
