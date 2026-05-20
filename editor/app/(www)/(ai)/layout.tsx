import { AiCredits } from "@/lib/ai/credits";
import { resolveInitialAiCredits } from "@/lib/ai/credits/actions";

/**
 * Route-group layout for `/ai/**` — provides `<AiCredits.Provider>` so
 * every page inside the group consumes balance through one shared
 * controller. The initial state is server-preloaded from Metronome when
 * the visitor is signed in to an org; unauth/no-org visitors get `null`
 * cents (renders as `"—"`, not `"$0.00"`).
 *
 * Pages can still do their own auth/org plumbing where they need
 * `organizationId` or `organizationSlug` — this layout owns only the
 * credit balance surface.
 */
export default async function AiGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initial = await resolveInitialAiCredits();
  return <AiCredits.Provider initial={initial}>{children}</AiCredits.Provider>;
}
