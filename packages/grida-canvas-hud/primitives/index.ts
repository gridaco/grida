export { HUDCanvas, type HUDCanvasOptions } from "./canvas";
export {
  resolvePaint,
  buildStripesTile,
  computeStripesTileGeometry,
  DEFAULT_STRIPES_ANGLE_DEG,
  DEFAULT_STRIPES_SPACING_PX,
  DEFAULT_STRIPES_THICKNESS_PX,
  type ResolvedPaint,
} from "./paint";
export {
  drawPixelGrid,
  DEFAULT_PIXEL_GRID_COLOR,
  DEFAULT_PIXEL_GRID_STEPS,
  type DrawPixelGridParams,
  type PixelGridConfig,
} from "./pixel-grid";
export {
  drawCornerRadius,
  computeCornerRadiusLayout,
  cornerRadiusHandlePosRect,
  cornerRadiusHandlePosLine,
  cornerRadiusLayoutGroups,
  cornerRadiusAnchorSign,
  resolveCornerDragAnchor,
  resolveCenterDragAnchor,
  DEFAULT_CORNER_RADIUS_HANDLE_INSET,
  DEFAULT_CORNER_RADIUS_HANDLE_SIZE,
  DEFAULT_CORNER_RADIUS_HIT_SIZE,
  type CornerRadiusAnchor,
  type CornerRadiusInput,
  type CornerRadiusRectangular,
  type CornerRadiusHandleLayout,
  type DrawCornerRadiusParams,
} from "./corner-radius";
export {
  drawParametricHandles,
  computeParametricHandleLayout,
  parametricHandleLayoutGroups,
  resolveParametricHandleByDirection,
  projectParametricHandleValue,
  DEFAULT_PARAMETRIC_HANDLE_INSET,
  DEFAULT_PARAMETRIC_HANDLE_SIZE,
  DEFAULT_PARAMETRIC_HIT_SIZE,
  type ParametricHandle,
  type ParametricHandleGroup,
  type ParametricHandleInput,
  type ParametricHandleLayout,
  type DrawParametricHandlesParams,
} from "./parametric-handle";
export {
  drawRuler,
  DEFAULT_RULER_STRIP,
  DEFAULT_RULER_TICK_HEIGHT,
  DEFAULT_RULER_OVERLAP_THRESHOLD,
  DEFAULT_RULER_TEXT_SIDE_OFFSET,
  DEFAULT_RULER_FONT,
  DEFAULT_RULER_COLOR,
  DEFAULT_RULER_ACCENT_BACKGROUND,
  DEFAULT_RULER_ACCENT_COLOR,
  DEFAULT_RULER_BACKGROUND,
  DEFAULT_RULER_STEPS,
  DEFAULT_RULER_DRAG_THRESHOLD,
  type DrawRulerParams,
  type RulerAxis,
  type RulerConfig,
  type RulerMark,
  type RulerRange,
} from "./ruler";
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
export { filterHUDDrawByGroup, type HUDGroupFilter } from "./draw";
export { snapGuideToHUDDraw } from "./snap-guide";
export { measurementToHUDDraw } from "./measurement-guide";
export { marqueeToHUDDraw } from "./marquee";
export { lassoToHUDDraw } from "./lasso";

// ─── Bedrock value types (v0.x — no compatibility guarantees) ──────────────
// The agnostic foundational layer: the canonical `HUDObject`, its hit/render
// shape unions, the `Painter` seam, and cursor value types. These share
// names (`HitShape`, `RenderShape`, `CursorIcon`, `MIN_HIT_SIZE`, …) with the
// legacy `event/` types still exported from the package root, so they are
// surfaced ONLY here, under the `@grida/hud/primitives` subpath, never at the
// root — the two layers coexist without collision until the legacy stack is
// retired. See `primitives/README.md` and the top-level stability banner.

export {
  type HUDObject,
  type HUDObjectPaintOnly,
  type HUDObjectInteractive,
  type HitShape,
  type RenderShape,
  MIN_HIT_SIZE,
  MIN_CHROME_VISIBLE_SIZE,
} from "./overlay";

export { type Painter, type PainterViewport } from "./painter";

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
