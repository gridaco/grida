import { HUDCanvas } from "../primitives/canvas";
import { filterHUDDrawByGroup } from "../primitives/draw";
import type { PixelGridConfig } from "../primitives/pixel-grid";
import type { HUDDraw, HUDSemanticGroup } from "../primitives/types";
import type {
  SurfaceEvent,
  SurfaceResponse,
  Modifiers,
  PointerButton,
} from "../event/event";
import { SurfaceState } from "../event/state";
import type { SurfaceGesture, NodeId } from "../event/gesture";
import {
  type CursorIcon,
  type CursorRenderer,
  cursorToCss,
} from "../event/cursor";
import type { Intent, IntentHandler } from "../event/intent";
import type { Transform } from "../event/transform";
import type { SelectionShape, SelectionGroup } from "../event/shape";
import { type HUDStyle, DEFAULT_STYLE, mergeStyle } from "./style";
import {
  buildChrome,
  fanOverlays,
  mergeDraws,
  type SurfaceChromeGroups,
} from "./chrome";
import { buildVectorChrome, type VectorOverlay } from "./vector-chrome";
import type { OverlayElement } from "../event/overlay";
import type { VectorSubSelection } from "../event/state";

export interface SurfaceVisibilityContext {
  gesture: SurfaceGesture;
}

export interface SurfaceVisibility {
  hidden?: Iterable<HUDSemanticGroup>;
}

export type SurfaceVisibilityPolicy = (
  context: SurfaceVisibilityContext
) => SurfaceVisibility | undefined;

export interface SurfaceOptions {
  /**
   * Content pick. Given a doc-space point, return the topmost node id under
   * the pointer, or `null`. Host wraps its scene query however it wants
   * (e.g. `elementFromPoint` + `data-id` for SVG-DOM hosts).
   */
  pick: (point_doc: [number, number]) => NodeId | null;
  /**
   * Selection shape for a node — what the chrome should wrap. Most nodes
   * return `{ kind: "rect", rect }`; vector lines return
   * `{ kind: "line", p1, p2 }`.
   */
  shapeOf: (id: NodeId) => SelectionShape | null;
  /**
   * Optional — vector geometry for a node under content-edit. When set
   * AND `setVectorSelection` has been called with a non-null mirror, the
   * surface renders vertex chrome (knobs, hit regions) for the named node.
   *
   * Hosts that never enter vector-edit mode (or that don't have path-aware
   * content-edit) can omit this. The chrome simply won't render.
   */
  vectorOf?: (id: NodeId) => VectorOverlay | null;
  /** Surface emits intents the host commits. */
  onIntent: IntentHandler;
  /** Initial style (partial; merged with defaults). */
  style?: Partial<HUDStyle>;
  /** Initial readonly flag. Default `false`. */
  readonly?: boolean;
  /** Optional HUDCanvas color override. */
  color?: string;
  /**
   * Optional pixel-grid configuration. Drawn back-most in the HUD canvas
   * when `enabled` and the current zoom exceeds `zoomThreshold`. Hosts can
   * also call `surface.setPixelGrid(...)` later.
   */
  pixelGrid?: PixelGridConfig | null;
  /**
   * Optional semantic groups for surface-owned chrome. The HUD package does
   * not define a group vocabulary; hosts pass the strings they want to use.
   */
  groups?: SurfaceChromeGroups;
  /**
   * Host-owned visibility policy. Called per frame with the current surface
   * gesture; returned groups are filtered from surface chrome and host extras.
   */
  visibility?: SurfaceVisibilityPolicy;
  /**
   * Where a click on a segment inserts the new vertex.
   *
   * - `"midpoint"` (default) — always at `t=0.5`. The ghost preview appears
   *   at the segment's geometric midpoint on hover; the position is
   *   independent of where on the segment the cursor lands. Predictable
   *   and matches the "owning segment hovers → midpoint becomes visible"
   *   mental model.
   * - `"projected"` — at the nearest point on the curve to the cursor
   *   (`cmath.bezier.project`). Mirrors the main editor's
   *   `snapped_segment_p` model — the ghost tracks the cursor along the
   *   curve. More expressive but adds a "where exactly will this land?"
   *   cognitive step.
   *
   * Both modes share the same hit-test, chrome rendering, and intent
   * vocabulary — only the projected `t` differs. Hosts that don't set
   * this get `"midpoint"` (the predictable default).
   */
  vectorInsertionMode?: VectorInsertionMode;
  /**
   * Which gesture an empty-space drag promotes to:
   * - `"marquee"` (default) — axis-aligned rect selection.
   * - `"lasso"` — freeform polygon selection.
   *
   * Pushed by the host alongside its own tool toggle (e.g. Q key in the
   * svg-editor swaps cursor ↔ lasso tools and calls
   * `setVectorSelectionMode`). The HUD reads it only at empty-space drag
   * promotion; no other branch consults it. Symmetric with
   * `vectorInsertionMode`.
   */
  vectorSelectionMode?: VectorSelectionMode;
  /**
   * Sticky-bend toggle for segment-body drag:
   * - `"auto"` (default) — Meta-modifier gates the bend gesture.
   *   No Meta → translate; Meta-held → bend.
   * - `"always"` — segment drag bends regardless of Meta. The host's
   *   bend tool sets this. Released by setting back to `"auto"`.
   *
   * Same host-pushed pattern as `vectorSelectionMode`. Affects only the
   * NEXT segment-drag promotion; in-flight gestures keep their committed
   * mode.
   */
  vectorBendMode?: VectorBendMode;
}

