import { createRouteHandlerWestClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";
import { CampaignCard } from "./campaign-card";
import EmptyWelcome from "@/components/empty";

type Params = {
  org: string;
  proj: string;
};

export default async function ChainsPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { org, proj } = await params;
  const cookieStore = cookies();
  const client = createRouteHandlerWestClient(cookieStore);

  const { data: series, error } = await client.from("campaign").select("*");
  if (error) {
    return <div>Error: {error.message}</div>;
  }

  return (
    <main>
      {series.length === 0 && (
        <EmptyWelcome
          title={"No Campaigns"}
          paragraph={
            "Campaign is for Enterprise customers. please contact your administrator for setting up campaigns"
          }
        />
      )}
      <div className="p-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {series.map((s) => {
          return (
            <Link key={s.id} href={`/${org}/${proj}/campaigns/${s.id}`}>
              <CampaignCard data={s} />
            </Link>
          );
        })}
      </div>
    </main>
  );
}
