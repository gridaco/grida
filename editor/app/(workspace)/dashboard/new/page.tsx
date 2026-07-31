// GRIDA-EE: billing — compatibility shim for retired pricing intents.

import { redirect } from "next/navigation";

type SearchParams = {
  plan?: string;
  period?: string;
};

export default async function LegacyPricingIntentPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { plan, period } = await searchParams;

  // Compatibility for old public pricing links. New links go directly to the
  // universal billing route, which handles auth and organization selection.
  if (!plan || plan === "free") redirect("/dashboard");
  if (plan === "pro" && (!period || period === "monthly")) {
    redirect("/_/settings/billing/upgrade");
  }

  // Retired or malformed offers must never be silently substituted with the
  // current paid offer.
  redirect("/pricing");
}
