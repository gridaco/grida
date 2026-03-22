/**
 * Maps keyboard events to text editing commands for the WASM text editing
 * engine.
 *
 * The mapping is platform-aware (macOS uses Cmd, Windows/Linux uses Ctrl).
 * Returns `null` if the key event does not map to a text editing command.
 */

import type { TextEditCommand } from "@grida/canvas-wasm";

const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);

/**
 * Map a `keydown` event to a `TextEditCommand` for the WASM text editing
 * engine. Returns `null` if the event does not correspond to an editing
 * command (e.g. it's a modifier-only press or an unrecognized key).
 */
export function keyEventToTextEditCommand(
  e: KeyboardEvent
): TextEditCommand | null {
  const mod = IS_MAC ? e.metaKey : e.ctrlKey;
  const shift = e.shiftKey;
  // Word-level navigation modifier: Option on Mac, Ctrl on Win/Linux.
  const wordMod = IS_MAC ? e.altKey : e.ctrlKey;
  // Normalize single-letter keys for consistent shortcut matching across browsers/platforms.
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  // --- Undo / Redo ---
  // Note: undo/redo is typically intercepted earlier in handleKeyDown
  // (which handles cascading session → document undo). This branch
  // exists so the mapping is complete when used standalone.
  if (mod && !e.altKey && key === "z") {
    return shift ? { type: "Redo" } : { type: "Undo" };
  }
  // Cmd+Shift+Z on Mac, Ctrl+Y on Win/Linux
  if (!IS_MAC && mod && key === "y") {
    return { type: "Redo" };
  }

  // --- Select All ---
  if (mod && key === "a") {
    return { type: "SelectAll" };
  }

  // --- Navigation ---
  switch (e.key) {
    case "ArrowLeft":
      if (mod && IS_MAC) return { type: "MoveHome", extend: shift }; // Cmd+Left = line start on Mac
      if (wordMod) return { type: "MoveWordLeft", extend: shift };
      return { type: "MoveLeft", extend: shift };

    case "ArrowRight":
      if (mod && IS_MAC) return { type: "MoveEnd", extend: shift }; // Cmd+Right = line end on Mac
      if (wordMod) return { type: "MoveWordRight", extend: shift };
      return { type: "MoveRight", extend: shift };

    case "ArrowUp":
      if (mod && IS_MAC) return { type: "MoveDocStart", extend: shift };
      return { type: "MoveUp", extend: shift };

    case "ArrowDown":
      if (mod && IS_MAC) return { type: "MoveDocEnd", extend: shift };
      return { type: "MoveDown", extend: shift };

    case "Home":
      return mod
        ? { type: "MoveDocStart", extend: shift }
        : { type: "MoveHome", extend: shift };

    case "End":
      return mod
        ? { type: "MoveDocEnd", extend: shift }
        : { type: "MoveEnd", extend: shift };

    case "PageUp":
      return { type: "MovePageUp", extend: shift };

    case "PageDown":
      return { type: "MovePageDown", extend: shift };
  }

  // --- Deletion ---
  if (e.key === "Backspace") {
    if (mod && IS_MAC) return { type: "BackspaceLine" };
    if (wordMod) return { type: "BackspaceWord" };
    return { type: "Backspace" };
  }

  if (e.key === "Delete") {
    if (mod && IS_MAC) return { type: "DeleteLine" };
    if (wordMod) return { type: "DeleteWord" };
    return { type: "Delete" };
  }

  // --- Text insertion ---
  if (e.key === "Enter") {
    return { type: "Insert", text: "\n" };
  }

  if (e.key === "Tab") {
    // Insert spaces instead of a tab character (matching the Rust example)
    return { type: "Insert", text: "    " };
  }

  // Single character insertion (non-modifier, non-control keys)
  // Only handle single-char keys that are not consumed by modifiers
  if (
    e.key.length === 1 &&
    !mod &&
    !e.ctrlKey // Don't capture Ctrl+C/V/X etc.
  ) {
    return { type: "Insert", text: e.key };
  }

  return null;
}
