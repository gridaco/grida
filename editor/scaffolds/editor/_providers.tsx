import React from "react";
import { EditorShortcutsProvider } from "./editor-shortcuts-provider";
import { EditorImageRepositoryProvider } from "./editor-image-repository-provider";
import { EditorPreviewDataProvider } from "./editor-preview-provider";
import { EditorCodeWebworkerProvider } from "scaffolds/editor/editor-code-webworker-provider";
import { EditorToastProvider } from "./editor-toast-provider";
import { FigmaImageServiceProvider } from "./editor-figma-image-service-provider";
import { FigmaImageServiceProviderForCanvasRenderer } from "./editor-figma-image-service-for-canvas-provider";
import { useEditorState } from "core/states";

export function EditorDefaultProviders(props: { children: React.ReactNode }) {
  const [state] = useEditorState();

  return (
    <EditorToastProvider>
      <EditorImageRepositoryProvider>
        <EditorCodeWebworkerProvider>
          <EditorPreviewDataProvider>
            <EditorShortcutsProvider>
              <FigmaImageServiceProvider filekey={state?.design?.key}>
                <FigmaImageServiceProviderForCanvasRenderer>
                  {props.children}
                </FigmaImageServiceProviderForCanvasRenderer>
              </FigmaImageServiceProvider>
            </EditorShortcutsProvider>
          </EditorPreviewDataProvider>
        </EditorCodeWebworkerProvider>
      </EditorImageRepositoryProvider>
    </EditorToastProvider>
  );
}
