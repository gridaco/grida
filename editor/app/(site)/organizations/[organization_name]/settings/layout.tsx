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
  // Billing handoffs and the profile view enforce auth and the caller's RLS
  // organization lookup. Keep their resource-specific sign-in continuation.
  return <SettingsShell orgName={organization_name}>{children}</SettingsShell>;
}
