"use client";

import { Features } from "@/lib/features/scheduling";
import React, { createContext, useContext, useMemo } from "react";
import type { CampaignMeta } from "@/types";

interface State {
  campaign: CampaignMeta;
}

const FormCampaignStartPageContext = createContext<State | null>(null);

export function FormCampaignStartPageContextProvider({
  children,
  value,
}: React.PropsWithChildren<{ value: CampaignMeta }>) {
  return (
    <FormCampaignStartPageContext.Provider value={{ campaign: value }}>
      {children}
    </FormCampaignStartPageContext.Provider>
  );
}

export function useCampaignMeta() {
  const context = useContext(FormCampaignStartPageContext);
  if (!context) {
    throw new Error(
      "useCampaignMeta must be used within a FormCampaignStartPageContextProvider"
    );
  }

  const { campaign } = context;

  const {
    is_force_closed,
    is_scheduling_enabled,
    scheduling_close_at,
    scheduling_open_at,
    scheduling_tz,
  } = campaign ?? {};

  const is_schedule_in_range = useMemo(() => {
    if (!is_scheduling_enabled) return false;

    return Features.schedule_in_range({
      open: scheduling_open_at,
      close: scheduling_close_at,
    });
  }, [is_scheduling_enabled, scheduling_open_at, scheduling_close_at]);

  return {
    ...campaign,
    is_schedule_in_range,
  };
}
