"use client";

import type { ReactNode } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { ResourceTypeIcon } from "@/components/resource-type-icon";
import { DarwinSidebarHeaderDragArea } from "@/host/desktop";
import { ArrowLeftIcon } from "@radix-ui/react-icons";
import { HomeIcon, ShieldCheckIcon, Store } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type ConsoleResourcesSidebarProps = {
  org: string;
  proj: string;
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

export function ConsoleResourcesSidebar({
  org,
  proj,
}: ConsoleResourcesSidebarProps) {
  const basePath = `/${org}/${proj}`;

  return (
    <Sidebar>
      <DarwinSidebarHeaderDragArea />
      <SidebarHeader className="desktop-drag-area">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href={basePath}>
                <ArrowLeftIcon />
                <span className="truncate">Project</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuLink href={`${basePath}/dash`}>
                <HomeIcon className="size-4" />
                Dashboard
              </SidebarMenuLink>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Customer</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuLink href={`${basePath}/customers`}>
                <ResourceTypeIcon type="customer" className="size-4" />
                Customers
              </SidebarMenuLink>
              <SidebarMenuLink href={`${basePath}/tags`}>
                <ResourceTypeIcon type="tag" className="size-4" />
                Tags
              </SidebarMenuLink>
              <SidebarMenuLink href={`${basePath}/ciam`} matchSubpaths={false}>
                <ShieldCheckIcon className="size-4" />
                CIAM
              </SidebarMenuLink>
              <SidebarMenuLink href={`${basePath}/ciam/portal`}>
                <Store className="size-4" />
                Customer Portal
              </SidebarMenuLink>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Site</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuLink href={`${basePath}/www`}>
                <ResourceTypeIcon type="v0_site" className="size-4" />
                Site Settings
              </SidebarMenuLink>
              <SidebarMenuLink href={`${basePath}/domains`}>
                <ResourceTypeIcon type="domain" className="size-4" />
                Domains
              </SidebarMenuLink>
              <SidebarMenuItem>
                <SidebarMenuButton size="sm" disabled title="Coming soon">
                  <ResourceTypeIcon type="chart" className="size-4" />
                  Analytics
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Events</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuLink href={`${basePath}/campaigns`}>
                <ResourceTypeIcon type="campaign" className="size-4" />
                Campaigns
              </SidebarMenuLink>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Advanced</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuLink href={`${basePath}/integrations`}>
                <ResourceTypeIcon type="connect" className="size-4" />
                Connections
              </SidebarMenuLink>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
