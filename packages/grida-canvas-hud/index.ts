// Primitives — dumb render shapes
export {
  HUDCanvas,
  type HUDCanvasOptions,
  type HUDDraw,
  type HUDLine,
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
} from "./primitives";

// Surface — wired state + hit-test + draw loop
export {
  Surface,
  type SurfaceOptions,
  type SurfaceResponse,
  type SurfaceVisibility,
  type SurfaceVisibilityContext,
  type SurfaceVisibilityPolicy,
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
