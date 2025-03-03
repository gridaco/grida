"use client";
import { DesktopDragArea } from "@/host/desktop-drag-area";
import { usePlatform } from "@/host/platform-provider";
import * as k from "./k";

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
