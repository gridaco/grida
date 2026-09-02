"use server";

// GRIDA-EE: entitlement — session-resolved recovery context for hosted AI.

import { resolveSessionOrganization } from "@/lib/auth/organization";
import { getEntitlement } from "@/lib/billing/metronome";
import { createClient } from "@/lib/supabase/server";
import type { AiRunGate } from "./controller";

/**
 * Resolve display/remedy context using the authenticated session's fallback
 * organization. Use this only for actions that also omit `organizationId` and
 * therefore use the same fallback. Org-scoped callers need a resolver bound to
 * their already verified org. This is not authorization: every retry still
 * passes through the authoritative AI seam. No organization id or slug is
 * accepted from the browser.
 */
export async function resolveSessionAiRunRemedy(): Promise<AiRunGate.Remedy> {
  try {
    const client = await createClient();
    const { data } = await client.auth.getUser();
    if (!data.user) return { kind: "signed_out", href: "/sign-in" };

    const organization = await resolveSessionOrganization(data.user.id);
    if (!organization) {
      return {
        kind: "organization_required",
        href: "/organizations/new",
      };
    }

    const entitlement = await getEntitlement(organization.id);
    if (entitlement.allowed) return { kind: "ready" };

    return {
      kind: "credit_required",
      organizationName: organization.name,
      href: `/organizations/${encodeURIComponent(organization.name)}/settings/billing`,
    };
  } catch (error) {
    console.error("[ai-run-gate-hosted] failed to resolve remedy", error);
    return { kind: "unavailable" };
  }
}
