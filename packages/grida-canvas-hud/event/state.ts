import cmath from "@grida/cmath";
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
import type { IntentHandler } from "./intent";
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
  | { kind: "ghost"; node_id: NodeId; segment: number; t: number };

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
   * How `t` is computed for segment hovers/clicks. `"midpoint"` = always
   * 0.5 (the predictable default — ghost preview pinned to the segment's
   * midpoint regardless of cursor); `"projected"` = `cmath.bezier.project`
   * of the cursor (mirrors the main editor — ghost tracks the cursor).
   */
  private vector_insertion_mode: "midpoint" | "projected" = "midpoint";
  /**
   * Which gesture an empty-space drag promotes to. `"marquee"` (default)
   * draws a rectangle; `"lasso"` draws a freeform polygon. The HUD doesn't
   * own the tool toggle — the host (svg-editor) pushes this whenever its
   * own tool model flips (e.g. Q-key swap). The only branch that reads it
   * is the pending → drag promotion in `pointer_move`.
   */
  private vector_selection_mode: "marquee" | "lasso" = "marquee";
  /**
   * Sticky-bend toggle for segment-body drag. `"auto"` (default) defers to
   * `modifiers.meta` (no Meta → translate, Meta → bend); `"always"` forces
   * the bend branch as if Meta were held. The host (svg-editor) sets this
   * when its bend tool is active. Same pattern as `vector_selection_mode`
   * — the HUD doesn't own the tool toggle, just exposes the dispatch knob.
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
   *   with shape resolved via `shapeOf(id)` at chrome build time. Simple
   *   hosts (e.g. svg-editor v1) use this overload.
   * - **A `SelectionGroup[]`** — pre-computed groups (typically grouped by
   *   parent), each with its own pre-unioned shape. Hosts that already
   *   compute groups (e.g. the main editor) use this overload.
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
              current_doc: point_doc,
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
      case "pan": {
        this.gesture = { kind: "pan", prev_screen: [sx, sy] };
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
    if (button !== "primary") return response;

    const point_doc = screenToDoc(this.transform, sx, sy);
    const screen: Vector2 = [sx, sy];

    // Gather inputs and ask the decision module what to do. ALL UX-level
    // branching lives in `event/decision.ts` — keep this handler purely
    // mechanical so the table in `docs/intent-decision-tree.md` stays the
    // single source of truth.
    const ui_action = this.hit_regions.hitTest(screen);
    const hovered_id = deps.pick(point_doc);
    const click_count = this.click_tracker.register(sx, sy);

    // For segment_strip hits, resolve `t` per `vector_insertion_mode` and
    // pass it to the decision module. Used by BOTH:
    //   - segment_strip → select_segment (no t needed for select)
    //   - ghost_handle  → split_segment.t (mode-dependent — "midpoint"
    //                     pins 0.5; "projected" projects the cursor)
    //   - either        → bend_segment.ca (ALWAYS projected at cursor,
    //                     mode-INDEPENDENT — matches the main editor's
    //                     `t0Ref = cmath.bezier.project(point)` in
    //                     `surface-vector-editor.tsx:337`)
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
        // 1. Emit `split_segment`. The host (svg-editor's
        //    `handle_split_segment`) commits the split AND pushes the
        //    new vertex into the selection mirror via
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
    }
    return response;
  }

  private onBlur(deps: StateDeps): SurfaceResponse {
    const response = emptyResponse();
    this.pending = null;
    if (this.gesture.kind !== "idle") {
      deps.emitIntent({ kind: "cancel_gesture" });
      this.gesture = IDLE;
      response.needsRedraw = true;
    }
    if (this.vector_hover !== null) {
      this.vector_hover = null;
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
  }
}

/** Re-exports for convenience. */
export type { Vector2 } from "./event";
