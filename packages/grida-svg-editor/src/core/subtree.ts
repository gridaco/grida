/**
 * Subtree clone — selection → sibling subtrees within the SAME document.
 *
 * The second of the two extraction operations the clipboard FRD names
 * ([docs/wg/feat-svg-editor/clipboard.md](../../../../docs/wg/feat-svg-editor/clipboard.md)
 * §Two extraction operations; design note:
 * [docs/wg/feat-svg-editor/subtree-clone.md](../../../../docs/wg/feat-svg-editor/subtree-clone.md)).
 * Unlike copy's payload extraction, a clone carries **no reference closure
 * and no namespace shell**: the destination is the source document, every
 * `url(#…)` / `href` reference still resolves against it, and carrying
 * definitions would deposit duplicate defs on every duplicate. The two
 * operations share exactly two things — selection normalization
 * ({@link subtree.normalize_roots}) and verbatim subtree serialization
 * (`SvgDocument.serialize_node`) — and nothing else.
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

import type { NodeId } from "../types";
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
    order: (a: NodeId, b: NodeId) => number = by_document_order(doc)
  ): NodeId[] {
    const live = [...new Set(selection)].filter(
      (id) => doc.is_element(id) && doc.contains(doc.root, id)
    );
    return doc.prune_nested_nodes(live).sort(order);
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
}