/** See {@link SurfaceOptions.vectorInsertionMode}. */
export type VectorInsertionMode = "midpoint" | "projected";

/** See {@link SurfaceOptions.vectorSelectionMode}. */
export type VectorSelectionMode = "marquee" | "lasso";

/** See {@link SurfaceOptions.vectorBendMode}. */
export type VectorBendMode = "auto" | "always";

/**
 * Top-level wired surface.
 *
 * Owns an internal `HUDCanvas`, a `SurfaceState` (gesture/hover/...) and
 * the host providers. On every `dispatch`, the state machine runs;
 * `draw` composes surface chrome + host-fed extras into a single canvas
 * paint.
 */
export class Surface {
  private hudCanvas: HUDCanvas;
  private state: SurfaceState;
  private style: HUDStyle;
  private opts: SurfaceOptions;
  // Explicit host color override; when set, beats `style.chromeColor` in
  // every paint until cleared via `setColor(null)`.
  private colorOverride: string | undefined;
  private width = 0;
  private height = 0;
  // Pluggable cursor renderer. `null` = use the built-in `cursorToCss`
  // mapping (current behavior; backwards-compat). Hosts opt into the
  // bundled SVG renderer via `setCursorRenderer(cursors.defaultRenderer())`
  // from `@grida/hud/cursors`.
  private cursor_renderer: CursorRenderer | null = null;

  constructor(canvas: HTMLCanvasElement, options: SurfaceOptions) {
    this.opts = options;
    this.style = mergeStyle(DEFAULT_STYLE, options.style);
    this.colorOverride = options.color;
    this.hudCanvas = new HUDCanvas(canvas, {
      color: this.colorOverride ?? this.style.chromeColor,
    });
    this.state = new SurfaceState();
    if (options.readonly !== undefined) {
      this.state.setReadonly(options.readonly);
    }
    if (options.vectorInsertionMode) {
      this.state.setVectorInsertionMode(options.vectorInsertionMode);
    }
    if (options.vectorSelectionMode) {
      this.state.setVectorSelectionMode(options.vectorSelectionMode);
    }
    if (options.vectorBendMode) {
      this.state.setVectorBendMode(options.vectorBendMode);
    }
    if (options.pixelGrid) {
      this.hudCanvas.setPixelGrid(options.pixelGrid);
    }
  }

  /** Switch the vector insertion mode at runtime. Affects both the
   *  hover preview position and the split/bend `t` for the NEXT
   *  pointer event. See {@link SurfaceOptions.vectorInsertionMode}. */
  setVectorInsertionMode(mode: VectorInsertionMode): void {
    this.state.setVectorInsertionMode(mode);
  }

  /** Switch the empty-space-drag selection gesture at runtime
   *  (`marquee` vs `lasso`). Affects only the NEXT pending → drag
   *  promotion; any in-flight gesture keeps running. See
   *  {@link SurfaceOptions.vectorSelectionMode}. */
  setVectorSelectionMode(mode: VectorSelectionMode): void {
    this.state.setVectorSelectionMode(mode);
  }

