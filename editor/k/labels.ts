import type { GDocumentType, PlatformPricingTier } from "@/types";

export namespace Labels {
  const doctype_labels = {
    v0_schema: "Database",
    v0_form: "Form",
    v0_site: "Site",
    v0_canvas: "Canvas",
    v0_bucket: "Storage",
    v0_campaign_referral: "Campaign",
  } as const;

  const price_tier_labels = {
    free: "Free",
    v0_pro: "Pro",
    v0_team: "Team",
    v0_enterprise: "Enterprise",
  } as const;

  export function doctype(dt: GDocumentType) {
    return doctype_labels[dt];
  }

  export function priceTier(tier: PlatformPricingTier) {
    return price_tier_labels[tier];
  }

  /**
   * may the fourth be with you
   *
   * (used for example date)
   */
  export const starwarsday = new Date(new Date().getFullYear(), 4, 4);
}
