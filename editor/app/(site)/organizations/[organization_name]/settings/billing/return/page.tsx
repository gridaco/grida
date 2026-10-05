import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { billingOwner } from "@/lib/platform/billing-consumer";
import {
  billingHandoff,
  type BillingReturnSearch,
} from "@/lib/platform/billing-handoff";
import { Button } from "@app/ui/components/button";

type Params = { organization_name: string };
type Search = BillingReturnSearch;

export default async function BillingReturnPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { organization_name } = await params;
  const search = await searchParams;
  if (billingOwner() === "infra") {
    const handoff = await billingHandoff(organization_name, "return", search);
    return (
      <main className="mx-auto w-full max-w-lg space-y-4 px-6 py-16">
        <h1 className="text-xl font-semibold">Check payment status</h1>
        <p className="text-muted-foreground">
          Open billing to check payment status for {handoff.name}.
        </p>
        <Button asChild>
          <Link href={handoff.url} prefetch={false}>
            Open billing
          </Link>
        </Button>
      </main>
    );
  }
  const { default: BillingReturnView } = await import("./_view");
  const { intent: rawIntent } = search;

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
  const intent:
    | "subscribe"
    | "payment_method"
    | "topup"
    | "auto_reload_enable"
    | "generic" =
    rawIntent === "subscribe" ||
    rawIntent === "payment_method" ||
    rawIntent === "topup" ||
    rawIntent === "auto_reload_enable"
      ? rawIntent
      : "generic";

  return (
    <BillingReturnView orgId={org.id} orgName={org.name} intent={intent} />
  );
}
