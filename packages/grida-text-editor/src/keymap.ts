/**
 * Keyboard binding — `KeyboardEvent` → typed `Action`.
 *
 * Returns an `Action` describing what the keystroke means. The
 * orchestrator routes:
 * - `{ kind: "command", cmd }`  → `apply_command`
 * - `{ kind: "commit" | "cancel" }` → lifecycle
 * - `{ kind: "copy" | "cut" | "paste" }` → clipboard helper
 * - `{ kind: "undo" | "redo" }` → history
 *
 * Platform-aware. Two distinct modifier keys, NOT collapsed into one:
 *  - `Mod`     — command-level keys: select-all, undo, copy/cut/paste,
 *                line-start/end nav on Mac. `Cmd` on Mac, `Ctrl` on
 *                Win/Linux.
 *  - `WordMod` — word-granularity nav and word-delete. `Option/Alt` on
 *                Mac, `Ctrl` on Win/Linux.
 *
 * The package never sniffs `navigator` — the host passes `is_mac`
 * explicitly. The text-editor is a pure logic module; runtime
 * platform detection is a host concern (and `navigator` only works in
 * a browser, which would contaminate the engine's portability).
 */

import type { EditingCommand } from "./edit-command";

export type Action =
  | { kind: "command"; cmd: EditingCommand }
  | { kind: "commit" }
  | { kind: "cancel" }
  | { kind: "copy" }
  | { kind: "cut" }
  | { kind: "paste" }
  | { kind: "undo" }
  | { kind: "redo" };

/**
 * Returns `null` if the event doesn't map to any action — the relay
 * should let the textarea handle it natively (which produces an
 * `input` event for character insertion).
 *
 * `is_mac` is required: host responsibility. For browser hosts, the
 * canonical detection is
 * `/Mac|iPod|iPhone|iPad/.test(navigator.userAgent)`.
 */
export function key_event_to_action(
  e: KeyboardEvent,
  is_mac: boolean
): Action | null {
  const mod = is_mac ? e.metaKey : e.ctrlKey;
  const word_mod = is_mac ? e.altKey : e.ctrlKey;
  const shift = e.shiftKey;

  if (e.key === "Enter") return { kind: "commit" };
  if (e.key === "Escape") return { kind: "cancel" };

  if (mod) {
    switch (e.key.toLowerCase()) {
      case "a":
        return { kind: "command", cmd: { type: "select_all" } };
      case "z":
        return shift ? { kind: "redo" } : { kind: "undo" };
      case "y":
        if (!is_mac) return { kind: "redo" };
        break;
      case "c":
        return { kind: "copy" };
      case "x":
        return { kind: "cut" };
      case "v":
        return { kind: "paste" };
    }
  }

  switch (e.key) {
    case "Backspace":
      // Mac: Cmd+Backspace = delete-line (V1 single-line → doc-start).
      // Option+Backspace = delete-word. Win/Linux: Ctrl+Backspace = word.
      if (mod && is_mac) {
        return {
          kind: "command",
          cmd: { type: "backspace", granularity: "line" },
        };
      }
      return {
        kind: "command",
        cmd: {
          type: "backspace",
          granularity: word_mod ? "word" : "grapheme",
        },
      };

    case "Delete":
      if (mod && is_mac) {
        return {
          kind: "command",
          cmd: { type: "delete", granularity: "line" },
        };
      }
      return {
        kind: "command",
        cmd: {
          type: "delete",
          granularity: word_mod ? "word" : "grapheme",
        },
      };

    case "ArrowLeft":
      // Mac: Cmd+Left = line start (V1 single-line → doc-start);
      // Option+Left = word-left. Win/Linux: Ctrl+Left = word-left.
      if (mod && is_mac) {
        return {
          kind: "command",
          cmd: { type: "move_doc_start", extend: shift },
        };
      }
      return {
        kind: "command",
        cmd: {
          type: "move_left",
          extend: shift,
          granularity: word_mod ? "word" : "grapheme",
        },
      };

    case "ArrowRight":
      if (mod && is_mac) {
        return {
          kind: "command",
          cmd: { type: "move_doc_end", extend: shift },
        };
      }
      return {
        kind: "command",
        cmd: {
          type: "move_right",
          extend: shift,
          granularity: word_mod ? "word" : "grapheme",
        },
      };

    case "ArrowUp":
      // Mac: Cmd+Up = doc start, plain Up = move_up (layout-dependent;
      // for single-line SVG the layout resolves to doc start).
      if (mod && is_mac) {
        return {
          kind: "command",
          cmd: { type: "move_doc_start", extend: shift },
        };
      }
      return { kind: "command", cmd: { type: "move_up", extend: shift } };

    case "ArrowDown":
      if (mod && is_mac) {
        return {
          kind: "command",
          cmd: { type: "move_doc_end", extend: shift },
        };
      }
      return { kind: "command", cmd: { type: "move_down", extend: shift } };

    case "PageUp":
      return { kind: "command", cmd: { type: "page_up", extend: shift } };

    case "PageDown":
      return { kind: "command", cmd: { type: "page_down", extend: shift } };

    case "Home":
      return {
        kind: "command",
        cmd: { type: "move_doc_start", extend: shift },
      };
    case "End":
      return {
        kind: "command",
        cmd: { type: "move_doc_end", extend: shift },
      };
  }

  return null;
}
