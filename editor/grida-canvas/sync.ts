/**
 * WASM-sync op log — ordered mutations the subscriber forwards 1:1 to WASM.
 *
 * Mutation sites emit ops into an {@link OpBuffer} as they run: the
 * tracked-`Graph` wrapper for structural edits and {@link appendPatchOps}
 * for node property changes (lifted from the Immer patch stream).
 * Consumers MUST apply ops in order: a `sync_links` that references a
 * freshly inserted node is only valid after that node has been delivered
 * by a prior `replace_node`.
 */

export type Op =
  | { readonly kind: "replace_node"; readonly id: string }
  | { readonly kind: "delete_node"; readonly id: string }
  | {
      readonly kind: "sync_links";
      readonly parent: string;
      readonly children: readonly string[];
    }
  /**
   * Escape hatch for callers that can't describe the change with the
   * granular ops — gesture abort, preview discard, document reset.
   * Subscribers short-circuit to a full re-encode.
   */
  | { readonly kind: "full_resync" };

export type OpLog = readonly Op[];

export const EMPTY_OP_LOG: OpLog = Object.freeze([] as readonly Op[]);

export const FULL_RESYNC_OP_LOG: OpLog = Object.freeze([
  Object.freeze({ kind: "full_resync" } as const),
]);

type MinimalPatch = {
  readonly op: string;
  readonly path: readonly (string | number)[];
};

type PatchWalkResult =
  | { readonly structural: true }
  | {
      readonly structural: false;
      readonly replaced: ReadonlySet<string>;
      readonly removed: ReadonlySet<string>;
    };

/**
 * Classify Immer patches into a pair of node-id sets. Patches touching
 * `document.*` other than `document.nodes[id]` or `document.links` fall
 * through to `structural: true`, which the caller maps to a full
 * `full_resync`. `document.links` is intentionally ignored: the
 * tracked-Graph wrapper observes structural edits and emits precise
 * `sync_links` ops, so the corresponding Immer patches would otherwise
 * cause a redundant (and destructive) full resync that collapses the
 * whole batch.
 */
function walkPatches(patches: readonly MinimalPatch[]): PatchWalkResult {
  const replaced = new Set<string>();
  const removed = new Set<string>();
  for (const patch of patches) {
    const path = patch.path;
    if (path[0] !== "document") continue;
    if (path[1] === "links") continue;
    if (path[1] !== "nodes") return { structural: true };
    const nodeId = path[2];
    if (typeof nodeId !== "string") return { structural: true };

    const isExactSlot = path.length === 3;
    if (isExactSlot && patch.op === "remove") {
      removed.add(nodeId);
      continue;
    }
    replaced.add(nodeId);
  }
  return { structural: false, replaced, removed };
}

/**
 * Append node-change ops to `buffer` from a batch of Immer patches.
 * A structural patch (non-node document mutation) appends a single
 * `full_resync` op — tracked-Graph normally handles structural edges,
 * so this is a correctness fallback, not the primary channel.
 */
export function appendPatchOps(
  patches: readonly MinimalPatch[],
  buffer: OpBuffer
): void {
  const walk = walkPatches(patches);
  if (walk.structural) {
    buffer.push({ kind: "full_resync" });
    return;
  }
  for (const id of walk.removed) buffer.push({ kind: "delete_node", id });
  for (const id of walk.replaced) {
    if (!walk.removed.has(id)) buffer.push({ kind: "replace_node", id });
  }
}

/**
 * Build a standalone op log from patches. Used by undo/redo paths
 * that have patches but no buffer.
 */
export function opLogFromPatches(patches: readonly MinimalPatch[]): OpLog {
  const walk = walkPatches(patches);
  if (walk.structural) return FULL_RESYNC_OP_LOG;

  const ops: Op[] = [];
  for (const id of walk.removed) ops.push({ kind: "delete_node", id });
  for (const id of walk.replaced) {
    if (!walk.removed.has(id)) ops.push({ kind: "replace_node", id });
  }
  return ops.length === 0 ? EMPTY_OP_LOG : ops;
}

/**
 * Per-dispatch op sink. Reset before each recipe; drained after.
 * Ephemeral scratch, not editor state.
 */
export class OpBuffer {
  private _ops: Op[] = [];

  push(op: Op): void {
    this._ops.push(op);
  }

  extend(ops: Iterable<Op>): void {
    for (const op of ops) this._ops.push(op);
  }

  reset(): void {
    this._ops = [];
  }

  /** Current log. Callers must not mutate. */
  get ops(): OpLog {
    return this._ops;
  }
}
