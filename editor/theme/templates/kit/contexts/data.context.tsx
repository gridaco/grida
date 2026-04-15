"use client";

import React, { createContext, useContext } from "react";

const DataContext = createContext<Record<string, unknown>>({});

export function DataProvider({
  children,
  data,
}: {
  data: Record<string, unknown>;
  children: React.ReactNode;
}) {
  return (
    <DataContext.Provider value={data ?? {}}>{children}</DataContext.Provider>
  );
}

export function useData<T extends Record<string, unknown>>() {
  return useContext(DataContext) as T;
}