  /** Switch the sticky-bend toggle at runtime (`auto` vs `always`).
   *  `"always"` is the host's bend tool talking — every segment-drag
   *  bends as if Meta were held. Affects only the NEXT segment-drag
   *  promotion. See {@link SurfaceOptions.vectorBendMode}. */
  setVectorBendMode(mode: VectorBendMode): void {
    this.state.setVectorBendMode(mode);
  }

  /** Configure / disable the back-most pixel-grid layer. */
  setPixelGrid(config: PixelGridConfig | null): void {
    this.hudCanvas.setPixelGrid(config);
  }

  /**
   * Update just the pixel grid's transform. Cheap to call per camera tick.
   * No-op when no pixel-grid config is set.
   */
  setPixelGridTransform(transform: Transform): void {
    this.hudCanvas.setPixelGridTransform(transform);
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  setSize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.hudCanvas.setSize(w, h);
  }

  setTransform(t: Transform): void {
    this.state.setTransform(t);
    this.hudCanvas.setTransform(t);
  }

  /**
   * Push a new selection from the host.
   *
   * Accepts either:
   * - `NodeId[]` — each id becomes its own single-member group, shape
   *   resolved via `shapeOf(id)` by the chrome builder.
   * - `SelectionGroup[]` — pre-computed groups with their union shape.
   *
   * See `SurfaceState.setSelection` for details.
   */
  setSelection(input: readonly NodeId[] | readonly SelectionGroup[]): void {
    this.state.setSelection(input);
  }

  /**
   * Push a vector-edit sub-selection. Pass `null` to exit vector chrome.
   *
   * Non-null: the surface renders vertex knobs for the named path on every
   * subsequent `draw()`, with selected vertices highlighted. Requires the
   * host to have wired `vectorOf` in `SurfaceOptions` — otherwise the
   * chrome silently skips.
   *
   * Host calls this on enter / exit of content-edit AND on every sub-
   * selection change (click, marquee, etc.). Cheap — just swaps a field.
   */
  setVectorSelection(input: VectorSubSelection | null): void {
    this.state.setVectorSelection(input);
  }

  setStyle(partial: Partial<HUDStyle>): void {
    this.style = mergeStyle(this.style, partial);
    this.hudCanvas.setColor(this.colorOverride ?? this.style.chromeColor);
  }

  /**
   * Set or clear the host color override. `null` clears the override and
   * lets `style.chromeColor` win on the next paint.
   */
  setColor(color: string | null): void {
    this.colorOverride = color ?? undefined;
    this.hudCanvas.setColor(this.colorOverride ?? this.style.chromeColor);
  }

  setReadonly(v: boolean): void {
    this.state.setReadonly(v);
  }

  /**
   * Set or clear a host-driven hover override.
   *
   * The surface tracks two hover sources:
   * - **Pointer pick** — what scene content is under the cursor (updated
   *   automatically on `pointer_move`).
   * - **Host override** — what the host wants to show as hovered, e.g.
   *   from a layers panel row mouseenter.
   *
   * The override (when non-null) wins. `hover()` returns the effective
   * value; chrome renders the effective value. Pass `null` to clear and
   * fall back to pointer pick.
   *
   * Returns the same response shape as `dispatch` so the host can react
   * to whether anything actually changed.
   */
  setHoverOverride(id: NodeId | null): SurfaceResponse {
    return this.state.setHoverOverride(id);
  }

  dispose(): void {
    // Currently no external resources; placeholder for future listeners.
  }

  // ── Input ────────────────────────────────────────────────────────────────

  dispatch(event: SurfaceEvent): SurfaceResponse {
    return this.state.dispatch(event, {
      pick: this.opts.pick,
      shapeOf: this.opts.shapeOf,
      emitIntent: this.opts.onIntent,
    });
  }

  // ── Frame ────────────────────────────────────────────────────────────────

