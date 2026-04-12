"use client";

import * as React from "react";
import { Editor } from "@/grida-canvas/editor";
import {
  SlideEditorMode,
  type SlideDescriptor,
  type SlideEditorModeConfig,
} from "@/grida-canvas/modes";
import { useEditor, useEditorState } from "./use-editor";
import type { editor } from "@/grida-canvas";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const SlideEditorModeContext = React.createContext<SlideEditorMode | null>(
  null
);

/**
 * Retrieve the current `SlideEditorMode` from context.
 *
 * Must be used inside a `<SlideEditorModeProvider>` (or the provider set up
 * by `useSlideEditor`). Throws if no mode is found.
 */
export function useSlideEditorMode(): SlideEditorMode {
  const mode = React.useContext(SlideEditorModeContext);
  if (!mode) {
    throw new Error(
      "useSlideEditorMode must be used within a SlideEditorModeProvider"
    );
  }
  return mode;
}

/**
 * Provider for the slide editor mode context.
 *
 * Wraps children so that `useSlideEditorMode()` resolves to the given mode.
 */
export function SlideEditorModeProvider({
  mode,
  children,
}: React.PropsWithChildren<{ mode: SlideEditorMode }>) {
  return (
    <SlideEditorModeContext.Provider value={mode}>
      {children}
    </SlideEditorModeContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook: create editor + mode
// ---------------------------------------------------------------------------

/**
 * Create a canvas-backed `Editor` and attach a `SlideEditorMode` to it.
 *
 * This is the primary entry point for slides pages. It replaces the
 * combination of `useEditor()` + `<SlideIsolationCameraFit />` +
 * `useAddSlide()` + `useSlidesHotKeys()` from the PoC.
 *
 * @returns A stable object containing `editor` and `slideMode`.
 */
export function useSlideEditor(
  init: editor.state.IEditorStateInit,
  config?: Partial<SlideEditorModeConfig>
): { editor: Editor; slideMode: SlideEditorMode } {
  const editorInstance = useEditor(init, "canvas");

  const [slideMode] = React.useState(
    () => new SlideEditorMode(editorInstance, config)
  );

  React.useEffect(() => {
    return () => {
      slideMode.dispose();
    };
  }, [slideMode]);

  return React.useMemo(
    () => ({ editor: editorInstance, slideMode }),
    [editorInstance, slideMode]
  );
}

// ---------------------------------------------------------------------------
// Derived hooks
// ---------------------------------------------------------------------------

/**
 * Reactively read the slide list from a `SlideEditorMode`.
 *
 * Re-renders when the slide list changes (trays added, removed, reordered).
 */
export function useSlides(mode: SlideEditorMode): SlideDescriptor[] {
  return useEditorState(mode.editor, () => mode.slides);
}

/**
 * Reactively read the currently isolated slide.
 *
 * Re-renders when `isolation_root_node_id` changes.
 */
export function useCurrentSlide(mode: SlideEditorMode): SlideDescriptor | null {
  return useEditorState(mode.editor, () => mode.currentSlide);
}
