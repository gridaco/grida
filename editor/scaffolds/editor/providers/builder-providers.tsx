import React from "react";
import { EditorShortcutsProvider } from "../editor-shortcuts-provider";
import { EditorPreviewDataProvider } from "../editor-preview-provider";
import { EditorToastProvider } from "../editor-toast-provider";

export function BuilderProviders(props: { children: React.ReactNode }) {
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
