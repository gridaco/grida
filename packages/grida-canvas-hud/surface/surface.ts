import { HUDCanvas } from "../primitives/canvas";
import { filterHUDDrawByGroup } from "../primitives/draw";
import type { PixelGridConfig } from "../primitives/pixel-grid";
import type { RulerConfig } from "../primitives/ruler";
import {
  computeCornerRadiusLayout,
  cornerRadiusLayoutGroups,
  type CornerRadiusInput,
  type CornerRadiusHandleLayout,
  type CornerRadiusAnchor,
} from "../primitives/corner-radius";
import {
  computeParametricHandleLayout,
  parametricHandleLayoutGroups,
  type ParametricHandleInput,
  type ParametricHandleLayout,
} from "../primitives/parametric-handle";
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
import type { TapHandler, TapOutcome } from "../event/tap";
import type { Transform } from "../event/transform";
import type { SelectionShape, SelectionGroup } from "../event/shape";
import { type HUDStyle, DEFAULT_STYLE, mergeStyle } from "./style";
import {
  buildChrome,
  fanOverlays,
  mergeDraws,
  type SurfaceChromeGroups,
} from "./chrome";
import { buildVectorChrome, type VectorOverlay } from "../classes/vector-path";
import {
  buildPaddingOverlay,
  type PaddingOverlayInput,
} from "../classes/padding";
import {
  buildTransformBox,
  type TransformBoxInput,
} from "../classes/transform-box";
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
  /**
   * Optional observe-only tap sink. Fires once per discrete tap (press +
   * release within the drag threshold) for the primary and secondary
   * buttons — never the middle button (pan), never a drag. The outcome
   * carries the document-space DOWN point, the button, the topmost host
   * pick at that point (or `null` for empty canvas), and the modifier
   * snapshot.
   *
   * Distinct from `onIntent` by design: a tap is a fact to observe, not a
   * change to commit, and it must be able to fire WITHOUT mutating
   * selection (most importantly for the secondary button). Hosts that don't
   * run a tap-driven tool omit it and pay nothing.
   *
   * @unstable — see {@link TapOutcome}.
   */
  onTap?: TapHandler;
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
   * Optional ruler configuration. Paints a top + left ruler strip (L-shape)
   * in screen-space, behind every other HUD primitive. Same two-transform
   * contract as `pixelGrid`. Hosts can also call `surface.setRuler(...)`
   * later. The corner square is deliberately left blank.
   */
  ruler?: RulerConfig | null;
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
   *   (`cmath.bezier.project`). The ghost tracks the cursor along the
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
   * Pushed by the host alongside its own tool toggle (e.g. when the host
   * swaps cursor ↔ lasso tools) via `setVectorSelectionMode`. The HUD reads
   * it only at empty-space drag promotion; no other branch consults it.
   * Symmetric with `vectorInsertionMode`.
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
  /**
   * Current corner-radius input, or `null`. Owned here (not in
   * `SurfaceState`) because the chrome builder needs it AND the
   * pointer_down handler needs it AND the registry rebuild needs
   * it — placing it on `SurfaceState` would pull a primitive type
   * into the event-layer's dependencies, which the README's
   * dependency arrow forbids. Surface is the wired class; the
   * setter passes the input to both the canvas (for paint) and
   * the state (via hit-region overlays each frame).
   */
  private cornerRadius: readonly CornerRadiusInput[] = [];
  private parametricHandles: readonly ParametricHandleInput[] = [];
  /**
   * Padding-overlay input. `null` = no chrome drawn. Hosts push on
   * flex-parent selection; clear on deselect / mode exit. See
   * `setPaddingOverlay`.
   */
  private paddingOverlay: PaddingOverlayInput | null = null;
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
    if (options.ruler) {
      this.hudCanvas.setRuler(options.ruler);
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

  /** Configure / disable the back-most ruler chrome (top + left strips). */
  setRuler(config: RulerConfig | null): void {
    this.hudCanvas.setRuler(config);
  }

  /**
   * Configure or clear the built-in corner-radius chrome.
   *
   * Accepts a single input (one node's corner-radius chrome) OR an
   * array of inputs (multiple nodes editable at once — typical for
   * a multi-selection of rect-bearing nodes, or for demos that
   * compare axis-aligned vs rotated rects in the same viewport).
   * Pass `null` to remove everything. The chrome for each input is
   * independent: each input's handles, hit regions, and emitted
   * intents carry the input's own `node_id`. The host distinguishes
   * by `node_id` when applying the intent.
   *
   * The HUD paints handles along the corner→arc-center diagonal
   * (rect geometry) or the a→b axis (line geometry); on pointer_down
   * it owns the hit-test; on drag it emits one of `corner_radius` /
   * `corner_radius_explicit` / `corner_radius_uniform` per the
   * geometry + modifier table.
   *
   * The handle layout is recomputed every frame from the inputs —
   * camera changes and radius changes both reflect on the next
   * `draw()` without a host-side `setCornerRadius` round-trip.
   *
   * See `@grida/hud/primitives/corner-radius` for the input shape.
   */
  setCornerRadius(
    input: CornerRadiusInput | readonly CornerRadiusInput[] | null
  ): void {
    if (input === null) {
      this.cornerRadius = [];
      return;
    }
    this.cornerRadius = Array.isArray(input)
      ? (input as readonly CornerRadiusInput[])
      : [input as CornerRadiusInput];
  }

  /**
   * Push one or more parametric-handle inputs — the universal
   * "scalar value on a 1D manifold" affordance. Each input declares
   * a node_id, one or more handles (each with curve + value +
   * optional domain + optional snap-back inset), optional coincidence
   * groups, and an optional local→doc transform.
   *
   * The HUD paints handles along their curves on every `draw()`, owns
   * the hit-test for the knobs, and emits `parametric_handle` intents
   * on drag with `{ node_id, handle_id, value, modifiers, phase }`.
   * Modifier semantics (alt → explicit, etc.) are host-decided —
   * the producer reports flags only.
   *
   * Pass `null` (or `[]`) to remove all parametric chrome. Single
   * input or array; arrays let one viewport edit multiple nodes
   * simultaneously. Intents carry their input's `node_id` so the
   * host routes per-node.
   *
   * Hosts typically build inputs through use-case-specific composers
   * (e.g. the corner-radius primitive builds a 4-handle input over a
   * rect). The shape itself is generic — anything that can be
   * expressed as scalars on 1D tracks fits.
   */
  setParametricHandles(
    input: ParametricHandleInput | readonly ParametricHandleInput[] | null
  ): void {
    if (input === null) {
      this.parametricHandles = [];
      return;
    }
    this.parametricHandles = Array.isArray(input)
      ? (input as readonly ParametricHandleInput[])
      : [input as ParametricHandleInput];
  }

  /**
   * Configure or clear the built-in padding-overlay chrome — the
   * `padding` named class for flex-parent container padding editing.
   *
   * Pass an input to enable the chrome (four inset side rects with
   * diagonal-stripe hover/selected paint + four mid-edge drag handles).
   * Pass `null` to disable. Schema-level feature flag — absence is the
   * off-state, no separate boolean to drift.
   *
   * The HUD owns hover (including alt-held axis-mirror visual), reads
   * the `alt` modifier directly for the intent's `mirror` flag, and
   * emits `padding_handle` intents on drag (preview-stream + commit).
   * The host applies the value to its node's `layout_padding_{side}`
   * field and pushes a re-rendered input back via `setPaddingOverlay`
   * so the chrome reflects the new value.
   *
   * Mid-gesture state mirror: hosts SHOULD push `active_side` while a
   * `padding_handle` gesture is in flight so the dragged side paints
   * with the "selected" stripe variant (and the opposite side too,
   * when alt is held). Clear `active_side` on commit.
   *
   * See `@grida/hud/classes/padding` for the input shape and
   * paint/hit/priority details.
   */
  setPaddingOverlay(input: PaddingOverlayInput | null): void {
    this.paddingOverlay = input;
  }

  /**
   * Push a transform-box input — the `transform-box` named class for
   * a 2×3 affine transform manipulated via quad outline + 4 corners +
   * 4 sides + body. `null` = no chrome drawn (schema-level feature
   * flag).
   *
   * Hosts re-push input whenever the bound transform / size / origin
   * / rotation changes (driven by the host's reducer applying the
   * `transform_box` intent). The chrome rebuilds every draw.
   *
   * See `@grida/hud/classes/transform-box` for the input shape and
   * hit/priority/anti-goals details.
   *
   * @unstable
   */
  setTransformBox(input: TransformBoxInput | null): void {
    this.state.setTransformBox(input);
  }

  /**
   * Update just the ruler's transform. Cheap to call per camera tick.
   * No-op when no ruler config is set.
   */
  setRulerTransform(transform: Transform): void {
    this.hudCanvas.setRulerTransform(transform);
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
      emitTap: this.opts.onTap,
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

    // Padding overlay. Emitted ABOVE selection chrome (it's a content
    // control set) and BELOW resize handles via the priority ladder
    // (`PADDING_REGION_PRIORITY` loses to resize; the handle wins). The
    // HUD owns the active-drag visual: when the gesture state is
    // `padding_handle`, that side's stripe paints with the `selected`
    // token — no host-pushed `active_side` shadow.
    if (this.paddingOverlay) {
      const g = this.state.gesture;
      const active_side =
        g.kind === "padding_handle" && g.node_id === this.paddingOverlay.node_id
          ? g.side
          : undefined;
      const padding_overlays = buildPaddingOverlay({
        overlay: this.paddingOverlay,
        style: this.style,
        hover: this.state.getPaddingHover(),
        alt_held: this.state.modifiers.alt,
        transform: this.state.getTransform(),
        active_side,
      });
      for (const o of padding_overlays) overlays.push(o);
    }

    // Transform-box overlay. Same z-band as padding (only one of these
    // classes is active at a time in practice — image-fit content-edit
    // doesn't co-exist with flex-parent overlay). Hit-priority ordering
    // (corner=13, side=14, body=38) does the real arbitration, push
    // order is just visual.
    const tb_input = this.state.getTransformBox();
    if (tb_input) {
      const g = this.state.gesture;
      const active_op =
        g.kind === "transform_box" && g.id === tb_input.id ? g.op : undefined;
      const tb_overlays = buildTransformBox({
        overlay: tb_input,
        style: this.style,
        hover: this.state.getTransformBoxHover(),
        transform: this.state.getTransform(),
        active_op,
      });
      for (const o of tb_overlays) overlays.push(o);
    }

    const hidden = this.opts.visibility?.({
      gesture: this.state.gesture,
    })?.hidden;
    const { screenRects, lines, polylines } = fanOverlays(
      filterOverlaysByGroup(overlays, hidden),
      this.state.getTransform(),
      this.state.hitRegions()
    );

    // ── Corner-radius handles ────────────────────────────────────────────
    // Computed every frame so radius changes / camera moves reflect
    // without a setCornerRadius round-trip. Painted by `HUDCanvas`
    // ABOVE chrome and BELOW the ruler (see canvas.ts paint order);
    // hit regions pushed AFTER `fanOverlays` so they survive its
    // `regions.clear()`. Priority sits ABOVE corner resize knobs in
    // the ladder so the corner-radius knob always wins overlap
    // with the resize-corner zone immediately beneath it.
    if (this.cornerRadius.length > 0) {
      // One layout pass per input — concat for the painter (so a single
      // pass paints them all in z-order), but register hit regions per
      // input so each region carries its own `node_id` + `transform`.
      const all_handles: CornerRadiusHandleLayout[] = [];
      for (const input of this.cornerRadius) {
        const handles = this.buildCornerRadiusHandles(input);
        if (handles.length === 0) continue;
        for (const h of handles) all_handles.push(h);
        this.registerCornerRadiusHitRegions(input, handles);
      }
      this.hudCanvas.setCornerRadiusHandles(all_handles);
    } else {
      this.hudCanvas.setCornerRadiusHandles(null);
    }

    // ── Parametric handles ───────────────────────────────────────────────
    // The universal "scalar value on a 1D manifold" primitive. Same z-
    // band as corner-radius (knob, not frame); painter is independent.
    // Hit regions are pushed AFTER `fanOverlays` for the same reason
    // corner-radius's are — to survive the per-frame `regions.clear()`
    // inside `fanOverlays`.
    if (this.parametricHandles.length > 0) {
      const all_parametric: ParametricHandleLayout[] = [];
      for (const input of this.parametricHandles) {
        const handles = this.buildParametricHandleLayout(input);
        if (handles.length === 0) continue;
        for (const h of handles) all_parametric.push(h);
        this.registerParametricHandleHitRegions(input, handles);
      }
      this.hudCanvas.setParametricHandles(all_parametric);
    } else {
      this.hudCanvas.setParametricHandles(null);
    }
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

  // ── Corner-radius internals ────────────────────────────────────────────

  /**
   * Resolve the current corner-radius layout against `shapeOf` (for
   * the rect-fallback) and the camera. Always returns an array;
   * empty when the input is null or when the rect can't be
   * resolved.
   */
  private buildCornerRadiusHandles(
    input: CornerRadiusInput
  ): CornerRadiusHandleLayout[] {
    const fallback =
      input.geometry.kind === "rect" && !input.geometry.rect
        ? selectionRectFromShape(this.opts.shapeOf(input.node_id))
        : null;
    const zoom = this.state.getTransform()[0][0];
    // Lift the padded-floor while the user is actively dragging THIS
    // input's corner-radius handle. The gesture identifies its input
    // by `node_id` — only that input's handles paint at raw radius;
    // every other input keeps the padded floor (so handles for the
    // axis-aligned rect don't "snap" while the user drags handles
    // on the rotated one in the same canvas).
    const g = this.state.gesture;
    const during_gesture =
      g.kind === "corner_radius" && g.node_id === input.node_id;
    return computeCornerRadiusLayout(input, fallback, zoom, {
      during_gesture,
    });
  }

  /**
   * Push one hit region per handle onto the state's registry. Called
   * AFTER `fanOverlays` so the regions survive the per-frame clear.
   */
  private registerCornerRadiusHitRegions(
    input: CornerRadiusInput,
    handles: readonly CornerRadiusHandleLayout[]
  ): void {
    if (handles.length === 0) return;
    const regions = this.state.hitRegions();
    const transform = this.state.getTransform();

    // Line geometry — one region, anchor-less, projects onto a → b.
    if (input.geometry.kind === "line") {
      const h = handles[0];
      const [sx, sy] = [
        transform[0][0] * h.pos[0] + transform[0][2],
        transform[1][1] * h.pos[1] + transform[1][2],
      ];
      regions.push({
        rect: {
          x: sx - h.hit_size / 2,
          y: sy - h.hit_size / 2,
          width: h.hit_size,
          height: h.hit_size,
        },
        priority: CORNER_RADIUS_PRIORITY,
        label: h.label,
        action: {
          kind: "corner_radius_handle",
          node_id: input.node_id,
          geometry: "line",
          pos: [h.pos[0], h.pos[1]],
          a: input.geometry.a,
          b: input.geometry.b,
        },
      });
      return;
    }

    // Rect geometry — register one region per coincidence group. The
    // group's anchor list becomes the gesture's `candidates`:
    //   - length 1: single-corner knob, anchor locked at pointer_down
    //   - length 2: oblong-max pair (TL/BL share a position; TR/BR
    //     share a position), anchor resolved by direction
    //   - length 4: square-max quadruple (all four at the center),
    //     anchor resolved by direction
    // The hit rect is anchored at the GROUP's coincidence position
    // (= the first member's `pos`, all coincident by construction).
    const rect_for_anchors =
      input.geometry.rect ??
      selectionRectFromShape(this.opts.shapeOf(input.node_id));
    if (!rect_for_anchors) return;

    const groups = cornerRadiusLayoutGroups(handles);
    if (groups.length === 0) return;

    // Build an anchor → layout lookup so we can find each group's
    // doc-space position (all members share it within ε).
    const by_anchor = new Map<CornerRadiusAnchor, CornerRadiusHandleLayout>();
    for (const h of handles) {
      if (h.anchor === "line") continue;
      by_anchor.set(h.anchor as CornerRadiusAnchor, h);
    }

    for (const group of groups) {
      const lead = by_anchor.get(group[0]);
      if (!lead) continue;
      const [sx, sy] = [
        transform[0][0] * lead.pos[0] + transform[0][2],
        transform[1][1] * lead.pos[1] + transform[1][2],
      ];
      const label =
        group.length === 1
          ? `corner_radius:${group[0]}`
          : `corner_radius:${group.join("+")}`;
      regions.push({
        rect: {
          x: sx - lead.hit_size / 2,
          y: sy - lead.hit_size / 2,
          width: lead.hit_size,
          height: lead.hit_size,
        },
        priority: CORNER_RADIUS_PRIORITY,
        label,
        action: {
          kind: "corner_radius_handle",
          node_id: input.node_id,
          geometry: "rect",
          pos: [lead.pos[0], lead.pos[1]],
          rect: rect_for_anchors,
          transform: input.geometry.transform,
          candidates: group,
        },
      });
    }
  }

  /**
   * Resolve the current parametric-handle layout for one input. The
   * snap-back floor is lifted while this specific input is being
   * dragged — match by `node_id` so other inputs in the same canvas
   * keep their resting positions.
   */
  private buildParametricHandleLayout(
    input: ParametricHandleInput
  ): ParametricHandleLayout[] {
    const g = this.state.gesture;
    const during_gesture =
      g.kind === "parametric_handle" && g.node_id === input.node_id;
    return computeParametricHandleLayout(input, { during_gesture });
  }

  /**
   * Push one hit region per coincidence group onto the state's
   * registry. Coincidence is geometric — a declared group only
   * collapses when its members actually overlap in doc-space. Open
   * groups produce one region per handle.
   */
  private registerParametricHandleHitRegions(
    input: ParametricHandleInput,
    layout: readonly ParametricHandleLayout[]
  ): void {
    if (layout.length === 0) return;
    const regions = this.state.hitRegions();
    const transform = this.state.getTransform();
    const groups = parametricHandleLayoutGroups(input, layout);
    for (const group of groups) {
      const lead = group[0];
      const [sx, sy] = [
        transform[0][0] * lead.pos[0] + transform[0][2],
        transform[1][1] * lead.pos[1] + transform[1][2],
      ];
      const label =
        group.length === 1
          ? lead.label
          : `parametric:${input.node_id}:${group.map((g) => g.handle_id).join("+")}`;
      regions.push({
        rect: {
          x: sx - lead.hit_size / 2,
          y: sy - lead.hit_size / 2,
          width: lead.hit_size,
          height: lead.hit_size,
        },
        priority: CORNER_RADIUS_PRIORITY,
        label,
        action: {
          kind: "parametric_knob",
          node_id: input.node_id,
          pos: [lead.pos[0], lead.pos[1]],
          candidates: group.map((g) => ({
            handle_id: g.handle_id,
            track_doc: g.track_doc,
            domain: g.domain,
          })),
        },
      });
    }
  }
}

/**
 * Priority for corner-radius handles in the hit-test ladder.
 *
 * Sits ABOVE every selection-control zone (resize corner / edge /
 * body / rotate) so the corner-radius knob ALWAYS wins overlap with
 * the resize-corner knob beneath it — the user is reaching for the
 * inner ring, not the corner. Below `ENDPOINT_HANDLE` (10) because
 * endpoints are the sole resize affordance on lines and outrank
 * everything else by doctrine.
 *
 * Hard-coded here (not in `selection-controls.ts`) because corner-
 * radius is its own affordance family — not part of the
 * selection-control 9-slice negotiation.
 */
const CORNER_RADIUS_PRIORITY = 15;

function selectionRectFromShape(
  shape: SelectionShape | null
): { x: number; y: number; width: number; height: number } | null {
  if (!shape) return null;
  if (shape.kind === "rect") return shape.rect;
  if (shape.kind === "transformed") return shape.local;
  return null;
}

export type { SurfaceResponse, SurfaceEvent, PointerButton, Modifiers };
export type { Intent, IntentHandler };
export type { TapHandler, TapOutcome };
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
