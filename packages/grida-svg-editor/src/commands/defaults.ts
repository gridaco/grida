/**
 * Default commands shipped with `@grida/svg-editor`.
 *
 * ALL handlers live here. Adding a new built-in command = add a row to
 * this file (and, usually, a corresponding row in `keymap/defaults.ts`).
 *
 * Each handler returns:
 *  - `true`  → consumed the invocation; the keymap dispatcher will stop.
 *  - `false` → did not apply; the dispatcher will try the next candidate
 *    registered for the same key. Self-guard on editor state to drive
 *    this — the chain semantics live in these return values, NOT in a
 *    `when:` predicate.
 *
 * Handlers are closures over the editor passed at registration time.
 */

import type { SvgEditor } from "../core/editor";
import type { AlignDirection } from "../core/align";
import type { ReorderDirection, Tool } from "../types";
import type { CommandHandler, CommandRegistry } from "./registry";

/** Command id for `tool.set`. Bound to V/R/O/L in `keymap/defaults.ts`. */
export const TOOL_SET = "tool.set";

/**
 * The headless default `transform.nudge` handler. Exported so a host
 * surface that overrides nudge (e.g. for faux-snap UX) can restore the
 * default on teardown — the registry doesn't stack handlers, so a plain
 * unregister leaves the slot empty.
 */
export function default_nudge_handler(editor: SvgEditor): CommandHandler {
  return (args) => {
    if (editor.state.selection.length === 0) return false;
    const { dx, dy } = args as { dx: number; dy: number };
    editor.commands.nudge({ dx, dy });
    return true;
  };
}

