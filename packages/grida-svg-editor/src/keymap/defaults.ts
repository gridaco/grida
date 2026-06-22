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

// Arrow-key nudge (move). Shift carries meaning (1px vs 10px). Ctrl is ALSO
// meaningful and must be RELEASED for move: `Ctrl+Alt+Arrow` is reserved for
// nudge-resize below, so move must not also fire on that chord. Alt stays
// don't-care — Alt-hold powers the measurement HUD and the user expects to
// keep nudging (moving) while it's on. Meta is don't-care.
//
// Expressed as a `meaningful` mask: Shift|Ctrl are meaningful, Alt/Meta are
// don't-care. `kb()` expands the don't-care bits to a power-set internally.
const NUDGE_MEANINGFUL = M.Shift | M.Ctrl;

// Nudge-resize chord (Ctrl+Alt+Arrow). Shift|Ctrl|Alt are all meaningful;
// Meta is don't-care. Literal Ctrl (not CtrlCmd) — the chord is `Ctrl+⌥` on
// both macOS and Windows/Linux.
const RESIZE_MEANINGFUL = M.Shift | M.Ctrl | M.Alt;

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
  // Delete / Backspace are overloaded; chain order matters. In path-edit
  // (`edit-content`) mode, `vector.delete-vertex` removes the sub-selected
  // vertices / segments / tangents and consumes the key. Outside that mode
  // it returns false, so the chain falls through to `selection.remove`,
  // which deletes the selected element(s) (guarded on `select` mode). This
  // is the same `false`-return chain `content.enter` → `hierarchy.enter`
  // uses for Enter (gridaco/grida#880).
  { keybinding: kb(KeyCode.Backspace), command: "vector.delete-vertex" },
  { keybinding: kb(KeyCode.Backspace), command: "selection.remove" },
  { keybinding: kb(KeyCode.Delete), command: "vector.delete-vertex" },
  { keybinding: kb(KeyCode.Delete), command: "selection.remove" },
  { keybinding: kb(KeyCode.KeyG, M.CtrlCmd), command: "selection.group" },
  {
    keybinding: kb(KeyCode.KeyG, M.CtrlCmd | M.Shift),
    command: "selection.ungroup",
  },
  { keybinding: kb(KeyCode.KeyD, M.CtrlCmd), command: "selection.duplicate" },
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

  // ─── content edit / hierarchy ─────────────────────────────────────────────
  // Enter is overloaded; chain order matters. First try entering content
  // edit on an editable (text/vector) node; `content.enter` returns false
  // for everything else, so the chain falls through to hierarchy descent.
  // This gives `Enter` parity with double-click.
  { keybinding: kb(KeyCode.Enter), command: "content.enter" },
  { keybinding: kb(KeyCode.Enter), command: "hierarchy.enter" },
  { keybinding: kb(KeyCode.Enter, M.Shift), command: "hierarchy.exit" },

  // ─── nudge — Arrow (1px) and Shift+Arrow (10px) ──────────────────────────
  // Meaningful = Shift|Ctrl (see NUDGE_MEANINGFUL). Move fires only with Ctrl
  // RELEASED — Ctrl+Alt+Arrow is the nudge-resize chord below. Alt stays
  // don't-care so Alt-hold (measurement HUD) keeps moving the selection.
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

  // ─── nudge-resize — Ctrl+Alt+Arrow (1px) and +Shift (10px) ───────────────
  // Grow/shrink each selected element by the delta around its OWN NW corner —
  // per-element, NOT a union/group resize (members keep their positions
  // relative to one another). Right/Left = width, Down/Up = height. The
  // all-or-nothing gate lives in `editor.commands.resize_by`; on refusal (the
  // selection includes a non-resizable / transformed member) the chord is a
  // no-op — the move-nudge mask forbids Ctrl, so nothing else catches it.
  // That same mask is why move and resize never both fire on this chord.
  {
    keybinding: kb(KeyCode.RightArrow, M.Ctrl | M.Alt, RESIZE_MEANINGFUL),
    command: "selection.nudge_resize",
    args: { dw: 1, dh: 0 },
  },
  {
    keybinding: kb(KeyCode.LeftArrow, M.Ctrl | M.Alt, RESIZE_MEANINGFUL),
    command: "selection.nudge_resize",
    args: { dw: -1, dh: 0 },
  },
  {
    keybinding: kb(KeyCode.DownArrow, M.Ctrl | M.Alt, RESIZE_MEANINGFUL),
    command: "selection.nudge_resize",
    args: { dw: 0, dh: 1 },
  },
  {
    keybinding: kb(KeyCode.UpArrow, M.Ctrl | M.Alt, RESIZE_MEANINGFUL),
    command: "selection.nudge_resize",
    args: { dw: 0, dh: -1 },
  },
  {
    keybinding: kb(
      KeyCode.RightArrow,
      M.Ctrl | M.Alt | M.Shift,
      RESIZE_MEANINGFUL
    ),
    command: "selection.nudge_resize",
    args: { dw: 10, dh: 0 },
  },
  {
    keybinding: kb(
      KeyCode.LeftArrow,
      M.Ctrl | M.Alt | M.Shift,
      RESIZE_MEANINGFUL
    ),
    command: "selection.nudge_resize",
    args: { dw: -10, dh: 0 },
  },
  {
    keybinding: kb(
      KeyCode.DownArrow,
      M.Ctrl | M.Alt | M.Shift,
      RESIZE_MEANINGFUL
    ),
    command: "selection.nudge_resize",
    args: { dw: 0, dh: 10 },
  },
  {
    keybinding: kb(
      KeyCode.UpArrow,
      M.Ctrl | M.Alt | M.Shift,
      RESIZE_MEANINGFUL
    ),
    command: "selection.nudge_resize",
    args: { dw: 0, dh: -10 },
  },

  // ─── tools — V (cursor) / R (rect) / O (ellipse) / L (line) / T (text) ──
  // Bare letter keys. All default bindings are suppressed while a text
  // input is focused (the form-element focus guard in keymap/keymap.ts);
  // the dom.ts on_keydown early-return additionally suppresses them
  // during inline SVG text edit. `T` selects the click-only text tool
  // (design: docs/wg/feat-svg-editor/text-tool.md).
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
  {
    keybinding: kb(KeyCode.KeyT),
    command: TOOL_SET,
    args: { type: "insert-text" },
  },
  // Q — vector lasso. The TOOL_SET handler gates on `mode === "edit-content"`,
  // so this fires only during path content-edit; outside that, the
  // keybinding chain falls through (other Q-bound chords still work).
  { keybinding: kb(KeyCode.KeyQ), command: TOOL_SET, args: { type: "lasso" } },

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
