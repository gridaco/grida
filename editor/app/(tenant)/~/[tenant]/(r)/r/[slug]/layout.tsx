import { sb } from "@/lib/supabase/server";
import { Metadata } from "next";
import { cookies, headers } from "next/headers";
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
  const headersList = headers();

  const rrwww = sb.rr.www.createRouteHandlerClient({
    headers: headersList,
    cookies: cookieStore,
  });

  const rrwest = sb.rr.west_referral.createRouteHandlerClient({
    headers: headersList,
    cookies: cookieStore,
  });

  // TODO: optimize query

  const { data: routing, error: routing_err } = await rrwww
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

  const { data: campaign, error: campaign_err } = await rrwest
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
