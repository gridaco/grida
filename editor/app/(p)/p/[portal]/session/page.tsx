import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createServerComponentWorkspaceClient,
  createServerComponentWestReferralClient,
} from "@/lib/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import CampaignReferrerCard from "./west-campaign-referrer-card";

type Params = {
  portal: string;
};

const dictionary = {
  ko: {
    now: "지금",
    past: "지난",
    upcoming: "예정된",
    campaigns: "참여중인 이벤트",
  },
  en: {
    now: "Now",
    past: "Past",
    upcoming: "Upcoming",
    campaigns: "Participating Events",
  },
};

type RangeQuery = "now" | "upcoming" | "past";
const locale = "ko"; // FIXME:
export default async function CustomerPortalSession({
  params,
}: {
  params: Promise<Params>;
}) {
  // TODO: bound by project

  const cookieStore = cookies();
  const authclient = createServerComponentWorkspaceClient(cookieStore);
  const westclient = createServerComponentWestReferralClient(cookieStore);

  const t = dictionary[locale];

  const { data } = await authclient.auth.getSession();
  // authclient.auth.getUserIdentities
  if (!data.session) {
    return redirect(`./login/`);
  }

  const { data: cus, error: cus_err } = await authclient
    .from("customer")
    .select()
    .eq("user_id", data.session.user.id)
    .single();

  // if (!cus) {
  //   console.error("session is valud, but customer not found");
  //   return redirect(`./login/`);
  // }

  const { data: iam_referrers, error: referrer_err } = await westclient
    .from("referrer")
    .select(
      `
        *,
        campaign:campaign_public(*)
      `
    );

  return (
    <main className="flex min-h-screen">
      <aside className="p-10 flex-1">
        <header className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <p className="text-muted-foreground">
              {cus?.name ?? "Customer Portal"}
            </p>
          </div>
          <Tabs defaultValue="now">
            <TabsList>
              <TabsTrigger value="now">{t.now}</TabsTrigger>
              <TabsTrigger value="upcoming">{t.upcoming}</TabsTrigger>
              <TabsTrigger value="past">{t.past}</TabsTrigger>
            </TabsList>
          </Tabs>
        </header>

        <section>
          <header className="my-2">
            <h2 className="text-xl font-bold tracking-tight">{t.campaigns}</h2>
          </header>
          {iam_referrers?.length === 0 && <Empty />}
          {iam_referrers?.map((r) => {
            const link = `/r/${r.campaign.ref}/t/${r.code}`;
            return (
              <Link key={link} href={link}>
                <CampaignReferrerCard
                  campaign={r.campaign}
                  referrer={{
                    invitation_count: 1,
                  }}
                />
              </Link>
            );
          })}
        </section>
      </aside>
    </main>
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-center justify-center w-full h-full p-10">
      <h2 className="text-xl font-bold tracking-tight text-muted-foreground">
        No Upcoming Events
      </h2>
      <p className="text-sm text-muted-foreground">
        You have no upcoming events.
      </p>
    </div>
  );
}