  draw(extra?: HUDDraw): void {
    const { overlays, decoration } = buildChrome({
      state: this.state,
      shapeOf: this.opts.shapeOf,
      style: this.style,
      groups: this.opts.groups,
      width: this.width,
      height: this.height,
    });

    // Merge in vector chrome (vertex knobs etc.) when a path is under
    // content-edit and the host wired `vectorOf`. Chrome stays decoupled —
    // the main `buildChrome` doesn't know about vector edit.
    const vector_selection = this.state.getVectorSelection();
    if (vector_selection && this.opts.vectorOf) {
      const vector_overlay = this.opts.vectorOf(vector_selection.node_id);
      if (vector_overlay) {
        const vector_chrome = buildVectorChrome({
          vector_selection,
          vector_overlay,
          style: this.style,
          // Hover is HUD-owned (mirrors the README rule). The chrome reads
          // it each frame to apply state-driven affordances.
          vector_hover: this.state.getVectorHover(),
          // Transform feeds the projection-based segment hit-test so its
          // distance threshold stays at the right screen-px at any zoom.
          transform: this.state.getTransform(),
          // Suppresses preview-only affordances (currently the ghost
          // insertion knob) once the user has touched the surface. See
          // `SurfaceState.isInteracting()` for the semantic.
          is_interacting: this.state.isInteracting(),
          group: this.opts.groups?.selectionControls,
        });
        // Vector overlays are appended AFTER selection-control overlays so
        // their hit regions win on overlap (same logical layer; higher
        // priority value via the priority field, not push order).
        for (const o of vector_chrome.overlays) overlays.push(o);
      }
    }

    const hidden = this.opts.visibility?.({
      gesture: this.state.gesture,
    })?.hidden;
    const { screenRects, lines, polylines } = fanOverlays(
      filterOverlaysByGroup(overlays, hidden),
      this.state.getTransform(),
      this.state.hitRegions()
    );
    // Merge overlay-fanned lines + polylines into the decoration so they're
    // drawn in the same pass as everything else. Polylines carry the
    // path-edit segment outlines; lines carry tangent handle lines.
    const has_extras = lines.length > 0 || polylines.length > 0;
    const decoration_with_extras: HUDDraw = has_extras
      ? {
          ...decoration,
          lines:
            lines.length > 0
              ? [...(decoration.lines ?? []), ...lines]
              : decoration.lines,
          polylines:
            polylines.length > 0
              ? [...(decoration.polylines ?? []), ...polylines]
              : decoration.polylines,
        }
      : decoration;
    this.hudCanvas.draw(
      filterHUDDrawByGroup(
        mergeDraws(decoration_with_extras, extra, screenRects),
        { hidden }
      )
    );
  }

  /** Convenience: clear the canvas (e.g. when the host stops the surface). */
  clear(): void {
    this.hudCanvas.draw(undefined);
  }

  // ── Read-only introspection ─────────────────────────────────────────────

  gesture(): SurfaceGesture {
    return this.state.gesture;
  }

  /**
   * The effective hover: host override (when set) wins over pointer pick.
   * Use this for chrome decisions and host-side reads.
   */
  hover(): NodeId | null {
    return this.state.getEffectiveHover();
  }

  cursor(): CursorIcon {
    return this.state.cursor;
  }

  /**
   * Resolve the current cursor to a CSS `cursor:` value. Runs the
   * installed renderer (or the built-in `cursorToCss` if none installed).
   *
   * Host wires it like:
   *
   *     const r = surface.dispatch(event);
   *     if (r.cursorChanged) el.style.cursor = surface.cursorCss();
   *
   * Saves the host from re-importing `cursorToCss` after every dispatch
   * and gives one place to change behavior when a renderer is swapped in.
   */
  cursorCss(): string {
    const fn = this.cursor_renderer ?? cursorToCss;
    return fn(this.state.cursor);
  }

  /**
   * Install (or clear) a custom cursor renderer.
   *
   * `null` restores the built-in `cursorToCss` behavior (native CSS
   * keywords for every variant). Pass `cursors.defaultRenderer()` from
   * `@grida/hud/cursors` for the bundled SVG cursor set.
   *
   * Re-callable mid-session; the next `cursorCss()` reads the new value.
   */
  setCursorRenderer(fn: CursorRenderer | null): void {
    this.cursor_renderer = fn;
  }

  modifiers(): Modifiers {
    return this.state.modifiers;
  }
}

export type { SurfaceResponse, SurfaceEvent, PointerButton, Modifiers };
export type { Intent, IntentHandler };
export type { HUDStyle };
export type { SelectionShape, SelectionGroup };

function filterOverlaysByGroup(
  overlays: readonly OverlayElement[],
  hidden: Iterable<HUDSemanticGroup> | undefined
): readonly OverlayElement[] {
  const hidden_set = new Set(hidden ?? []);
  if (hidden_set.size === 0) return overlays;
  return overlays.filter((overlay) => {
    return !overlay.group || !hidden_set.has(overlay.group);
  });
}
