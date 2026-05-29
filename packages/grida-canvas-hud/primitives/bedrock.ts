// `@grida/hud/primitives` — the agnostic bedrock value-type surface.
//
// This is the curated public barrel for the `./primitives` subpath. It
// exports ONLY layer-clean value types — the canonical `HUDObject`, its
// hit/render shape unions, the `Painter` seam, cursor value types, and the
// drawing-descriptor vocabulary those reference. Everything reachable from
// here imports only `@grida/cmath` and sibling bedrock files.
//
// It deliberately does NOT re-export the package's `primitives/index.ts`
// barrel: that barrel still carries the legacy opinionated drawers
// (`ruler.ts`, `corner-radius.ts`, `parametric-handle.ts`, `pixel-grid.ts`,
// `canvas.ts`, `projection.ts`), which import from `event/` and `classes/`.
// Surfacing those here would couple the "agnostic bedrock" subpath to the
// legacy stack. The closure-walking layering test
// (`__tests__/api/import-graph.test.ts`) starts from this file and asserts
// the entire reachable graph stays clean.

// ─── The canonical object + its shapes ─────────────────────────────────────
export {
  type HUDObject,
  type HUDObjectPaintOnly,
  type HUDObjectInteractive,
  type HitShape,
  type RenderShape,
  MIN_HIT_SIZE,
  MIN_CHROME_VISIBLE_SIZE,
} from "./overlay";

// ─── Backend seam ──────────────────────────────────────────────────────────
export { type Painter, type PainterViewport } from "./painter";

// ─── Cursor value types ────────────────────────────────────────────────────
export {
  type CursorIcon,
  type ResizeDirection,
  type RotationCorner,
  type CursorRenderer,
  CURSOR_ANGLE_BUCKET_RAD,
  angleBucket,
  cursorToCss,
  cursorEquals,
} from "./cursor";

// ─── Drawing-descriptor vocabulary (referenced by RenderShape / Painter) ───
export type {
  HUDDraw,
  HUDLine,
  HUDPaint,
  HUDPaintSolid,
  HUDPaintStripes,
  HUDPoint,
  HUDPolyline,
  HUDRect,
  HUDRule,
  HUDScreenRect,
  HUDSemantic,
  HUDSemanticGroup,
} from "./types";
