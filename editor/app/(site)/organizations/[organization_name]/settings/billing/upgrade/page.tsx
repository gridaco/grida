// GRIDA-EE: billing — standard Pro upgrade entry point.
import { billingHandoff } from "@/lib/platform/billing-handoff";

type Params = { organization_name: string };

export default async function OrganizationBillingUpgradePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { organization_name } = await params;
  await billingHandoff(organization_name, "upgrade");
  return null;
}
