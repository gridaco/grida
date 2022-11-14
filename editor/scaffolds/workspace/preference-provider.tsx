import React from "react";
import { EditorPreference } from "@code-editor/preferences";
import { EditorPreferencesRoutesProvider } from "scaffolds/preferences";

export function PreferencesProvider({ children }: React.PropsWithChildren<{}>) {
  return (
    <>
      <EditorPreference>
        <EditorPreferencesRoutesProvider>
          {children}
        </EditorPreferencesRoutesProvider>
      </EditorPreference>
    </>
  );
}
