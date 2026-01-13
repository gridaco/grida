import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { getLocale } from "@/i18n/server";
import { notFound, redirect } from "next/navigation";
import { createCIAMClient, service_role } from "@/lib/supabase/server";
import type { Database } from "@app/database";
import type { PostgrestError } from "@supabase/supabase-js";
import CampaignReferrerCard from "../west-campaign-referrer-card";

type Params = {
  token: string;
};

type RedeemPortalSessionReturn =
  Database["grida_ciam_public"]["Functions"]["redeem_customer_portal_session"]["Returns"];

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

export default async function CustomerPortalSessionPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token } = await params;
  const locale = await getLocale(["en", "ko"]);
  const t = dictionary[locale];

  let data: RedeemPortalSessionReturn | null = null;
  let error: PostgrestError | null = null;
  try {
    const ciam = await createCIAMClient();
    const res = await ciam.rpc("redeem_customer_portal_session", {
      p_token: token,
      p_touch: true,
    });
    data = res.data;
    error = res.error;
  } catch {
    // misconfigured environment
    return notFound();
  }

  // Treat expired and not-found the same: redirect back to login.
  // (No DB-side special casing; redemption may return empty for both cases.)
  const tokenPreview = `${token.slice(0, 6)}…${token.slice(-6)}`;
  const empty = !data || (Array.isArray(data) && data.length === 0);
  if (error || empty) {
    console.warn("[ciam]/portal session redeem failed", {
      tokenPreview,
      tokenLength: token.length,
      error: error
        ? {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
          }
        : null,
      empty,
    });
    return redirect(`../../login?from_expired=true`);
  }

  if (!data) {
    return redirect(`../../login?from_expired=true`);
  }

  const redeemed = data[0];

  const { data: cus, error: cus_err } = await service_role.workspace
    .from("customer")
    .select("uid, project_id, name")
    .eq("uid", redeemed.customer_uid)
    .eq("project_id", redeemed.project_id)
    .single();

  if (cus_err) {
    console.error("[ciam]/failed to load customer for portal session", {
      tokenPreview,
      tokenLength: token.length,
      cus_err,
    });
    return redirect(`../../login?from_expired=true`);
  }

  // NOTE:
  // West Referral tables use RLS policies that are typically satisfied by "via customer"
  // claims (e.g. JWT-backed customer session). Since portal sessions are currently URL-token
  // based and we don't yet have customer-session claims attached to DB requests, we fetch
  // via service_role on the server and filter by customer_id/project_id.
  //
  // TODO(ciam): Replace this service_role read with customer-session-oriented RLS once we
  // introduce a proper browser session/auth setup (e.g. JWT claims + custom client/proxy/
  // cookie integration) so queries can be performed under least privilege.
  const { data: iam_referrers, error: referrer_err } =
    await service_role.west_referral
      .from("referrer")
      .select(
        `
        *,
        campaign:campaign_public(
          *
        )
      `
      )
      .eq("customer_id", redeemed.customer_uid)
      .eq("project_id", redeemed.project_id)
      .order("created_at", { ascending: false });

  if (referrer_err) {
    console.error("[ciam]/referrer error", referrer_err);
  }

  console.info("[ciam]/portal session redeemed", {
    tokenPreview,
    tokenLength: token.length,
    customer_uid: redeemed.customer_uid,
    project_id: redeemed.project_id,
  });

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
