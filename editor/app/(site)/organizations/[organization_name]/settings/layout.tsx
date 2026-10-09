import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SettingsShell from "./_shell";
import { billingOwner } from "@/lib/platform/billing-consumer";

type Params = { organization_name: string };

export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<Params>;
}) {
  const { organization_name } = await params;
  // Children own their current-member checks and exact sign-in continuation.
  // Source profile settings do not depend on the remote billing service.
  if (billingOwner() === "infra")
    return (
      <SettingsShell orgName={organization_name} externalBilling>
        {children}
      </SettingsShell>
    );
  const client = await createClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return redirect("/sign-in");

  const { data: org } = await client
    .from("organization")
    .select("id, name, is_enterprise")
    .eq("name", organization_name)
    .single();

  if (!org) return notFound();

  const { data: sub } = await client
    .from("v_billing_subscription")
    .select("plan")
    .eq("organization_id", org.id)
    .maybeSingle();

  const plan = sub?.plan ?? "free";

  return (
    <SettingsShell orgName={org.name} plan={plan} isCustom={org.is_enterprise}>
      {children}
    </SettingsShell>
  );
}
