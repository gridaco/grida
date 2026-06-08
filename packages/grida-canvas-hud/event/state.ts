import cmath from "@grida/cmath";
import type { PaddingHover } from "../classes/padding/input";
import { projectPaddingValue } from "../classes/padding/surface";
import type {
  TransformBoxHover,
  TransformBoxInput,
} from "../classes/transform-box/input";
import { docDeltaToBoxLocal } from "../classes/transform-box/surface";
import {
  decompose as decomposeTransformBox,
  reduceTransformBox,
} from "../primitives/transform-box";
import {
  type SurfaceEvent,
  type SurfaceResponse,
  type Modifiers,
  type Vector2,
  type PointerButton,
  NO_MODS,
  emptyResponse,
} from "./event";
import {
  type SurfaceGesture,
  type NodeId,
  IDLE,
  rectFromPoints,
  applyResize,
} from "./gesture";
import { type SelectionShape, type SelectionGroup, shapeBounds } from "./shape";
import { type CursorIcon, cursorEquals } from "./cursor";
import type { Intent, IntentHandler, IntentPhase } from "./intent";
import type { TapHandler } from "./tap";
import { ClickTracker } from "./click-tracker";
import { HitRegions } from "./hit-regions";
import {
  decidePointerDown,
  decideIdleCursor,
  type DeferredIntent,
  type PendingPromote,
} from "./decision";
import {
  type Transform,
  IDENTITY,
  screenToDoc,
  docToScreen,
} from "./transform";

/**
 * Pending pointer-down state, stored between pointer-down and the next
 * pointer-move or pointer-up.
 *
 * Mirrors the Rust overlay's `PendingPointerDown`:
 * - **Already-selected node** → selection change is deferred. Drag preserves
 *   the multi-selection for translate; click (release without drag) applies
 *   the deferred selection.
 * - **Newly-selected node** → selection was applied immediately. The anchor
 *   is stored so a subsequent drag starts a Translate gesture.
 */
interface PendingPointerDown {
  anchor_doc: Vector2;
  anchor_screen: Vector2;
  deferred?: DeferredIntent;
  /** Selection at the time of pointer-down (for translate ids if dragged). */
  ids_at_down: NodeId[];
  /** Optional promote-on-drag override (e.g. segment-strip → bend gesture). */
  promote_to?: PendingPromote;
}

/**
 * Down-point snapshot for an in-flight tap. Captured at pointer-down for
 * primary / secondary; consumed at pointer-up iff the pointer never crossed
 * the drag threshold. Distinct from `PendingPointerDown` because a tap is
 * button-agnostic and selection-independent — the secondary button records
 * a candidate without ever opening a `pending`.
 */
interface TapCandidate {
  /** DOWN point in document-space — the point the tap resolves against. */
  anchor_doc: Vector2;
  /** Which button pressed. Middle never reaches here. */
  button: Exclude<PointerButton, "middle">;
  /** Topmost host pick at the down point, captured at press time. */
  hit: NodeId | null;
  /** Modifier snapshot at press time. */
  mods: Modifiers;
}

/**
 * Provider callbacks the host wires into the surface at construction.
 *
 * Two verbs, deliberately distinct:
 *
 * - **`pick`** — content pick. Given a doc-space point, return the topmost
 *   node id under the pointer, or `null`. Host wraps its scene query
 *   (`elementFromPoint` + `data-id` for DOM hosts, R-tree for cg, etc.).
 * - **`shapeOf`** — selection shape. Given a node id, return its
 *   `SelectionShape` in doc-space — typically `{ kind: "rect", rect }`,
 *   but `{ kind: "line", p1, p2 }` for vector lines.
 *
 * These are the only callbacks the event/ layer needs to reason about the
 * scene. Selection, cursor, intent emission are surface-internal or
 * host-pushed via `setSelection` / `setTransform`.
 */
export interface StateDeps {
  pick: (point_doc: Vector2) => NodeId | null;
  shapeOf: (id: NodeId) => SelectionShape | null;
  emitIntent: IntentHandler;
  /**
   * Optional observe-only tap sink. Called once per discrete tap (press +
   * release within the drag threshold) for primary and secondary buttons.
   * Distinct from `emitIntent` — a tap is a fact to observe, not a change
   * to commit. Omitted by hosts that don't run a tap-driven tool.
   */
  emitTap?: TapHandler;
}

/**
 * Vector edit sub-selection — what vertices / segments / tangents of a path
 * are selected during content-edit. Host pushes this via
 * `Surface.setVectorSelection(...)` whenever its authoritative state changes;
 * the chrome reads it each frame.
 */
export interface VectorSubSelection {
  /** Path node id under content-edit. */
  node_id: NodeId;
  vertices: readonly number[];
  segments: readonly number[];
  /** `[vertex_idx, 0]` for ta on segment whose a === vertex_idx;
   *  `[vertex_idx, 1]` for tb where b === vertex_idx. */
  tangents: readonly (readonly [number, 0 | 1])[];
  /**
   * Selected region indices (= closed-loop ids in
   * `VectorOverlay.regions`). Optional for backward compat — hosts that
   * don't enumerate regions (or don't push a region mirror) leave it
   * undefined; the chrome treats `undefined` and `[]` identically.
   *
   * Drives the region's `selected` visual state. The chrome reads it
   * each frame.
   */
  regions?: readonly number[];
}

/**
 * Which vector chrome control (if any) is currently under the pointer.
 * Derived from `hit_regions.hitTest(...)` on every idle pointer_move; the
 * vector chrome reads it to render hover affordances (segment highlight,
 * vertex/tangent stroke variant).
 *
 * Owned by the HUD — mirrors the "HUD owns hover, host owns selection"
 * boundary in the README.
 */
export type VectorHover =
  | { kind: "vertex"; node_id: NodeId; index: number }
  | { kind: "tangent"; node_id: NodeId; tangent: readonly [number, 0 | 1] }
  /**
   * Cursor is over the segment body, OFF the ghost insertion knob. Drives
   * the segment's hovered outline + emits the ghost in DEFAULT (idle)
   * render state at evaluate(t) so the user can see "the insertion point
   * lives HERE; reach for it."
   */
  | { kind: "segment"; node_id: NodeId; segment: number; t: number }
  /**
   * Cursor is over the ghost insertion knob itself (a higher-priority hit
   * region that sits on top of the segment-strip — see chrome). Drives
   * the ghost render in HOVER state and gates the split-on-click: only
   * this hover variant deferred-clicks to `split_segment`.
   */
  | { kind: "ghost"; node_id: NodeId; segment: number; t: number }
  /**
   * Cursor is inside a closed-loop "region" (a body hit, not a control
   * knob). Drives the region's hover paint (diagonal stripes). Loses
   * priority to vertex / tangent / ghost / segment-strip controls
   * within the same loop's bbox — those win on overlap so the user can
   * always reach a specific control without the region claiming the
   * pixel.
   */
  | { kind: "region"; node_id: NodeId; region: number };

const DRAG_THRESHOLD_PX = 3;

/**
 * Pure-logic surface state machine.
 *
 * Owns gesture, hover, modifiers, cursor, click-tracker, hit-regions, and
 * the current selection **mirror** pushed by the host. Does not own the
 * authoritative selection — emits `select` intents the host commits.
 *
 * No canvas knowledge. No DOM knowledge. No React.
 */
export class SurfaceState {
  // Public read-only state
  gesture: SurfaceGesture = IDLE;
  /**
   * Hover from pointer pick — what scene-content is under the cursor.
   * Updated on every `pointer_move` in idle gesture state. Public for
   * legacy reads; new consumers should prefer `getEffectiveHover()`,
   * which merges this with any host-set override.
   */
  hover: NodeId | null = null;
  /**
   * Host-set hover override. When non-null, this wins over `hover` for
   * the effective hover (which is what chrome renders and what
   * `Surface.hover()` returns). Lets hosts drive hover from outside the
   * canvas — e.g. a layers panel highlighting a node on row mouseenter.
   */
  hover_override: NodeId | null = null;
  cursor: CursorIcon = "default";
  modifiers: Modifiers = { ...NO_MODS };
  readonly: boolean = false;

  // Internal
  private groups: SelectionGroup[] = [];
  private selection_ids: NodeId[] = [];
  private transform: Transform = IDENTITY;
  private hit_regions = new HitRegions();
  private click_tracker = new ClickTracker();
  private pending: PendingPointerDown | null = null;
  /**
   * Live tap candidate, captured at pointer-down for primary / secondary
   * buttons (never middle). Holds the DOWN-point data the tap will report
   * if the pointer releases without crossing the drag threshold. Cleared
   * the moment the press promotes to a drag/gesture — so a drag emits no
   * tap. Independent of `pending` (which exists only for the primary
   * selection flow); the secondary button has no `pending` but still taps.
   */
  private tap_candidate: TapCandidate | null = null;
  /**
   * Vector-edit selection mirror. Set by the host via `setVectorSelection`
   * when entering content-edit on a path. Non-null = surface should render
   * vertex chrome for the named node; null = no vector-edit visualization.
   *
   * Like `selection_ids`, this is a read-only mirror — the host owns the
   * authoritative state. The HUD reads it to decide which vertices to
   * highlight in chrome rendering.
   */
  private vector_selection: VectorSubSelection | null = null;
  /**
   * Which vector control is currently under the pointer (or null). Updated
   * on every idle `pointer_move` from the hit_regions registry. The chrome
   * reads this each frame to render hover affordances. Owned by the HUD.
   */
  private vector_hover: VectorHover | null = null;
  /**
   * Which padding-overlay control is currently under the pointer (or
   * null). Updated on every idle `pointer_move` from the hit_regions
   * registry. The padding chrome reads this each frame to render hover
   * affordances (per-side stripe paint, alt-held mirror paint on the
   * opposite side). Owned by the HUD — mirrors the vector_hover pattern.
   */
  private padding_hover: PaddingHover | null = null;
  /**
   * Which transform-box control is currently under the pointer (or
   * null). Updated on every idle `pointer_move` from the hit_regions
   * registry. The chrome reads this each frame; cursor mapping reads
   * it on idle. Owned by the HUD — mirrors padding_hover.
   */
  private transform_box_hover: TransformBoxHover | null = null;
  /**
   * Active transform-box input pushed via `setTransformBox`. The chrome
   * builder reads this and re-emits overlays on every draw; the gesture
   * intercept reads it for `size`, `rotation`, and `base_transform` at
   * pointer-down. `null` = chrome off (schema-level feature flag).
   */
  private transform_box_input: TransformBoxInput | null = null;
  /**
   * How `t` is computed for segment hovers/clicks. `"midpoint"` = always
   * 0.5 (the predictable default — ghost preview pinned to the segment's
   * midpoint regardless of cursor); `"projected"` = `cmath.bezier.project`
   * of the cursor (ghost tracks the cursor along the segment).
   */
  private vector_insertion_mode: "midpoint" | "projected" = "midpoint";
  /**
   * Which gesture an empty-space drag promotes to. `"marquee"` (default)
   * draws a rectangle; `"lasso"` draws a freeform polygon. The HUD doesn't
   * own the tool toggle — the host pushes this whenever its own tool model
   * flips. The only branch that reads it is the pending → drag promotion
   * in `pointer_move`.
   */
  private vector_selection_mode: "marquee" | "lasso" = "marquee";
  /**
   * Sticky-bend toggle for segment-body drag. `"auto"` (default) defers to
   * `modifiers.meta` (no Meta → translate, Meta → bend); `"always"` forces
   * the bend branch as if Meta were held. The host sets this when its bend
   * tool is active. Same pattern as `vector_selection_mode` — the HUD
   * doesn't own the tool toggle, just exposes the dispatch knob.
   */
  private vector_bend_mode: "auto" | "always" = "auto";

