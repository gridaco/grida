import React from "react";
import { EditorHelpFab } from "@/scaffolds/globals/editor-help-fab";
import { EditorCommandK } from "@/scaffolds/globals/editor-cmdk";
import WorkspaceSidebar from "@/scaffolds/workspace/sidebar";
import { SidebarProvider } from "@app/ui/components/sidebar";
import { ConsoleLinks } from "@/lib/platform/console-links";
import Header from "../header";

// TODO(org-home-gate): split out of `[org]/layout.tsx` so the gate renders
// bare; may stay after the gate is removed (see `home-gate.tsx`).
/**
 * The organization workspace chrome — sidebar, breadcrumb header, help and
 * command palette. Wraps the "Work" home and project pages; the home gate
 * renders without it.
 */
export function WorkspaceShell({
  org,
  children,
}: React.PropsWithChildren<{ org: string }>) {
  return (
    <SidebarProvider>
      <EditorHelpFab />
      <EditorCommandK />
      <WorkspaceSidebar consoleHref={ConsoleLinks.aiGateway(org)} />
      <div className="h-full flex flex-1 w-full">
        <div className="flex flex-col overflow-hidden w-full h-full">
          <Header />
          {children}
        </div>
      </div>
    </SidebarProvider>
  );
}
