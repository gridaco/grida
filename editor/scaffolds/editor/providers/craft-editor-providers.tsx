import React from "react";
import { EditorShortcutsProvider } from "../editor-shortcuts-provider";
import { EditorPreviewDataProvider } from "../editor-preview-provider";
import { EditorToastProvider } from "../editor-toast-provider";
import { EditorGlobalDndContextProvider } from "../editor-global-dnd-context-provider";
import { CraftAddWidgetDndContextProvider } from "@code-editor/craft";

export function CraftEditorProviders(props: { children: React.ReactNode }) {
  return (
    <EditorToastProvider>
      <EditorGlobalDndContextProvider>
        <CraftAddWidgetDndContextProvider>
          <EditorShortcutsProvider>
            <EditorPreviewDataProvider>
              {/*  */}
              {props.children}
            </EditorPreviewDataProvider>
          </EditorShortcutsProvider>
        </CraftAddWidgetDndContextProvider>
      </EditorGlobalDndContextProvider>
    </EditorToastProvider>
  );
}
