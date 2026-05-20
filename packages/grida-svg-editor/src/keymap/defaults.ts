/**
 * Default keybindings shipped with `@grida/svg-editor`.
 *
 * THIS IS THE ONLY FILE where built-in shortcuts are declared. Adding
 * a new shortcut = one new row here (plus, if the target command is
 * new, one new handler in `src/commands/defaults.ts`). That is the
 * V1 design contract.
 *
 * Same key, multiple meanings? Add multiple rows. The chain semantics
 * (handler returns `false` when not applicable) handle the rest.
 */

import { KeyCode, M, kb } from "@grida/keybinding";
import { TOOL_SET } from "../commands/defaults";
import type { Keymap, KeymapBinding } from "./keymap";

// Arrow-key nudge should fire regardless of Alt/Cmd/Ctrl — Alt-hold powers
// the measurement HUD, and the user expects to keep nudging while it's on.
// Only Shift carries meaning (1px vs 10px); the rest are "don't care".
//
// Expressed as a `meaningful` mask: only Shift is meaningful, so Ctrl/Alt/Meta
// are don't-care. `kb()` expands to the 2^3 = 8 power-set internally.
const NUDGE_MEANINGFUL = M.Shift;

export const DEFAULT_BINDINGS: readonly KeymapBinding[] = [
  // ─── history ──────────────────────────────────────────────────────────────
  { keybinding: kb(KeyCode.KeyZ, M.CtrlCmd), command: "history.undo" },
  {
    keybinding: kb(KeyCode.KeyZ, M.CtrlCmd | M.Shift),
    command: "history.redo",
  },
  { keybinding: kb(KeyCode.KeyY, M.CtrlCmd), command: "history.redo" },

  // ─── selection ────────────────────────────────────────────────────────────
  { keybinding: kb(KeyCode.Escape), command: "selection.deselect" },
  { keybinding: kb(KeyCode.Backspace), command: "selection.remove" },
  { keybinding: kb(KeyCode.Delete), command: "selection.remove" },
  { keybinding: kb(KeyCode.KeyG, M.CtrlCmd), command: "selection.group" },
  { keybinding: kb(KeyCode.KeyA, M.CtrlCmd), command: "selection.all" },

  // ─── tree navigation ─────────────────────────────────────────────────────
  // Tab / Shift+Tab cycle the selection through siblings within the
  // selected node's parent. From no selection, fall back to first/last
  // child of the current scope. Wraps at edges.
  {
    keybinding: kb(KeyCode.Tab),
    command: "selection.sibling",
    args: "next",
  },
  {
    keybinding: kb(KeyCode.Tab, M.Shift),
    command: "selection.sibling",
    args: "prev",
  },

  // ─── alignment ───────────────────────────────────────────────────────────
  // Matches Figma's mapping (Alt+A/D/W/S edges, Alt+H/V centers). The
  // headless Alt-as-measurement-HUD modifier is orthogonal: it's a held
  // state on `surface.modifiers()`; the Alt+letter chord still reaches
  // the keymap normally on keydown.
  {
    keybinding: kb(KeyCode.KeyA, M.Alt),
    command: "selection.align",
    args: "left",
  },
  {
    keybinding: kb(KeyCode.KeyD, M.Alt),
    command: "selection.align",
    args: "right",
  },
  {
    keybinding: kb(KeyCode.KeyW, M.Alt),
    command: "selection.align",
    args: "top",
  },
  {
    keybinding: kb(KeyCode.KeyS, M.Alt),
    command: "selection.align",
    args: "bottom",
  },
  {
    keybinding: kb(KeyCode.KeyH, M.Alt),
    command: "selection.align",
    args: "horizontal_centers",
  },
  {
    keybinding: kb(KeyCode.KeyV, M.Alt),
    command: "selection.align",
    args: "vertical_centers",
  },

  // ─── hierarchy ────────────────────────────────────────────────────────────
  { keybinding: kb(KeyCode.Enter), command: "hierarchy.enter" },
  { keybinding: kb(KeyCode.Enter, M.Shift), command: "hierarchy.exit" },

  // ─── nudge — Arrow (1px) and Shift+Arrow (10px) ──────────────────────────
  // Only Shift is meaningful; Alt/Cmd/Ctrl are don't-care. Alt-hold is
  // the measurement-HUD trigger and must not block movement; Cmd/Ctrl
  // are free for future "snap-override" semantics without rebinding here.
  {
    keybinding: kb(KeyCode.LeftArrow, 0, NUDGE_MEANINGFUL),
    command: "transform.nudge",
    args: { dx: -1, dy: 0 },
  },
  {
    keybinding: kb(KeyCode.RightArrow, 0, NUDGE_MEANINGFUL),
    command: "transform.nudge",
    args: { dx: 1, dy: 0 },
  },
  {
    keybinding: kb(KeyCode.UpArrow, 0, NUDGE_MEANINGFUL),
    command: "transform.nudge",
    args: { dx: 0, dy: -1 },
  },
  {
    keybinding: kb(KeyCode.DownArrow, 0, NUDGE_MEANINGFUL),
    command: "transform.nudge",
    args: { dx: 0, dy: 1 },
  },
  {
    keybinding: kb(KeyCode.LeftArrow, M.Shift, NUDGE_MEANINGFUL),
    command: "transform.nudge",
    args: { dx: -10, dy: 0 },
  },
  {
    keybinding: kb(KeyCode.RightArrow, M.Shift, NUDGE_MEANINGFUL),
    command: "transform.nudge",
    args: { dx: 10, dy: 0 },
  },
  {
    keybinding: kb(KeyCode.UpArrow, M.Shift, NUDGE_MEANINGFUL),
    command: "transform.nudge",
    args: { dx: 0, dy: -10 },
  },
  {
    keybinding: kb(KeyCode.DownArrow, M.Shift, NUDGE_MEANINGFUL),
    command: "transform.nudge",
    args: { dx: 0, dy: 10 },
  },

  // ─── tools — V (cursor) / R (rect) / O (ellipse) / L (line) ─────────────
  // Bare letter keys. The focus guard in keymap/keymap.ts already prevents
  // these from firing inside <input>/<textarea>; the dom.ts on_keydown
  // early-return suppresses them during inline SVG text edit. `T` is
  // deliberately omitted — text insertion needs its own UX design pass
  // (see TODO.md).
  { keybinding: kb(KeyCode.KeyV), command: TOOL_SET, args: { type: "cursor" } },
  {
    keybinding: kb(KeyCode.KeyR),
    command: TOOL_SET,
    args: { type: "insert", tag: "rect" },
  },
  {
    keybinding: kb(KeyCode.KeyO),
    command: TOOL_SET,
    args: { type: "insert", tag: "ellipse" },
  },
  {
    keybinding: kb(KeyCode.KeyL),
    command: TOOL_SET,
    args: { type: "insert", tag: "line" },
  },

  // ─── reorder — Illustrator/Figma convention from main editor docs ────────
  // `]` / `[`   → bring to front / send to back
  // `Mod+]` / `Mod+[` → bring forward / send backward
  {
    keybinding: kb(KeyCode.BracketRight),
    command: "reorder",
    args: "bring_to_front",
  },
  {
    keybinding: kb(KeyCode.BracketLeft),
    command: "reorder",
    args: "send_to_back",
  },
  {
    keybinding: kb(KeyCode.BracketRight, M.CtrlCmd),
    command: "reorder",
    args: "bring_forward",
  },
  {
    keybinding: kb(KeyCode.BracketLeft, M.CtrlCmd),
    command: "reorder",
    args: "send_backward",
  },
];

/** Register every default binding into a keymap. */
export function applyDefaultBindings(keymap: Keymap): void {
  for (const b of DEFAULT_BINDINGS) {
    keymap.bind(b);
  }
}
