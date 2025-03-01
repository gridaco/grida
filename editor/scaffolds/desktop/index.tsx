"use client";
import { DesktopDragArea } from "@/host/desktop-drag-area";
import { usePlatform } from "@/host/platform-provider";

export function DesktopSidebarHeaderDragArea() {
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
    case "win32":
      return (
        <div
          style={{
            width: 140,
          }}
        />
      );
    default:
      return null;
  }
}
