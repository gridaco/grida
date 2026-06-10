/**
 * Clipboard payload extraction — selection → standalone SVG document.
 *
 * Implements the copy side of the clipboard FRD
 * ([docs/wg/feat-svg-editor/clipboard.md](../../../../docs/wg/feat-svg-editor/clipboard.md)):
 * the payload is a standalone, namespace-well-formed SVG document — not a
 * private envelope. Assembly is a pure function of (document, selection):
 * no geometry, no environment, no randomness (FRD R6 — the same selection
 * yields the same bytes headless or surface-attached).
 *
 * What the payload carries, and what it deliberately does not
 * (FRD §Extraction — five context kinds):
 *
 *   1. Referenced resources — CARRIED. The outbound `url(#…)` / `href`
 *      closure is walked from the closed carrier list below and emitted
 *      verbatim in one `<defs>` block.
 *   2. Namespace declarations — CARRIED. Prefixes a subtree borrows from
 *      ancestor scope are declared on the payload shell (an undeclared
 *      prefix is a well-formedness error, so this includes the deliberate
 *      well-known-table repair for e.g. `xlink`).
 *   3. Ancestor transforms — NOT carried (verbatim policy).
 *   4. Inherited presentation / cascade — NOT carried (verbatim policy).
 *   5. Viewport — NOT carried (no `viewBox`, no sizing on the shell).
 *
 * This module is the **payload extraction** operation only. The sibling
 * operation the FRD names — in-document subtree CLONE (duplicate /
 * clone-drag), which must NOT carry the closure — is a different contract
 * and does not live here.
 */

import type { NodeId } from "../types";
import type { SvgDocument } from "./document";
import { SVG_NS, WELL_KNOWN_NS_PREFIXES, XMLNS_NS } from "./document";

export namespace clipboard {
  /**
   * Presentation carriers that may hold `url(#…)` references, read both as
   * a presentation attribute and as an inline `style=""` declaration.
   *
   * CLOSED LIST — extending it is a spec change to the FRD's §Extraction 1
   * carrier list, not a bug fix. Deliberately NOT walked in v1 (documented
   * degradations): `<style>` element rules (CSS parsing is the deferred
   * cascade capability), SMIL timing/value references, `cursor`, SVG 2
   * text-layout properties.
   */
  const URL_REF_PROPS = [
    "fill",
    "stroke",
    "filter",
    "clip-path",
    "mask",
    "marker-start",
    "marker-mid",
    "marker-end",
    "marker",
  ] as const;

  /**
   * Elements whose `href` / `xlink:href` is a same-document resource
   * reference the closure follows. CLOSED LIST — `<a href>` is navigation,
   * `<image href>` is content, SMIL `href` is an animation target; none of
   * them are walked.
   */
  const HREF_TAGS = new Set([
    "use",
    "textPath",
    "mpath",
    "feImage",
    "pattern",
    "linearGradient",
    "radialGradient",
    "filter",
  ]);

  /**
   * `url(#id)` extractor. Global — a single value can carry several
   * references (`filter: url(#a) blur(2px) url(#b)` is a legal filter
   * function list). Same quoting tolerance as the defs registry's
   * ref-counting pattern.
   */
  const URL_REF_RE = /url\(\s*["']?#([^"')\s]+)["']?\s*\)/g;

  /**
   * Extract a standalone SVG document from the selection.
   *
   * Pipeline (FRD §The payload, normatively):
   *   1. Normalize — ancestor subtrees subsume selected descendants (the
   *      same rule deletion uses); stale / non-element / detached ids are
   *      skipped, never thrown (R1: copy has no refusal path); roots are
   *      emitted in DOCUMENT order regardless of selection order (sibling
   *      order is paint order, and paint order is meaning).
   *   2. Closure — {@link collect_reference_closure} over the roots,
   *      emitted verbatim in one `<defs>` element (omitted when empty).
   *   3. Shell — `<svg>` declaring the SVG namespace plus every resolved
   *      prefix the fragment requires, and nothing else.
   *
   * Returns `null` when nothing serializable is selected — the caller's
   * no-op, not an error.
   */
  export function extract_payload(
    doc: SvgDocument,
    selection: ReadonlyArray<NodeId>
  ): string | null {
    // One doc-order comparator per extraction (each build walks the whole
    // node tree); collect_reference_closure keeps its own — it is an
    // independently exported test entry point.
    const order = by_document_order(doc);
    const roots = normalize_selection(doc, selection, order);
    if (roots.length === 0) return null;

    const closure = collect_reference_closure(doc, roots);

    // Shell namespace declarations: every payload member (roots AND
    // closure — `<linearGradient xlink:href>` living in `<defs>` is the
    // common real case) contributes the prefixes its subtree borrows from
    // ancestor scope. Members are processed in document order, first
    // declaration wins — the FRD is silent on conflicting prefix URIs
    // across members; first-in-document-order is deterministic and honest.
    const shell_ns = new Map<string, string>();
    for (const member of [...closure, ...roots].sort(order)) {
      for (const prefix of doc.undeclared_ns_prefixes(member)) {
        if (shell_ns.has(prefix)) continue;
        const uri = resolve_prefix(doc, member, prefix);
        if (uri !== null) shell_ns.set(prefix, uri);
        // Unresolvable unknown prefix: left unbound — the source was
        // equally unbound, and inventing a URI would be fabrication.
      }
    }

    let shell = `<svg xmlns="${SVG_NS}"`;
    for (const [prefix, uri] of shell_ns) {
      shell += ` xmlns:${prefix}="${uri}"`;
    }
    shell += ">";

    const defs_block =
      closure.length > 0
        ? `<defs>${closure.map((id) => doc.serialize_node(id)).join("")}</defs>`
        : "";
    const content = roots.map((id) => doc.serialize_node(id)).join("");

    return `${shell}${defs_block}${content}</svg>`;
  }

