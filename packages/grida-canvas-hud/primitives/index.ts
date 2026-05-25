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