  /**
   * The effective hover: override beats pick.
   * Used by chrome rendering and by `Surface.hover()`.
   */
  getEffectiveHover(): NodeId | null {
    return this.hover_override ?? this.hover;
  }

  // ── External setters ─────────────────────────────────────────────────────

  /**
   * Push a new selection from the host. Accepts either:
   *
   * - **A flat `NodeId[]`** — each id becomes its own single-member group
   *   with shape resolved via `shapeOf(id)` at chrome build time. Hosts
   *   that don't pre-group by parent use this overload.
   * - **A `SelectionGroup[]`** — pre-computed groups (typically grouped by
   *   parent), each with its own pre-unioned shape. Hosts that already
   *   compute groups use this overload.
   *
   * The flat-ids form is resolved lazily — `shapeOf` is called by the chrome
   * builder, not here. This keeps `setSelection` cheap and lets host shape
   * changes (e.g. after a node move) be reflected without re-calling
   * `setSelection`.
   */
  setSelection(input: readonly NodeId[] | readonly SelectionGroup[]): void {
    if (input.length === 0) {
      this.groups = [];
      this.selection_ids = [];
      return;
    }
    const first = input[0];
    if (typeof first === "string") {
      // Flat ids — each becomes a 1-member group with an `unresolved` shape.
      // Chrome builder calls `shapeOf(id)` to materialize at frame time.
      const ids = input as readonly NodeId[];
      this.selection_ids = [...ids];
      this.groups = ids.map((id) => ({
        ids: [id],
        shape: { kind: "unresolved", id },
      }));
    } else {
      // Pre-computed groups.
      const groups = input as readonly SelectionGroup[];
      this.groups = groups.map((g) => ({ ids: [...g.ids], shape: g.shape }));
      const flat: NodeId[] = [];
      for (const g of groups) flat.push(...g.ids);
      this.selection_ids = flat;
    }
  }

  /** Read-only access to the flat list of selected ids (for hover logic). */
  getSelectionIds(): readonly NodeId[] {
    return this.selection_ids;
  }

  /** Read-only access to the selection groups (for chrome rendering). */
  getSelectionGroups(): readonly SelectionGroup[] {
    return this.groups;
  }

  /**
   * Push a vector-edit sub-selection from the host. Pass `null` to exit
   * vector chrome rendering (e.g. on content-edit exit). The HUD reads this
   * each frame in `buildVectorChrome` and renders vertex knobs accordingly.
   */
  setVectorSelection(input: VectorSubSelection | null): void {
    this.vector_selection = input;
  }

  /** Read-only access to the vector sub-selection (for chrome). */
  getVectorSelection(): VectorSubSelection | null {
    return this.vector_selection;
  }

  /** Read-only access to the current vector hover (for chrome). */
  getVectorHover(): VectorHover | null {
    return this.vector_hover;
  }

  /** Read-only access to the current padding hover (for chrome). */
  getPaddingHover(): PaddingHover | null {
    return this.padding_hover;
  }

  /**
   * Push a transform-box input from the host. Pass `null` to clear
   * (schema-level feature flag). Surface reads this on every draw to
   * emit chrome via `buildTransformBox`.
   */
  setTransformBox(input: TransformBoxInput | null): void {
    this.transform_box_input = input;
    // If the input is cleared mid-hover, the hover would point at a
    // now-invisible region — clear it to avoid stale cursor state.
    if (input === null && this.transform_box_hover !== null) {
      this.transform_box_hover = null;
    }
  }

  /** Read-only access to the current transform-box input (for chrome). */
  getTransformBox(): TransformBoxInput | null {
    return this.transform_box_input;
  }

  /** Read-only access to the current transform-box hover (for chrome). */
  getTransformBoxHover(): TransformBoxHover | null {
    return this.transform_box_hover;
  }

  /**
   * True when the user has committed pointer input — either a pending
   * pointer-down (drag-vs-click discriminator window) or an active
   * gesture (translate, bend, marquee, …). Idle hover otherwise.
   *
   * Chrome reads this to gate preview-only affordances — overlays that
   * exist to suggest "what the next idle-hover interaction would do."
   * They have no business competing with the user's actual intent once
   * the user has touched the surface. Currently used by the ghost
   * insertion knob; future drop-indicators, snap previews, or similar
   * hover-derived overlays should reuse the same gate.
   *
   * Naming: this is the surface's "interaction phase" — `false` = idle,
   * `true` = active.
   */
  isInteracting(): boolean {
    return this.gesture.kind !== "idle" || this.pending !== null;
  }

  setVectorInsertionMode(mode: "midpoint" | "projected"): void {
    this.vector_insertion_mode = mode;
  }

  getVectorInsertionMode(): "midpoint" | "projected" {
    return this.vector_insertion_mode;
  }

  /**
   * Set the empty-space-drag selection gesture. Host calls this on tool
   * swap (e.g. Q toggles between cursor and lasso tools). Affects only
   * the next pending → drag promotion; the current gesture (if any)
   * keeps running.
   */
  setVectorSelectionMode(mode: "marquee" | "lasso"): void {
    this.vector_selection_mode = mode;
  }

  getVectorSelectionMode(): "marquee" | "lasso" {
    return this.vector_selection_mode;
  }

  /**
   * Set the sticky-bend toggle. `"always"` forces segment-drag to bend
   * regardless of Meta — the host's bend tool calls this. `"auto"` (default)
   * falls back to `modifiers.meta`. Affects only the NEXT segment-drag
   * promotion; in-flight gestures keep their committed mode.
   */
  setVectorBendMode(mode: "auto" | "always"): void {
    this.vector_bend_mode = mode;
  }

  getVectorBendMode(): "auto" | "always" {
    return this.vector_bend_mode;
  }

  setTransform(t: Transform): void {
    this.transform = t;
  }

  getTransform(): Transform {
    return this.transform;
  }

  setReadonly(v: boolean): void {
    this.readonly = v;
  }

  hitRegions(): HitRegions {
    return this.hit_regions;
  }

  // ── Dispatch ─────────────────────────────────────────────────────────────

  dispatch(event: SurfaceEvent, deps: StateDeps): SurfaceResponse {
    switch (event.kind) {
      case "pointer_move":
        return this.onPointerMove(event.x, event.y, event.mods, deps);
      case "pointer_down":
        this.modifiers = event.mods;
        return this.onPointerDown(event.x, event.y, event.button, deps);
      case "pointer_up":
        this.modifiers = event.mods;
        return this.onPointerUp(event.x, event.y, event.button, deps);
      case "modifiers":
        this.modifiers = event.mods;
        return emptyResponse();
      case "wheel":
      case "key":
        return emptyResponse();
      case "blur":
        return this.onBlur(deps);
    }
  }

  // ── Pointer move ─────────────────────────────────────────────────────────

