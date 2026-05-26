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

/**
 * `PathModel` — canonical vector-network model for a single SVG `<path>`
 * d-string. Public Layer-A primitive, distinct from the editor instance:
 * models a single SVG path's vector network for callers that want path
 * geometry without an editor.
 *
 * Construct with {@link PathModel.fromSvgPathD}; serialize back with
 * `toSvgPathD()`; observe with `snapshot()` / `bbox()` / `vertexCount()` /
 * `segmentCount()`. No `SvgDocument`, no editor lifecycle, no DOM access
 * is involved at any step.
 *
 * @experimental Shape is v0 and may shift before the package reaches
 * semver stability. Consumers that depend on this surface should pin a
 * minor version and re-validate on upgrade.
 */
export { PathModel } from "./core/vector-edit/model";
export type {
  PathSnapshot,
  SegmentId,
  Verb,
  VertexId,
} from "./core/vector-edit/model";
