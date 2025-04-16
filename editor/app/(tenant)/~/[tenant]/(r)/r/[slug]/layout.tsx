import {
  createRouteHandlerWestReferralClient,
  createRouteHandlerWWWClient,
} from "@/lib/supabase/server";
import { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { CampaignAgentProvider } from "./store";
import { TenantLayoutProvider } from "@/scaffolds/tenant";

type Params = {
  tenant: string;
  slug: string;
};

async function fetchCampaign({ params }: { params: Params }) {
  const { slug } = params;
  const route_path = "/r/" + slug;
  const cookieStore = cookies();
  const routing_client = createRouteHandlerWWWClient(cookieStore);
  const west_client = createRouteHandlerWestReferralClient(cookieStore);

  // TODO: optimize query

  const { data: routing, error: routing_err } = await routing_client
    .from("public_route")
    .select(
      `
        *,
        template(*)
      `
    )
    .eq("route_path", route_path)
    .eq("document_type", "v0_campaign_referral")
    .single();

  if (routing_err) {
    console.error("routing error", routing_err);
    return notFound();
  }

  const { document_id, template, ...route } = routing;

  const { data: campaign, error: campaign_err } = await west_client
    .from("campaign_public")
    .select()
    .eq("id", document_id)
    .single();

  if (campaign_err) {
    console.error("campaign error", document_id, campaign_err);
    return notFound();
  }

  return {
    route,
    template,
    campaign,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { campaign } = await fetchCampaign({ params: await params });

  // const og_image = data?.og_image
  //   ? workspaceclient.storage.from("www").getPublicUrl(data.og_image).data.publicUrl
  //   : null;

  // const og_images = Tenant.www.metadata.getOpenGraphImages(og_image);

  return {
    title: campaign.title || undefined,
    description: campaign.description || undefined,
    // TODO: og image from campaign
    // openGraph: {
    //   images: og_images,
    // },
  };
}

export default async function Layout({
  params,
  children,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<Params>;
}>) {
  const { route, campaign, template } = await fetchCampaign({
    params: await params,
  });

  return (
    <TenantLayoutProvider
      layout={{ id: route.id, template: template!, metadata: route.metadata }}
    >
      <CampaignAgentProvider campaign={campaign}>
        {children}
      </CampaignAgentProvider>
    </TenantLayoutProvider>
  );
}
