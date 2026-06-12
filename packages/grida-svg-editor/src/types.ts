/**
 * Stable identifier for a node in the editor's document model.
 *
 * Independent of any backing representation. Generated when the document is
 * parsed.
 */
export type NodeId = string;

export type Vec2 = { x: number; y: number };

export type Rect = { x: number; y: number; width: number; height: number };

/**
 * A 2×3 affine transform in SVG `matrix(a b c d e f)` order — the same
 * six-number tuple the SVG `transform="matrix(...)"` function takes.
 *
 * Applied to a point `(x, y)`:
 *   x' = a·x + c·y + e
 *   y' = b·x + d·y + f
 *
 * This is the wire shape `commands.transform` accepts. Examples:
 *   - `[-1, 0, 0, 1, 0, 0]` — horizontal flip (mirror x about the origin)
 *   - `[1, 0, 0, -1, 0, 0]` — vertical flip (mirror y about the origin)
 *   - `[1, 0, 0, 1, 0, 0]`  — identity (no-op)
 *
 * `commands.transform` re-centers this about a pivot, so the bare flip
 * tuples become in-place flips about the selection center.
 */
export type Matrix2D = readonly [
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
];

/**
 * Observe-only outcome of a discrete pointer **tap** on the canvas: the user
 * pressed and released within the drag threshold, without dragging. Delivered
 * through {@link SvgEditor.subscribe_pick} — a transient event, never part of
 * `EditorState` (it would be stale on the next snapshot).
 *
 * A pick is deliberately **separate from selection**. Selection answers "what
 * do commands target"; a pick answers "what did the user just click, and
 * where". A primary tap on a node both selects it and emits a pick; a tap on
 * empty canvas emits a pick with `node_id: null` (distinguishable from "nothing
 * is selected"); a secondary (right-button) tap emits a pick and does NOT
 * change selection. This is what a click-driven host tool (annotation, context
 * menu, custom selection) needs and selection alone cannot express.
 *
 * Observe-only: a pick reports a click that already happened. It cannot
 * prevent or replace the editor's own selection handling.
 *
 * @unstable Shape is provisional until ≥2 consumers exercise it. Fields may
 * change without a semver bump until then.
 */
export type PickEvent = {
  /** Document-space point the tap resolved against (the pointer-DOWN point). */
  point: Vec2;
  /** Topmost node under `point`, or `null` for empty canvas / background. */
  node_id: NodeId | null;
  /** Which button produced the tap. `"middle"` is pan and never taps. */
  button: "primary" | "secondary";
  /** Modifier snapshot at press time. */
  mods: { shift: boolean; alt: boolean; meta: boolean; ctrl: boolean };
};

export type Mode = "select" | "edit-content";

// ─── Tool (orthogonal to Mode — what does pointer-down do in select mode?) ─

/**
 * SVG element tags inserted by the **drag-to-size** subsystem. Closed set;
 * adding a new insertable tag requires a PR.
 *
 * `text` is intentionally NOT here. It is creatable (the `insert-text`
 * tool — see {@link Tool}), but via a **click-only** gesture, not
 * drag-to-size: `<text>` has no intrinsic size, so there is nothing for a
 * drag to set. Its creation path mounts the inline content-editor
 * immediately. Design: `docs/wg/feat-svg-editor/text-tool.md`.
 */
export type InsertableTag = "rect" | "ellipse" | "line";

/**
 * Active tool — orthogonal to `Mode`. `Mode` is what the editor is doing
 * (interacting normally vs. inline text edit); `Tool` is what pointer-down
 * does while in `select` mode.
 *
 *  - `cursor` (default): pointer-down selects / starts marquee / drags
 *    selection (existing HUD-driven behavior).
 *  - `insert`: pointer-down opens an insertion-preview gesture for the
 *    given tag. Click-no-drag inserts a default-sized node; drag sizes
 *    the new node. Tool reverts to `cursor` after commit.
 */
