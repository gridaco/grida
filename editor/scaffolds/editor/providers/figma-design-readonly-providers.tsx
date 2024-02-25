import React, { useCallback } from "react";
import { EditorShortcutsProvider } from "../editor-shortcuts-provider";
import { EditorImageRepositoryProvider } from "../editor-image-repository-provider";
import { EditorPreviewDataProvider } from "../editor-preview-provider";
import { EditorCodeWebworkerProvider } from "scaffolds/editor/editor-code-webworker-provider";
import { EditorToastProvider } from "../editor-toast-provider";
import { FigmaImageServiceProviderForCanvasRenderer } from "../editor-figma-image-service-for-canvas-provider";
import { DashboardStateProvider } from "@code-editor/dashboard";
import { EditorState, useEditorState } from "core/states";

export function FigmaDesignReadonlyProviders(props: {
  children: React.ReactNode;
}) {
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
          <EditorImageRepositoryProvider>
            <EditorCodeWebworkerProvider>
              <FigmaImageServiceProviderForCanvasRenderer>
                <DashboardProvider design={state.design}>
                  {props.children}
                </DashboardProvider>
              </FigmaImageServiceProviderForCanvasRenderer>
            </EditorCodeWebworkerProvider>
          </EditorImageRepositoryProvider>
        </EditorPreviewDataProvider>
      </EditorShortcutsProvider>
    </EditorToastProvider>
  );
}
