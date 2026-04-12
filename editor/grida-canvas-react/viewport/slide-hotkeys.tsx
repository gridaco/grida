"use client";

import { useHotkeys } from "react-hotkeys-hook";
import { useCurrentEditor } from "../use-editor";
import { useEditorHotKeys } from "./hotkeys";
import type { SlideEditorMode } from "@/grida-canvas/modes/slide-mode";
import {
  slideKeybindings,
  slideKeybindingHandlers,
} from "@/grida-canvas/modes/slide-keybindings";
import { keybindingToHotkeysString } from "@/grida-canvas/keybinding";

/**
 * Slides-specific keyboard shortcut registration.
 *
 * Registers the full editor hotkey set via {@link useEditorHotKeys}, then
 * layers on slide-specific bindings from the declarative
 * {@link slideKeybindingHandlers} definitions.
 *
 * This is a thin bridge: the binding definitions and handler logic live in
 * `grida-canvas/modes/slide-keybindings.ts`. This hook converts them into
 * `react-hotkeys-hook` registrations.
 */
export function useSlideKeybindings(mode: SlideEditorMode): void {
  // Register all standard editor hotkeys first.
  useEditorHotKeys();

  const editor = useCurrentEditor();

  for (const handler of slideKeybindingHandlers) {
    const binding = slideKeybindings[handler.id];
    const hotkeysStr = keybindingToHotkeysString(binding);

    // eslint-disable-next-line react-hooks/rules-of-hooks -- handlers
    // array is static and never changes between renders, so the hook
    // count is stable.
    useHotkeys(
      hotkeysStr,
      (e) => {
        if (handler.when && !handler.when(editor.state, mode)) return;
        e.preventDefault();
        handler.execute(editor, mode);
      },
      {
        preventDefault: false,
        enableOnFormTags: false,
        enableOnContentEditable: false,
        ignoreModifiers: true,
      }
    );
  }
}
