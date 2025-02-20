import React, { createContext, useContext } from "react";

export interface CTAContextValue {
  onClick: () => void;
}

export const CTAContext = createContext<CTAContextValue>({
  onClick: () => {},
});

export function CTAProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: CTAContextValue;
}) {
  return <CTAContext.Provider value={value}>{children}</CTAContext.Provider>;
}

export function useCTAContext() {
  return useContext(CTAContext);
}
