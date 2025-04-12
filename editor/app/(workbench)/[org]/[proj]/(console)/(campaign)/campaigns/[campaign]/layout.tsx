import React from "react";
import { cookies } from "next/headers";
import { createRouteHandlerWestReferralClient } from "@/lib/supabase/server";
import { CampaignProvider } from "./store";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarFooter,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import Link from "next/link";
import { ArrowLeftIcon } from "@radix-ui/react-icons";
import {
  GiftIcon,
  HistoryIcon,
  HomeIcon,
  PaletteIcon,
  SettingsIcon,
  TrophyIcon,
  UsersIcon,
} from "lucide-react";
import { AboutGridaWestCard } from "./about-west-card";
type Params = { org: string; proj: string; campaign: string };

export default async function CampaignLayout({
  params,
  children,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<Params>;
}>) {
  const { org, proj, campaign: campaign_id } = await params;
  const cookieStore = await cookies();
  const client = createRouteHandlerWestReferralClient(cookieStore);

  const { data, error } = await client
    .from("campaign")
    .select()
    .eq("id", campaign_id)
    .single();

  if (error) {
    console.error("error", error);
    return <>something went wrong</>;
  }

  const base_url = `/${org}/${proj}/campaigns/${campaign_id}`;

  return (
    <CampaignProvider campaign={data}>
      <SidebarProvider>
        <div className="flex flex-1 overflow-y-auto">
          <div className="h-full flex flex-1 w-full">
            <Sidebar>
              <SidebarHeader>
                <SidebarMenu>
                  <Link href={`/${org}/${proj}/campaigns`}>
                    <SidebarMenuItem>
                      <SidebarMenuButton>
                        <ArrowLeftIcon />
                        <span className="truncate">{data.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </Link>
                </SidebarMenu>
              </SidebarHeader>
              <SidebarContent>
                <SidebarGroup>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <Link href={`${base_url}`}>
                        <SidebarMenuItem>
                          <SidebarMenuButton size="sm">
                            <HomeIcon className="size-3" />
                            Home
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      </Link>
                      <Link href={`${base_url}/participants`}>
                        <SidebarMenuItem>
                          <SidebarMenuButton size="sm">
                            <UsersIcon className="size-3" />
                            Participants
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      </Link>
                      <Link href={`${base_url}/quests`}>
                        <SidebarMenuItem>
                          <SidebarMenuButton size="sm">
                            <TrophyIcon className="size-3" />
                            Quests
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      </Link>
                      <Link href={`${base_url}/rewards`}>
                        <SidebarMenuItem>
                          <SidebarMenuButton size="sm">
                            <GiftIcon className="size-3" />
                            Rewards
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      </Link>
                      <Link href={`${base_url}/observability`}>
                        <SidebarMenuItem>
                          <SidebarMenuButton size="sm">
                            <HistoryIcon className="size-3" />
                            Observability
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      </Link>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
                <SidebarGroup>
                  <SidebarGroupLabel>Design</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <Link href={`${base_url}/design`}>
                        <SidebarMenuItem>
                          <SidebarMenuButton size="sm">
                            <PaletteIcon className="size-3" />
                            Design
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      </Link>
                      <Link href={`${base_url}/settings`}>
                        <SidebarMenuItem>
                          <SidebarMenuButton size="sm">
                            <SettingsIcon className="size-3" />
                            Settings
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      </Link>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
              <SidebarFooter>
                <AboutGridaWestCard />
              </SidebarFooter>
            </Sidebar>
            <div className="flex flex-col overflow-hidden w-full h-full">
              <div className="w-full h-full overflow-x-hidden overflow-y-auto">
                {children}
              </div>
            </div>
          </div>
        </div>
      </SidebarProvider>
    </CampaignProvider>
  );
}
