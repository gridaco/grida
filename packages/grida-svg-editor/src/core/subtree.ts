/**
 * The selection → subtree algebra the two extraction operations share,
 * plus the clone-specific member (`clone_plan`).
 *
 * The clipboard FRD
 * ([docs/wg/feat-svg-editor/clipboard.md](../../../../docs/wg/feat-svg-editor/clipboard.md)
 * §Two extraction operations) names two operations over a normalized
 * selection: **payload extraction** (copy — `core/clipboard.ts`) and
 * **subtree clone** (duplicate / clone-drag — this module; design note:
 * [docs/wg/feat-svg-editor/subtree-clone.md](../../../../docs/wg/feat-svg-editor/subtree-clone.md)).
 * They share exactly two things — selection normalization
 * ({@link subtree.normalize_roots}) and verbatim subtree serialization
 * (`SvgDocument.serialize_node`) — and nothing else.
 *
 * Unlike copy's payload, a clone carries **no reference closure and no
 * namespace shell**: the destination is the source document, every
 * `url(#…)` / `href` reference still resolves against it, and carrying
 * definitions would deposit duplicate defs on every duplicate.
 *
 * Consumers: `commands.duplicate` (⌘D) and the translate orchestrator's
 * Alt-drag clone session (gridaco/grida#817).
 *
 * Verbatim-id policy: authored `id=""` attributes are cloned verbatim,
 * NEVER rewritten — same stance as `insert_fragment`. A clone of a node
 * carrying `id="x"` yields a second `id="x"`; reference resolution follows
 * the host renderer's first-in-document-order rule (a cloned subtree's
 * internal self-reference resolves to the ORIGINAL), and deduplication is
 * the explicit Tidy command's job.
 */

import cmath from "@grida/cmath";
import type { NodeId, Rect, Vec2 } from "../types";
import { array_shallow_equal } from "../util/equal";
import type { SvgDocument } from "./document";

export namespace subtree {
  /**
   * Document-order comparator over node ids. Builds the index once per
   * call (one full tree walk) — create one comparator per operation and
   * reuse it, as `clipboard.extract_payload` does.
   */
  export function by_document_order(
    doc: SvgDocument
  ): (a: NodeId, b: NodeId) => number {
    const index = new Map<NodeId, number>();
    let i = 0;
    for (const id of doc.all_nodes()) index.set(id, i++);
    return (a, b) => (index.get(a) ?? 0) - (index.get(b) ?? 0);
  }

  /**
   * Selection normalization — the half of extraction that payload
   * extraction (copy) and subtree clone share, per the FRD:
   * dedupe → live elements only → ancestor subtrees subsume selected
   * descendants (`prune_nested_nodes`) → DOCUMENT order regardless of
   * selection order (sibling order is paint order, and paint order is
   * meaning). Stale / non-element / detached ids are skipped, never
   * thrown — normalization is a filter, not a validator.
   */
  export function normalize_roots(
    doc: SvgDocument,
    selection: ReadonlyArray<NodeId>,
    order?: (a: NodeId, b: NodeId) => number
  ): NodeId[] {
    const live = [...new Set(selection)].filter(
      (id) => doc.is_element(id) && doc.contains(doc.root, id)
    );
    const roots = doc.prune_nested_nodes(live);
    // Build the comparator only when a sort can actually run — the
    // dominant callers (⌘D, Alt-drag) pass single-node selections, and
    // by_document_order walks the whole tree.
    if (roots.length > 1) roots.sort(order ?? by_document_order(doc));
    return roots;
  }

  /** One origin → clone pairing with the clone's placement, captured at
   *  plan time. `before` is the origin's next sibling NODE (element or
   *  trivia) so the clone lands immediately after its origin. */
  export type SubtreeClonePlanEntry = {
    origin: NodeId;
    /** Registered in the document's node map, DETACHED (`create_fragment`
     *  style) — the consumer inserts it inside its own history closure. */
    clone: NodeId;
    /** `parent_of(origin)` at plan time. */
    parent: NodeId;
    /** `next_sibling_of(origin)` at plan time; `null` = append. */
    before: NodeId | null;
  };

