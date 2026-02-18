"use client";

import type { ReactNode } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
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
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DarwinSidebarHeaderDragArea } from "@/host/desktop";
import { AboutGridaWestCard } from "./about-west-card";

type CampaignSidebarProps = {
  baseUrl: string;
  campaignsUrl: string;
};

type SidebarMenuLinkProps = {
  href: string;
  children: ReactNode;
  size?: "default" | "sm" | "lg";
  matchSubpaths?: boolean;
};

function SidebarMenuLink({
  href,
  children,
  size = "sm",
  matchSubpaths = true,
}: SidebarMenuLinkProps) {
  const pathname = usePathname();
  const isActive = matchSubpaths
    ? pathname === href || pathname.startsWith(`${href}/`)
    : pathname === href;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild size={size} isActive={isActive}>
        <Link href={href}>{children}</Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function CampaignSidebar({
  baseUrl,
  campaignsUrl,
}: CampaignSidebarProps) {
  return (
    <Sidebar>
      <DarwinSidebarHeaderDragArea />
      <SidebarHeader className="desktop-drag-area">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href={campaignsUrl}>
                <ArrowLeftIcon />
                <span className="truncate">Campaigns</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuLink href={baseUrl} matchSubpaths={false}>
                <HomeIcon className="size-3" />
                Home
              </SidebarMenuLink>
              <SidebarMenuLink href={`${baseUrl}/participants`}>
                <UsersIcon className="size-3" />
                Participants
              </SidebarMenuLink>
              <SidebarMenuLink href={`${baseUrl}/quests`}>
                <TrophyIcon className="size-3" />
                Quests
              </SidebarMenuLink>
              <SidebarMenuItem>
                <SidebarMenuButton size="sm" disabled title="Coming soon">
                  <GiftIcon className="size-3" />
                  Rewards
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuLink href={`${baseUrl}/observability`}>
                <HistoryIcon className="size-3" />
                Observability
              </SidebarMenuLink>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Design</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuLink href={`${baseUrl}/design`}>
                <PaletteIcon className="size-3" />
                Design
              </SidebarMenuLink>
              <SidebarMenuLink href={`${baseUrl}/settings`}>
                <SettingsIcon className="size-3" />
                Settings
              </SidebarMenuLink>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <AboutGridaWestCard />
      </SidebarFooter>
    </Sidebar>
  );
}
