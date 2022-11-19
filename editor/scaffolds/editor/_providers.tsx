import React, { useMemo } from "react";
import { EditorShortcutsProvider } from "./editor-shortcuts-provider";
import { EditorImageRepositoryProvider } from "./editor-image-repository-provider";
import { EditorPreviewDataProvider } from "./editor-preview-provider";
import { EditorCodeWebworkerProvider } from "scaffolds/editor/editor-code-webworker-provider";
import { EditorToastProvider } from "./editor-toast-provider";
import { FigmaImageServiceProvider } from "./editor-figma-image-service-provider";
import { FigmaImageServiceProviderForCanvasRenderer } from "./editor-figma-image-service-for-canvas-provider";
import { DashboardStateProvider } from "@code-editor/dashboard";
import { useEditorState } from "core/states";

export function EditorDefaultProviders(props: { children: React.ReactNode }) {
  const [state] = useEditorState();

  const DashboardProvider = useMemo(() => {
    return state.design ? DashboardStateProvider : React.Fragment;
  }, [state.design?.version]);

  return (
    <EditorToastProvider>
      <EditorImageRepositoryProvider>
        <EditorCodeWebworkerProvider>
          <EditorPreviewDataProvider>
            <EditorShortcutsProvider>
              <FigmaImageServiceProvider filekey={state?.design?.key}>
                <FigmaImageServiceProviderForCanvasRenderer>
                  <DashboardProvider design={state.design}>
                    {props.children}
                  </DashboardProvider>
                </FigmaImageServiceProviderForCanvasRenderer>
              </FigmaImageServiceProvider>
            </EditorShortcutsProvider>
          </EditorPreviewDataProvider>
        </EditorCodeWebworkerProvider>
      </EditorImageRepositoryProvider>
    </EditorToastProvider>
  );
}