  export type SubtreeClonePlan = ReadonlyArray<SubtreeClonePlanEntry>;

  /**
   * Build a clone plan for the selection: for each normalized origin,
   * serialize its subtree verbatim and re-adopt it under fresh runtime
   * NodeIds via `create_fragment` — the markup round-trip rides the same
   * trivia-preserving emit and never-rewrite-ids adoption the package
   * already guarantees, so `serialize_node(clone) === serialize_node(origin)`
   * byte-for-byte once inserted.
   *
   * Clones are returned DETACHED (plan, don't insert): consumers own
   * insertion inside their history closures so redo can re-insert the
   * same NodeIds (`remove` keeps nodes in the id map).
   *
   * Skipped origins (refusals, normalized away — not errors):
   *   - the document root and any other parentless node (no sibling slot);
   *   - nested `<svg>` elements — `create_fragment` deliberately treats a
   *     lone `<svg>` root as a full-document shell and discards it (the
   *     FRD's paste rule), which would silently unwrap the clone; refusing
   *     beats mishandling.
   *
   * An empty selection (or one that normalizes to nothing) yields an
   * empty plan — the caller's no-op.
   */
  export function clone_plan(
    doc: SvgDocument,
    selection: ReadonlyArray<NodeId>
  ): SubtreeClonePlan {
    const out: SubtreeClonePlanEntry[] = [];
    for (const origin of normalize_roots(doc, selection)) {
      const parent = doc.parent_of(origin);
      if (parent === null) continue; // document root — no sibling slot
      if (doc.tag_of(origin) === "svg") continue; // shell-unwrap hazard
      const { roots } = doc.create_fragment(doc.serialize_node(origin));
      if (roots.length !== 1) {
        // serialize_node emits exactly one element; anything else means
        // the round-trip invariant broke — surface it, don't paper over.
        throw new Error(
          `subtree.clone_plan: cloning ${JSON.stringify(origin)} yielded ${roots.length} roots`
        );
      }
      out.push({
        origin,
        clone: roots[0],
        parent,
        before: doc.next_sibling_of(origin),
      });
    }
    return out;
  }

  /**
   * Attach every plan clone at its captured anchor. Anchors predate the
   * plan (captured before any insertion), so no entry anchors on another
   * entry's clone — each insert is independent and the interleaved
   * `A, A′, B, B′` order falls out of the per-origin anchors.
   *
   * Idempotent: `doc.insert` detaches-then-splices, so re-attaching an
   * already-live clone repositions it to the same slot. History redo
   * closures rely on this.
   */
  export function insert_plan(doc: SvgDocument, plan: SubtreeClonePlan): void {
    for (const p of plan) doc.insert(p.clone, p.parent, p.before);
  }

  /**
   * Detach every plan clone. Order-independent for the same reason
   * {@link insert_plan} is: anchors are never plan clones. Removed nodes
   * stay in the document's id map (standard removed-node policy), so a
   * later {@link insert_plan} over the same plan restores them.
   */
  export function remove_plan(doc: SvgDocument, plan: SubtreeClonePlan): void {
    for (const p of plan) doc.remove(p.clone);
  }

  /**
   * The last committed duplication — the memory the repeating-offset
   * behavior reads (gridaco/grida#825; spec:
   * [docs/wg/feat-svg-editor/subtree-clone.md](../../../../docs/wg/feat-svg-editor/subtree-clone.md)
   * §Repeating offset). Armed by `commands.duplicate` and by a cloned
   * translate commit (Alt-drag); consumed and re-armed by the next
   * `duplicate()`. Editor-session state — never observable, never in
   * history. Staleness is caught at use by {@link repeat_delta}, not by
   * per-mutation bookkeeping.
   *
   * The arrays are INDEX-PAIRED: `clones[i]` is the clone of
   * `origins[i]` (both producers derive them from the same
   * {@link SubtreeClonePlan}). {@link repeat_delta}'s per-member
   * rigidity check depends on that pairing.
   */
  export type DuplicationRecord = {
    origins: ReadonlyArray<NodeId>;
    clones: ReadonlyArray<NodeId>;
  };

