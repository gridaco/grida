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
  type DeferredSelect,
} from "./decision";
import { type Transform, IDENTITY, screenToDoc } from "./transform";

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
  deferred?: DeferredSelect;
  /** Selection at the time of pointer-down (for translate ids if dragged). */
  ids_at_down: NodeId[];
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

    // 1. Pending pointer-down → translate / marquee promotion when threshold crossed
    if (this.pending && this.gesture.kind === "idle") {
      const ax = this.pending.anchor_screen[0];
      const ay = this.pending.anchor_screen[1];
      const dx = sx - ax;
      const dy = sy - ay;
      if (dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
        const ids = this.pending.ids_at_down;
        // Cancel deferred selection — drag preserves multi-selection.
        this.pending.deferred = undefined;
        if (ids.length > 0) {
          this.gesture = {
            kind: "translate",
            ids,
            anchor_doc: this.pending.anchor_doc,
            last_doc: point_doc,
          };
          this.setCursor("move", response);
        } else {
          this.gesture = {
            kind: "marquee",
            anchor_doc: this.pending.anchor_doc,
            current_doc: point_doc,
          };
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

    const decision = decidePointerDown({
      ui_action,
      hovered_id,
      selection_ids: this.selection_ids,
      modifiers: this.modifiers,
      click_count,
      readonly: this.readonly,
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

      case "enter_edit":
        deps.emitIntent({ kind: "enter_content_edit", id: decision.id });
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
        };
        return response;

      case "pend":
        this.pending = {
          anchor_doc: point_doc,
          anchor_screen: screen,
          ids_at_down: decision.pending.ids_at_down,
          deferred: decision.pending.deferred,
        };
        return response;

      case "start_marquee_pend":
        if (decision.emit_deselect_all) {
          deps.emitIntent({ kind: "deselect_all" });
          response.needsRedraw = true;
        }
        this.pending = {
          anchor_doc: point_doc,
          anchor_screen: screen,
          ids_at_down: [],
        };
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

    // Apply deferred selection on click (no drag occurred).
    if (this.pending && this.pending.deferred) {
      const d = this.pending.deferred;
      deps.emitIntent({
        kind: "select",
        ids: [d.node_id],
        mode: d.shift ? "toggle" : "replace",
      });
      response.needsRedraw = true;
    }
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

/** Re-exports for convenience. */
export type { Vector2 } from "./event";
