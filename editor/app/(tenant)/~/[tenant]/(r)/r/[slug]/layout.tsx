import {
  createRouteHandlerWestReferralClient,
  createRouteHandlerWWWClient,
} from "@/lib/supabase/server";
import { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { CampaignAgentProvider } from "./store";

type Params = {
  slug: string;
};

// FIXME: REPLACE_STATIC
export const metadata: Metadata = {
  title: "Polestar 친구 초대 시승 이벤트",
  description: "Polestar 시승 하고 10만원 상당의 상품권을 받아보세요.",
  openGraph: {
    images:
      "https://www.polestar.com/dato-assets/11286/1644586145-home.jpg?auto=format&w=1200&h=630&fit=crop&q=35",
  },
};

export default async function Layout({
  params,
  children,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<Params>;
}>) {
  const { slug } = await params;
  const route_path = "/r/" + slug;
  const cookieStore = cookies();
  const routing_client = createRouteHandlerWWWClient(cookieStore);
  const west_client = createRouteHandlerWestReferralClient(cookieStore);

  // TODO: optimize query

  const { data: routing, error: routing_err } = await routing_client
    .from("routing_table_public")
    .select()
    .eq("route_path", route_path)
    .eq("document_type", "v0_campaign_referral")
    .single();

  if (routing_err) {
    console.error("routing error", routing_err);
    return notFound();
  }

  const { document_id, document_type } = routing;

  const { data: campaign, error: campaign_err } = await west_client
    .from("campaign_public")
    .select()
    .eq("id", document_id)
    .single();

  if (campaign_err) {
    console.error("campaign error", document_id, campaign_err);
    return notFound();
  }

  console.log("campaign found", campaign);

  return (
    <CampaignAgentProvider campaign={campaign}>
      {children}
    </CampaignAgentProvider>
  );
}
