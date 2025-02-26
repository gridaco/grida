"use client";

import React, { createContext } from "react";

const PlatformContext = createContext<{
  desktop_app_version: string | null;
  is_desktop_app: boolean;
}>({
  desktop_app_version: null,
  is_desktop_app: false,
});

export default function PlatformProvider({
  desktop_app_version,
  children,
}: {
  desktop_app_version: string | null | undefined;
  children: React.ReactNode;
}) {
  return (
    <PlatformContext.Provider
      value={{
        desktop_app_version: desktop_app_version ?? null,
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
