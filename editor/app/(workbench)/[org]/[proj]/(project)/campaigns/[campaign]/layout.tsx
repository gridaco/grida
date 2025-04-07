import React from "react";
import { cookies } from "next/headers";
import { createRouteHandlerWestReferralClient } from "@/lib/supabase/server";
import { CampaignProvider } from "./store";
type Params = { org: string; proj: string; campaign: string };

export default async function CampaignLayout({
  params,
  children,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<Params>;
}>) {
  const { org, proj, campaign: campaign_slug } = await params;
  const cookieStore = await cookies();
  const client = createRouteHandlerWestReferralClient(cookieStore);

  const { data, error } = await client
    .from("campaign")
    .select()
    .eq("slug", campaign_slug)
    .single();

  if (error) {
    console.error("error", error);
    return <>something went wrong</>;
  }

  return <CampaignProvider campaign={data}>{children}</CampaignProvider>;
}
