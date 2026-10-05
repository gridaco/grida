// GRIDA-EE: billing — organization billing entry point.

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { billingOwner } from "@/lib/platform/billing-consumer";
import { billingHandoff } from "@/lib/platform/billing-handoff";

type Params = { organization_name: string };

export default async function OrganizationBillingPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { organization_name } = await params;
  if (billingOwner() === "infra") {
    await billingHandoff(organization_name, "billing");
    return null;
  }
  const { default: BillingView } = await import("./_view");
  const client = await createClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return redirect("/sign-in");

  const { data: org } = await client
    .from("organization")
    .select("id, name, is_enterprise")
    .eq("name", organization_name)
    .single();

  if (!org) return notFound();

  return (
    <BillingView
      orgId={org.id}
      orgName={org.name}
      isCustom={org.is_enterprise}
    />
  );
}
