import React from "react";
import { EditorPreference } from "@code-editor/preferences";

export function EditorPreferenceProvider({
  children,
}: React.PropsWithChildren<{}>) {
  return (
    <>
      <EditorPreference>{children}</EditorPreference>
    </>
  );
}