  private onPointerMove(
    sx: number,
    sy: number,
    mods: Modifiers,
    deps: StateDeps
  ): SurfaceResponse {
    this.modifiers = mods;
    const response = emptyResponse();
    const point_doc = screenToDoc(this.transform, sx, sy);

    // 1. Pending pointer-down → translate / marquee / promote-override
    //    promotion when threshold crossed
    if (this.pending && this.gesture.kind === "idle") {
      const ax = this.pending.anchor_screen[0];
      const ay = this.pending.anchor_screen[1];
      const dx = sx - ax;
      const dy = sy - ay;
      if (dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
        const promote = this.pending.promote_to;
        // Cancel deferred selection — drag preserves multi-selection.
        this.pending.deferred = undefined;
        // The press became a drag — it is no longer a tap. Drop the
        // candidate so pointer-up emits no tap.
        this.tap_candidate = null;
        if (promote) {
          // Explicit promote (e.g. segment-strip → bend_segment or
          // translate_vector_selection per drag mode).
          switch (promote.kind) {
            case "bend_segment":
              this.gesture = {
                kind: "bend_segment",
                node_id: promote.node_id,
                segment: promote.segment,
                ca: promote.ca,
                anchor_doc: this.pending.anchor_doc,
                last_doc: point_doc,
              };
              break;
            case "translate_vector_selection":
              this.gesture = {
                kind: "translate_vector_selection",
                node_id: promote.node_id,
                additional_vertex_indices: promote.additional_vertex_indices,
                anchor_doc: this.pending.anchor_doc,
                last_doc: point_doc,
              };
              break;
            case "translate_tangent_singleton":
              // Tangent ∈ sub-selection AND sub-selection is exactly
              // this one tangent → drag with the existing absolute
              // tangent gesture (curve / set_tangent semantics). The
              // multi-tangent / mixed-axis path branched into
              // translate_vector_selection above; this is the
              // strict-singleton fallback that preserves mirror
              // semantics. No select intent fires — the deferred
              // select was cancelled at threshold.
              this.gesture = {
                kind: "translate_tangent",
                node_id: promote.node_id,
                tangent: promote.tangent,
                anchor_doc: [promote.pos[0], promote.pos[1]],
                last_doc: point_doc,
                down_doc: this.pending.anchor_doc,
              };
              break;
          }
        } else {
          const ids = this.pending.ids_at_down;
          if (ids.length > 0) {
            this.gesture = {
              kind: "translate",
              ids,
              anchor_doc: this.pending.anchor_doc,
              last_doc: point_doc,
            };
            this.setCursor("move", response);
          } else if (this.vector_selection_mode === "lasso") {
            // Host has the lasso tool active — empty-space drag draws a
            // freeform polygon. First two samples: the anchor and the
            // current pointer (so the first preview already has 2 points,
            // enough for `cmath.polygon.pointInPolygon` to be meaningful).
            this.gesture = {
              kind: "lasso",
              anchor_doc: this.pending.anchor_doc,
              points: [this.pending.anchor_doc, point_doc],
            };
          } else {
            this.gesture = {
              kind: "marquee",
              anchor_doc: this.pending.anchor_doc,
              // Seed with the anchor so the same-dispatch fall-through into
              // `case "marquee"` sees a non-trivial delta against the move
              // point and emits the first preview. The dedupe in that case
              // compares against `current_doc` in rounded screen-px.
              current_doc: this.pending.anchor_doc,
            };
          }
        }
        // Promoted gesture is picked up by the switch below — same dispatch
        // emits the first preview intent.
      }
    }

    switch (this.gesture.kind) {
      case "idle": {
        // Hover ALWAYS reflects scene content — HUD UI does not block hover.
        const hit = deps.pick(point_doc);
        this.setHover(hit, response);

        // Cursor is an INTENT signal — defers to `decideIdleCursor` so it
        // stays in lockstep with `decidePointerDown`. Both read the same
        // inputs; they can't drift.
        const ui_action = this.hit_regions.hitTest([sx, sy]);
        this.setCursor(
          decideIdleCursor({
            ui_action,
            hovered_id: hit,
            selection_ids: this.selection_ids,
          }),
          response
        );

        // Vector hover — derive from the current ui_action when it's a
        // vector control. Chrome reads `vector_hover` to render hover
        // affordances (segment highlight, vertex/tangent stroke variant,
        // ghost insertion point preview).
        //
        // For segments, `t` is resolved per `vector_insertion_mode`:
        // `"midpoint"` pins to 0.5; `"projected"` runs
        // `cmath.bezier.project` against the cursor. Both modes share
        // every other code path — only the `t` differs.
        const next_vh = vectorHoverFromAction(
          ui_action,
          point_doc,
          this.vector_insertion_mode
        );
        // Padding hover — derived from the SAME ui_action under a
        // separate identity space (vector_hover and padding_hover never
        // co-exist; vector chrome only shows during content-edit, padding
        // only on flex parents in non-content-edit). Reads `alt` to
        // populate `mirror_side` when over a region body.
        const next_ph = paddingHoverFromAction(ui_action, this.modifiers.alt);
        if (!paddingHoversEqual(this.padding_hover, next_ph)) {
          this.padding_hover = next_ph;
          response.needsRedraw = true;
        }
        // Transform-box hover — same shape (separate identity space,
        // separate cursor mapping). HUD-owned; redraw on change.
        const next_th = transformBoxHoverFromAction(ui_action);
        if (!transformBoxHoversEqual(this.transform_box_hover, next_th)) {
          this.transform_box_hover = next_th;
          response.needsRedraw = true;
        }
        if (!vectorHoversEqual(this.vector_hover, next_vh)) {
          this.vector_hover = next_vh;
          response.needsRedraw = true;
        } else if (
          next_vh &&
          (next_vh.kind === "segment" || next_vh.kind === "ghost") &&
          this.vector_hover &&
          this.vector_hover.kind === next_vh.kind
        ) {
          // Same hover identity, different live `t` → redraw so the ghost
          // tracks the cursor in projected mode (and so the underlying
          // chrome rebuild updates the ghost hit region's screen anchor).
          const prev_t = this.vector_hover.t;
          if (Math.abs(prev_t - next_vh.t) > 1e-6) {
            this.vector_hover = next_vh;
            response.needsRedraw = true;
          }
        }
        return response;
      }
      case "translate": {
        const g = this.gesture;
        const dx = point_doc[0] - g.anchor_doc[0];
        const dy = point_doc[1] - g.anchor_doc[1];
        this.gesture = { ...g, last_doc: point_doc };
        deps.emitIntent({
          kind: "translate",
          ids: g.ids,
          dx,
          dy,
          phase: "preview",
        });
        response.needsRedraw = true;
        return response;
      }
      case "marquee": {
        const g = this.gesture;
        // Dedupe in rounded screen-px so an idle cursor — or sub-pixel
        // jitter — doesn't re-emit the same preview rect and force the
        // host through a full O(nodes) hit-test on every move.
        const [last_sx, last_sy] = docToScreen(
          this.transform,
          g.current_doc[0],
          g.current_doc[1]
        );
        const [new_sx, new_sy] = docToScreen(
          this.transform,
          point_doc[0],
          point_doc[1]
        );
        if (
          Math.round(new_sx) === Math.round(last_sx) &&
          Math.round(new_sy) === Math.round(last_sy)
        ) {
          return response;
        }
        this.gesture = { ...g, current_doc: point_doc };
        // Emit a preview-phase `marquee_select` every move so hosts can run
        // their hit-test live. Mirrors `resize` / `translate` / `bend_segment`
        // — every drag gesture publishes its current value each frame, and the
        // host decides whether to act on previews. For vector content-edit
        // the math is cheap (geometry already resolved); the host's
        // `handle_marquee_vectors` branch consumes the preview directly.
        // Regular scene hosts can ignore preview phases if the scene query
        // is too expensive (early-return on `phase !== "commit"`).
        deps.emitIntent({
          kind: "marquee_select",
          rect: rectFromPoints(g.anchor_doc, point_doc),
          additive: this.modifiers.shift,
          phase: "preview",
        });
        response.needsRedraw = true;
        return response;
      }
      case "lasso": {
        const g = this.gesture;
        // Dedupe in rounded screen-px so the threshold stays visually
        // constant across zoom levels and floating-point drift can't
        // defeat it.
        const last = g.points[g.points.length - 1];
        const [last_sx, last_sy] = docToScreen(
          this.transform,
          last[0],
          last[1]
        );
        const [new_sx, new_sy] = docToScreen(
          this.transform,
          point_doc[0],
          point_doc[1]
        );
        let points = g.points;
        if (
          Math.round(new_sx) !== Math.round(last_sx) ||
          Math.round(new_sy) !== Math.round(last_sy)
        ) {
          points = [...g.points, point_doc];
          this.gesture = { ...g, points };
        }
        // `points` is either the gesture's stable reference (dedupe hit)
        // or a fresh spread (new sample). Either way the host can stash
        // it safely; we never mutate in place.
        deps.emitIntent({
          kind: "lasso_select",
          polygon: points,
          additive: this.modifiers.shift,
          phase: "preview",
        });
        response.needsRedraw = true;
        return response;
      }
      case "resize": {
        const g = this.gesture;
        const dx = point_doc[0] - g.anchor_doc[0];
        const dy = point_doc[1] - g.anchor_doc[1];
        const next_shape = applyResize(g.initial_shape, g.direction, dx, dy);
        this.gesture = { ...g, current_shape: next_shape };
        deps.emitIntent({
          kind: "resize",
          ids: g.ids,
          anchor: g.direction,
          // AABB stays on the intent as the legacy axis-aligned target
          // (hosts that ignore `shape` keep working unchanged); `shape`
          // carries the full local-frame + matrix truth for rotated
          // selections.
          rect: shapeBounds(next_shape),
          shape: next_shape,
          phase: "preview",
        });
        response.needsRedraw = true;
        return response;
      }
      case "rotate": {
        const g = this.gesture;
        const angle = Math.atan2(
          point_doc[1] - g.center_doc[1],
          point_doc[0] - g.center_doc[0]
        );
        this.gesture = { ...g, current_angle: angle };
        const delta = angle - g.anchor_angle;
        deps.emitIntent({
          kind: "rotate",
          ids: g.ids,
          angle: delta,
          phase: "preview",
        });
        // Cursor MUST track the rotation visually during the gesture.
        // Without this re-emit, the cursor was set once at `start_rotate`
        // and stayed pointing at the corner's static orientation while
        // the element rotated under it. `cursorEquals` buckets
        // `baseAngle` to 0.5° so this only fires on real motion.
        //
        // `initial_cursor_angle` captures the selection's screen-space
        // rotation at gesture start (non-zero for `transformed` shapes);
        // compose with the gesture delta so the cursor stays correctly
        // oriented through the whole rotate, not just the delta.
        this.setCursor(
          {
            kind: "rotate",
            corner: g.corner,
            baseAngle: g.initial_cursor_angle + delta,
          },
          response
        );
        response.needsRedraw = true;
        return response;
      }
      case "endpoint": {
        const g = this.gesture;
        this.gesture = { ...g, pos_doc: point_doc };
        deps.emitIntent({
          kind: "set_endpoint",
          id: g.id,
          endpoint: g.endpoint,
          pos: point_doc,
          phase: "preview",
        });
        response.needsRedraw = true;
        return response;
      }
      case "translate_vertex": {
        let g = this.gesture;
        // Lazy index resolution. `indices = []` is the sentinel used by
        // `start_split_and_translate`: the host may push the new vertex
        // into the selection mirror EITHER synchronously inside
        // `emitIntent(split_segment)` OR in a follow-up tick (microtask /
        // requestAnimationFrame / React commit). By the time the first
        // pointer_move arrives, the mirror has settled — read it then
        // and lock the indices in. After this resolution, the gesture
        // behaves identically to a regular vertex_handle press.
        if (g.indices.length === 0) {
          const sel = this.vector_selection;
          if (sel && sel.vertices.length > 0) {
            g = { ...g, indices: [...sel.vertices] };
            this.gesture = g;
          } else {
            // Mirror still empty — nothing to translate. Skip emit
            // (the gesture stays open; if the mirror arrives later
            // we'll pick it up on the next pointer_move).
            this.gesture = { ...g, last_doc: point_doc };
            response.needsRedraw = true;
            return response;
          }
        }
        const dx = point_doc[0] - g.anchor_doc[0];
        const dy = point_doc[1] - g.anchor_doc[1];
        this.gesture = { ...g, last_doc: point_doc };
        deps.emitIntent({
          kind: "translate_vertices",
          node_id: g.node_id,
          indices: g.indices,
          dx,
          dy,
          phase: "preview",
        });
        response.needsRedraw = true;
        return response;
      }
      case "translate_vector_selection": {
        const g = this.gesture;
        const dx = point_doc[0] - g.anchor_doc[0];
        const dy = point_doc[1] - g.anchor_doc[1];
        this.gesture = { ...g, last_doc: point_doc };
        // Host UNIONs `additional_vertex_indices` with its authoritative
        // sub-selection (expanded to vertex indices) and translates the
        // union. The HUD doesn't know the segment→vertex mapping; the
        // host's path session does.
        deps.emitIntent({
          kind: "translate_vector_selection",
          node_id: g.node_id,
          additional_vertex_indices: g.additional_vertex_indices,
          dx,
          dy,
          phase: "preview",
        });
        response.needsRedraw = true;
        return response;
      }
      case "translate_tangent": {
        const g = this.gesture;
        this.gesture = { ...g, last_doc: point_doc };
        // `anchor_doc` is the tangent control point at gesture start (per
        // chrome's `pos`); pointer-doc tracks the cursor. Their values are
        // already 1:1 because the user grabbed the knob — the new control
        // point IS where the cursor is. Emit absolute pos so the host
        // applies it directly via `PathModel.setTangent`.
        deps.emitIntent({
          kind: "set_tangent",
          node_id: g.node_id,
          tangent: g.tangent,
          pos: point_doc,
          mirror: "auto",
          phase: "preview",
        });
        response.needsRedraw = true;
        return response;
      }
      case "bend_segment": {
        const g = this.gesture;
        this.gesture = { ...g, last_doc: point_doc };
        deps.emitIntent({
          kind: "bend_segment",
          node_id: g.node_id,
          segment: g.segment,
          ca: g.ca,
          cb: point_doc,
          phase: "preview",
        });
        response.needsRedraw = true;
        return response;
      }
      case "corner_radius": {
        let g = this.gesture;
        // Multi-candidate resolution. While `g.anchor` is `null` on a
        // RECT gesture (it was opened from a coincidence group with
        // 2+ candidates), wait for the cursor to cross the drag
        // threshold, then resolve the corner by direction — picking
        // among `g.candidates` only. The single-candidate case
        // never enters this branch (`anchor` is set at pointer_down).
        // Line geometry also keeps `anchor === null` permanently;
        // resolution is a rect-only concern.
        if (
          g.geometry === "rect" &&
          g.anchor === null &&
          g.candidates.length > 1
        ) {
          // Threshold gate stays in SCREEN pixels — the user's
          // physical pointer movement governs "did the drag begin",
          // not how far the artwork has moved in world units.
          const dx_screen = sx - g.anchor_screen[0];
          const dy_screen = sy - g.anchor_screen[1];
          if (
            dx_screen * dx_screen + dy_screen * dy_screen <
            DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX
          ) {
            // Pre-threshold: don't emit; the handle stays painted
            // at its coincidence position (the dedup-paint slot in
            // `drawCornerRadius`).
            this.gesture = { ...g, last_doc: point_doc };
            response.needsRedraw = true;
            return response;
          }
          // Direction resolution runs in DOC space so it stays
          // correct under camera rotation AND node rotation. The
          // candidate sign vectors are local-axis (nw/ne/se/sw); the
          // resolver rotates them through `g.transform.linear` to
          // doc-space before comparing against the doc-space drag
          // delta.
          const dx_doc = point_doc[0] - g.anchor_doc[0];
          const dy_doc = point_doc[1] - g.anchor_doc[1];
          const resolved = resolveCornerDragAnchor(
            dx_doc,
            dy_doc,
            g.candidates,
            g.transform
          );
          g = { ...g, anchor: resolved };
          this.gesture = g;
        }
        const value = Math.max(0, projectRadiusFromGesture(g, point_doc));
        this.gesture = { ...g, last_doc: point_doc, value, dragged: true };
        deps.emitIntent(buildCornerRadiusIntent(g, value, "preview"));
        response.needsRedraw = true;
        return response;
      }
      case "parametric_handle": {
        let g = this.gesture;
        // Multi-candidate resolution: when the gesture was opened from
        // a coincident group, wait for the cursor to cross the drag
        // threshold, then pick the handle whose curve tangent is most
        // opposite the drag delta. Pre-threshold: don't emit; the
        // knob stays at its painted coincident position.
        if (g.handle_id === null && g.candidates.length > 1) {
          const dx = sx - g.anchor_screen[0];
          const dy = sy - g.anchor_screen[1];
          if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
            this.gesture = { ...g, last_doc: point_doc };
            response.needsRedraw = true;
            return response;
          }
          let best = g.candidates[0];
          let best_dot = -Infinity;
          for (const c of g.candidates) {
            const [tx, ty] = trackTangent01(c.track_doc);
            const dot = tx * -dx + ty * -dy;
            if (dot > best_dot) {
              best_dot = dot;
              best = c;
            }
          }
          g = { ...g, handle_id: best.handle_id };
          this.gesture = g;
        }
        // Project + quantize. Dispatch on track kind: continuous
        // curves use the parametric projector; point sets snap to
        // the nearest point.
        const active =
          g.candidates.find((c) => c.handle_id === g.handle_id) ??
          g.candidates[0];
        const proj =
          active.track_doc.kind === "points"
            ? cmath.ui.projectPointOnSet(active.track_doc, point_doc)
            : cmath.ui.projectPointOnCurve(active.track_doc, point_doc);
        const span = active.domain.max - active.domain.min;
        let value = active.domain.min + proj.t * span;
        if (active.domain.step && active.domain.step > 0) {
          const k = Math.round(
            (value - active.domain.min) / active.domain.step
          );
          value = active.domain.min + k * active.domain.step;
        }
        if (value < active.domain.min) value = active.domain.min;
        else if (value > active.domain.max) value = active.domain.max;
        this.gesture = { ...g, last_doc: point_doc, value, dragged: true };
        if (g.handle_id !== null) {
          deps.emitIntent({
            kind: "parametric_handle",
            node_id: g.node_id,
            handle_id: g.handle_id,
            value,
            modifiers: g.modifiers,
            phase: "preview",
          });
        }
        response.needsRedraw = true;
        return response;
      }
      case "pan": {
        this.gesture = { kind: "pan", prev_screen: [sx, sy] };
        return response;
      }
      case "padding_handle": {
        const g = this.gesture;
        const value = projectPaddingValue(g.rect, g.side, point_doc);
        this.gesture = { ...g, last_doc: point_doc, value, dragged: true };
        deps.emitIntent({
          kind: "padding_handle",
          node_id: g.node_id,
          side: g.side,
          value,
          // Read alt LIVE — modifier change mid-gesture updates mirror
          // on subsequent previews.
          mirror: this.modifiers.alt,
          phase: "preview",
        });
        response.needsRedraw = true;
        return response;
      }
      case "transform_box": {
        const g = this.gesture;
        // Compute doc-space delta from gesture start, de-rotate by
        // -rotation to get the un-rotated pixel-space delta the math
        // reducer expects, then call `reduceTransformBox` to reduce
        // from `base_transform` (NOT from the previous frame's
        // `transform` — frame-accumulation would drift on a slow
        // reducer).
        const doc_delta: cmath.Vector2 = [
          point_doc[0] - g.start_doc[0],
          point_doc[1] - g.start_doc[1],
        ];
        // Synthesize a TransformBoxInput shape for `docDeltaToBoxLocal`.
        // The de-rotation only needs `rotation`; we don't need the
        // origin/size for the delta transform.
        const box_delta = docDeltaToBoxLocal(
          {
            id: g.id,
            transform: g.base_transform,
            size: g.size,
            origin: [0, 0],
            rotation: g.rotation,
          },
          doc_delta
        );
        const action =
          g.op.type === "translate"
            ? { type: "translate" as const, delta: box_delta }
            : g.op.type === "scale_side"
              ? {
                  type: "scale-side" as const,
                  side: g.op.side,
                  delta: box_delta,
                }
              : {
                  type: "rotate" as const,
                  corner: g.op.corner,
                  delta: box_delta,
                };
        const next_transform = reduceTransformBox(g.base_transform, action, {
          size: g.size,
        });
        this.gesture = {
          ...g,
          last_doc: point_doc,
          transform: next_transform,
          dragged: true,
        };
        deps.emitIntent({
          kind: "transform_box",
          id: g.id,
          op: g.op,
          transform: next_transform,
          phase: "preview",
        });
        // Live cursor tracking — same pattern as the selection-box
        // rotate gesture (`initial_cursor_angle + delta`): compose the
        // container rotation with the inner transform's *live* rotation
        // so the cursor stays aligned to the visible box throughout the
        // drag, not just at gesture start. `cursorEquals` buckets the
        // angle so this only re-emits on real motion.
        const live_angle_rad =
          ((decomposeTransformBox(next_transform).rotation + g.rotation) *
            Math.PI) /
          180;
        if (g.op.type === "translate") {
          this.setCursor("move", response);
        } else if (g.op.type === "scale_side") {
          this.setCursor(
            {
              kind: "resize",
              direction:
                g.op.side === "top" || g.op.side === "bottom" ? "n" : "w",
              baseAngle: live_angle_rad,
            },
            response
          );
        } else {
          this.setCursor(
            {
              kind: "rotate",
              corner: g.op.corner,
              baseAngle: live_angle_rad,
            },
            response
          );
        }
        response.needsRedraw = true;
        return response;
      }
    }
    return response;
  }

  // ── Pointer down ─────────────────────────────────────────────────────────

  private onPointerDown(
    sx: number,
    sy: number,
    button: PointerButton,
    deps: StateDeps
  ): SurfaceResponse {
    const response = emptyResponse();

    const point_doc = screenToDoc(this.transform, sx, sy);
    const screen: Vector2 = [sx, sy];

    // Tap candidate — captured at down for primary AND secondary (never
    // middle, which is pan). The candidate freezes the DOWN point + pick so
    // a tap reports the press point even when the primary selection commits
    // on pointer-up (deferred path). Cleared on drag-promotion in
    // `onPointerMove`; consumed in `onPointerUp` iff no drag happened. The
    // pick used here is the SAME pick the primary flow resolves selection
    // against below — one `pick` per down, no host disagreement.
    let tap_hit: NodeId | null = null;
    if (button !== "middle") {
      tap_hit = deps.pick(point_doc);
      this.tap_candidate = {
        anchor_doc: point_doc,
        button,
        hit: tap_hit,
        mods: { ...this.modifiers },
      };
    }

    // Secondary / middle never run the selection-intent flow: secondary must
    // not mutate selection (the tap is its only outcome), middle is pan.
    if (button !== "primary") return response;

    // Gather inputs and ask the decision module what to do. ALL UX-level
    // branching lives in `event/decision.ts` — keep this handler purely
    // mechanical so the table in `docs/intent-decision-tree.md` stays the
    // single source of truth.
    const ui_action = this.hit_regions.hitTest(screen);
    // Reuse the pick already resolved for the tap candidate — primary always
    // captured one above, so this is never a second `pick` call.
    const hovered_id = tap_hit;
    const click_count = this.click_tracker.register(sx, sy);

    // Corner-radius handle intercept — its own affordance family,
    // not part of the selection-intent classifier in decision.ts.
    // The action carries everything the gesture needs (geometry,
    // anchor, corner, center); we open the gesture eagerly and
    // wait for pointer_move to emit the first preview intent.
    // Alt is latched here, not on every frame — the intent kind
    // (`corner_radius` vs `corner_radius_explicit`) is decided once
    // at gesture start so toggling alt mid-drag doesn't switch the
    // host's commit pipe between branches.
    if (ui_action && ui_action.kind === "corner_radius_handle") {
      // Readonly mode forbids mutating gestures across the board —
      // these early-return branches bypass `decidePointerDown` (which
      // enforces it for the regular intent classifier), so the gate
      // is re-applied here.
      if (this.readonly) return response;
      const explicit = this.modifiers.alt;
      // Build the gesture variant matching the action's geometry.
      // Single-candidate rect: anchor is locked at start (no
      // resolution needed). Multi-candidate rect: anchor is `null`
      // and the move handler resolves it after the drag threshold.
      // Line: anchor is permanently `null`; no resolution.
      if (ui_action.geometry === "rect") {
        const candidates = ui_action.candidates ?? [];
        const initial_anchor = candidates.length === 1 ? candidates[0] : null;
        this.gesture = {
          kind: "corner_radius",
          node_id: ui_action.node_id,
          geometry: "rect",
          rect: ui_action.rect,
          transform: ui_action.transform,
          candidates,
          anchor: initial_anchor,
          anchor_screen: [sx, sy],
          anchor_doc: [point_doc[0], point_doc[1]],
          explicit,
          last_doc: point_doc,
          // Radius at pointer_down — if the anchor is already
          // locked, project the handle's current rendered position
          // onto its (sign_x, sign_y) axis to recover the radius the
          // host configured. Otherwise we start at 0 and let the
          // first post-threshold frame compute the real value.
          value:
            initial_anchor !== null && ui_action.rect
              ? Math.max(
                  0,
                  projectRadiusOnRectAnchor(
                    ui_action.pos,
                    ui_action.rect,
                    initial_anchor,
                    ui_action.transform
                  )
                )
              : 0,
          dragged: false,
        };
      } else {
        // line geometry
        const a = ui_action.a ?? ([0, 0] as const);
        const b = ui_action.b ?? ([0, 0] as const);
        this.gesture = {
          kind: "corner_radius",
          node_id: ui_action.node_id,
          geometry: "line",
          candidates: [],
          anchor: null,
          a: [a[0], a[1]],
          b: [b[0], b[1]],
          anchor_screen: [sx, sy],
          anchor_doc: [point_doc[0], point_doc[1]],
          explicit,
          last_doc: point_doc,
          value: Math.max(0, projectRadiusOnAxis(ui_action.pos, a, b)),
          dragged: false,
        };
      }
      response.needsRedraw = true;
      return response;
    }

    // Parametric handle knob intercept — the universal value-on-curve
    // affordance. Opens a `parametric_handle` gesture; the gesture
    // emits `parametric_handle` intents on every move and on commit.
    // Coincident groups (length > 1 candidates) wait for the drag
    // threshold before resolving which handle the pointer meant by
    // direction. Modifier state (alt/shift) is latched at pointer_down
    // and carried unchanged on every intent payload — host interprets.
    if (ui_action && ui_action.kind === "parametric_knob") {
      // Same readonly gate as the corner-radius intercept above.
      if (this.readonly) return response;
      const candidates = ui_action.candidates;
      const initial_handle =
        candidates.length === 1 ? candidates[0].handle_id : null;
      let initial_value = 0;
      if (initial_handle !== null) {
        const c = candidates[0];
        const seed: cmath.Vector2 = [ui_action.pos[0], ui_action.pos[1]];
        const r =
          c.track_doc.kind === "points"
            ? cmath.ui.projectPointOnSet(c.track_doc, seed)
            : cmath.ui.projectPointOnCurve(c.track_doc, seed);
        const span = c.domain.max - c.domain.min;
        initial_value = c.domain.min + r.t * span;
      }
      this.gesture = {
        kind: "parametric_handle",
        node_id: ui_action.node_id,
        candidates,
        handle_id: initial_handle,
        anchor_screen: [sx, sy],
        modifiers: {
          alt: this.modifiers.alt,
          shift: this.modifiers.shift,
        },
        last_doc: point_doc,
        value: initial_value,
        dragged: false,
      };
      response.needsRedraw = true;
      return response;
    }

    // Padding handle intercept. Opens a `padding_handle` gesture
    // eagerly at pointer_down; on drag the gesture emits
    // `padding_handle` intents per move + commit. Click-no-drag is a
    // no-op (no commit) — matches corner-radius's `dragged` guard
    // pattern.
    if (ui_action && ui_action.kind === "padding_handle") {
      if (this.readonly) return response;
      this.gesture = {
        kind: "padding_handle",
        node_id: ui_action.node_id,
        side: ui_action.side,
        rect: ui_action.rect,
        initial_value: ui_action.initial_value,
        last_doc: point_doc,
        value: ui_action.initial_value,
        dragged: false,
      };
      response.needsRedraw = true;
      return response;
    }

    // Transform-box intercept. Opens a `transform_box` gesture eagerly
    // at pointer_down for any of the 3 hit kinds (body, side, corner).
    // Click-no-drag is a no-op — matches padding-handle / corner-
    // radius. The gesture reads `transform_box_input` for `size`,
    // `rotation`, and the base
    // transform — frozen at gesture start, the chrome rebuild
    // doesn't re-derive them.
    if (
      ui_action &&
      (ui_action.kind === "transform_box_body" ||
        ui_action.kind === "transform_box_side" ||
        ui_action.kind === "transform_box_corner")
    ) {
      if (this.readonly) return response;
      const input = this.transform_box_input;
      // Defensive: if the host cleared the input between chrome build
      // and pointer-down (race), don't open a gesture against stale
      // hit data. Mirrors the corner-radius's input-presence check.
      if (input === null || input.id !== ui_action.id) return response;
      const op =
        ui_action.kind === "transform_box_body"
          ? ({ type: "translate" } as const)
          : ui_action.kind === "transform_box_side"
            ? ({ type: "scale_side", side: ui_action.side } as const)
            : ({ type: "rotate", corner: ui_action.corner } as const);
      this.gesture = {
        kind: "transform_box",
        id: input.id,
        op,
        size: input.size,
        rotation: input.rotation ?? 0,
        base_transform: input.transform,
        start_doc: point_doc,
        last_doc: point_doc,
        transform: input.transform,
        dragged: false,
      };
      response.needsRedraw = true;
      return response;
    }

    // For segment_strip hits, resolve `t` per `vector_insertion_mode` and
    // pass it to the decision module. Used by BOTH:
    //   - segment_strip → select_segment (no t needed for select)
    //   - ghost_handle  → split_segment.t (mode-dependent — "midpoint"
    //                     pins 0.5; "projected" projects the cursor)
    //   - either        → bend_segment.ca (ALWAYS projected at cursor,
    //                     mode-INDEPENDENT — bend pivot follows the cursor
    //                     regardless of insertion mode)
    //
    // The two `t`s are computed separately. Conflating them was the
    // "bend pivot pinned to 0.5 in midpoint mode" bug — insertion mode
    // governed pivot too.
    const is_segment_bearing =
      !!ui_action &&
      (ui_action.kind === "segment_strip" || ui_action.kind === "ghost_handle");
    const segment_split_t = is_segment_bearing
      ? segmentTForMode(ui_action!, point_doc, this.vector_insertion_mode)
      : undefined;
    const segment_pivot_t = is_segment_bearing
      ? segmentProjectedT(ui_action!, point_doc)
      : undefined;

    const decision = decidePointerDown({
      ui_action,
      hovered_id,
      selection_ids: this.selection_ids,
      modifiers: this.modifiers,
      click_count,
      readonly: this.readonly,
      // Content-edit visibility for the decision module — `vector_selection`
      // is the only HUD-side signal that the editor is "inside" a path's
      // sub-edit context. Drives the dblclick-away → ExitEdit rule.
      in_content_edit: this.vector_selection !== null,
      segment_split_t,
      segment_pivot_t,
      // Doctrine: "would-deselect → defer." The classifier needs axis-set
      // membership probes per sub-selection axis. We pass through the
      // mirror as-is; the classifier owns the membership predicate.
      sub_selection: this.vector_selection
        ? {
            vertices: this.vector_selection.vertices,
            segments: this.vector_selection.segments,
            tangents: this.vector_selection.tangents,
            regions: this.vector_selection.regions ?? [],
          }
        : undefined,
      // Sticky-bend override. `"always"` is the host's bend tool talking
      // — the segment branches treat it as Meta-pinned-true regardless
      // of physical key state. `"auto"` is the default; Meta acts on
      // its own.
      bend_mode: this.vector_bend_mode,
    });

    switch (decision.kind) {
      case "noop":
        return response;

      case "start_resize":
        this.gesture = {
          kind: "resize",
          ids: [...decision.ids],
          direction: decision.direction,
          initial_shape: decision.initial_shape,
          anchor_doc: point_doc,
          current_shape: decision.initial_shape,
        };
        response.needsRedraw = true;
        return response;

      case "start_rotate": {
        // Rotation pivot = center of the shape's doc-space AABB. For
        // `kind: "rect"` this is the rect center directly; for
        // `kind: "transformed"` it's the center of the AABB of the
        // 4 transformed corners — which equals the local center
        // transformed through `matrix` whenever the matrix is a pure
        // rotation (the headline case). Skew/non-uniform-scale make
        // these two centers differ; flagged in the plan as a follow-up.
        const [cx, cy] = cmath.rect.getCenter(
          shapeBounds(decision.initial_shape)
        );
        const angle = Math.atan2(point_doc[1] - cy, point_doc[0] - cx);
        // Initial cursor angle = the selection's current screen-space
        // rotation. For axis-aligned `rect` selections this is 0; for
        // `transformed` selections it's `cmath.transform.angle(matrix)`
        // in radians. Composed with the gesture delta in pointer_move so
        // the cursor stays correctly oriented through the whole rotate.
        const initial_cursor_angle =
          decision.initial_shape.kind === "transformed"
            ? (cmath.transform.angle(decision.initial_shape.matrix) * Math.PI) /
              180
            : 0;
        this.gesture = {
          kind: "rotate",
          ids: [...decision.ids],
          corner: decision.corner,
          center_doc: [cx, cy],
          anchor_angle: angle,
          current_angle: angle,
          initial_cursor_angle,
        };
        // Seed the cursor with the selection's current orientation; the
        // in-gesture `pointer_move` arm composes `initial + delta`.
        this.setCursor(
          {
            kind: "rotate",
            corner: decision.corner,
            baseAngle: initial_cursor_angle,
          },
          response
        );
        response.needsRedraw = true;
        return response;
      }

      case "start_endpoint": {
        const start = decision.endpoint === "p1" ? decision.p1 : decision.p2;
        this.gesture = {
          kind: "endpoint",
          id: decision.id,
          endpoint: decision.endpoint,
          pos_doc: [start[0], start[1]],
        };
        response.needsRedraw = true;
        return response;
      }

      case "start_translate_vertex": {
        // Emit select intent first so the host's sub-selection state mirrors
        // the click. The host receives this synchronously; subsequent gesture
        // moves emit `translate_vertices` against the singleton indices the
        // surface captured at down-time (host-side multi-vertex co-drag is a
        // future extension).
        if (decision.select) {
          deps.emitIntent({
            kind: "select_vertex",
            node_id: decision.node_id,
            index: decision.index,
            mode: decision.select.mode,
          });
        }
        this.gesture = {
          kind: "translate_vertex",
          node_id: decision.node_id,
          indices: [decision.index],
          anchor_doc: point_doc,
          last_doc: point_doc,
        };
        response.needsRedraw = true;
        return response;
      }

      case "start_translate_tangent": {
        if (decision.select) {
          deps.emitIntent({
            kind: "select_tangent",
            node_id: decision.node_id,
            tangent: decision.tangent,
            mode: decision.select.mode,
          });
        }
        // anchor_doc is the tangent control point in doc-space at down
        // time (chrome carried `pos`). Pointer-doc is captured separately
        // in `down_doc` — the cursor is within the knob's Fitts'-tolerant
        // hit area but rarely pixel-perfect on the control point.
        // Subsequent pointer_move emits `set_tangent` with the cursor's
        // current doc-space position.
        this.gesture = {
          kind: "translate_tangent",
          node_id: decision.node_id,
          tangent: decision.tangent,
          anchor_doc: [decision.pos[0], decision.pos[1]],
          last_doc: point_doc,
          down_doc: point_doc,
        };
        response.needsRedraw = true;
        return response;
      }

      case "start_split_and_translate": {
        // Press on the ghost insertion knob — eager split-and-drag.
        //
        // 1. Emit `split_segment`. The host commits the split AND
        //    pushes the new vertex into the selection mirror via
        //    `setVectorSelection({ vertices: [new_idx], … })`. That
        //    push can happen SYNCHRONOUSLY (within `emitIntent`) OR in
        //    a follow-up tick (microtask / RAF / React commit) —
        //    surface code must not assume a particular timing.
        //
        // 2. Open the translate gesture eagerly. If the mirror is
        //    already populated, capture indices now; otherwise leave
        //    indices as `[]` — the `translate_vertex` handler resolves
        //    them lazily from the mirror on the first pointer_move
        //    (by which time the host has had its async tick).
        //
        // Click-no-drag is fine: pointer_up's translate_vertex commit
        // does the same lazy resolution.
        deps.emitIntent({
          kind: "split_segment",
          node_id: decision.node_id,
          segment: decision.segment,
          t: decision.t,
        });
        const sel = this.vector_selection;
        const indices = sel ? [...sel.vertices] : [];
        this.gesture = {
          kind: "translate_vertex",
          node_id: decision.node_id,
          indices,
          anchor_doc: point_doc,
          last_doc: point_doc,
        };
        response.needsRedraw = true;
        return response;
      }

      case "enter_edit":
        deps.emitIntent({ kind: "enter_content_edit", id: decision.id });
        this.pending = null;
        return response;

      case "exit_edit":
        // Mirror enter_edit: clear any pending state and tell the host.
        // The host owns the actual mode flip + preview discard; the HUD
        // does NOT clear its own vector_selection — that must arrive via
        // a follow-up `setVectorSelection(null)` from the host, so the
        // HUD's mirror stays in lockstep with the host's authoritative
        // state.
        deps.emitIntent({ kind: "exit_content_edit" });
        this.pending = null;
        return response;

      case "immediate_select":
        deps.emitIntent({
          kind: "select",
          ids: [...decision.select_ids],
          mode: decision.mode,
        });
        response.needsRedraw = true;
        this.pending = {
          anchor_doc: point_doc,
          anchor_screen: screen,
          ids_at_down: decision.pending.ids_at_down,
          deferred: decision.pending.deferred,
          promote_to: decision.pending.promote_to,
        };
        return response;

      case "immediate_select_region":
        deps.emitIntent({
          kind: "select_region",
          node_id: decision.node_id,
          region: decision.region,
          mode: decision.mode,
        });
        response.needsRedraw = true;
        this.pending = {
          anchor_doc: point_doc,
          anchor_screen: screen,
          ids_at_down: decision.pending.ids_at_down,
          deferred: decision.pending.deferred,
          promote_to: decision.pending.promote_to,
        };
        return response;

      case "immediate_select_segment":
        // Segment select fires eagerly at pointer-down — parity with
        // vertex/tangent. Pending stays open for drag promotion
        // (translate sub-selection / bend on Meta); pointer-up with no
        // drag is a no-op since the select already landed.
        deps.emitIntent({
          kind: "select_segment",
          node_id: decision.node_id,
          segment: decision.segment,
          mode: decision.mode,
        });
        response.needsRedraw = true;
        this.pending = {
          anchor_doc: point_doc,
          anchor_screen: screen,
          ids_at_down: decision.pending.ids_at_down,
          deferred: decision.pending.deferred,
          promote_to: decision.pending.promote_to,
        };
        return response;

      case "pend":
        this.pending = {
          anchor_doc: point_doc,
          anchor_screen: screen,
          ids_at_down: decision.pending.ids_at_down,
          deferred: decision.pending.deferred,
          promote_to: decision.pending.promote_to,
        };
        // Interaction phase flipped (idle → active). Chrome reads
        // `isInteracting()` to hide preview-only affordances; without a
        // redraw here, the ghost would linger past pointer-down.
        response.needsRedraw = true;
        return response;

      case "start_marquee_pend":
        switch (decision.emit_on_down) {
          case "deselect_all":
            deps.emitIntent({ kind: "deselect_all" });
            response.needsRedraw = true;
            break;
          case "clear_vector_selection":
            deps.emitIntent({ kind: "clear_vector_selection" });
            response.needsRedraw = true;
            break;
          case "none":
            break;
        }
        this.pending = {
          anchor_doc: point_doc,
          anchor_screen: screen,
          ids_at_down: [],
        };
        // Interaction phase flipped (idle → active). See "pend" above.
        response.needsRedraw = true;
        return response;
    }
  }

  // ── Pointer up ───────────────────────────────────────────────────────────

  private onPointerUp(
    _sx: number,
    _sy: number,
    button: PointerButton,
    deps: StateDeps
  ): SurfaceResponse {
    const response = emptyResponse();

    // Tap resolution — button-agnostic, BEFORE the primary-only gate below.
    // A tap fires iff a candidate from this press survived to release (the
    // pointer never crossed the drag threshold — `onPointerMove` clears the
    // candidate on promotion) AND no gesture is active (an eager handle
    // press opened a gesture at down, which is a handle interaction, not a
    // content tap). The candidate carries the DOWN point + the down-time
    // pick, so the deferred (commit-on-up) primary path still reports the
    // press point, not this release point.
    const tap = this.tap_candidate;
    this.tap_candidate = null;
    if (tap && tap.button === button && this.gesture.kind === "idle") {
      deps.emitTap?.({
        point: tap.anchor_doc,
        button: tap.button,
        hit: tap.hit,
        mods: tap.mods,
      });
    }

    if (button !== "primary") return response;

    // Apply deferred intent on click (no drag occurred).
    if (this.pending && this.pending.deferred) {
      const d = this.pending.deferred;
      switch (d.kind) {
        case "select":
          deps.emitIntent({
            kind: "select",
            ids: [d.node_id],
            mode: d.shift ? "toggle" : "replace",
          });
          break;
        case "split_segment":
          deps.emitIntent({
            kind: "split_segment",
            node_id: d.node_id,
            segment: d.segment,
            t: d.t,
          });
          break;
        case "select_vertex":
          // Click-no-drag on ∈ vertex → narrow / toggle per shift.
          // Doctrine: drag-promote already cleared `deferred` before we got
          // here, so this only fires for true clicks.
          deps.emitIntent({
            kind: "select_vertex",
            node_id: d.node_id,
            index: d.index,
            mode: d.shift ? "toggle" : "replace",
          });
          break;
        case "select_tangent":
          deps.emitIntent({
            kind: "select_tangent",
            node_id: d.node_id,
            tangent: d.tangent,
            mode: d.shift ? "toggle" : "replace",
          });
          break;
        case "select_segment":
          deps.emitIntent({
            kind: "select_segment",
            node_id: d.node_id,
            segment: d.segment,
            mode: d.shift ? "toggle" : "replace",
          });
          break;
      }
      response.needsRedraw = true;
    }
    // Interaction phase flipped (active → idle) — request a redraw so
    // chrome re-renders the now-idle state (e.g. ghost reappearing under
    // the cursor). Skipped when no pending was set (true idle pointer-up).
    if (this.pending !== null) response.needsRedraw = true;
    this.pending = null;

    // End active gesture; emit commit intents.
    switch (this.gesture.kind) {
      case "translate": {
        const g = this.gesture;
        const dx = g.last_doc[0] - g.anchor_doc[0];
        const dy = g.last_doc[1] - g.anchor_doc[1];
        deps.emitIntent({
          kind: "translate",
          ids: g.ids,
          dx,
          dy,
          phase: "commit",
        });
        this.gesture = IDLE;
        response.needsRedraw = true;
        if (cursorEquals(this.cursor, "move")) {
          this.setCursor("default", response);
        }
        break;
      }
      case "marquee": {
        const g = this.gesture;
        const rect = rectFromPoints(g.anchor_doc, g.current_doc);
        deps.emitIntent({
          kind: "marquee_select",
          rect,
          additive: this.modifiers.shift,
          phase: "commit",
        });
        this.gesture = IDLE;
        response.needsRedraw = true;
        break;
      }
      case "lasso": {
        const g = this.gesture;
        deps.emitIntent({
          kind: "lasso_select",
          polygon: g.points.slice(),
          additive: this.modifiers.shift,
          phase: "commit",
        });
        this.gesture = IDLE;
        response.needsRedraw = true;
        break;
      }
      case "resize": {
        const g = this.gesture;
        deps.emitIntent({
          kind: "resize",
          ids: g.ids,
          anchor: g.direction,
          rect: shapeBounds(g.current_shape),
          shape: g.current_shape,
          phase: "commit",
        });
        this.gesture = IDLE;
        response.needsRedraw = true;
        break;
      }
      case "rotate": {
        const g = this.gesture;
        deps.emitIntent({
          kind: "rotate",
          ids: g.ids,
          angle: g.current_angle - g.anchor_angle,
          phase: "commit",
        });
        this.gesture = IDLE;
        response.needsRedraw = true;
        break;
      }
      case "endpoint": {
        const g = this.gesture;
        deps.emitIntent({
          kind: "set_endpoint",
          id: g.id,
          endpoint: g.endpoint,
          pos: g.pos_doc,
          phase: "commit",
        });
        this.gesture = IDLE;
        response.needsRedraw = true;
        break;
      }
      case "translate_vertex": {
        let g = this.gesture;
        // Lazy resolution at commit — mirrors the pointer_move case. If
        // the user pressed-and-released the ghost without moving AND the
        // host echoed the selection late, we still want to commit a
        // zero-delta translate against the new vertex (so the host sees
        // a clean "gesture done" signal).
        if (g.indices.length === 0) {
          const sel = this.vector_selection;
          if (sel && sel.vertices.length > 0) {
            g = { ...g, indices: [...sel.vertices] };
          }
        }
        if (g.indices.length === 0) {
          // Still nothing — drop the commit silently. The split intent
          // (emitted at pointer_down) stands as the only history op.
          this.gesture = IDLE;
          response.needsRedraw = true;
          break;
        }
        const dx = g.last_doc[0] - g.anchor_doc[0];
        const dy = g.last_doc[1] - g.anchor_doc[1];
        deps.emitIntent({
          kind: "translate_vertices",
          node_id: g.node_id,
          indices: g.indices,
          dx,
          dy,
          phase: "commit",
        });
        this.gesture = IDLE;
        response.needsRedraw = true;
        break;
      }
      case "translate_vector_selection": {
        const g = this.gesture;
        const dx = g.last_doc[0] - g.anchor_doc[0];
        const dy = g.last_doc[1] - g.anchor_doc[1];
        deps.emitIntent({
          kind: "translate_vector_selection",
          node_id: g.node_id,
          additional_vertex_indices: g.additional_vertex_indices,
          dx,
          dy,
          phase: "commit",
        });
        this.gesture = IDLE;
        response.needsRedraw = true;
        break;
      }
      case "translate_tangent": {
        const g = this.gesture;
        // Click-no-drag guard: `translate_tangent` is an absolute-position
        // gesture (commit writes `last_doc` to the control point). When
        // the pointer never moved, `last_doc === down_doc` — emitting the
        // commit would snap the tangent to the cursor's down position,
        // which is generally a few px off the actual knob center
        // (Fitts'-tolerant hit area). The user intent on a no-drag press
        // is "select only", not "mutate". Skip the emit entirely.
        if (
          g.last_doc[0] === g.down_doc[0] &&
          g.last_doc[1] === g.down_doc[1]
        ) {
          this.gesture = IDLE;
          response.needsRedraw = true;
          break;
        }
        deps.emitIntent({
          kind: "set_tangent",
          node_id: g.node_id,
          tangent: g.tangent,
          pos: g.last_doc,
          mirror: "auto",
          phase: "commit",
        });
        this.gesture = IDLE;
        response.needsRedraw = true;
        break;
      }
      case "bend_segment": {
        const g = this.gesture;
        deps.emitIntent({
          kind: "bend_segment",
          node_id: g.node_id,
          segment: g.segment,
          ca: g.ca,
          cb: g.last_doc,
          phase: "commit",
        });
        this.gesture = IDLE;
        response.needsRedraw = true;
        break;
      }
      case "corner_radius": {
        const g = this.gesture;
        // Click-no-drag on a per-corner handle is a no-op (no
        // commit). For the center handle, no commit either —
        // there's no anchor to act on. The handle's rendered
        // position will return to the padded start on the next
        // frame because `value` was never persisted to the host.
        if (g.geometry === "rect" && g.anchor === null) {
          this.gesture = IDLE;
          response.needsRedraw = true;
          break;
        }
        // Skip commit on click-only (no pointer_move advanced the
        // gesture). `g.value` was seeded from the inset-padded knob
        // position at pointer_down, so committing on a pure click
        // would mutate the host's radius to that padded value.
        if (!g.dragged) {
          this.gesture = IDLE;
          response.needsRedraw = true;
          break;
        }
        deps.emitIntent(buildCornerRadiusIntent(g, g.value, "commit"));
        this.gesture = IDLE;
        response.needsRedraw = true;
        break;
      }
      case "parametric_handle": {
        const g = this.gesture;
        // Click-no-drag on a coincident group: no commit. The knob
        // returns to its painted coincident position on the next
        // frame because `value` was never persisted upstream.
        if (g.handle_id === null) {
          this.gesture = IDLE;
          response.needsRedraw = true;
          break;
        }
        // Same click-only guard as corner-radius: the seed value is
        // the inset-padded projection at pointer_down, not a real
        // host commit.
        if (!g.dragged) {
          this.gesture = IDLE;
          response.needsRedraw = true;
          break;
        }
        deps.emitIntent({
          kind: "parametric_handle",
          node_id: g.node_id,
          handle_id: g.handle_id,
          value: g.value,
          modifiers: g.modifiers,
          phase: "commit",
        });
        this.gesture = IDLE;
        response.needsRedraw = true;
        break;
      }
      case "padding_handle": {
        const g = this.gesture;
        // Click-no-drag: no commit. `value === initial_value` so a
        // commit would be a no-op for the host anyway, but emitting
        // it would still drive a history entry. Skip to keep the
        // history clean — matches corner-radius / parametric handle.
        if (!g.dragged) {
          this.gesture = IDLE;
          response.needsRedraw = true;
          break;
        }
        deps.emitIntent({
          kind: "padding_handle",
          node_id: g.node_id,
          side: g.side,
          value: g.value,
          mirror: this.modifiers.alt,
          phase: "commit",
        });
        this.gesture = IDLE;
        response.needsRedraw = true;
        break;
      }
      case "transform_box": {
        const g = this.gesture;
        // Click-no-drag: no commit. `transform === base_transform`
        // so a commit would be identity for the host. Matches the
        // padding-handle / corner-radius `dragged` guard pattern.
        if (!g.dragged) {
          this.gesture = IDLE;
          response.needsRedraw = true;
          break;
        }
        deps.emitIntent({
          kind: "transform_box",
          id: g.id,
          op: g.op,
          transform: g.transform,
          phase: "commit",
        });
        this.gesture = IDLE;
        response.needsRedraw = true;
        break;
      }
    }
    return response;
  }

  private onBlur(deps: StateDeps): SurfaceResponse {
    const response = emptyResponse();
    this.pending = null;
    // A press interrupted by blur never releases on the surface — drop the
    // candidate so no tap fires when focus returns.
    this.tap_candidate = null;
    if (this.gesture.kind !== "idle") {
      deps.emitIntent({ kind: "cancel_gesture" });
      this.gesture = IDLE;
      response.needsRedraw = true;
    }
    if (this.vector_hover !== null) {
      this.vector_hover = null;
      response.needsRedraw = true;
    }
    if (this.padding_hover !== null) {
      this.padding_hover = null;
      response.needsRedraw = true;
    }
    if (this.transform_box_hover !== null) {
      this.transform_box_hover = null;
      response.needsRedraw = true;
    }
    return response;
  }

  // ── Internal helpers ────────────────────────────────────────────────────

  private setHover(id: NodeId | null, response: SurfaceResponse): void {
    if (this.hover === id) return;
    const prev_eff = this.getEffectiveHover();
    this.hover = id;
    const next_eff = this.getEffectiveHover();
    if (prev_eff !== next_eff) {
      response.hoverChanged = true;
      response.needsRedraw = true;
    }
  }

  /**
   * Set or clear the host-driven hover override. Pass `null` to clear.
   * Returns a response indicating whether the *effective* hover changed —
   * the caller should redraw and notify subscribers if `hoverChanged`.
   */
  setHoverOverride(id: NodeId | null): SurfaceResponse {
    const response = emptyResponse();
    if (this.hover_override === id) return response;
    const prev_eff = this.getEffectiveHover();
    this.hover_override = id;
    const next_eff = this.getEffectiveHover();
    if (prev_eff !== next_eff) {
      response.hoverChanged = true;
      response.needsRedraw = true;
    }
    return response;
  }

  private setCursor(next: CursorIcon, response: SurfaceResponse): void {
    if (!cursorEquals(this.cursor, next)) {
      this.cursor = next;
      response.cursorChanged = true;
    }
  }
}

