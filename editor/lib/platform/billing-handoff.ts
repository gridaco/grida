// GRIDA-EE: billing — published Grida entries hand off to the shared console.
import "server-only";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../supabase/server";
import {
  BillingConsumerError,
  configuredOrigin,
  consoleBillingUrl,
  type BillingDestination,
} from "./billing-consumer";

export type BillingReturnSearch = {
  intent?: string | string[];
  purchase_id?: string | string[];
};
export function sourceBillingPath(
  slug: string,
  section: "billing" | "upgrade" | "return",
  search: BillingReturnSearch = {}
): string {
  if (!/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/.test(slug))
    throw new BillingConsumerError();
  const base = `/organizations/${slug}/settings/billing${section === "billing" ? "" : `/${section}`}`;
  if (section !== "return") return base;
  const query = new URLSearchParams();
  if (search.purchase_id !== undefined) {
    if (
      typeof search.purchase_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        search.purchase_id
      )
    )
      throw new BillingConsumerError();
    query.set("purchase_id", search.purchase_id);
  }
  if (search.intent !== undefined) {
    if (
      typeof search.intent !== "string" ||
      !["subscribe", "payment_method", "topup", "auto_reload_enable"].includes(
        search.intent
      )
    )
      throw new BillingConsumerError();
    query.set("intent", search.intent);
  }
  return base + (query.size ? `?${query}` : "");
}
export async function billingHandoff(
  slug: string,
  section: "billing" | "upgrade" | "return",
  search: BillingReturnSearch = {}
): Promise<{ url: string; name: string }> {
  let source: string;
  try {
    source = sourceBillingPath(slug, section, search);
  } catch {
    return notFound();
  }
  const client = await createClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError && authError.name !== "AuthSessionMissingError")
    throw new BillingConsumerError();
  if (!auth.user) {
    // The auth handler may observe the proxy's private origin. Keep the exact
    // validated resource on the configured public source across sign-in.
    const origin = configuredOrigin(
      process.env.GRIDA_OAUTH_ORIGIN,
      process.env
    );
    return redirect(`/sign-in?next=${encodeURIComponent(origin + source)}`);
  }
  const { data: org, error } = await client
    .from("organization")
    .select("id,name")
    .eq("name", slug)
    .maybeSingle();
  if (error) throw new BillingConsumerError();
  if (!org) return notFound();
  const destination: BillingDestination =
    section === "return" && typeof search.purchase_id === "string"
      ? { section: "purchase", purchaseId: search.purchase_id }
      : { section: section === "upgrade" ? "upgrade" : "billing" };
  const url = consoleBillingUrl(org.id, destination);
  if (section !== "return" || search.purchase_id) return redirect(url);
  // Released intent-only returns have no durable destination purchase UUID.
  // They must not guess the latest purchase or report a processor success.
  return { url, name: org.name };
}
