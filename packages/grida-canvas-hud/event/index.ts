export {
  type SurfaceEvent,
  type SurfaceResponse,
  type Modifiers,
  type PointerButton,
  NO_MODS,
  emptyResponse,
} from "./event";
export {
  type SurfaceGesture,
  type NodeId,
  type Rect,
  IDLE,
  rectFromPoints,
  applyResize,
} from "./gesture";
export {
  type CursorIcon,
  type ResizeDirection,
  type RotationCorner,
  cursorToCss,
  cursorEquals,
} from "./cursor";
export {
  type Intent,
  type IntentPhase,
  type IntentHandler,
  type SelectMode,
} from "./intent";
export { ClickTracker, type ClickTrackerOptions } from "./click-tracker";
export { HitRegions, type HitRegion, type OverlayAction } from "./hit-regions";
export {
  type Transform,
  IDENTITY,
  screenToDoc,
  docToScreen,
  zoomOf,
} from "./transform";
export { SurfaceState, type StateDeps } from "./state";
export { type SelectionShape, type SelectionGroup, shapeBounds } from "./shape";
export {
  type OverlayElement,
  type HitShape,
  type RenderShape,
  MIN_HIT_SIZE,
  MIN_CHROME_VISIBLE_SIZE,
  ROTATION_WRAP,
} from "./overlay";
