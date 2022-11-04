import React from "react";
import { EditorShortcutsProvider } from "./editor-shortcuts-provider";
import { EditorImageRepositoryProvider } from "./editor-image-repository-provider";
import { EditorPreviewDataProvider } from "./editor-preview-provider";
import { EditorCodeWebworkerProvider } from "scaffolds/editor/editor-code-webworker-provider";
import { ToastProvider } from "./editor-toast-provider";
import { FigmaImageServiceProvider } from "./editor-figma-image-service-provider";
import { useEditorState } from "core/states";

export function EditorDefaultProviders(props: { children: React.ReactNode }) {
  const [state] = useEditorState();

  return (
    <EditorImageRepositoryProvider>
      <EditorCodeWebworkerProvider>
        <EditorPreviewDataProvider>
          <EditorShortcutsProvider>
            <FigmaImageServiceProvider filekey={state?.design?.key}>
              <ToastProvider>{props.children}</ToastProvider>
            </FigmaImageServiceProvider>
          </EditorShortcutsProvider>
        </EditorPreviewDataProvider>
      </EditorCodeWebworkerProvider>
    </EditorImageRepositoryProvider>
  );
}
