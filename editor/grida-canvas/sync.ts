/**
 * WASM-sync Effect protocol.
 *
 * Every reducer run produces a single `Effect` describing, at document
 * granularity, what the WASM renderer must do to catch up to the new state.
 * The Effect is computed by whoever owns the mutation (the reducer / bypass
 * branch), and consumed by the document-change subscriber in `editor.ts`.
 *
 * Why a first-class Effect instead of deriving routing from Immer patches?
 *
 * The editor has two reducer paths — the default {@link produceWithPatches}
 * path and a mutable bypass that runs the recipe on a pre-cloned plain
 * object to avoid proxy/finalization overhead in gesture hot loops. The
 * bypass path produces **no patches** (it never enters Immer), so any
 * router that classifies work from patches alone has no signal to route
 * with and has to fall back to a full document re-encode. That fallback
 * defeats the whole point of the bypass — the hot path pays the 100ms
 * re-encode it was specifically designed to avoid.
 *
 * The fix is to make Effect the protocol: both paths emit one, and the
 * WASM subscriber dispatches on `effect.kind`. Patches become a pure
 * history-adapter concern (undo/redo, remote sync), not a control-flow
 * signal for the renderer.
 *
 * Categories:
 * - `none` — no renderer-visible change (selection/marquee/hover only).
 * - `nodes` — a bounded set of existing nodes changed properties and/or
 *   were removed. `replaceNode` / `deleteNode` suffice; no full re-encode.
 * - `structural` — scene graph itself changed (node added, reparented,
 *   link reordered, bitmap/image store touched, or anything outside
 *   `document.nodes[*]`). Full re-encode via `__wasm_sync_document`.
 */
import type { editor } from ".";

export type Effect =
  | { readonly kind: "none" }
  | {
      readonly kind: "nodes";
      /** Node ids whose props changed; send via `replaceNode`. */
      readonly replace: ReadonlySet<string>;
      /** Node ids removed from the scene; send via `deleteNode`. */
      readonly remove: ReadonlySet<string>;
    }
  | { readonly kind: "structural" };

/** Canonical singleton — avoid allocating `{ kind: "none" }` per dispatch. */
export const EFFECT_NONE: Effect = Object.freeze({ kind: "none" });

/** Canonical singleton — avoid allocating `{ kind: "structural" }` per dispatch. */
export const EFFECT_STRUCTURAL: Effect = Object.freeze({ kind: "structural" });

/**
 * Build a `nodes` effect. Returns `EFFECT_NONE` if both sets are empty so
 * callers don't have to branch.
 */
export function effectNodes(
  replace: ReadonlySet<string>,
  remove: ReadonlySet<string>
): Effect {
  if (replace.size === 0 && remove.size === 0) return EFFECT_NONE;
  return { kind: "nodes", replace, remove };
}

/**
 * Lift a batch of Immer patches into an Effect. Used by the default
 * (non-bypass) reducer path where patches are the source of truth for
 * what changed.
 *
 * Classification rules:
 * - No `document.*` patches → `none`.
 * - Patches touching anything under `document.*` other than
 *   `document.nodes[id]` → `structural` (links, bitmaps, images,
 *   properties, scene graph).
 * - An `add` at the exact node slot (`document.nodes[id]`) is a creation
 *   and needs parent/link updates → `structural`.
 * - A `remove` at the exact node slot → goes into the `remove` set.
 * - Anything else under `document.nodes[id]` → goes into the `replace`
 *   set (a property change on an existing node).
 */
export function effectFromPatches(
  patches: readonly editor.history.Patch[]
): Effect {
  const replace = new Set<string>();
  const remove = new Set<string>();
  let sawDocumentPatch = false;

  for (const patch of patches) {
    const path = patch.path;
    if (path[0] !== "document") continue;
    sawDocumentPatch = true;

    if (path[1] !== "nodes") return EFFECT_STRUCTURAL;

    const nodeId = path[2];
    if (typeof nodeId !== "string") return EFFECT_STRUCTURAL;

    const isExactNodeSlot = path.length === 3;
    if (isExactNodeSlot && patch.op === "add") return EFFECT_STRUCTURAL;
    if (isExactNodeSlot && patch.op === "remove") {
      remove.add(nodeId);
      continue;
    }
    replace.add(nodeId);
  }

  if (!sawDocumentPatch) return EFFECT_NONE;
  // Remove wins — a property patch followed by removal in the same tick
  // would otherwise replay a stale node into a slot we're about to delete.
  for (const id of remove) replace.delete(id);
  return effectNodes(replace, remove);
}

/**
 * Combine two effects into one, preserving the highest-impact category.
 *
 * Used to merge the per-action effects from a multi-action dispatch
 * batch into a single effect for the subscriber.
 *
 * - structural ∪ _ = structural
 * - nodes ∪ nodes = union of replace / remove sets (remove still wins
 *   over replace for ids in both)
 * - nodes ∪ none = nodes
 * - none ∪ none = none
 */
export function mergeEffect(a: Effect, b: Effect): Effect {
  if (a.kind === "structural" || b.kind === "structural") {
    return EFFECT_STRUCTURAL;
  }
  if (a.kind === "none") return b;
  if (b.kind === "none") return a;
  // both are `nodes`
  const replace = new Set<string>(a.replace);
  for (const id of b.replace) replace.add(id);
  const remove = new Set<string>(a.remove);
  for (const id of b.remove) remove.add(id);
  for (const id of remove) replace.delete(id);
  return effectNodes(replace, remove);
}
