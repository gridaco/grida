"use client";
import Link from "next/link";
import { CampaignCard } from "./campaign-card";
import { createClientWestReferralClient } from "@/lib/supabase/client";
import { useProject } from "@/scaffolds/workspace";
import { Spinner } from "@/components/spinner";
import { Platform } from "@/lib/platform";
import { Button } from "@/components/ui/button";
import EmptyWelcome from "@/components/empty";
import useSWR from "swr";

type Params = {
  org: string;
  proj: string;
};

export default function ChainsPage({ params }: { params: Params }) {
  const client = createClientWestReferralClient();
  const { id: project_id } = useProject();

  const { data: campaigns, isLoading } = useSWR<
    Platform.WEST.Referral.CampaignWithRef[]
  >([project_id], {
    fetcher: async () => {
      const { data: campaigns, error } = await client
        .from("campaign_with_ref")
        .select("*")
        .eq("project_id", project_id);

      if (error) {
        throw new Error(error.message);
      }

      return campaigns;
    },
  });

  console.log("campaigns", campaigns);

  if (!campaigns) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <main className="container mx-auto my-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
        <Link href={`./campaigns/new`}>
          <Button>New Campaign</Button>
        </Link>
      </header>
      <hr className="my-4" />
      {campaigns.length === 0 && (
        <EmptyWelcome
          title={"No Campaigns"}
          paragraph={
            "Campaign is for Enterprise customers. please contact your administrator for setting up campaigns"
          }
        />
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {campaigns.map((c) => {
          return (
            <Link key={c.id} href={`./campaigns/${c.ref}`}>
              <CampaignCard data={c} />
            </Link>
          );
        })}
      </div>
    </main>
  );
}
