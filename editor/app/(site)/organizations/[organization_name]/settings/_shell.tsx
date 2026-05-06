"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
} from "@/components/ui/sidebar";

type SettingsCategory = { href: string; label: string };

export default function SettingsShell({
  orgName,
  plan,
  children,
}: {
  orgName: string;
  plan: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const settingsBase = `/organizations/${orgName}/settings`;
  const isPaidPlan = plan === "pro" || plan === "team";

  const categories: ReadonlyArray<SettingsCategory> = [
    { href: `${settingsBase}/profile`, label: "Profile" },
    { href: `${settingsBase}/billing`, label: "Billing" },
    ...(isPaidPlan
      ? []
      : [{ href: `${settingsBase}/billing/upgrade`, label: "Upgrade plan" }]),
  ];

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <Link
            href={`/organizations/${orgName}`}
            className="text-sm font-semibold px-2 py-1 hover:underline truncate"
          >
            {orgName}
          </Link>
          <Link
            href={`/organizations/${orgName}`}
            className="text-xs text-muted-foreground px-2 py-1 hover:underline inline-flex items-center gap-1"
          >
            <ArrowLeftIcon className="size-3" />
            Back to organization
          </Link>
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Settings</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {categories.map((c) => {
                  const isActive =
                    pathname === c.href || pathname?.startsWith(`${c.href}/`);
                  return (
                    <SidebarMenuItem key={c.href}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <Link href={c.href}>{c.label}</Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
