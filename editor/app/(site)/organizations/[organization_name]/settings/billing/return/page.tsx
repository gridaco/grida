import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BillingReturnView from "./_view";

type Params = { organization_name: string };
type Search = { intent?: string };

export default async function BillingReturnPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { organization_name } = await params;
  const { intent: rawIntent } = await searchParams;

  const client = await createClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return redirect("/sign-in");

  const { data: org } = await client
    .from("organization")
    .select("id, name")
    .eq("name", organization_name)
    .single();
  if (!org) return notFound();

  // Whitelist of supported intents — anything else falls back to a
  // generic wait. Drives the copy and the "settled" predicate in the view.
  const intent: "subscribe" | "payment_method" | "generic" =
    rawIntent === "subscribe" || rawIntent === "payment_method"
      ? rawIntent
      : "generic";

  return (
    <BillingReturnView orgId={org.id} orgName={org.name} intent={intent} />
  );
}
