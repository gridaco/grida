import { AiCredits } from "@/lib/ai/credits";
import { resolveInitialAiCredits } from "@/lib/ai/credits/actions";

/**
 * Route-group layout for `/svg` — provides `<AiCredits.Provider>` so the
 * AI chat panel can render a balance / BYOK chip via `useAiCredits()`.
 * Mirrors the `(www)/(ai)/layout.tsx` pattern. Initial state is server-
 * preloaded; unauth visitors get `{ cents: null, allowed: false, byok }`.
 */
export default async function SvgLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initial = await resolveInitialAiCredits();
  return <AiCredits.Provider initial={initial}>{children}</AiCredits.Provider>;
}