export type Tool =
  | { type: "cursor" }
  | { type: "insert"; tag: InsertableTag }
  /**
   * Text creation tool. A select-mode tool like `insert`, but **click-only**
   * rather than drag-to-size: pointer-down creates a single-line `<text>` at
   * the click point with default appearance and immediately enters
   * content-edit (caret active). `<text>` has no intrinsic size, so the
   * drag-to-size model doesn't apply; a drag box would mean SVG 2 wrapped
   * text, which is a separate (out-of-scope) model. Reverts to `cursor`
   * after the node is placed. Design:
   * `docs/wg/feat-svg-editor/text-tool.md`.
   */
  | { type: "insert-text" }
  /**
   * Vector content-edit lasso (Q). Empty-space drag draws a freeform
   * polygon that picks vertices + tangents inside it (segments are NOT
   * tested — matches the main editor decision; see `@grida/hud`
   * `VectorSelectionMode`). Valid only while `state.mode === "edit-content"`
   * on a path; tool reverts to cursor on path-content-edit exit.
   */
  | { type: "lasso" }
  /**
   * Vector content-edit bend. Sticky version of holding Meta — every
   * segment-body drag bends instead of translating, regardless of
   * Meta state. See `@grida/hud` `VectorBendMode`. Valid only while
   * `state.mode === "edit-content"` on a path; tool reverts to cursor
   * on path-content-edit exit.
   */
  | { type: "bend" };

export const TOOL_CURSOR: Tool = { type: "cursor" };

// ─── Properties (CSS / SVG spec-aligned) ───────────────────────────────────

export type Provenance = {
  /** CSS cascade origin (css-cascade-5 §6.2). */
  origin: "author" | "user_agent";
  /** Editor metadata — where in the file the winning declaration lives. */
  carrier:
    | "presentation_attribute"
    | "inline_style"
    | "stylesheet"
    | "inherited"
    | "defaulted";
};

export type InvalidComputedValue = {
  error: "invalid_at_computed_value_time";
  reason: string;
};

export type PropertyValue<T = string | number> = {
  declared: string | null;
  computed: T | InvalidComputedValue | null;
  provenance: Provenance;
};

// ─── Paint (SVG 2 §13.2 `<paint>` production) ──────────────────────────────

/**
 * Computed-time color. `current_color` stays a keyword (CSS Color 4 §4.4)
 * — its rgb resolution happens at *used* value, which needs the surface's
 * painting context.
 *
 * For `rgb`, `value` is canonical lowercase hex — `#rrggbb`, or
 * `#rrggbbaa` when alpha < 1 — whenever the literal is resolvable without
 * a rendering context (named colors, hex, `rgb()`, `hsl()`, `hwb()`).
 * Literals the editor does not resolve (`lab()` / `oklch()` / `color()` —
 * gamut mapping out of scope) pass through as authored. The authored
 * string is always available on the `declared` channel.
 */
export type Color = { kind: "rgb"; value: string } | { kind: "current_color" };

export type PaintFallback = { kind: "none" } | { kind: "color"; value: Color };

export type Paint =
  | { kind: "none" }
  | { kind: "color"; value: Color }
  | { kind: "ref"; id: string; fallback?: PaintFallback }
  | { kind: "context_fill" }
  | { kind: "context_stroke" };

export type PaintValue = {
  declared: string | null;
  computed: Paint | InvalidComputedValue | null;
  provenance: Provenance;
};

// ─── Resource definitions (defs registries) ────────────────────────────────

export type GradientStop = {
  offset: number;
  color: string;
  opacity?: number;
};

export type LinearGradientDefinition = {
  kind: "linear";
  stops: GradientStop[];
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  gradient_units?: "user_space_on_use" | "object_bounding_box";
  spread_method?: "pad" | "reflect" | "repeat";
};

export type RadialGradientDefinition = {
  kind: "radial";
  stops: GradientStop[];
  cx?: number;
  cy?: number;
  r?: number;
  fx?: number;
  fy?: number;
  gradient_units?: "user_space_on_use" | "object_bounding_box";
  spread_method?: "pad" | "reflect" | "repeat";
};

export type GradientDefinition =
  | LinearGradientDefinition
  | RadialGradientDefinition;

export type GradientEntry = {
  id: string;
  definition: GradientDefinition;
  ref_count: number;
};

// ─── Style (HUD chrome appearance) ─────────────────────────────────────────