  /** Per-member rigidity tolerance for the rigid-translate witness in
   *  {@link repeat_delta} — position drift from the shared delta, and
   *  size drift from the origin. Generous against float noise from
   *  re-encoded path data / `getBBox`, far below anything a user would
   *  call a move or a resize. */
  const REPEAT_RIGID_EPSILON = 0.01;

  /**
   * The repeating-offset delta (gridaco/grida#825): given the previous
   * duplication's record and the CURRENT duplicate's normalized origins,
   * return the world-space offset the fresh clones should repeat, or
   * `null` for "no repeat — duplicate in place".
   *
   * The repeat fires only when the record still witnesses
   * "duplicate, then rigidly translate the copies":
   *   - `targets` is exactly `record.clones`, in the same (document)
   *     order — the user is duplicating the previous duplication's
   *     copies and nothing else;
   *   - `bounds_of` answers for EVERY member of both sets (a detached
   *     member, a measureless tag, or a missing geometry provider all
   *     refuse);
   *   - EVERY clone is rigid against its own origin (the record's
   *     arrays are index-paired): same size, displaced by the same
   *     delta as the union, within {@link REPEAT_RIGID_EPSILON}. The
   *     check is per member, not per envelope — a rearranged or
   *     resized inner copy is no longer a translate even when the
   *     envelope-defining copies keep the union bbox intact;
   *   - the union top-left delta exceeds the same tolerance (a copy
   *     that never moved — or drifted by float noise only — repeats
   *     nothing; the in-place duplicate stays byte-equal instead of
   *     inheriting noise-sized attribute writes).
   *
   * Pure and gesture-grade: reads only through `bounds_of`, never
   * throws — every failed precondition degrades to `null` (the main
   * editor's `active_duplication` assert-on-mismatch is deliberately
   * NOT copied; ⌘D must never crash on a stale record).
   */
  export function repeat_delta(
    record: DuplicationRecord | null,
    targets: ReadonlyArray<NodeId>,
    bounds_of: (id: NodeId) => Rect | null
  ): Vec2 | null {
    if (record === null) return null;
    if (record.origins.length === 0) return null;
    if (record.origins.length !== record.clones.length) return null;
    if (!array_shallow_equal(record.clones, targets)) return null;
    const origin_bounds = collect_bounds(record.origins, bounds_of);
    if (origin_bounds === null) return null;
    const clone_bounds = collect_bounds(record.clones, bounds_of);
    if (clone_bounds === null) return null;
    const a = cmath.rect.union(origin_bounds);
    const b = cmath.rect.union(clone_bounds);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    for (let i = 0; i < origin_bounds.length; i++) {
      const o = origin_bounds[i];
      const c = clone_bounds[i];
      if (
        Math.abs(c.x - o.x - dx) > REPEAT_RIGID_EPSILON ||
        Math.abs(c.y - o.y - dy) > REPEAT_RIGID_EPSILON ||
        Math.abs(c.width - o.width) > REPEAT_RIGID_EPSILON ||
        Math.abs(c.height - o.height) > REPEAT_RIGID_EPSILON
      ) {
        return null;
      }
    }
    // Same tolerance as the rigidity check: a sub-epsilon net delta is
    // float noise, not a move — degrade to the byte-equal in-place
    // duplicate rather than fabricate noise-sized attribute writes.
    if (
      Math.abs(dx) <= REPEAT_RIGID_EPSILON &&
      Math.abs(dy) <= REPEAT_RIGID_EPSILON
    ) {
      return null;
    }
    return { x: dx, y: dy };
  }

  /** All-or-nothing bounds gather for {@link repeat_delta} — one
   *  unmeasurable member and the record can't witness a rigid
   *  translate. */
  function collect_bounds(
    ids: ReadonlyArray<NodeId>,
    bounds_of: (id: NodeId) => Rect | null
  ): Rect[] | null {
    const out: Rect[] = [];
    for (const id of ids) {
      const r = bounds_of(id);
      if (r === null) return null;
      out.push(r);
    }
    return out;
  }
}
