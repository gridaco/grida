import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { resolveSessionOrganization } from "@/lib/auth/organization";
import { AiCredits } from "@/lib/ai/credits";
import { resolveInitialAiCredits } from "@/lib/ai/credits/actions";
import Page from "./_page";

export const metadata: Metadata = {
  title: "AI Chat — Grida",
  description:
    "Minimal AI chat wired through the Grida credit seam — for testing and dogfooding.",
  robots: { index: false, follow: false },
};

export type AiPageContext = {
  organizationId: number;
  organizationSlug: string;
};

export default async function AiChatPage() {
  // Intentionally NOT pre-gated — unauth / no-org visitors must reach the
  // chat UI and hit the gate at submit time.

  const [client, initialCredits] = await Promise.all([
    createClient(),
    resolveInitialAiCredits(),
  ]);
  const { data: auth } = await client.auth.getUser();
  const authed = !!auth.user;

  const org = auth.user ? await resolveSessionOrganization(auth.user.id) : null;
  const context: AiPageContext | null = org
    ? { organizationId: org.id, organizationSlug: org.name }
    : null;

  return (
    <AiCredits.Provider initial={initialCredits}>
      <Page authed={authed} context={context} />
    </AiCredits.Provider>
  );
}
