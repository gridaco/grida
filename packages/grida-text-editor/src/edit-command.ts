/**
 * Command vocabulary + dispatcher.
 *
 * Mirrors `crates/grida/src/text_edit/`'s `EditingCommand` enum.
 * `apply_command` takes a session and a command, mutates the session,
 * and returns an `EditKind` (for history grouping) or `null` when the
 * command was non-mutating (caret/selection only).
 *
 * Pure with respect to layout: every command in V1 is either purely
 * session-local or driven by the `boundaries` helpers. Layout-dependent
 * commands (`move_up`, `move_down`, etc.) are intentionally absent;
 * the host should expose backend-specific behavior via its own routing.
 */

import {
  next_grapheme,
  next_word,
  prev_grapheme,
  prev_word,
  segment_at,
  word_at,
} from "./boundaries";
import type { LayoutEngine, NavigationDirection } from "./layout-engine";
import type { TextEditSession } from "./session";

export type Granularity = "grapheme" | "word" | "line";

export type EditingCommand =
  // Mutations
  | { type: "insert"; text: string }
  | { type: "delete"; granularity?: Granularity }
  | { type: "backspace"; granularity?: Granularity }
  | { type: "replace"; start: number; end: number; text: string }
  // Caret movement — pure
  | {
      type: "move_left";
      extend: boolean;
      granularity?: "grapheme" | "word";
    }
  | {
      type: "move_right";
      extend: boolean;
      granularity?: "grapheme" | "word";
    }
  | { type: "move_doc_start"; extend: boolean }
  | { type: "move_doc_end"; extend: boolean }
  // Caret movement — layout-dependent (calls into LayoutEngine)
  | { type: "move_up"; extend: boolean }
  | { type: "move_down"; extend: boolean }
  | { type: "move_line_start"; extend: boolean }
  | { type: "move_line_end"; extend: boolean }
  | { type: "page_up"; extend: boolean }
  | { type: "page_down"; extend: boolean }
  // Selection
  | { type: "select_all" }
  | { type: "set_selection"; anchor: number; focus: number }
  | { type: "select_at"; index: number; granularity: "word" | "line" }
  // IME
  | { type: "composition_set"; text: string }
  | { type: "composition_commit"; text: string }
  | { type: "composition_cancel" };

/**
 * Per the Rust crate's `EditKind`. Classifies a mutation for undo
 * grouping. `null` means the command was non-mutating (movement,
 * selection) and shouldn't push a history entry.
 */
export type EditKind =
  | "typing"
  | "backspace"
  | "delete"
  | "paste"
  | "ime_commit"
  | "cut"
  | null;

/**
 * Dispatch `cmd` against `session`. Returns the EditKind for history
 * grouping; null means the session didn't gain a mutation (selection
 * or caret movement only).
 *
 * Layout-dependent commands (`move_up`, `move_down`, `move_line_*`,
 * `page_*`) require a `layout`. When `layout` is not provided, those
 * commands are no-ops — making the function safe to call in tests
 * without a layout for non-layout commands.
 */
