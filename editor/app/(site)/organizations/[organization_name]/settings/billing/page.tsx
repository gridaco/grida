import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BillingView from "./_view";

type Params = { organization_name: string };

export default async function OrganizationBillingPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { organization_name } = await params;
  const client = await createClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return redirect("/sign-in");

  const { data: org } = await client
    .from("organization")
    .select("id, name")
    .eq("name", organization_name)
    .single();

  if (!org) return notFound();

  return <BillingView orgId={org.id} orgName={org.name} />;
}
