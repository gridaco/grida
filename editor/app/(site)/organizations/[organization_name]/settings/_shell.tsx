"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftIcon, ArrowUpRightIcon, SquareTerminal } from "lucide-react";
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
} from "@app/ui/components/sidebar";

type SettingsCategory = { href: string; label: string };

export default function SettingsShell({
  orgName,
  consoleHref,
  children,
}: {
  orgName: string;
  /** The organization's Console (AI Gateway) page. */
  consoleHref: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const settingsBase = `/organizations/${orgName}/settings`;

  const categories: ReadonlyArray<SettingsCategory> = [
    { href: `${settingsBase}/profile`, label: "Profile" },
    { href: `${settingsBase}/billing`, label: "Billing" },
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
                  // A parent's prefix-match would also light up when a child
                  // route is active (e.g. `/billing` matching on `/billing/upgrade`).
                  // Disable prefix-match when any sibling category is a child of
                  // this one — the more specific category will mark itself active.
                  const hasSiblingChild = categories.some(
                    (other) =>
                      other !== c && other.href.startsWith(`${c.href}/`)
                  );
                  const isActive = hasSiblingChild
                    ? pathname === c.href
                    : pathname === c.href ||
                      (pathname?.startsWith(`${c.href}/`) ?? false);
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
          {/* TODO(org-home-gate): Console entry added with the `/<org>` gate; revisit with the product catalogue / links cleanup. */}
          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Console">
                    <a href={consoleHref}>
                      <SquareTerminal />
                      <span>Console</span>
                      <ArrowUpRightIcon className="ms-auto opacity-50" />
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
