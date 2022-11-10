import React from "react";
import { EditorShortcutsProvider } from "./editor-shortcuts-provider";
import { EditorImageRepositoryProvider } from "./editor-image-repository-provider";
import { EditorPreviewDataProvider } from "./editor-preview-provider";
import { EditorCodeWebworkerProvider } from "scaffolds/editor/editor-code-webworker-provider";
import { EditorToastProvider } from "./editor-toast-provider";
import { FigmaImageServiceProvider } from "./editor-figma-image-service-provider";
import { useEditorState } from "core/states";
import { EditorPreferenceProvider } from "./editor-preference-provider";

export function EditorDefaultProviders(props: { children: React.ReactNode }) {
  const [state] = useEditorState();

  return (
    <EditorToastProvider>
      <EditorImageRepositoryProvider>
        <EditorCodeWebworkerProvider>
          <EditorPreviewDataProvider>
            <EditorPreferenceProvider>
              <EditorShortcutsProvider>
                <FigmaImageServiceProvider filekey={state?.design?.key}>
                  {props.children}
                </FigmaImageServiceProvider>
              </EditorShortcutsProvider>
            </EditorPreferenceProvider>
          </EditorPreviewDataProvider>
        </EditorCodeWebworkerProvider>
      </EditorImageRepositoryProvider>
    </EditorToastProvider>
  );
}
