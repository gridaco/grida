"use client";

import React, { createContext } from "react";
import type { Platform } from "./platform";

const PlatformContext = createContext<{
  desktop_app_version: string | null;
  desktop_app_platform: Platform | null;
  is_desktop_app: boolean;
}>({
  desktop_app_version: null,
  desktop_app_platform: null,
  is_desktop_app: false,
});

export default function PlatformProvider({
  desktop_app_platform,
  desktop_app_version,
  children,
}: {
  desktop_app_platform: Platform | null | undefined;
  desktop_app_version: string | null | undefined;
  children: React.ReactNode;
}) {
  return (
    <PlatformContext.Provider
      value={{
        desktop_app_version: desktop_app_version ?? null,
        desktop_app_platform: desktop_app_platform ?? null,
        is_desktop_app: !!desktop_app_version,
      }}
    >
      {children}
    </PlatformContext.Provider>
  );
}

export function usePlatform() {
  return React.useContext(PlatformContext);
}
