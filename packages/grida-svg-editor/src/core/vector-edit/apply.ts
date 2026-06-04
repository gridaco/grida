// Vector-edit IO helpers — the tag-aware bridge between the in-session
// path-form `d` (the "session-d") and the document's native attrs.
//
// `VectorEditSession` holds a session-d in memory as the lingua franca
// for vector-edit gestures. The document still holds whatever attrs the
// source SVG tag uses:
//
//   - <path>     → d="..."
//   - <polyline> → points="..."
//   - <polygon>  → points="..."
//
// For `<path>` the session-d IS the document's `d` (verbatim). For
// `<polyline>` / `<polygon>` the session-d is derived from `points=`
// via `vn.fromPolyline` / `vn.fromPolygon` so gesture handlers can
// stay tag-oblivious; this module projects the session-d back to
// `points=` on commit.
//
// This module owns the round-trip between those two views:
//
//   source_to_session_d(source)          → string  (enter time)
//   apply_session_d(doc, id, source, d)  → bool    (per gesture commit)
//
// It lives next to `session.ts` so the boundary discipline in
// session.ts (no `@grida/vn` / no `PathModel` imports) is preserved —
// the geometry traffic concentrates here.

import vn from "@grida/vn";
import { SVGShapes } from "@grida/svg/pathdata";
import type { RetypeRecord, SvgDocument, VectorEditSource } from "../document";
import type { VectorEditSession } from "./session";
import { PathModel } from "./model";

/**
 * Build the in-session path-form `d` ("session-d") for a freshly-
 * entered vector-edit. For `<path>` this is the verbatim authored
 * string; for the two vertex-chain tags we route through
 * `vn.fromPolyline` / `vn.fromPolygon` and emit via `vn.toSVGPathData`
 * — same zero-tangent `M`/`L` sequence the gesture handlers'
 * `PathModel.toSvgPathD()` will produce on subsequent commits.
 *
 * The returned string is internal to the session — it is never written
 * to the document on its own. Native-attr writeback happens through
 * {@link apply_session_d} (which calls {@link PathModel.toNativeAttrs}
 * to project the path-form geometry back to source-tag attrs).
 */
export function source_to_session_d(source: VectorEditSource): string {
  switch (source.kind) {
    case "path":
      return source.d;
    case "line":
      return vn.toSVGPathData(
        vn.fromPolyline([
          [source.x1, source.y1],
          [source.x2, source.y2],
        ])
      );
    case "polyline":
      return vn.toSVGPathData(
        vn.fromPolyline(
          source.points.map((p) => [p[0], p[1]] as [number, number])
        )
      );
    case "polygon":
      return vn.toSVGPathData(
        vn.fromPolygon(
          source.points.map((p) => [p[0], p[1]] as [number, number])
        )
      );
    case "circle":
      // Cubic-Bézier conic: a four-segment ellipse with cardinal anchors
      // (the chosen editing representation — see promote-to-path RFD D3).
      return vn.toSVGPathData(
        vn.fromEllipse({
          x: source.cx - source.r,
          y: source.cy - source.r,
          width: source.r * 2,
          height: source.r * 2,
        })
      );
    case "ellipse":
      return vn.toSVGPathData(
        vn.fromEllipse({
          x: source.cx - source.rx,
          y: source.cy - source.ry,
          width: source.rx * 2,
          height: source.ry * 2,
        })
      );
    case "rect":
      // Square corners → four lines; rounded corners (rx/ry) → exact
      // arc joins (reuses the tested shape builder; arcs round-trip
      // through PathModel). rx/ry of 0 falls to the line-only path.
      return SVGShapes.createRect(
        source.x,
        source.y,
        source.width,
        source.height,
        source.rx,
        source.ry
      ).encode();
  }
}