export type EditorStyle = {
  chrome_color: string;
  handle_size: number;
  handle_fill: string;
  handle_stroke: string;
  endpoint_dot_radius: number;
  selection_outline_width: number;
  /**
   * Color for measurement guides (distance lines + numeric pills). Distinct
   * from `chrome_color` so the user can tell at a glance whether something
   * is selection chrome or a measurement readout.
   */
  measurement_color: string;
  /** `W × H` pill under each selected node, in `chrome_color`. */
  show_size_meter: boolean;
  /** Snap to neighbor edges, centers, and equidistant spacing during
   *  translate. Both behavior and guides are off when `false`. */
  snap_enabled: boolean;
  /** Snap activation distance in HUD container pixels. Touch UIs may
   *  prefer larger (~10–12); precision UIs smaller (~3–4). */
  snap_threshold_px: number;
  /** Hit-test tolerance in screen CSS pixels. The picker selects a node
   *  whose rendered geometry is within this many pixels of the pointer,
   *  making thin elements (1-px lines, hairline strokes) selectable
   *  without pixel-perfect aiming. Tolerance is screen-space, not
   *  world-space — the band stays the same width on screen regardless
   *  of zoom. `0` disables fat-hit and falls back to elementFromPoint
   *  exact-pixel selection. */
  hit_tolerance_px: number;
  /** Snap-to-pixel-grid quantization for translate. When `true`, every
   *  translate (drag, nudge, RPC) snaps the agent-union origin to integer
   *  multiples of `pixel_grid_size` as the final pipeline stage — composes
   *  on top of snap-to-geometry, which still emits guides as usual. Default
   *  `false` for SVG-fidelity: SVG paths are unitless and frequently
   *  fractional; forcing integers would corrupt authored geometry.
   *
   *  Naming: this is the *action* flag (snap to the pixel grid). The
   *  "pixel grid" itself — a visual integer-pixel overlay — is a separate
   *  feature (see `@grida/canvas-pixelgrid`) and is unrelated. */
  snap_to_pixel_grid: boolean;
  /** Quantum size in HUD container pixels (`1` = integer grid). Ignored
   *  when `snap_to_pixel_grid` is false. */
  pixel_grid_size: number;
  /** Show the visual pixel-grid overlay on the HUD. Independent of
   *  `snap_to_pixel_grid` — this is the *display* flag, that one is the
   *  *action* flag. The grid is zoom-gated; it only paints at high zoom
   *  (see `@grida/hud` `setPixelGrid` for the threshold). Default `true`. */
  pixel_grid: boolean;
  /** Shift-drag snap step for rotation, in radians. Default π/12 (15°).
   *  When `null` or `<= 0`, shift-rotate is free (no quantization). */
  angle_snap_step_radians: number | null;
};

export const DEFAULT_STYLE: EditorStyle = {
  chrome_color: "#2563eb",
  handle_size: 8,
  handle_fill: "#ffffff",
  handle_stroke: "#2563eb",
  endpoint_dot_radius: 5,
  selection_outline_width: 2,
  measurement_color: "#ff3a30",
  show_size_meter: true,
  snap_enabled: true,
  snap_threshold_px: 6,
  hit_tolerance_px: 0,
  snap_to_pixel_grid: false,
  pixel_grid_size: 1,
  pixel_grid: true,
  angle_snap_step_radians: Math.PI / 12, // 15°
};

// ─── Providers ─────────────────────────────────────────────────────────────

export type ClipboardProvider = {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
};

export type FontResolver = {
  resolve(family: string): Promise<{
    available: boolean;
    metrics?: { ascent: number; descent: number; unitsPerEm: number };
  }>;
};

export type FileIOProvider = {
  openSvg(): Promise<string | null>;
  saveSvg(svg: string, suggestedName?: string): Promise<void>;
};

export type Providers = {
  clipboard?: ClipboardProvider;
  fonts?: FontResolver;
  file_io?: FileIOProvider;
};

// ─── Editor state ──────────────────────────────────────────────────────────

