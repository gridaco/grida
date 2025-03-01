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

/**
 * macOS traffic lights width (without the padding or position)
 */
const DARWIN_TRAFFIC_LIGHTS_WIDTH = 54;

/**
 * macOS traffic lights height (without the padding or position)
 */
const DARWIN_TRAFFIC_LIGHTS_HEIGHT = 16;

/**
 * win32 window control buttons width - positioned at the top right corner
 */
const WIN32_WINDOW_CONTROL_BUTTONS_WIDTH = 135;

/**
 * linux window control buttons width - positioned at the top right corner
 * (may vary by theme) usually 100 ~ 120 (there is no accirate way to set/get this)
 */
const LINUX_WINDOW_CONTROL_BUTTONS_WIDTH = 120;

/**
 * title bar height, also a window control buttons height on win32 and linux.
 */
const TITLEBAR_HEIGHT = 44;

export function Win32LinuxWindowSafeArea() {
  const platform = usePlatform();
  if (!platform.is_desktop_app) return null;
  switch (platform.desktop_app_platform) {
    case "linux":
      return (
        <div
          style={{
            width: LINUX_WINDOW_CONTROL_BUTTONS_WIDTH,
          }}
        />
      );
    case "win32":
      return (
        <div
          style={{
            width: WIN32_WINDOW_CONTROL_BUTTONS_WIDTH,
          }}
        />
      );
    default:
      return null;
  }
}
