import React from "react";
import { PreferencesProvider } from "./preference-provider";

export function WorkspaceDefaultProviders({
  children,
}: React.PropsWithChildren<{}>) {
  return <PreferencesProvider>{children}</PreferencesProvider>;
}
