"use client";

import type { ReactNode } from "react";
import { cn } from "@app/ui/lib/utils";
import { TitleBar } from "./title-bar";

/**
 * Fixed-height desktop page shell.
 *
 * Desktop chrome must never participate in document scrolling. Pages
 * that need scrollable content scroll the content slot, not the
 * window body that contains the title bar.
 */
export function DesktopPageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-svh w-full flex-col bg-background", className)}>
      <TitleBar />
      {children}
    </div>
  );
}

export function DesktopPageContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className={cn("min-h-full", className)}>{children}</div>
    </main>
  );
}
