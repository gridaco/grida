"use client";

import React, { createContext, useContext } from "react";

const CampaignAgentContext = createContext<{
  id: string;
  title: string;
} | null>(null);

export function CampaignAgentProvider({
  children,
  campaign,
}: {
  children: React.ReactNode;
  campaign: {
    id: string;
    title: string;
  };
}) {
  return (
    <CampaignAgentContext.Provider value={campaign}>
      {children}
    </CampaignAgentContext.Provider>
  );
}

export function useCampaignAgent() {
  const context = useContext(CampaignAgentContext);
  if (!context) {
    throw new Error("useCampaign must be used within a CampaignProvider");
  }
  return context;
}