// ─── Helpers (module-private) ─────────────────────────────────────────────

import type { OverlayAction } from "./hit-regions";

/**
 * Resolve the parametric `t` for a segment-bearing action (`segment_strip`
 * OR `ghost_handle`) under a given insertion mode.
 *
 * - `"midpoint"` → always 0.5 (the segment's geometric midpoint).
 * - `"projected"` → `cmath.bezier.project(cursor)` (mirrors the main
 *   editor's `snapped_segment_p`; tracks the cursor along the curve).
 *
 * Both action kinds carry the same cubic control points, so the math is
 * identical — only the action's `kind` discriminates downstream UX.
 */
type SegmentBearingAction = Extract<
  OverlayAction,
  { kind: "segment_strip" | "ghost_handle" }
>;

function segmentTForMode(
  action: SegmentBearingAction,
  point_doc: cmath.Vector2,
  mode: "midpoint" | "projected"
): number {
  if (mode === "midpoint") return 0.5;
  return segmentProjectedT(action, point_doc);
}

/**
 * Cursor's parametric projection on the segment's cubic — **always**
 * geometry-aware, mode-independent. Used for `bend_segment.ca` so the
 * bend pivot tracks where the user actually grabbed the curve, never
 * pinned to 0.5 by the insertion-preview mode.
 */
