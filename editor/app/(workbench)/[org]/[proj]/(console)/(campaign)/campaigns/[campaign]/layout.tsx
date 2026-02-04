import { createWestReferralClient } from "@/lib/supabase/server";
import { CampaignProvider } from "./store";
import { SidebarProvider } from "@/components/ui/sidebar";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { CampaignSidebar } from "./campaign-sidebar";
type Params = { org: string; proj: string; campaign: string };

export const metadata: Metadata = {
  title: "Campaign | Grida WEST",
};

export default async function CampaignLayout({
  params,
  children,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<Params>;
}>) {
  const { org, proj, campaign: campaign_id } = await params;
  const client = await createWestReferralClient();

  const { data, error } = await client
    .from("campaign")
    .select()
    .eq("id", campaign_id)
    .single();

  if (error) {
    return notFound();
  }

  const campaignsUrl = `/${org}/${proj}/campaigns`;
  const baseUrl = `${campaignsUrl}/${campaign_id}`;

  return (
    <CampaignProvider campaign={data}>
      <SidebarProvider>
        <div className="flex flex-1 h-full overflow-hidden">
          <div className="h-full flex flex-1 w-full">
            <CampaignSidebar
              baseUrl={baseUrl}
              campaignsUrl={campaignsUrl}
              campaignTitle={data.title}
            />
            <div className="flex flex-col h-full w-full">{children}</div>
          </div>
        </div>
      </SidebarProvider>
    </CampaignProvider>
  );
}
