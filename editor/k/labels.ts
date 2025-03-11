import type { GDocumentType, PlatformPricingTier } from "@/types";

export namespace Labels {
  const doctype_labels = {
    v0_schema: "Database",
    v0_form: "Form",
    v0_site: "Site",
    v0_canvas: "Canvas",
    v0_bucket: "Storage",
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
}
