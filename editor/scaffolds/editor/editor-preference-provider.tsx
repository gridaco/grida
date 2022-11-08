import React from "react";
import { Dialog } from "@mui/material";
import { EditorPreference } from "@code-editor/preferences";

export function EditorPreferenceProvider({
  children,
}: React.PropsWithChildren<{}>) {
  return (
    <>
      {children}
      <Dialog open maxWidth="lg">
        <EditorPreference />
      </Dialog>
    </>
  );
}
