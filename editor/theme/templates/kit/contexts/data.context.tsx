"use client";

import React, { createContext, useContext } from "react";

const DataContext = createContext<Record<string, any>>({});

export function DataProvider({
  children,
  data,
}: {
  data: Record<string, any>;
  children: React.ReactNode;
}) {
  return (
    <DataContext.Provider value={data ?? {}}>{children}</DataContext.Provider>
  );
}

export function useData<T extends Record<string, any>>() {
  return useContext(DataContext) as T;
}