function segmentProjectedT(
  action: SegmentBearingAction,
  point_doc: cmath.Vector2
): number {
  const a: cmath.Vector2 = [action.a[0], action.a[1]];
  const b: cmath.Vector2 = [action.b[0], action.b[1]];
  const ta_rel: cmath.Vector2 = [
    action.a_control[0] - action.a[0],
    action.a_control[1] - action.a[1],
  ];
  const tb_rel: cmath.Vector2 = [
    action.b_control[0] - action.b[0],
    action.b_control[1] - action.b[1],
  ];
  return cmath.bezier.project(a, b, ta_rel, tb_rel, point_doc);
}

function vectorHoverFromAction(
  action: OverlayAction | null,
  point_doc: cmath.Vector2,
  mode: "midpoint" | "projected"
): VectorHover | null {
  if (!action) return null;
  switch (action.kind) {
    case "vertex_handle":
      return { kind: "vertex", node_id: action.node_id, index: action.index };
    case "tangent_handle":
      return {
        kind: "tangent",
        node_id: action.node_id,
        tangent: action.tangent,
      };
    case "segment_strip":
      return {
        kind: "segment",
        node_id: action.node_id,
        segment: action.segment,
        t: segmentTForMode(action, point_doc, mode),
      };
    case "ghost_handle":
      return {
        kind: "ghost",
        node_id: action.node_id,
        segment: action.segment,
        // Recompute `t` LIVE from the cursor — the action data was registered
        // from a prior frame's chrome rebuild, so `t` on a stale registry
        // entry doesn't reflect the current cursor. Project against the
        // action's cubic geometry to stay zero-lag in projected mode.
        t: segmentTForMode(action, point_doc, mode),
      };
    case "region":
      return {
        kind: "region",
        node_id: action.node_id,
        region: action.region,
      };
    default:
      return null;
  }
}

