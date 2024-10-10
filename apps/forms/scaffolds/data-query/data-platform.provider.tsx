"use client";
import React, { createContext, useContext } from "react";

type DataPlatform =
  | { provider: "x-supabase"; supabase_project_id: number }
  | { provider: "grida" };

const DataPlatformContext = createContext<DataPlatform | null>(null);

/**
 * DataPlatformProvider is a standalone provider to define a current data provider platform.
 *
 * this is used for standalone query context to specify which feature to support and how to handle the query.
 */
export function DataPlatformProvider({
  platform,
  children,
}: React.PropsWithChildren<{ platform: DataPlatform }>) {
  return (
    <DataPlatformContext.Provider value={platform}>
      {children}
    </DataPlatformContext.Provider>
  );
}

/**
 * @returns the current working schema name
 */
export function useDataPlatform() {
  const context = useContext(DataPlatformContext);
  if (context === null) {
    throw new Error(
      "useDataPlatform must be used within a DataPlatformProvider"
    );
  }

  return context;
}