/**
 * Native-attribute writeback. Given a new path-data `d` from a gesture,
 * project it back into the source tag's native attrs and write those —
 * `<path>` takes `d` directly; `<line>` takes `x1/y1/x2/y2`;
 * `<polyline>` / `<polygon>` take `points`.
 *
 * Returns `true` if the geometry was written natively. Returns `false`
 * when the source tag cannot express the geometry — a curve was introduced
 * or the topology left the tag's canonical form, OR the source is a
 * geometry primitive (rect / circle / ellipse) which has no native vector
 * form at all. A `false` return is the re-type-to-`<path>` signal; the
 * caller ({@link vector_apply}) handles it. This function never re-types.
 *
 * Symmetric across apply / revert: callers use it for both the in-flight
 * write and the undo-revert (both are just "set the geometry to this d").
 */
export function apply_session_d(
  doc: SvgDocument,
  node_id: string,
  source: VectorEditSource,
  d: string
): boolean {
  if (source.kind === "path") {
    doc.set_attr(node_id, "d", d);
    return true;
  }
  const native = PathModel.fromSvgPathD(d).toNativeAttrs(source.kind);
  if (native === null) return false;
  if (native.kind === "line") {
    doc.set_attr(node_id, "x1", String(native.x1));
    doc.set_attr(node_id, "y1", String(native.y1));
    doc.set_attr(node_id, "x2", String(native.x2));
    doc.set_attr(node_id, "y2", String(native.y2));
    return true;
  }
  // polyline / polygon both write the same `points=` attr.
  const points = native.points.map((p) => `${p[0]},${p[1]}`).join(" ");
  doc.set_attr(node_id, "points", points);
  return true;
}

/**
 * Session-aware geometry write — the single commit chokepoint the DOM
 * gesture handlers call so re-typing stays in one place rather than being
 * reimplemented per gesture. One uniform rule across every source:
 *
 *   1. Try native writeback ({@link apply_session_d}). For `<path>` and for
 *      a vertex tag (`line` / `polyline` / `polygon`) whose edit still fits
 *      its native form, this writes and we're done — the element keeps its
 *      tag.
 *   2. If native writeback refused (a curve was introduced, the topology
 *      escaped the canonical chain, or the source is a geometry primitive
 *      with no native form), re-type the element to `<path>` via
 *      {@link SvgDocument.retype_to_path} and flip the session source to
 *      `path` (so every downstream reader — overlay, gates, the
 *      external-mutation reconciler — behaves correctly).
 *
 * Returns the {@link RetypeRecord} token iff this call performed a re-type
 * (so the caller can pair it with the edit in one history bracket and hand
 * it to {@link vector_revert} on undo); otherwise `null`.
 */
export function vector_apply(
  doc: SvgDocument,
  session: VectorEditSession,
  d: string
): RetypeRecord | null {
  // Native writeback covers <path> and any vertex tag whose edit still fits.
  if (apply_session_d(doc, session.node_id, session.source, d)) return null;
  // Not natively expressible → re-type to <path>.
  const token = doc.retype_to_path(session.node_id, d);
  if (token) {
    session.promote_source_to_path();
    return token;
  }
  // Already re-typed earlier this gesture (idempotent) — just update `d`.
  doc.set_attr(session.node_id, "d", d);
  return null;
}

/**
 * Counterpart to {@link vector_apply}. If this gesture re-typed the element
 * (a non-null `promotion` token), restore the original tag/attrs and the
 * session source — the re-type and the edit undo as one step. Otherwise
 * re-write the baseline geometry natively; for a geometry primitive that
 * never re-typed, {@link apply_session_d} writes nothing (a correct no-op).
 */
export function vector_revert(
  doc: SvgDocument,
  session: VectorEditSession,
  baseline_d: string,
  promotion: RetypeRecord | null
): void {
  if (promotion) {
    doc.revert_retype(session.node_id, promotion);
    session.restore_source();
    return;
  }
  apply_session_d(doc, session.node_id, session.source, baseline_d);
}