function vectorHoversEqual(
  a: VectorHover | null,
  b: VectorHover | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.node_id !== b.node_id) return false;
  switch (a.kind) {
    case "vertex":
      return (b as Extract<VectorHover, { kind: "vertex" }>).index === a.index;
    case "tangent": {
      const bt = b as Extract<VectorHover, { kind: "tangent" }>;
      return bt.tangent[0] === a.tangent[0] && bt.tangent[1] === a.tangent[1];
    }
    case "segment":
      // `t` is intentionally NOT part of identity — the caller decides
      // separately whether the t-change warrants a redraw. Without this,
      // every cursor pixel along a segment would force a hover-identity
      // change.
      return (
        (b as Extract<VectorHover, { kind: "segment" }>).segment === a.segment
      );
    case "ghost":
      return (
        (b as Extract<VectorHover, { kind: "ghost" }>).segment === a.segment
      );
    case "region":
      return (
        (b as Extract<VectorHover, { kind: "region" }>).region === a.region
      );
  }
}

// ─── Corner-radius helpers ────────────────────────────────────────────────

/**
 * Project a doc-space point onto the `corner → center` axis and return
 * its scalar distance from `corner`. Used to derive the new radius
 * value during a drag — clamped to `>= 0` by the caller; clamped to
 * the segment length implicitly (a cursor past `center` yields a
 * value greater than the full distance, which the host clamps if it
 * cares — the HUD reports geometry, not policy).
 */
