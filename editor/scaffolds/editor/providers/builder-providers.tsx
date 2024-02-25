import React, { useCallback } from "react";
import { EditorShortcutsProvider } from "../editor-shortcuts-provider";
import { EditorPreviewDataProvider } from "../editor-preview-provider";
import { EditorToastProvider } from "../editor-toast-provider";
import { DashboardStateProvider } from "@code-editor/dashboard";
import { EditorState, useEditorState } from "core/states";

export function BuilderProviders(props: { children: React.ReactNode }) {
  const [state] = useEditorState();

  const DashboardProvider = useCallback(
    ({
      children,
      design,
    }: React.PropsWithChildren<{ design: EditorState["design"] }>) => {
      return state.design ? (
        <DashboardStateProvider design={design}>
          {children}
        </DashboardStateProvider>
      ) : (
        <React.Fragment>{children}</React.Fragment>
      );
    },
    [state.design?.version]
  );

  return (
    <EditorToastProvider>
      <EditorShortcutsProvider>
        <EditorPreviewDataProvider>
          {/*  */}
          {props.children}
        </EditorPreviewDataProvider>
      </EditorShortcutsProvider>
    </EditorToastProvider>
  );
}
