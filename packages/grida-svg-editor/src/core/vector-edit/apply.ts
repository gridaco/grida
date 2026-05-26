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
import type { SvgDocument, VectorEditSource } from "../document";
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
  }
}

/**
 * Tag-aware document write. Given a new path-data `d` from a gesture,
 * project it back into the source tag's native attrs and write those —
 * unless the source is `<path>`, in which case `d` is written
 * directly.
 *
 * Returns `true` on success. Returns `false` for non-path sources when
 * the model can no longer be expressed in the source tag's native attrs
 * (tangent introduced, topology change). v1 treats `false` as gesture
 * refusal — the caller should NOT fall through and write `d` on a non-
 * path element. Promotion to `<path>` lives in v1.1+.
 *
 * Symmetric across apply / revert: gesture handlers call this for both
 * the in-flight write and the undo-revert (since both are just "set the
 * geometry to this d"), so apply/revert stay consistent even when one
 * writes native attrs and the other would.
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
  // Both non-path kinds write the same `points=` attr.
  const points = native.points.map((p) => `${p[0]},${p[1]}`).join(" ");
  doc.set_attr(node_id, "points", points);
  return true;
}