function projectRadiusOnAxis(
  point: cmath.Vector2 | readonly [number, number],
  corner: cmath.Vector2 | readonly [number, number],
  center: cmath.Vector2 | readonly [number, number]
): number {
  const dx = center[0] - corner[0];
  const dy = center[1] - corner[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return 0;
  const px = point[0] - corner[0];
  const py = point[1] - corner[1];
  const t = (px * dx + py * dy) / len2;
  // `t * len` = projected distance along the axis (in doc-px). For
  // `rect`, `len` is the corner→center distance; for `line`,
  // `len` is the a→b distance.
  const len = Math.sqrt(len2);
  return t * len;
}

/**
 * Resolve a coincidence-group drag direction to one of the supplied
 * candidates. Picks the anchor whose intercardinal direction (sign_x,
 * sign_y) best matches the NEGATED drag delta — the user pulls the
 * handle TOWARD a corner, so the delta is `-(sign_x, sign_y)`. Used
 * for both the 2-candidate oblong-max case and the 4-candidate
 * square-max case; `candidates` constrains the choice so we never
 * resolve to a corner that isn't part of the group the user grabbed.
 *
 * Coordinate frames:
 *
 * - The intercardinal sign vectors `nw=(1,1)` etc. live in the rect's
 *   LOCAL frame.
 * - `dx, dy` is the drag delta in DOC space.
 * - For a rotated rect, the host's `transform` (local → doc) rotates
 *   the sign vectors into doc space via `T.linear · sign_local` so
 *   the dot-product picks the corner the user actually dragged
 *   toward, not the corner that lines up with the world axes.
 *
 * When `transform` is undefined (axis-aligned rect) the local frame
 * coincides with the doc frame and the rotation is a no-op.
 */
function resolveCornerDragAnchor(
  dx: number,
  dy: number,
  candidates: readonly ("nw" | "ne" | "se" | "sw")[],
  transform?: cmath.Transform
): "nw" | "ne" | "se" | "sw" {
  const local_dirs: Record<"nw" | "ne" | "se" | "sw", [number, number]> = {
    nw: [1, 1],
    ne: [-1, 1],
    se: [-1, -1],
    sw: [1, -1],
  };
  // Pre-rotate the local sign vectors into doc-space once.
  // `T.linear` is the 2x2 linear part — translation drops out for
  // direction vectors.
  const [a, b, c, d] = transform
    ? [transform[0][0], transform[0][1], transform[1][0], transform[1][1]]
    : [1, 0, 0, 1];
  let best: "nw" | "ne" | "se" | "sw" = candidates[0];
  let best_dot = -Infinity;
  for (const anchor of candidates) {
    const [vx, vy] = local_dirs[anchor];
    const dx_doc = a * vx + b * vy;
    const dy_doc = c * vx + d * vy;
    const dot = dx_doc * -dx + dy_doc * -dy;
    if (dot > best_dot) {
      best_dot = dot;
      best = anchor;
    }
  }
  return best;
}

/**
 * Project a doc-space cursor onto the (sign_x, sign_y) diagonal axis
 * of a rect corner — the projection axis for the arc-center handle.
 *
 * Axis-aligned case (no transform):
 *
 *   handle_doc = corner_local + (sign_x · r, sign_y · r)
 *   r          = ((cursor - corner) · (sign_x, sign_y)) / 2
 *
 * Rotated case (transform applied):
 *
 *   handle_doc = T · (corner_local + r · sign_local)
 *              = T · corner_local + r · (T.linear · sign_local)
 *              = corner_doc + r · sign_doc
 *
 * where `sign_doc = T.linear · sign_local`. For orthonormal `T`
 * (pure rotation), |sign_doc|² = 2, and the projection formula
 * collapses to:
 *
 *   r = ((cursor - corner_doc) · sign_doc) / 2
 *
 * For non-orthonormal transforms the magnitude term would change;
 * we use `|sign_doc|²` as the divisor so the math stays correct
 * under uniform scale and degrades predictably under shear.
 */
function projectRadiusOnRectAnchor(
  point: cmath.Vector2 | readonly [number, number],
  rect: { x: number; y: number; width: number; height: number },
  anchor: "nw" | "ne" | "se" | "sw",
  transform?: cmath.Transform
): number {
  const corners: Record<"nw" | "ne" | "se" | "sw", readonly [number, number]> =
    {
      nw: [rect.x, rect.y],
      ne: [rect.x + rect.width, rect.y],
      se: [rect.x + rect.width, rect.y + rect.height],
      sw: [rect.x, rect.y + rect.height],
    };
  const signs: Record<"nw" | "ne" | "se" | "sw", readonly [-1 | 1, -1 | 1]> = {
    nw: [1, 1],
    ne: [-1, 1],
    se: [-1, -1],
    sw: [1, -1],
  };
  const [cx, cy] = corners[anchor];
  const [sx, sy] = signs[anchor];

  if (!transform) {
    return ((point[0] - cx) * sx + (point[1] - cy) * sy) / 2;
  }

  const [[a, b, tx], [c, d, ty]] = transform;
  // corner_doc = T · corner_local
  const corner_dx = a * cx + b * cy + tx;
  const corner_dy = c * cx + d * cy + ty;
  // sign_doc = T.linear · sign_local
  const dirx = a * sx + b * sy;
  const diry = c * sx + d * sy;
  const len2 = dirx * dirx + diry * diry;
  if (len2 === 0) return 0;
  return ((point[0] - corner_dx) * dirx + (point[1] - corner_dy) * diry) / len2;
}

/**
 * Pick the right projection for a corner-radius gesture frame. RECT
 * geometry projects onto the resolved anchor's (sign_x, sign_y)
 * diagonal; LINE projects onto `a → b`. Pre-resolution rect frames
 * never reach this — the move handler returns early when
 * `g.anchor === null` and the threshold hasn't been crossed.
 */
function projectRadiusFromGesture(
  g: Extract<SurfaceGesture, { kind: "corner_radius" }>,
  point: cmath.Vector2
): number {
  if (g.geometry === "line" && g.a && g.b) {
    return projectRadiusOnAxis(point, g.a, g.b);
  }
  if (g.geometry === "rect" && g.rect && g.anchor) {
    return projectRadiusOnRectAnchor(point, g.rect, g.anchor, g.transform);
  }
  return 0;
}

/**
 * Build the per-frame corner-radius intent payload from the active
 * gesture. The intent kind is decided by:
 *
 * - `geometry === "line"` → `corner_radius_uniform`
 * - `geometry === "rect"` + `explicit` → `corner_radius_explicit`
 * - `geometry === "rect"` + !`explicit` → `corner_radius`
 *
 * The gesture's `anchor` is null only on a pre-resolution center
 * drag, which the caller filters out by checking `phase === "preview"`
 * before emit. At commit time (or for any non-center variant)
 * `anchor` is always populated for `rect`.
 */
function buildCornerRadiusIntent(
  g: Extract<SurfaceGesture, { kind: "corner_radius" }>,
  value: number,
  phase: IntentPhase
): Intent {
  if (g.geometry === "line") {
    return {
      kind: "corner_radius_uniform",
      node_id: g.node_id,
      value,
      phase,
    };
  }
  // rect — `anchor` is non-null after pre-threshold resolution. The
  // preview branch can be called with `anchor = null` for a center
  // drag that hasn't crossed the threshold yet; we never reach this
  // function in that case (the move handler returns early).
  const anchor = g.anchor ?? "nw";
  return {
    kind: g.explicit ? "corner_radius_explicit" : "corner_radius",
    node_id: g.node_id,
    anchor,
    value,
    phase,
  };
}

/**
 * Unit tangent at a track's `t = 0` end, pointing toward `t = 1`.
 * Mirror of `trackTangent` in `primitives/parametric-handle.ts` —
 * kept local to keep the state machine free of producer imports.
 * Continuous curves return the geometric tangent; point sets return
 * the unit vector from the first to the second point (the "next
 * step direction"). Degenerate tracks return `[1, 0]`.
 */
function trackTangent01(
  track: cmath.ui.Curve | cmath.ui.PointSet
): cmath.Vector2 {
  if (track.kind === "segment") {
    const dx = track.b[0] - track.a[0];
    const dy = track.b[1] - track.a[1];
    const len = Math.hypot(dx, dy);
    if (len === 0) return [1, 0];
    return [dx / len, dy / len];
  }
  if (track.kind === "points") {
    if (track.points.length < 2) return [1, 0];
    const dx = track.points[1][0] - track.points[0][0];
    const dy = track.points[1][1] - track.points[0][1];
    const len = Math.hypot(dx, dy);
    if (len === 0) return [1, 0];
    return [dx / len, dy / len];
  }
  if (track.radius === 0) return [1, 0];
  const dir = track.to >= track.from ? 1 : -1;
  return [-Math.sin(track.from) * dir, Math.cos(track.from) * dir];
}

// ─── Padding-overlay hover helpers ────────────────────────────────────────

/**
 * Derive a `PaddingHover` from the current `OverlayAction` (or null).
 * Reads `alt_held` to populate `mirror_side` on region hovers — the
 * renderer paints both the hovered side and its opposite when alt is
 * down.
 */
function paddingHoverFromAction(
  action: OverlayAction | null,
  alt_held: boolean
): PaddingHover | null {
  if (!action) return null;
  switch (action.kind) {
    case "padding_region":
      return {
        kind: "padding_region",
        node_id: action.node_id,
        side: action.side,
        mirror_side: alt_held
          ? cmath.rect.getOppositeSide(action.side)
          : undefined,
      };
    case "padding_handle":
      return {
        kind: "padding_handle",
        node_id: action.node_id,
        side: action.side,
      };
    default:
      return null;
  }
}

function paddingHoversEqual(
  a: PaddingHover | null,
  b: PaddingHover | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.node_id !== b.node_id) return false;
  if (a.side !== b.side) return false;
  if (a.kind === "padding_region" && b.kind === "padding_region") {
    return a.mirror_side === b.mirror_side;
  }
  return true;
}

