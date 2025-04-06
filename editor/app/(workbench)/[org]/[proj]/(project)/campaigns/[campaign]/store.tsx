"use client";

import React, { createContext, useContext } from "react";

const CampaignContext = createContext<{
  id: number;
  ref: string;
  name: string;
} | null>(null);

export function CampaignProvider({
  children,
  campaign,
}: {
  children: React.ReactNode;
  campaign: {
    id: number;
    ref: string;
    name: string;
  };
}) {
  return (
    <CampaignContext.Provider value={campaign}>
      {children}
    </CampaignContext.Provider>
  );
}

export function useCampaign() {
  const context = useContext(CampaignContext);
  if (!context) {
    throw new Error("useCampaign must be used within a CampaignProvider");
  }
  return context;
}
