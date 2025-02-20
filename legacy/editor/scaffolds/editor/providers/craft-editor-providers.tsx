import React from "react";
import { EditorShortcutsProvider } from "../editor-shortcuts-provider";
import { EditorPreviewDataProvider } from "../editor-preview-provider";
import { EditorToastProvider } from "../editor-toast-provider";
import { EditorGlobalDndContextProvider } from "../editor-global-dnd-context-provider";
import { CraftAddWidgetDndContextProvider } from "@code-editor/craft";
import { EditorShortcutOverlayProvider } from "../editor-shortcut-overlay-provider";

const IS_DEV = process.env.NODE_ENV === "development";

export function CraftEditorProviders(props: { children: React.ReactNode }) {
  return (
    <EditorToastProvider>
      <EditorGlobalDndContextProvider>
        <CraftAddWidgetDndContextProvider>
          <EditorShortcutsProvider>
            <EditorShortcutOverlayProvider disabled={!IS_DEV}>
              <EditorPreviewDataProvider>
                {/*  */}
                {props.children}
              </EditorPreviewDataProvider>
            </EditorShortcutOverlayProvider>
          </EditorShortcutsProvider>
        </CraftAddWidgetDndContextProvider>
      </EditorGlobalDndContextProvider>
    </EditorToastProvider>
  );
}
