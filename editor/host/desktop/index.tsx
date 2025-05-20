"use client";
import React from "react";
import { usePlatform } from "@/host/platform-provider";
import { cn } from "@/components/lib/utils";
import * as k from "./k";

export function DesktopDragArea({
  children,
  className,
  ...props
}: React.HtmlHTMLAttributes<HTMLDivElement>) {
  const platform = usePlatform();

  return (
    <div
      {...props}
      className={cn(
        "w-full",
        platform.is_desktop_app ? "desktop-drag-area" : "",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Sidebar header for darwin (macOS) platform.
 */
export function DarwinSidebarHeaderDragArea() {
  const platform = usePlatform();
  if (platform.desktop_app_platform === "darwin") {
    return <DesktopDragArea className="desktop-title-bar-height" />;
  }
  return null;
}

export function Win32LinuxWindowSafeArea() {
  const platform = usePlatform();
  if (!platform.is_desktop_app) return null;
  switch (platform.desktop_app_platform) {
    case "linux":
      return (
        <div
          style={{
            width: k.DESKTOP_LINUX_WINDOW_CONTROL_BUTTONS_WIDTH,
          }}
        />
      );
    case "win32":
      return (
        <div
          style={{
            width: k.DESKTOP_WIN32_WINDOW_CONTROL_BUTTONS_WIDTH,
          }}
        />
      );
    default:
      return null;
  }
}
