// Primitives — dumb render shapes
export {
  HUDCanvas,
  type HUDCanvasOptions,
  resolvePaint,
  buildStripesTile,
  computeStripesTileGeometry,
  DEFAULT_STRIPES_ANGLE_DEG,
  DEFAULT_STRIPES_SPACING_PX,
  DEFAULT_STRIPES_THICKNESS_PX,
  type ResolvedPaint,
  type HUDDraw,
  type HUDLine,
  type HUDPaint,
  type HUDPaintSolid,
  type HUDPaintStripes,
  type HUDPoint,
  type HUDPolyline,
  type HUDRect,
  type HUDRule,
  type HUDScreenRect,
  type HUDSemantic,
  type HUDSemanticGroup,
  filterHUDDrawByGroup,
  snapGuideToHUDDraw,
  measurementToHUDDraw,
  marqueeToHUDDraw,
  lassoToHUDDraw,
  drawPixelGrid,
  DEFAULT_PIXEL_GRID_COLOR,
  DEFAULT_PIXEL_GRID_STEPS,
  type DrawPixelGridParams,
  type PixelGridConfig,
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
} from "./primitives";

// Surface — wired state + hit-test + draw loop
export {
  Surface,
  type SurfaceOptions,
  type SurfaceResponse,
  type SurfaceVisibility,
  type SurfaceVisibilityContext,
  type SurfaceVisibilityPolicy,
  type VectorInsertionMode,
  type VectorSelectionMode,
  type VectorBendMode,
} from "./surface";
export type { SurfaceChromeGroups } from "./surface/chrome";
export type { HUDStyle } from "./surface/style";

// Event types — public for hosts that need to construct events
export type { SurfaceEvent, Modifiers, PointerButton } from "./event/event";
export { NO_MODS } from "./event/event";
export type { SurfaceGesture } from "./event/gesture";
export type { Intent, IntentPhase, SelectMode } from "./event/intent";
export type {
  CursorIcon,
  CursorRenderer,
  ResizeDirection,
  RotationCorner,
} from "./event/cursor";
export { cursorToCss, cursorEquals } from "./event/cursor";
export type { SelectionShape, SelectionGroup } from "./event/shape";
export type { OverlayElement, HitShape, RenderShape } from "./event/overlay";
export { MIN_HIT_SIZE, MIN_CHROME_VISIBLE_SIZE } from "./event/overlay";
export type { VectorSubSelection, VectorHover } from "./event/state";
export type { VectorOverlay } from "./classes/vector-path";
export {
  buildPaddingOverlay,
  PADDING_HANDLE_PRIORITY,
  PADDING_REGION_PRIORITY,
  PADDING_HANDLE_LENGTH,
  PADDING_HANDLE_THICKNESS,
  type PaddingOverlayInput,
  type PaddingHover,
} from "./classes/padding";

// Transform-box (named class).
export {
  buildTransformBox,
  TRANSFORM_BOX_CORNER_PRIORITY,
  TRANSFORM_BOX_SIDE_PRIORITY,
  TRANSFORM_BOX_BODY_PRIORITY,
  TRANSFORM_BOX_CORNER_HIT_SIZE,
  TRANSFORM_BOX_SIDE_HIT_THICKNESS,
  type TransformBoxInput,
  type TransformBoxHover,
  type TransformBoxActiveOp,
} from "./classes/transform-box";
// Transform-box math primitive — class-bound math reducer factored out
// for testability. Lives in `primitives/` for code organization; the
// chrome that consumes it lives in `classes/transform-box/`.
export {
  reduceTransformBox,
  getTransformBoxCorners,
  cornersToBoxTransform,
  decompose as decomposeTransformBox,
  compose as composeTransformBox,
  type AffineTransform,
  type TransformBoxAction,
  type TransformBoxOptions,
  type TransformBoxCorners,
} from "./primitives/transform-box";

// Selection-controls — pure-geometry model + priority ladder (UX rule).
export {
  HUDHitPriority,
  MIN_GUARANTEED_INTERACTIVE_DIM,
  BODY_FLIP_THRESHOLD,
  computeSelectionControlLayout,
  negotiateAxis,
} from "./event/selection-controls";
export type {
  SelectionControlLayout,
  SelectionControlZone,
  SelectionControlRole,
} from "./event/selection-controls";
