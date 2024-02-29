import React from "react";
import { EditorShortcutsProvider } from "../editor-shortcuts-provider";
import { EditorPreviewDataProvider } from "../editor-preview-provider";
import { EditorToastProvider } from "../editor-toast-provider";
import { EditorGlobalDndContextProvider } from "../editor-global-dnd-context-provider";

export function BuilderProviders(props: { children: React.ReactNode }) {
  return (
    <EditorToastProvider>
      <EditorGlobalDndContextProvider>
        <EditorShortcutsProvider>
          <EditorPreviewDataProvider>
            {/*  */}
            {props.children}
          </EditorPreviewDataProvider>
        </EditorShortcutsProvider>
      </EditorGlobalDndContextProvider>
    </EditorToastProvider>
  );
}
