"use client";
import React from "react";
import { cn } from "@/utils";
import { usePlatform } from "./platform-provider";

export function DesktopDragArea({
  children,
  className,
  ...props
}: React.HtmlHTMLAttributes<HTMLDivElement>) {
  const platform = usePlatform();
  if (!platform.is_desktop_app) return null;

  return (
    <div {...props} className={cn("w-full desktop-drag-area", className)}>
      {children}
    </div>
  );
}