export function registerDefaultCommands(
  reg: CommandRegistry,
  editor: SvgEditor
): void {
  // ─── history ──────────────────────────────────────────────────────────────
  reg.register("history.undo", () => {
    if (!editor.state.can_undo) return false;
    editor.commands.undo();
    return true;
  });

  reg.register("history.redo", () => {
    if (!editor.state.can_redo) return false;
    editor.commands.redo();
    return true;
  });

  // ─── selection ────────────────────────────────────────────────────────────
  reg.register("selection.deselect", () => {
    if (editor.state.selection.length === 0) return false;
    editor.commands.deselect();
    return true;
  });

  reg.register("selection.remove", () => {
    if (editor.state.selection.length === 0) return false;
    editor.commands.remove();
    return true;
  });

  // Cmd+G — wrap selection in a new <g>. Returns false when policy
  // rejects (empty selection, cross-parent, invalid tag / parent, …)
  // so the keymap chain can keep going. Guarded on `select` mode so
  // a programmatic invoke during text-edit can't mutate structure.
  reg.register("selection.group", () => {
    if (editor.state.mode !== "select") return false;
    if (editor.state.selection.length === 0) return false;
    return editor.commands.group();
  });

  // Inspector entry point — set the union bbox of the current selection
  // to an explicit rect. `args` is the target `{x, y, width, height}`.
  // Refuses outside select-mode (text-edit would route the call into a
  // content surface). Returns the editor's own success bit so a chain
  // candidate registered after this can take over when the gesture is
  // a no-op (no selection / no DOM surface attached).
  reg.register("selection.resize_to", (args) => {
    if (editor.state.mode !== "select") return false;
    if (editor.state.selection.length === 0) return false;
    const target = args as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    return editor.commands.resize_to(target);
  });

  // Rotate the selection by `args.angle` radians. Pivot defaults to the
  // union-bbox center; pass `args.pivot = {x, y}` to override. Returns
  // false if `is_rotatable` refuses any selected member (composite
  // transform, per-glyph `<text rotate>`, CSS-property transform,
  // animated transform) — the host then surfaces a chip.
  reg.register("selection.rotate", (args) => {
    if (editor.state.mode !== "select") return false;
    if (editor.state.selection.length === 0) return false;
    const a = args as { angle: number; pivot?: { x: number; y: number } };
    return editor.commands.rotate(a.angle, { pivot: a.pivot });
  });

  // Set absolute rotation. Same refusal semantics as `rotate`.
  reg.register("selection.rotate_to", (args) => {
    if (editor.state.mode !== "select") return false;
    if (editor.state.selection.length === 0) return false;
    const a = args as { angle: number; pivot?: { x: number; y: number } };
    return editor.commands.rotate_to(a.angle, { pivot: a.pivot });
  });

  // Collapse each selected member's transform list into a single matrix
  // token. The escape valve for accumulated rotation drift — see
  // README §Flatten Transform / TODO §1.
  reg.register("selection.flatten_transform", () => {
    if (editor.state.mode !== "select") return false;
    if (editor.state.selection.length === 0) return false;
    return editor.commands.flatten_transform();
  });

  // Replace the selection with every element-child of the current scope.
  // Cmd+A binding. Returns false on an empty scope so the chain can
  // try the next candidate (no candidates today; matches the deselect
  // / remove pattern of guarding on emptiness).
  reg.register("selection.all", () => {
    if (editor.state.mode !== "select") return false;
    return editor.commands.select_all();
  });

  // Rotate the selection to the next / previous sibling. `args` is the
  // direction. Tab / Shift+Tab bindings.
  reg.register("selection.sibling", (args) => {
    if (editor.state.mode !== "select") return false;
    return editor.commands.select_sibling(args as "next" | "prev");
  });

  // Align selection along the requested edge / center of the union bbox.
  // `args` is the `AlignDirection`. Refuses on <2 members or no surface
  // — see editor.commands.align doc for the rationale.
  reg.register("selection.align", (args) => {
    if (editor.state.mode !== "select") return false;
    return editor.commands.align(args as AlignDirection);
  });

  // ─── hierarchy ────────────────────────────────────────────────────────────
  // Enter — select the first child of the selected node. Lets the user drill
  // into a group from the keyboard. Returns false when the selection isn't a
  // single container, so a future chained binding (e.g. content-edit on a
  // text node) can preempt.
  reg.register("hierarchy.enter", () => {
    if (editor.state.selection.length !== 1) return false;
    const id = editor.state.selection[0];
    const tree = editor.tree();
    const node = tree.nodes.get(id);
    if (!node || node.children.length === 0) return false;
    editor.commands.select(node.children[0]);
    return true;
  });

  // Shift+Enter — select the parent of the selected node. Walking past the
  // document root is a no-op (returns false so the chain can keep going).
  reg.register("hierarchy.exit", () => {
    if (editor.state.selection.length !== 1) return false;
    const id = editor.state.selection[0];
    const tree = editor.tree();
    const node = tree.nodes.get(id);
    if (!node || node.parent === null || node.parent === tree.root) {
      return false;
    }
    editor.commands.select(node.parent);
    return true;
  });

  // ─── transform ────────────────────────────────────────────────────────────
  // Arrow keys (1px) and Shift+Arrow (10px). The delta is supplied via the
  // binding's `args` so all 8 entries share one handler. A DOM surface may
  // override this with a snap-aware variant (see `dom.ts`); the host
  // restores this default on detach via `default_nudge_handler`.
  reg.register("transform.nudge", default_nudge_handler(editor));

  // ─── reorder ──────────────────────────────────────────────────────────────
  // `[` / `]` and their `Mod`-modified variants. The direction is in `args`.
  reg.register("reorder", (args) => {
    if (editor.state.selection.length !== 1) return false;
    editor.commands.reorder(args as ReorderDirection);
    return true;
  });

  // ─── tools ────────────────────────────────────────────────────────────────
  // V / R / O / L — switch the active insertion tool. Refuses during text
  // edit so the letter keys reach the inline text editor instead.
  reg.register(TOOL_SET, (args) => {
    if (editor.state.mode !== "select") return false;
    editor.set_tool(args as Tool);
    return true;
  });
}
