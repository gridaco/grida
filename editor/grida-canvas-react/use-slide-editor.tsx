"use client";

import * as React from "react";
import { Editor } from "@/grida-canvas/editor";
import {
  SlideEditorMode,
  deriveSlides,
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
 * Throws if no mode is found.
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

/** Provider for the slide editor mode context. */
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
 * Create a canvas-backed `Editor` and attach a `SlideEditorMode`.
 *
 * The mode is constructed inside a `useEffect` (not `useState`) so its
 * constructor — which calls `setIsolation` — only runs in the browser.
 */
export function useSlideEditor(
  init: editor.state.IEditorStateInit,
  config?: Partial<SlideEditorModeConfig>
): { editor: Editor; slideMode: SlideEditorMode | null } {
  const editorInstance = useEditor(init, "canvas");

  const [slideMode, setSlideMode] = React.useState<SlideEditorMode | null>(
    null
  );

  React.useEffect(() => {
    const mode = new SlideEditorMode(editorInstance, config);
    setSlideMode(mode);
    return () => {
      mode.dispose();
      setSlideMode(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- config is a static object
  }, [editorInstance]);

  return React.useMemo(
    () => ({ editor: editorInstance, slideMode }),
    [editorInstance, slideMode]
  );
}

// ---------------------------------------------------------------------------
// Selectors — pure functions over state, shared with deriveSlides
// ---------------------------------------------------------------------------

const EMPTY_SLIDES: SlideDescriptor[] = [];

function selectSlides(state: editor.state.IEditorState): SlideDescriptor[] {
  const slides = deriveSlides(state);
  return slides.length === 0 ? EMPTY_SLIDES : slides;
}

function slidesEqual(a: SlideDescriptor[], b: SlideDescriptor[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false;
  }
  return true;
}

/**
 * Reactively read the slide list.
 * Re-renders when slides are added, removed, or reordered.
 */
export function useSlides(mode: SlideEditorMode): SlideDescriptor[] {
  return useEditorState(mode.editor, selectSlides, slidesEqual);
}

/**
 * Reactively read the currently isolated slide.
 * Re-renders when isolation changes.
 */
export function useCurrentSlide(mode: SlideEditorMode): SlideDescriptor | null {
  return useEditorState(
    mode.editor,
    (state) => {
      const id = state.isolation_root_node_id;
      if (!id) return null;
      return selectSlides(state).find((s) => s.id === id) ?? null;
    },
    (a, b) => a?.id === b?.id
  );
}
