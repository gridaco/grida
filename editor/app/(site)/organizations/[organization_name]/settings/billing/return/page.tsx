import Link from "next/link";
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