export function apply_command(
  session: TextEditSession,
  cmd: EditingCommand,
  layout?: LayoutEngine
): EditKind {
  switch (cmd.type) {
    case "insert":
      return insert(session, cmd.text);

    case "delete":
      return delete_forward(session, cmd.granularity ?? "grapheme");

    case "backspace":
      return delete_backward(session, cmd.granularity ?? "grapheme");

    case "replace":
      session.replace(cmd.start, cmd.end, cmd.text);
      return "paste";

    case "move_left": {
      // Selection + arrow WITHOUT extend = collapse to the boundary;
      // the caret does NOT move past it by an extra grapheme. Matches
      // every native text editor (and `crates/grida/src/text_edit/`).
      const sel = session.selection;
      if (sel && !cmd.extend) {
        session.moveCaret(sel.start, false);
        return null;
      }
      const target = compute_left(session, cmd.granularity ?? "grapheme");
      session.moveCaret(target, cmd.extend);
      return null;
    }

    case "move_right": {
      const sel = session.selection;
      if (sel && !cmd.extend) {
        session.moveCaret(sel.end, false);
        return null;
      }
      const target = compute_right(session, cmd.granularity ?? "grapheme");
      session.moveCaret(target, cmd.extend);
      return null;
    }

    case "move_doc_start":
      session.moveCaret(0, cmd.extend);
      return null;

    case "move_doc_end":
      session.moveCaret(session.text.length, cmd.extend);
      return null;

    case "move_up":
      return nav_via_layout(session, layout, "up", cmd.extend);
    case "move_down":
      return nav_via_layout(session, layout, "down", cmd.extend);
    case "move_line_start":
      return nav_via_layout(session, layout, "line_start", cmd.extend);
    case "move_line_end":
      return nav_via_layout(session, layout, "line_end", cmd.extend);
    case "page_up":
      return nav_via_layout(session, layout, "page_up", cmd.extend);
    case "page_down":
      return nav_via_layout(session, layout, "page_down", cmd.extend);

    case "select_all":
      session.selectAll();
      return null;

    case "set_selection":
      session.setSelection(cmd.anchor, cmd.focus);
      return null;

    case "select_at": {
      if (cmd.granularity === "line") {
        session.selectAll();
      } else {
        const range = word_at(session.text, cmd.index);
        session.setSelection(range.start, range.end);
      }
      return null;
    }

    case "composition_set":
      session.setComposition(cmd.text);
      return null;

    case "composition_commit":
      session.commitComposition(cmd.text);
      return "ime_commit";

    case "composition_cancel":
      session.cancelComposition();
      return null;
  }
}

function nav_via_layout(
  session: TextEditSession,
  layout: LayoutEngine | undefined,
  direction: NavigationDirection,
  extend: boolean
): EditKind {
  if (!layout) return null;
  const target = layout.positionForNavigation(session.caret, direction);
  if (target === null) return null;
  session.moveCaret(target, extend);
  return null;
}

// ─── Mutation helpers ──────────────────────────────────────────────────────

function insert(session: TextEditSession, text: string): EditKind {
  if (!text) return null;
  session.insertText(text);
  // A single-grapheme insert is "typing"; longer chunks are paste-like.
  const grapheme_end = next_grapheme(text, 0);
  return grapheme_end === text.length ? "typing" : "paste";
}

function delete_forward(
  session: TextEditSession,
  granularity: Granularity
): EditKind {
  if (session.selection) {
    session.deleteForward();
    return "delete";
  }
  if (session.caret >= session.text.length) return null;
  if (granularity === "grapheme") {
    session.deleteForward();
    return "delete";
  }
  if (granularity === "word") {
    // Segment-based: delete the segment AT the caret. Matches the Rust
    // crate's `DeleteWord` (UAX-29 segment iteration) — at "hello|
    // world" (caret=5, right before the space) this deletes the
    // single-space segment, not the next whole word.
    const seg = segment_at(session.text, session.caret);
    if (seg.end === session.caret) return null;
    session.replace(session.caret, seg.end, "");
    return "delete";
  }
  // "line" → end of doc (V1: single line)
  if (session.text.length === session.caret) return null;
  session.replace(session.caret, session.text.length, "");
  return "delete";
}

function delete_backward(
  session: TextEditSession,
  granularity: Granularity
): EditKind {
  if (session.selection) {
    session.deleteBackward();
    return "backspace";
  }
  if (session.caret <= 0) return null;
  if (granularity === "grapheme") {
    session.deleteBackward();
    return "backspace";
  }
  if (granularity === "word") {
    // Segment-based: delete the segment immediately BEFORE the caret.
    // Matches the Rust crate's `BackspaceWord`.
    const seg = segment_at(session.text, session.caret - 1);
    if (seg.start === session.caret) return null;
    session.replace(seg.start, session.caret, "");
    return "backspace";
  }
  // "line" → start of doc (V1: single line)
  if (session.caret === 0) return null;
  session.replace(0, session.caret, "");
  return "backspace";
}

function compute_left(
  session: TextEditSession,
  granularity: "grapheme" | "word"
): number {
  if (granularity === "word") {
    return prev_word(session.text, session.caret);
  }
  return prev_grapheme(session.text, session.caret);
}

function compute_right(
  session: TextEditSession,
  granularity: "grapheme" | "word"
): number {
  if (granularity === "word") {
    return next_word(session.text, session.caret);
  }
  return next_grapheme(session.text, session.caret);
}
