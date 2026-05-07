import type { GDocumentType, PlanTier } from "@/types";

export namespace Labels {
  const doctype_labels = {
    v0_schema: "Database",
    v0_form: "Form",
    v0_site: "Site",
    v0_canvas: "Canvas",
    v0_bucket: "Storage",
    v0_campaign_referral: "Campaign",
  } as const;

  const plan_labels = {
    free: "Free",
    pro: "Pro",
    team: "Team",
  } as const satisfies Record<PlanTier, string>;

  export function doctype(dt: GDocumentType) {
    return doctype_labels[dt];
  }

  export function planTier(plan: PlanTier, is_enterprise = false): string {
    if (is_enterprise) return "Enterprise";
    return plan_labels[plan];
  }

  /**
   * may the fourth be with you
   *
   * (used for example date)
   */
  export const starwarsday = new Date(new Date().getFullYear(), 4, 4);
}
