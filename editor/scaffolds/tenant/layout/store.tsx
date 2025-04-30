"use client";

import React, { createContext, useContext } from "react";

interface CurrentTenantLayout {
  id: string;
  template: { data: any };
  metadata: unknown;
}

const TenantLayoutContext = createContext<CurrentTenantLayout | null>(null);

export function TenantLayoutProvider({
  children,
  layout,
}: {
  children: React.ReactNode;
  layout: CurrentTenantLayout;
}) {
  return (
    <TenantLayoutContext.Provider value={layout}>
      {children}
    </TenantLayoutContext.Provider>
  );
}

export function useLayout() {
  const context = useContext(TenantLayoutContext);
  if (!context) {
    throw new Error("useLayout must be used within a TenantLayoutProvider");
  }
  return context;
}
