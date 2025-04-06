import { GridaLogo } from "@/components/grida-logo";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createServerComponentWorkspaceClient,
  createServerComponentWestReferralClient,
} from "@/lib/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import CampaignReferrerCard from "./west-campaign-referrer-card";
const mock = {
  project_name: "Project Name",
};

type Params = {
  portal: string;
};

const dictionary = {
  ko: {
    campaigns: "참여중인 이벤트",
  },
  en: {
    campaigns: "Participating Events",
  },
};

export default async function CustomerPortalSession({
  params,
}: {
  params: Promise<Params>;
}) {
  const { project_name } = mock;
  const cookieStore = cookies();
  const authclient = createServerComponentWorkspaceClient(cookieStore);
  const westclient = createServerComponentWestReferralClient(cookieStore);
  const locale = "ko"; // FIXME:

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
    // TODO: project
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
      <aside className="flex flex-col p-10 bg-primary text-primary-foreground">
        <header>{project_name}</header>
        <div className="flex-1" />
        <div>
          <span className="text-xs">Powered by</span>
          <span className="ml-2">
            <GridaLogo size={15} className="fill-white" />
          </span>
        </div>
      </aside>
      <aside className="p-10 flex-1">
        <Tabs defaultValue="campaigns">
          <TabsList>
            <TabsTrigger value="campaigns">{t.campaigns}</TabsTrigger>
          </TabsList>
          <TabsContent value="campaigns">
            {iam_referrers?.map((r) => {
              const link = `/r/${r.campaign_id}/${r.code}`;
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
          </TabsContent>
        </Tabs>
      </aside>
    </main>
  );
}
