// @grida/svg-editor — headless public surface.
//
// This entry must not import any DOM types. The DOM surface (Camera,
// Gestures, MemoizedGeometryProvider, SnapOptions, DomComputed*) lives at
// `@grida/svg-editor/dom`. The plugin-host-shaped seams (CommandHandler,
// CommandId, KeymapBinding) are internal — adding them to the public
// surface would violate the "Not a plugin host" anti-goal.

export { createSvgEditor } from "./core/editor";
export type {
  Commands,
  CreateSvgEditorOptions,
  SelectMode,
  Surface,
  SurfaceHandle,
  SvgEditor,
} from "./core/editor";

export type { AlignDirection } from "./core/align";

export type {
  ClipboardProvider,
  Color,
  EditorState,
  EditorStyle,
  FileIOProvider,
  FontResolver,
  GradientDefinition,
  GradientEntry,
  GradientStop,
  InsertableTag,
  InsertPreviewSession,
  InvalidComputedValue,
  LinearGradientDefinition,
  Mode,
  NodeId,
  Paint,
  PaintFallback,
  PaintPreviewSession,
  PaintValue,
  PreviewSession,
  Providers,
  Provenance,
  PropertyValue,
  RadialGradientDefinition,
  Rect,
  ReorderDirection,
  Tool,
  Unsubscribe,
  Vec2,
} from "./types";

export { DEFAULT_STYLE, TOOL_CURSOR } from "./types";
