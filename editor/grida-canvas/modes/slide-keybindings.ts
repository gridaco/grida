import type { Editor } from "@/grida-canvas/editor";
import type { editor } from "@/grida-canvas";
import { KeyCode } from "../keycode";
import { M, kb, type Keybinding } from "../keybinding";
import type { SlideEditorMode } from "./slide-mode";

// ---------------------------------------------------------------------------
// Declarative keybinding definitions
// ---------------------------------------------------------------------------

/**
 * Declarative slide keybinding definitions.
 *
 * Consumed by:
 * 1. The runtime handler registration (React bridge or headless).
 * 2. The shortcut display UI (menus, tooltips) via `keybindingsToKeyCodes`.
 * 3. Documentation / help overlay.
 */
export const slideKeybindings = {
  prevSlide: [kb(KeyCode.UpArrow), kb(KeyCode.LeftArrow)] as Keybinding,
  nextSlide: [kb(KeyCode.DownArrow), kb(KeyCode.RightArrow)] as Keybinding,
  newSlide: kb(KeyCode.Enter),
  duplicateSlide: kb(KeyCode.KeyD, M.CtrlCmd),
  deleteSlide: [kb(KeyCode.Backspace), kb(KeyCode.Delete)] as Keybinding,
} as const satisfies Record<string, Keybinding>;

export type SlideKeybindingId = keyof typeof slideKeybindings;

// ---------------------------------------------------------------------------
// Keybinding handlers
// ---------------------------------------------------------------------------

/**
 * A handler for a single slide keybinding.
 *
 * `when` is evaluated against editor state + mode to determine whether the
 * handler should fire. If omitted the handler always fires.
 */
export interface SlideKeybindingHandler {
  readonly id: SlideKeybindingId;
  /** Should this binding fire in the current state? */
  when?: (state: editor.state.IEditorState, mode: SlideEditorMode) => boolean;
  /** Execute the command. */
  execute: (editor: Editor, mode: SlideEditorMode) => void;
}

/** True when nothing is selected, or exactly one root tray is selected. */
function canNavigateSlides(
  state: editor.state.IEditorState,
  mode: SlideEditorMode
): boolean {
  if (state.selection.length === 0) return true;
  if (state.selection.length !== 1) return false;
  return mode.slides.some((s) => s.id === state.selection[0]);
}

export const slideKeybindingHandlers: readonly SlideKeybindingHandler[] = [
  {
    id: "prevSlide",
    when: canNavigateSlides,
    execute: (_e, m) => m.navigateSlide(-1),
  },
  {
    id: "nextSlide",
    when: canNavigateSlides,
    execute: (_e, m) => m.navigateSlide(1),
  },
  {
    id: "newSlide",
    when: (s) => s.selection.length === 0,
    execute: (_e, m) => {
      m.addSlide();
    },
  },
  {
    id: "duplicateSlide",
    when: (s, m) => {
      if (s.selection.length !== 1) return false;
      return m.slides.some((slide) => slide.id === s.selection[0]);
    },
    execute: (e, m) => {
      const trayId = e.state.selection[0];
      if (trayId) m.duplicateSlide(trayId);
    },
  },
  {
    id: "deleteSlide",
    when: (s, m) => {
      if (s.selection.length !== 1) return false;
      return (
        m.slides.length > 1 &&
        m.slides.some((slide) => slide.id === s.selection[0])
      );
    },
    execute: (e, m) => {
      const trayId = e.state.selection[0];
      if (trayId) m.deleteSlide(trayId);
    },
  },
];
