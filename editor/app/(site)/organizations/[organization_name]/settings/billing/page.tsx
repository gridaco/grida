// GRIDA-EE: billing — organization billing entry point.
import { billingHandoff } from "@/lib/platform/billing-handoff";

type Params = { organization_name: string };

export default async function OrganizationBillingPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { organization_name } = await params;
  await billingHandoff(organization_name, "billing");
  return null;
}
