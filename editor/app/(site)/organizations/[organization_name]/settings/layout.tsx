import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SettingsShell from "./_shell";

type Params = { organization_name: string };

export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
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

  const { data: sub } = await client
    .from("v_billing_subscription")
    .select("plan")
    .eq("organization_id", org.id)
    .maybeSingle();

  const plan = sub?.plan ?? "free";

  return (
    <SettingsShell orgName={org.name} plan={plan}>
      {children}
    </SettingsShell>
  );
}