  /**
   * Outbound reference closure of the copied forest (FRD §Extraction 1).
   *
   * Walks the closed carrier list over every element of every root's
   * subtree; resolves `#id` targets within the source document
   * (first-in-document-order wins, matching host-renderer duplicate-id
   * resolution); recurses into collected targets (gradient `href` chains,
   * filter → `feImage`); guards against reference cycles.
   *
   * Excluded: targets already inside the copied forest (they are content —
   * carrying them again would duplicate them), and unresolved references
   * (left as authored; the payload is no more broken than the source).
   *
   * Returns closure members deduplicated subtree-aware (a collected
   * element nested inside another collected element is dropped) in
   * document order.
   *
   * Exported for isolated testing (P5); not part of the public package
   * surface.
   */
  export function collect_reference_closure(
    doc: SvgDocument,
    roots: ReadonlyArray<NodeId>
  ): NodeId[] {
    // Doc-order first-wins id map — built once per walk.
    const id_map = new Map<string, NodeId>();
    for (const el of doc.all_elements()) {
      const id_attr = doc.get_attr(el, "id");
      if (id_attr !== null && !id_map.has(id_attr)) id_map.set(id_attr, el);
    }

    const in_forest = (target: NodeId): boolean =>
      roots.some((r) => doc.contains(r, target));

    const collected = new Set<NodeId>();
    const pending: NodeId[] = [...roots];

    while (pending.length > 0) {
      const subtree = pending.pop()!;
      for (const el of elements_of_subtree(doc, subtree)) {
        for (const ref of refs_of(doc, el)) {
          const target = id_map.get(ref);
          if (target === undefined) continue; // unresolved — left as authored
          if (in_forest(target)) continue; // already content
          if (collected.has(target)) continue; // cycle / shared-def guard
          collected.add(target);
          pending.push(target);
        }
      }
    }

    // Subtree-aware dedup (a collected gradient inside a collected
    // pattern would otherwise serialize twice), then document order.
    return doc.prune_nested_nodes([...collected]).sort(by_document_order(doc));
  }

  // ─── Internals ─────────────────────────────────────────────────────────

  function normalize_selection(
    doc: SvgDocument,
    selection: ReadonlyArray<NodeId>,
    order: (a: NodeId, b: NodeId) => number
  ): NodeId[] {
    const live = [...new Set(selection)].filter(
      (id) => doc.is_element(id) && doc.contains(doc.root, id)
    );
    return doc.prune_nested_nodes(live).sort(order);
  }

  function by_document_order(
    doc: SvgDocument
  ): (a: NodeId, b: NodeId) => number {
    const index = new Map<NodeId, number>();
    let i = 0;
    for (const id of doc.all_nodes()) index.set(id, i++);
    return (a, b) => (index.get(a) ?? 0) - (index.get(b) ?? 0);
  }

  /** Preorder element walk of `root`'s subtree, root included. */
  function elements_of_subtree(doc: SvgDocument, root: NodeId): NodeId[] {
    const out: NodeId[] = [];
    const walk = (id: NodeId) => {
      if (!doc.is_element(id)) return;
      out.push(id);
      for (const c of doc.children_of(id)) walk(c);
    };
    walk(root);
    return out;
  }

  /** Same-document reference ids carried by one element, per the closed
   *  carrier list. */
  function refs_of(doc: SvgDocument, id: NodeId): string[] {
    const out: string[] = [];
    // One parse of the inline style per element (`get_style` re-parses the
    // whole attribute per property); first declaration wins, matching
    // `get_style`'s semantics.
    const styles = new Map<string, string>();
    for (const { property, value } of doc.get_all_styles(id)) {
      if (!styles.has(property)) styles.set(property, value);
    }
    for (const prop of URL_REF_PROPS) {
      for (const value of [doc.get_attr(id, prop), styles.get(prop)]) {
        if (!value) continue;
        for (const m of value.matchAll(URL_REF_RE)) out.push(m[1]);
      }
    }
    if (HREF_TAGS.has(doc.tag_of(id))) {
      // ns=null matches any namespace — covers `href` and `xlink:href`.
      const href = doc.get_attr(id, "href");
      if (href !== null && href.startsWith("#") && href.length > 1) {
        out.push(href.slice(1));
      }
    }
    return out;
  }

  /**
   * Resolve a prefix a member's subtree borrows from ancestor scope:
   * nearest ancestor `xmlns:<prefix>` declaration wins (correct XML
   * scoping), falling back to the well-known table — the deliberate
   * repair that keeps the payload namespace-well-formed even when the
   * source never declared the prefix (FRD §Extraction 2).
   */
  function resolve_prefix(
    doc: SvgDocument,
    member: NodeId,
    prefix: string
  ): string | null {
    let cur: NodeId | null = doc.parent_of(member);
    while (cur !== null) {
      const uri = doc.get_attr(cur, prefix, XMLNS_NS);
      if (uri !== null) return uri;
      cur = doc.parent_of(cur);
    }
    return WELL_KNOWN_NS_PREFIXES.get(prefix) ?? null;
  }
}