// ─── Transform-box hover helpers ──────────────────────────────────────────

/**
 * Derive a `TransformBoxHover` from the current `OverlayAction` (or null).
 * Transform-box hover has no modifier-sensitive variants (unlike
 * padding's `mirror_side`); the 1:1 mapping below is the entire policy.
 */
function transformBoxHoverFromAction(
  action: OverlayAction | null
): TransformBoxHover | null {
  if (!action) return null;
  switch (action.kind) {
    case "transform_box_body":
      return { kind: "transform_box_body", id: action.id };
    case "transform_box_side":
      return {
        kind: "transform_box_side",
        id: action.id,
        side: action.side,
      };
    case "transform_box_corner":
      return {
        kind: "transform_box_corner",
        id: action.id,
        corner: action.corner,
      };
    default:
      return null;
  }
}

function transformBoxHoversEqual(
  a: TransformBoxHover | null,
  b: TransformBoxHover | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.id !== b.id) return false;
  if (a.kind === "transform_box_side" && b.kind === "transform_box_side") {
    return a.side === b.side;
  }
  if (a.kind === "transform_box_corner" && b.kind === "transform_box_corner") {
    return a.corner === b.corner;
  }
  return true;
}

/** Re-exports for convenience. */
export type { Vector2 } from "./event";