export type EditorState = {
  readonly selection: ReadonlyArray<NodeId>;
  readonly scope: NodeId | null;
  readonly mode: Mode;
  /**
   * Active tool — orthogonal to `mode`. Default `{ type: "cursor" }`. While
   * in `select` mode + `insert` tool, pointer-down on the surface starts
   * an insertion gesture for the configured tag instead of selection.
   * Switched via `editor.set_tool(...)` or the bundled `tool.set` keymap
   * (V/R/O/L). Bumps `state.version` only.
   */
  readonly tool: Tool;
  readonly dirty: boolean;
  readonly can_undo: boolean;
  readonly can_redo: boolean;
  /**
   * Bumps on every editor emission. Use this when you need to react to
   * any change — selection, history, mutation. NOT a good cache key for
   * tree-shape views because it fires on attribute writes too (e.g. x/y
   * during a drag).
   *
   * NOT a content fingerprint either: this bumps on UI-state emissions
   * (selection, scope, mode, tool) that leave the serialized SVG
   * unchanged. For "did the document content change?" use
   * {@link content_version}.
   */
  readonly version: number;
  /**
   * Bumps on every document mutation — insert, remove, reorder, attribute
   * write, style write, undo, redo, load. Stable across pure UI-state
   * emissions (selection, scope, mode, tool).
   *
   * The honest fingerprint for serialized content: if `content_version`
   * is unchanged, `editor.serialize()` returns the same bytes. Use this
   * — not `version` — as the freshness token when persisting, diffing,
   * or hashing the document.
   */
  readonly content_version: number;
  /**
   * Bumps only when the document's tree shape or display-label-affecting
   * data changes — node added/removed/reordered, text content, or the
   * `id` attribute. Stable across pure presentation-attribute writes.
   *
   * The right cache key for hierarchy / layers panels: snapshot once per
   * `structure_version` so a drag doesn't invalidate the tree view.
   */
  readonly structure_version: number;
  /**
   * Bumps when any change occurs that could shift a node's world-space
   * bounds — geometry-affecting attribute writes (x, y, d, transform,
   * font-size, …), text content, or structure (insert/remove). Stable
   * across pure presentation writes (fill, stroke-color, opacity).
   *
   * Cache key for `GeometryProvider` — bounds caches snapshot on this
   * so a fill-color change doesn't invalidate them.
   */
  readonly geometry_version: number;
  /**
   * Bumps once per `editor.load(svg)` call. Distinct from
   * `structure_version` (which bumps on edits too). Starts at 0; the
   * constructor's initial SVG does NOT count as a load. Use this when
   * you want to react to "a new document was loaded" — e.g. refit
   * camera to the new root, reset host-side UI state, clear per-file
   * scratch — without firing on text edits, reorders, or deletes.
   *
   * Monotonic, never resets.
   */
  readonly load_version: number;
};

export type Unsubscribe = () => void;

// ─── Commands ──────────────────────────────────────────────────────────────

export type ReorderDirection =
  | "bring_forward"
  | "send_backward"
  | "bring_to_front"
  | "send_to_back";

/**
 * Continuous-gesture write session returned by
 * `commands.preview_property(name)`: many `update()` calls during a drag,
 * one `commit()` (→ single history step) or `discard()` (→ no step).
 *
 * Supersession: a discrete write to the same property
 * (`set_property(name, …)` — and for paint channels `set_paint` /
 * `set_paint_from_gradient`, which write through it) or opening a second
 * session on the same name silently discards this session — the discrete
 * write is the user's final intent and a later `commit()` must not replay
 * the stale previewed value over it. After the session ends for any
 * reason (commit, discard, supersession), every method is a no-op — a
 * defensive `discard()` before a discrete write is valid but no longer
 * required. Sessions on OTHER property names are untouched by discrete
 * writes.
 */
export type PreviewSession = {
  update(value: string): void;
  commit(): void;
  discard(): void;
};

/** `PreviewSession` over typed `Paint` values, from
 *  `commands.preview_paint(channel)`. Same lifecycle and supersession
 *  contract — the channel ("fill" / "stroke") is the property name. */
export type PaintPreviewSession = {
  update(paint: Paint): void;
  commit(): void;
  discard(): void;
};

/**
 * Preview-bracketed insertion gesture. Returned by
 * `editor.commands.insert_preview(...)`. The pending node is created and
 * inserted immediately (so the HUD selection chrome renders); per-frame
 * geometry writes call `update(attrs)`; `commit()` collapses the gesture
 * into a single undo step; `discard()` rolls back as if the gesture never
 * happened.
 */
export type InsertPreviewSession = {
  /** The live node, addressable during drag. */
  readonly id: NodeId;
  update(attrs: Readonly<Record<string, string>>): void;
  commit(): void;
  discard(): void;
};
