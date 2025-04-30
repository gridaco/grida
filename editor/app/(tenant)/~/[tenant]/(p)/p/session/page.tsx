import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createClient,
  createWWWClient,
  createWestReferralClient,
  service_role,
} from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import CampaignReferrerCard from "./west-campaign-referrer-card";
import Link from "next/link";
import { getLocale } from "@/i18n/server";

type Params = {
  tenant: string;
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

export default async function CustomerPortalSession({
  params,
}: {
  params: Promise<Params>;
}) {
  const { tenant } = await params;

  const locale = await getLocale(["en", "ko"]);

  const client = await createClient();
  const westClient = await createWestReferralClient();
  const wwwClient = await createWWWClient();

  const t = dictionary[locale];

  const { data } = await client.auth.getSession();

  if (!data.session) {
    return redirect(`./login/`);
  }

  const { data: wwwref, error: wwwreferr } = await service_role.www
    .from("www")
    .select("project_id")
    .eq("name", tenant)
    .single();

  if (wwwreferr) return notFound();

  const { data: cus, error: cus_err } = await client
    .from("customer")
    .select()
    .eq("project_id", wwwref.project_id)
    .eq("user_id", data.session.user.id)
    .single();

  // if (!cus) {
  //   console.error("session is valud, but customer not found");
  //   return redirect(`./login/`);
  // }

  const { data: iam_referrers, error: referrer_err } = await westClient
    .from("referrer")
    .select(
      `
        *,
        campaign:campaign_public(
          *
        )
      `
    );

  if (referrer_err) {
    console.error("referrer error", referrer_err);
  }

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
              <TabsTrigger disabled value="upcoming">
                {t.upcoming}
              </TabsTrigger>
              <TabsTrigger disabled value="past">
                {t.past}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </header>

        <section>
          <header className="my-2">
            <h2 className="text-xl font-bold tracking-tight">{t.campaigns}</h2>
          </header>
          {iam_referrers?.length === 0 && <Empty />}
          {iam_referrers?.map((r) => {
            r.campaign.www_route_path;
            // FIXME: tenant url
            const link = `${r.campaign.www_route_path}/t/${r.code}`;
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
