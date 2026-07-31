// GRIDA-EE: billing — intercepted standard Pro upgrade entry point.

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import UpgradeView from "../../upgrade/_view";
import { BillingModal } from "../../_modal-shell";

type Params = { organization_name: string };

export default async function UpgradeModalIntercept({
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
    .select("id, name, is_enterprise")
    .eq("name", organization_name)
    .single();

  if (!org) return notFound();
  if (org.is_enterprise) return redirect("/contact");

  return (
    <BillingModal
      title="Pro"
      description="Review Grida's monthly subscription for this organization."
    >
      <UpgradeView orgId={org.id} orgName={org.name} embedded />
    </BillingModal>
  );
}
