import {
  createWestReferralClient,
  createWWWClient,
} from "@/lib/supabase/server";
import { Metadata } from "next";
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

  const wwwClient = await createWWWClient();

  const westClient = await createWestReferralClient();

  // TODO: optimize query

  const { data: routing, error: routing_err } = await wwwClient
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

  const { data: campaign, error: campaign_err } = await westClient
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

export async function generateMetadata(
  props: {
    params: Promise<Params>;
  }
): Promise<Metadata> {
  const params = await props.params;
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

export default async function Layout(
  props: Readonly<{
    children: React.ReactNode;
    params: Promise<Params>;
  }>
) {
  const params = await props.params;

  const {
    children
  } = props;

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
