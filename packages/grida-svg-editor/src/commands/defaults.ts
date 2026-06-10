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

  // Cmd+Shift+G — dissolve the selected <g>, hoisting its children into
  // the parent. Returns false when `ungroup` refuses (not a single <g>,
  // inside <defs>, no children, carries visual state, <use>-referenced,
  // animation-bearing, unbakeable transform) so the keymap chain can
  // keep going. Guarded on a single selection + `select` mode — the same
  // shape as `selection.group`.
  reg.register("selection.ungroup", () => {
    if (editor.state.mode !== "select") return false;
    if (editor.state.selection.length !== 1) return false;
    return editor.commands.ungroup();
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

  // Ctrl+Alt+Arrow — grow/shrink each selected element by the delta around its
  // own NW corner (per-element; see `editor.commands.resize_by` — NOT a
  // union/group resize). `args` is `{dw, dh}` (±1 / ±10 with Shift). The
  // all-or-nothing resizability gate lives in `resize_by`; this handler only
  // guards mode + non-empty selection and returns false when the verb refuses
  // (selection includes a `<g>` or a transformed member) — the chord is then
  // a no-op.
  reg.register("selection.nudge_resize", (args) => {
    if (editor.state.mode !== "select") return false;
    if (editor.state.selection.length === 0) return false;
    const { dw, dh } = args as { dw: number; dh: number };
    return editor.commands.resize_by({ dw, dh });
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

  // ─── clipboard ────────────────────────────────────────────────────────────
  // Contract: docs/wg/feat-svg-editor/clipboard.md. No keymap rows bind
  // these — Cmd+C/X/V reach the editor as native ClipboardEvents wired by
  // the DOM surface (a keymap claim would preventDefault the keystroke and
  // suppress the native event's generation). These ids exist for menu /
  // RPC / palette hosts.
  //
  // All three gate on `select` mode — one step beyond the FRD's named
  // text-edit inertness: cut/paste during vector content-edit would mutate
  // structure under an open edit session (same hazard `selection.group`
  // guards). Copy is a pure read but gates too, for symmetry.

  reg.register("clipboard.copy", () => {
    if (editor.state.mode !== "select") return false;
    if (editor.state.selection.length === 0) return false;
    return editor.commands.copy() !== null;
  });

  reg.register("clipboard.cut", () => {
    if (editor.state.mode !== "select") return false;
    if (editor.state.selection.length === 0) return false;
    return editor.commands.cut() !== null;
  });

  // Paste acquisition is the invoking channel's job (FRD §Command
  // semantics). Precedence here mirrors the FRD read rule: explicitly
  // delivered text first (`args.text` — an RPC/host caller that already
  // holds the markup), else the provider when configured (async read,
  // fire-and-forget — the refusal observability of the async leg is
  // inherently weaker), else the editor's internal buffer (sync, honest
  // chain semantics).
  reg.register("clipboard.paste", (args) => {
    if (editor.state.mode !== "select") return false;
    const text = (args as { text?: string } | undefined)?.text;
    if (typeof text === "string") {
      return editor.commands.paste(text).length > 0;
    }
    const provider = editor.providers.clipboard;
    if (provider) {
      void provider
        .read()
        .then((text) => {
          if (text) editor.commands.paste(text);
        })
        .catch((err) => {
          console.warn("[svg-editor] clipboard provider read failed:", err);
        });
      return true;
    }
    return editor.commands.paste().length > 0;
  });

  // ─── content edit ─────────────────────────────────────────────────────────
  // Enter — enter content-edit (text edit / vector edit) on the single
  // selected node. Mirrors the double-click → `enter_content_edit` intent
  // path (dom.ts:commit_intent). `enter_content_edit()` self-guards on a
  // single selection and returns false for non-editable nodes (or when no
  // surface is attached to drive the edit), so the chained `hierarchy.enter`
  // binding can preempt and descend into a container instead.
  reg.register("content.enter", () => editor.enter_content_edit());

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
  // Per-tool mode gating:
  //   - `insert` (R / O / L) — select mode only. Refuses during text edit so
  //     the letter keys reach the inline text editor instead.
  //   - `lasso` / `bend` — path content-edit only. Refuse outside it.
  //   - `cursor` (V) — valid in EVERY mode. V doubles as "exit current tool
  //     back to cursor" — works during content-edit (to leave lasso/bend
  //     mid-session without exiting vector-edit) and during select.
  // The dom-side tool subscriber pushes the matching HUD-side mode setters
  // (selection mode for lasso, bend mode for bend) on every change, and
  // `exit_vector_edit` reverts non-cursor → cursor, so tool/mode stays
  // internally consistent.
  reg.register(TOOL_SET, (args) => {
    const next = args as Tool;
    const required_mode: "select" | "edit-content" | null =
      next.type === "lasso" || next.type === "bend"
        ? "edit-content"
        : next.type === "insert" || next.type === "insert-text"
          ? "select"
          : null; // cursor — any mode
    if (required_mode !== null && editor.state.mode !== required_mode)
      return false;
    editor.set_tool(next);
    return true;
  });
}
