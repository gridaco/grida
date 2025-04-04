"use client";
import Link from "next/link";
import { CampaignCard } from "./campaign-card";
import EmptyWelcome from "@/components/empty";
import { createClientWestReferralClient } from "@/lib/supabase/client";
import { useProject } from "@/scaffolds/workspace";
import useSWR from "swr";
import { Spinner } from "@/components/spinner";
import { Platform } from "@/lib/platform";

type Params = {
  org: string;
  proj: string;
};

export default function ChainsPage({ params }: { params: Params }) {
  const client = createClientWestReferralClient();
  const { id: project_id } = useProject();

  const { data: campaigns, isLoading } = useSWR<
    Platform.WEST.Referral.Campaign[]
  >([project_id], {
    fetcher: async () => {
      const { data: series, error } = await client
        .from("campaign")
        .select("*")
        .eq("project_id", project_id);

      if (error) {
        throw new Error(error.message);
      }

      return series;
    },
  });

  if (!campaigns) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <main className="container mx-auto my-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
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
        {campaigns.map((s) => {
          return (
            <Link key={s.id} href={`./campaigns/${s.id}`}>
              <CampaignCard data={s} />
            </Link>
          );
        })}
      </div>
    </main>
  );
}
