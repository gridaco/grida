"use client";

import React, { createContext, useContext } from "react";

const CampaignContext = createContext<{
  id: string;
  title: string;
  layout_id: string | null;
  max_invitations_per_referrer: number | null;
} | null>(null);

export function CampaignProvider({
  children,
  campaign,
}: {
  children: React.ReactNode;
  campaign: {
    id: string;
    title: string;
    layout_id: string | null;
    max_invitations_per_referrer: number | null;
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
