/**
 * Selection-intent decision module — pure functions, ZERO side effects.
 *
 * Mental model:
 *
 *   The HUD is an event router over real overlay layers. The host creates
 *   overlays (resize knob, rotate region, endpoint knob, translate body,
 *   etc.); the router decides what each one does on pointer-down by overlay
 *   type, falling back to a scene-content pick when no overlay claims.
 *   Pointer events are synthesized on top of raw pointer input — no native
 *   `click`, no DOM ordering.
 *
 *   Architecture:
 *
 *     PointerDownInput  ─►  classifyScenario()  ─►  Scenario  ─►  dispatch()  ─►  PointerDownDecision
 *                           (recognizer)                          (declarative table)
 *
 *   The `Scenario` enum is a **descriptive label** for each `(overlay hit,
 *   pick result, selection, modifiers)` combination — useful for tests and
 *   readable dispatch — NOT a contract the HUD imposes on hosts. The
 *   contract is per-overlay routing semantics (e.g. resize knob always
 *   starts a gesture; translate body always defers) and the Tier-1 → Tier-2
 *   fallback when no overlay claims the point.
 *
 * Adding a new UX rule:
 *
 *   1. Add a new `Scenario` constant (or reuse one).
 *   2. Add/update the recognizer branch in {@link classifyScenario}.
 *   3. Add/update the dispatch branch in {@link decidePointerDown}.
 *   4. Add tests pinning the classification and the dispatch.
 *   5. Update the working-group doc.
 *
 * Working-group spec (implementation-agnostic):
 *   https://grida.co/docs/wg/feat-editor/ux-surface/selection-intent
 *
 * UX-narrative sibling:
 *   https://grida.co/docs/wg/feat-editor/ux-surface/selection
 */

import cmath from "@grida/cmath";
import type { Modifiers } from "./event";
import type { OverlayAction } from "./hit-regions";
import type { NodeId } from "./gesture";
import type { SelectionShape } from "./shape";
import type { CursorIcon, ResizeDirection, RotationCorner } from "./cursor";
import type { SelectMode } from "./intent";

// ════════════════════════════════════════════════════════════════════════════
// Scenarios — descriptive labels for routing combinations
// ════════════════════════════════════════════════════════════════════════════

/**
 * Each `Scenario` is a label for one `(overlay hit, pick, selection,
 * modifiers)` combination. The set is closed; `classifyScenario` is total
 * over `PointerDownInput`.
 *
 * These names are descriptive, not prescriptive. The HUD's external
 * contract is the per-overlay routing rules (handle-types commit gestures
 * immediately; the translate body always defers) and the Tier-1 → Tier-2
 * fallback when no overlay claims a point — not the closed enum below.
 * The enum exists because a flat, named switch is the most testable shape
 * for the dispatch.
 *
 * Family prefixes:
 *
 * - `Handle*` — pointer hit a typed handle overlay (resize / rotate /
 *   endpoint). Singleton; commit on down.
 * - `Content*` — no overlay claimed; pointer fell through to the scene pick.
 *   `*OrDrag` suffix marks the ambiguous cases (deferred until pointer-up
 *   or drag-threshold-crossing decides).
 * - `Body*` — pointer hit a translate-body overlay. Every Body case defers
 *   because the body's reason to exist is "the user may be about to drag
 *   the existing selection."
 * - `Empty*` — pointer hit nothing (no overlay, no scene content).
 * - `EnterEdit` — double-click variant.
 * - `ExitEdit` — double-click while already in content-edit, with no
 *   vector-control overlay claiming the press. The "dblclick away" exit.
 * - `Noop` — suppressed (readonly + handle hit, etc.).
 */
export const enum Scenario {
  // ── Singleton — commit on down ──────────────────────────────────────────
  HandleResize = "HandleResize",
  HandleRotate = "HandleRotate",
  HandleEndpoint = "HandleEndpoint",
  EnterEdit = "EnterEdit",
  /**
   * Double-click that exits content-edit mode. Fires when the surface is
   * mirroring an active vector sub-selection (`in_content_edit === true`)
   * and the dblclick lands on something OTHER than the active edit's
   * vector controls (vertex / tangent / segment-strip). UX contract: the
   * user is asking to leave the editing context.
   *
   * The host emits `{ kind: "exit_content_edit" }` and decides what
   * follow-up to run (e.g. select the under-cursor node, leave a clean
   * "select" mode, etc.). The HUD does not assume.
   */
  ExitEdit = "ExitEdit",
  ContentReplace = "ContentReplace",
  ContentAdd = "ContentAdd",

  // ── Ambiguous — defer to next event ─────────────────────────────────────
  ContentNarrowOrDrag = "ContentNarrowOrDrag",
  ContentToggleOrDrag = "ContentToggleOrDrag",
  BodyDragOnly = "BodyDragOnly",
  BodyNarrowOrDrag = "BodyNarrowOrDrag",
  BodyToggleOrDrag = "BodyToggleOrDrag",
  BodySwapOrDrag = "BodySwapOrDrag",
  /**
   * Not singleton even though shift+would-select usually is — the body
   * overlay's drag claim remains a live candidate, so defer. Eagerly
   * committing here was the multi-select-on-shift-hover bug.
   */
  BodyAddOrDrag = "BodyAddOrDrag",
  /**
   * Sub-selection control scenarios — three axes (vertex / tangent /
   * segment) × four variants (Replace / Add / NarrowOrDrag / ToggleOrDrag).
   * Mirror the Tier-2 `Content*` shape, applied per sub-selection axis.
   * The doctrine's "would-deselect → always defer" rule applies uniformly:
   *
   *   target ∉ axis-set, no shift → *Replace      (singleton, on-down)
   *   target ∉ axis-set, shift    → *Add          (singleton, on-down)
   *   target ∈ axis-set, no shift → *NarrowOrDrag (defer)
   *   target ∈ axis-set, shift    → *ToggleOrDrag (defer)
   *
   * Click-no-drag → fire `select_<axis>` with replace / toggle mode.
   * Click-drag    → cancel deferred select; promote to translate gesture
   *                 (drag preserves multi-selection).
   *
   * See `docs/wg/feat-editor/ux-surface/selection-intent.md`.
   */
  HandleVertexReplace = "HandleVertexReplace",
  HandleVertexAdd = "HandleVertexAdd",
  HandleVertexNarrowOrDrag = "HandleVertexNarrowOrDrag",
  HandleVertexToggleOrDrag = "HandleVertexToggleOrDrag",
  HandleTangentReplace = "HandleTangentReplace",
  HandleTangentAdd = "HandleTangentAdd",
  HandleTangentNarrowOrDrag = "HandleTangentNarrowOrDrag",
  HandleTangentToggleOrDrag = "HandleTangentToggleOrDrag",
  HandleSegmentReplace = "HandleSegmentReplace",
  HandleSegmentAdd = "HandleSegmentAdd",
  HandleSegmentNarrowOrDrag = "HandleSegmentNarrowOrDrag",
  HandleSegmentToggleOrDrag = "HandleSegmentToggleOrDrag",
  /**
   * Ghost-handle pointer-down — cursor is on the half-point insertion knob.
   *
   * EAGER: the press immediately splits the segment AND grabs the inserted
   * vertex for a translate gesture. Click-no-drag → vertex is just
   * inserted + selected. Drag → vertex moves with the cursor. The user
   * never has to release-then-press-again to drag the new vertex;
   * single-pass insert-and-position is the whole point of clicking the
   * ghost.
   *
   * Bend is NOT promoted from a ghost press — bend is reserved for the
   * singleton-this segment-body case.
   */
  HandleGhostSplit = "HandleGhostSplit",

  // ── Empty space ─────────────────────────────────────────────────────────
  EmptyDeselectThenMarquee = "EmptyDeselectThenMarquee",
  /**
   * Single-click on empty space WHILE in content-edit. Clears the path-
   * edit sub-selection (vertex / segment / tangent) without exiting
   * content-edit or touching the host's node selection. Mirrors the
   * dblclick `ExitEdit` rule — same "click outside" gesture, one fewer
   * step. Pairs with `EmptyDeselectThenMarquee` outside content-edit.
   */
  EmptyClearSubSelectionThenMarquee = "EmptyClearSubSelectionThenMarquee",
  EmptyMarquee = "EmptyMarquee",
  EmptyAdditiveMarquee = "EmptyAdditiveMarquee",

  Noop = "Noop",
}

// ════════════════════════════════════════════════════════════════════════════
// Inputs / outputs
// ════════════════════════════════════════════════════════════════════════════

/**
 * Everything the decision module looks at. The caller computes these from the
 * live surface state; classification reads nothing else.
 */
export interface PointerDownInput {
  /** UI hit (corner/edge/rotation/endpoint/body) at the press point, or null. */
  ui_action: OverlayAction | null;
  /** Scene-content pick under the cursor (host-provided), or null. */
  hovered_id: NodeId | null;
  /** Current selection mirror (flat list). */
  selection_ids: readonly NodeId[];
  modifiers: Modifiers;
  /** Click count from the surface's click tracker (1 for single, 2 for double, …). */
  click_count: number;
  /** True when the surface is read-only — gestures that mutate are suppressed. */
  readonly: boolean;
  /**
   * True when the host has pushed an active vector sub-selection (the
   * surface mirrors a path under content-edit). Drives the dblclick-exit
   * rule: a dblclick that lands on anything other than the active path's
   * vector controls classifies as `ExitEdit` instead of `EnterEdit`. The
   * HUD never asks "what mode is the editor in?" — it just observes
   * whether a vector mirror is present (the only HUD-visible signal of
   * content-edit mode).
   *
   * Optional; defaults to `false` for callers (mostly tests) that don't
   * care about content-edit semantics.
   */
  in_content_edit?: boolean;
  /**
   * Parametric `t` for the **split** dispatched by a ghost-handle click.
   * Mode-dependent — caller resolves per `vector_insertion_mode`:
   *   - `"midpoint"` → 0.5
   *   - `"projected"` → `cmath.bezier.project(cursor)`
   *
   * Used by `HandleGhostSplit`'s `split_segment.t`. Pure scenario
   * classification doesn't know how to project — `state.ts` does the
   * math because it has the cursor and the action geometry in one
   * place. Optional so tests that don't exercise segment routes can
   * omit it (defaults to 0.5).
   */
  segment_split_t?: number;

  /**
   * Parametric `t` for the bend gesture's pivot `ca` — **always** the
   * cursor's geometry-aware projection onto the cubic at pointer-down,
   * mode-INDEPENDENT. Mirrors the main editor's
   * `t0Ref = cmath.bezier.project(point)` in
   * `surface-vector-editor.tsx:337`.
   *
   * Kept separate from `segment_split_t` because the two `t`s answer
   * different questions: split-`t` is "where will the new vertex go?"
   * (predictable preview = midpoint); pivot-`t` is "where am I bending
   * the curve through?" (must reflect where the user grabbed). Conflating
   * them was the "bend shifts to midpoint" bug.
   *
   * Optional with default 0.5; tests that don't exercise segment-drag
   * routes can omit.
   */
  segment_pivot_t?: number;

  /**
   * Current vector sub-selection mirror (vertex / segment / tangent sets).
   * Optional — when the host has not pushed an active path-edit context,
   * the classifier treats every axis-set as empty.
   *
   * Drives the "would-deselect → defer" rule for sub-selection control
   * overlays (vertex / tangent / segment_strip). Symmetric with
   * `selection_ids` for node-level: clicking a target that is ALREADY
   * in the relevant axis-set must defer (so a click-drag preserves the
   * multi-set instead of collapsing it on the down-edge).
   *
   * See `docs/wg/feat-editor/ux-surface/selection-intent.md` § Tier-1
   * sub-selection scenarios.
   */
  sub_selection?: {
    vertices: readonly number[];
    segments: readonly number[];
    tangents: readonly (readonly [number, 0 | 1])[];
  };
  /**
   * Sticky-bend override (default `"auto"`). When `"always"`, the
   * segment-drag dispatch treats Meta as held — i.e. promotes to
   * `bend_segment` regardless of physical Meta state. Set by the host
   * when its bend tool is active.
   */
  bend_mode?: "auto" | "always";
}

/**
 * Anchor stored on the surface's pending state while waiting for drag-vs-click.
 *
 * - `ids_at_down` — the ids a drag would translate.
 * - `deferred` — a select intent to fire on pointer-up IF no drag happened.
 *   Promoted-to-drag clears this; pointer-up emits it.
 */
export interface PendingPlan {
  ids_at_down: NodeId[];
  deferred?: DeferredIntent;
  /**
   * Optional "promote-to-this-gesture-on-drag" override. When set, the
   * surface promotes a pending → gesture transition using this kind
   * INSTEAD of the default rule (`ids.length > 0` → translate, else
   * marquee). Used by segment-strip pointer-downs which need to start a
   * `bend_segment` gesture on drag.
   */
  promote_to?: PendingPromote;
}

/**
 * What kind of gesture a pending pointer-down should promote into when
 * the drag threshold is crossed. The shape carries enough state so the
 * surface can construct the gesture without an extra round-trip.
 *
 * - `bend_segment` — segment-body drag WITH Meta. The pivot `ca` is the
 *   cursor's projection at drag-start, captured before promotion.
 * - `translate_vector_selection` — segment-body drag without Meta
 *   (default). Carries the dragged segment's endpoints in
 *   `additional_vertex_indices` so the host can translate them even if
 *   that segment isn't yet in the sub-selection.
 */
export type PendingPromote =
  | {
      kind: "bend_segment";
      node_id: NodeId;
      segment: number;
      ca: number;
    }
  | {
      kind: "translate_vector_selection";
      node_id: NodeId;
      additional_vertex_indices: readonly number[];
    }
  | {
      /**
       * Singleton-tangent drag — promote into the existing
       * `start_translate_tangent` gesture (absolute "curve" semantics,
       * mirror modifiers applicable at gesture level). Used only when
       * the tangent ∈ sub-selection AND the sub-selection is exactly
       * this one tangent (singleton-this). Mirrors main editor's
       * "curve" gesture (`use-sub-vector-network-editor.ts:141-149`).
       *
       * The deferred `select_tangent` is cancelled at drag-promote per
       * the standard rule — no select intent fires.
       */
      kind: "translate_tangent_singleton";
      node_id: NodeId;
      tangent: readonly [number, 0 | 1];
      pos: [number, number];
    };

/**
 * What the pending pointer-down should do on pointer-up (no drag).
 *
 * - `select` — apply a node-level select intent.
 * - `split_segment` — emit a vector split intent (segment click that
 *   landed on the ghost insertion knob).
 * - `select_vertex` / `select_tangent` / `select_segment` — apply a
 *   sub-selection-axis select intent. Fired when the user clicks an
 *   already-selected vertex/tangent/segment without drag — narrow on
 *   no-shift, toggle off on shift. Deferred so a click-DRAG instead
 *   preserves the multi-element sub-selection (doctrine: would-deselect
 *   always defers). Symmetric with node-level `select`.
 */
export type DeferredIntent =
  | { kind: "select"; node_id: NodeId; shift: boolean }
  | { kind: "split_segment"; node_id: NodeId; segment: number; t: number }
  | {
      kind: "select_vertex";
      node_id: NodeId;
      index: number;
      shift: boolean;
    }
  | {
      kind: "select_tangent";
      node_id: NodeId;
      tangent: readonly [number, 0 | 1];
      shift: boolean;
    }
  | {
      kind: "select_segment";
      node_id: NodeId;
      segment: number;
      shift: boolean;
    };

/**
 * Mechanical outcome of a pointer-down. `state.ts` applies these directly —
 * no further UX choices downstream.
 */
export type PointerDownDecision =
  | {
      kind: "start_resize";
      ids: readonly NodeId[];
      direction: ResizeDirection;
      initial_shape: SelectionShape;
    }
  | {
      kind: "start_rotate";
      ids: readonly NodeId[];
      corner: RotationCorner;
      initial_shape: SelectionShape;
    }
  | {
      kind: "start_endpoint";
      id: NodeId;
      endpoint: "p1" | "p2";
      p1: [number, number];
      p2: [number, number];
    }
  | {
      kind: "start_translate_vertex";
      node_id: NodeId;
      index: number;
      pos: [number, number];
      /** Whether to emit a `select_vertex` intent before the gesture starts.
       *  When the user shift-clicks an already-selected vertex, we still
       *  want to drag the existing selection without re-selecting. The host
       *  is told via the additive flag; null = no select intent fired. */
      select: { mode: SelectMode } | null;
    }
  | {
      kind: "start_translate_tangent";
      node_id: NodeId;
      tangent: readonly [number, 0 | 1];
      pos: [number, number];
      /** Like vertex_handle, always emit a select intent at down-time. */
      select: { mode: SelectMode } | null;
    }
  | {
      /**
       * Eager: split the segment at `t` AND immediately start translating
       * the newly-inserted vertex. The state machine emits the split
       * intent first (the host inserts the vertex and synchronously
       * pushes the new index into the vector-selection mirror via
       * `setVectorSelection`); then reads the mirror back and opens a
       * `translate_vertex` gesture against the new index. One pointer
       * press → insert + grab in a single pass.
       */
      kind: "start_split_and_translate";
      node_id: NodeId;
      segment: number;
      t: number;
    }
  | { kind: "enter_edit"; id: NodeId }
  | {
      /**
       * Exit content-edit. No payload — the host knows which path it has
       * under edit (it's the one it most recently pushed a vector mirror
       * for). Mirrors `enter_edit`'s "tell the host, host decides
       * follow-up" pattern.
       */
      kind: "exit_edit";
    }
  | {
      kind: "immediate_select";
      select_ids: readonly NodeId[];
      mode: SelectMode;
      pending: PendingPlan;
    }
  | {
      /**
       * Eagerly emit a `select_segment` intent AND open a pending pointer-down
       * for drag-promotion. Mirrors `immediate_select` for node-level
       * selection: the segment is selected at pointer-down (parity with
       * vertex/tangent control points), and the subsequent drag — if any —
       * promotes via `pending.promote_to` (translate sub-selection by default,
       * bend on Meta). Click-no-drag leaves the segment selected; no
       * follow-up emit needed at pointer-up.
       */
      kind: "immediate_select_segment";
      node_id: NodeId;
      segment: number;
      mode: SelectMode;
      pending: PendingPlan;
    }
  | { kind: "pend"; pending: PendingPlan }
  | {
      kind: "start_marquee_pend";
      /**
       * What to emit at pointer-down BEFORE the marquee gesture begins.
       * Fires eagerly so the click-without-drag case ends with state
       * already cleared. The `phase` is implicit (no preview/commit —
       * it's a one-shot clear).
       *
       * - `"none"` — additive marquee or no selection; no eager emit.
       * - `"deselect_all"` — clear the host's NODE-level selection
       *   (outside content-edit).
       * - `"clear_vector_selection"` — clear the path-edit sub-selection
       *   (in content-edit). Preserves the node selection so content-edit
       *   stays open; dblclick is what exits.
       */
      emit_on_down: "none" | "deselect_all" | "clear_vector_selection";
    }
  | { kind: "noop" };

// ════════════════════════════════════════════════════════════════════════════
// Classification — input → Scenario
// ════════════════════════════════════════════════════════════════════════════

/**
 * Recognize which scenario a pointer-down belongs to. Total over inputs.
 * Pure, no I/O. The single source of truth for "which atomic intent did the
 * user just express?"
 */
export function classifyScenario(input: PointerDownInput): Scenario {
  const {
    ui_action,
    hovered_id,
    selection_ids,
    modifiers,
    click_count,
    readonly,
    in_content_edit,
    sub_selection,
  } = input;

  // ── Tier 0 — content-edit exit ─────────────────────────────────────────
  // While a vector sub-selection mirror is active, a dblclick that does
  // NOT land on a vector-control overlay (vertex / tangent / segment_strip)
  // means "leave content-edit." This must run BEFORE the EnterEdit rules
  // below — a dblclick on another node, on the body of the editing node,
  // or on empty space, should exit, not re-enter.
  if (in_content_edit && click_count >= 2) {
    const is_vector_control =
      ui_action &&
      (ui_action.kind === "vertex_handle" ||
        ui_action.kind === "tangent_handle" ||
        ui_action.kind === "segment_strip" ||
        ui_action.kind === "ghost_handle");
    if (!is_vector_control) return Scenario.ExitEdit;
  }

  // ── Tier 1 — UI hit ────────────────────────────────────────────────────
  if (ui_action) {
    switch (ui_action.kind) {
      case "resize_handle":
        return readonly ? Scenario.Noop : Scenario.HandleResize;
      case "rotate_handle":
        return readonly ? Scenario.Noop : Scenario.HandleRotate;
      case "endpoint_handle":
        return readonly ? Scenario.Noop : Scenario.HandleEndpoint;
      case "vertex_handle": {
        if (readonly) return Scenario.Noop;
        const in_set =
          sub_selection?.vertices.includes(ui_action.index) ?? false;
        const variant = classifyAgainstAxisSet(in_set, modifiers.shift);
        return VERTEX_VARIANT_TO_SCENARIO[variant];
      }
      case "tangent_handle": {
        if (readonly) return Scenario.Noop;
        const in_set =
          sub_selection !== undefined &&
          tangentSetHas(sub_selection.tangents, ui_action.tangent);
        const variant = classifyAgainstAxisSet(in_set, modifiers.shift);
        return TANGENT_VARIANT_TO_SCENARIO[variant];
      }
      case "segment_strip": {
        if (readonly) return Scenario.Noop;
        const in_set =
          sub_selection?.segments.includes(ui_action.segment) ?? false;
        const variant = classifyAgainstAxisSet(in_set, modifiers.shift);
        return SEGMENT_VARIANT_TO_SCENARIO[variant];
      }
      case "ghost_handle":
        return readonly ? Scenario.Noop : Scenario.HandleGhostSplit;

      case "select_node": {
        // Treated like Tier-2 content: it's a content-representative click.
        const id = ui_action.id;
        if (click_count >= 2) return Scenario.EnterEdit;
        return classifyContent(id, selection_ids, modifiers);
      }

      case "translate_handle":
        return classifyBodyRegion(
          hovered_id,
          selection_ids,
          modifiers,
          click_count
        );
    }
  }

  // ── Tier 2 — scene content ─────────────────────────────────────────────
  if (hovered_id) {
    if (click_count >= 2) return Scenario.EnterEdit;
    return classifyContent(hovered_id, selection_ids, modifiers);
  }

  // ── Tier 2 — empty space ───────────────────────────────────────────────
  if (modifiers.shift) return Scenario.EmptyAdditiveMarquee;
  // In content-edit mode, an empty-space click clears the sub-selection
  // (vertices / segments / tangents) without exiting. The node selection
  // (the path being edited) stays put — content-edit only exits on
  // dblclick (see Tier 0). Drag still starts a marquee for vector
  // sub-selection.
  if (in_content_edit) return Scenario.EmptyClearSubSelectionThenMarquee;
  if (selection_ids.length > 0) return Scenario.EmptyDeselectThenMarquee;
  return Scenario.EmptyMarquee;
}

/**
 * Tier-2 content classification (also reused for the Tier-1 `select_node`
 * overlay variant). The asymmetry lives here in one place:
 *
 *   would-deselect (in selection) → ambiguous (defer)
 *   would-select   (not in selection) → singleton (immediate)
 */
function classifyContent(
  id: NodeId,
  selection_ids: readonly NodeId[],
  modifiers: Modifiers
): Scenario {
  if (selection_ids.includes(id)) {
    return modifiers.shift
      ? Scenario.ContentToggleOrDrag
      : Scenario.ContentNarrowOrDrag;
  }
  return modifiers.shift ? Scenario.ContentAdd : Scenario.ContentReplace;
}

/**
 * Axis-agnostic four-way variant decision shared by all sub-selection
 * controls (vertex / tangent / segment). The membership probe lives at
 * the call site (each axis has its own equality predicate); this helper
 * encodes only the doctrine's would-select / would-deselect routing rule.
 *
 *   in_set, no shift → NarrowOrDrag  (defer; click narrows, drag preserves)
 *   in_set, shift    → ToggleOrDrag  (defer; click toggles off, drag preserves)
 *   ∉ set, no shift  → Replace       (singleton, on-down)
 *   ∉ set, shift     → Add           (singleton, on-down)
 *
 * Mirrors `classifyContent` shape — same rule, different membership axis.
 */
type AxisVariant = "Replace" | "Add" | "NarrowOrDrag" | "ToggleOrDrag";

function classifyAgainstAxisSet(in_set: boolean, shift: boolean): AxisVariant {
  if (in_set) return shift ? "ToggleOrDrag" : "NarrowOrDrag";
  return shift ? "Add" : "Replace";
}

/** Tangent membership probe (mirrors host-side `tangents_equal`). */
function tangentSetHas(
  set: readonly (readonly [number, 0 | 1])[],
  ref: readonly [number, 0 | 1]
): boolean {
  return set.some((t) => t[0] === ref[0] && t[1] === ref[1]);
}

const VERTEX_VARIANT_TO_SCENARIO: Record<AxisVariant, Scenario> = {
  Replace: Scenario.HandleVertexReplace,
  Add: Scenario.HandleVertexAdd,
  NarrowOrDrag: Scenario.HandleVertexNarrowOrDrag,
  ToggleOrDrag: Scenario.HandleVertexToggleOrDrag,
};

const TANGENT_VARIANT_TO_SCENARIO: Record<AxisVariant, Scenario> = {
  Replace: Scenario.HandleTangentReplace,
  Add: Scenario.HandleTangentAdd,
  NarrowOrDrag: Scenario.HandleTangentNarrowOrDrag,
  ToggleOrDrag: Scenario.HandleTangentToggleOrDrag,
};

const SEGMENT_VARIANT_TO_SCENARIO: Record<AxisVariant, Scenario> = {
  Replace: Scenario.HandleSegmentReplace,
  Add: Scenario.HandleSegmentAdd,
  NarrowOrDrag: Scenario.HandleSegmentNarrowOrDrag,
  ToggleOrDrag: Scenario.HandleSegmentToggleOrDrag,
};

/**
 * "Singleton-this" — sub-selection is exactly this one item, nothing
 * selected anywhere else across any axis. Discriminator between
 * specialized single-target gestures (bend, set_tangent curve) and the
 * unified delta-translate (`translate_vector_selection`).
 *
 * Per user direction: "when point A, B and line AB is selected (3 in
 * total) or similar (A + AB), the intent is always to translate, not
 * bend." Singleton-this is therefore a strict equality, not a
 * cardinality check.
 *
 * Mirrors main editor's `use-sub-vector-network-editor.ts:141-149`
 * branch: `multi > 1` (mixed or multiple) → translate-vector-controls;
 * else → curve/bend gesture.
 */
function isSingletonThisSegment(
  segment: number,
  sub: PointerDownInput["sub_selection"]
): boolean {
  if (!sub) return false;
  return (
    sub.segments.length === 1 &&
    sub.segments[0] === segment &&
    sub.vertices.length === 0 &&
    sub.tangents.length === 0
  );
}

function isSingletonThisTangent(
  ref: readonly [number, 0 | 1],
  sub: PointerDownInput["sub_selection"]
): boolean {
  if (!sub) return false;
  return (
    sub.tangents.length === 1 &&
    sub.tangents[0][0] === ref[0] &&
    sub.tangents[0][1] === ref[1] &&
    sub.vertices.length === 0 &&
    sub.segments.length === 0
  );
}

/**
 * Body-region classification. Every variant defers, because in the body
 * region "drag the existing selection" is always a candidate intent — even
 * with shift, even when the underlying hover would otherwise be a clear
 * select. The body region's whole purpose is to claim drag.
 */
function classifyBodyRegion(
  hovered_id: NodeId | null,
  selection_ids: readonly NodeId[],
  modifiers: Modifiers,
  click_count: number
): Scenario {
  if (click_count >= 2) return Scenario.EnterEdit;

  if (!hovered_id) return Scenario.BodyDragOnly;

  if (selection_ids.includes(hovered_id)) {
    return modifiers.shift
      ? Scenario.BodyToggleOrDrag
      : Scenario.BodyNarrowOrDrag;
  }
  return modifiers.shift ? Scenario.BodyAddOrDrag : Scenario.BodySwapOrDrag;
}

// ════════════════════════════════════════════════════════════════════════════
// Dispatch — Scenario → PointerDownDecision
// ════════════════════════════════════════════════════════════════════════════

/**
 * Decide what a primary-button pointer-down should do. Thin wrapper:
 * classify the scenario, then dispatch declaratively. The dispatch table is
 * a flat switch — adding a new scenario shows up as exactly one new case.
 */
export function decidePointerDown(
  input: PointerDownInput
): PointerDownDecision {
  const scenario = classifyScenario(input);
  return dispatch(scenario, input);
}

function dispatch(
  scenario: Scenario,
  input: PointerDownInput
): PointerDownDecision {
  const { ui_action, hovered_id, selection_ids, modifiers } = input;

  switch (scenario) {
    case Scenario.Noop:
      return { kind: "noop" };

    // ── Handles ─────────────────────────────────────────────────────────
    case Scenario.HandleResize: {
      const a = ui_action as Extract<OverlayAction, { kind: "resize_handle" }>;
      return {
        kind: "start_resize",
        ids: a.ids,
        direction: a.direction,
        initial_shape: a.initial_shape,
      };
    }
    case Scenario.HandleRotate: {
      const a = ui_action as Extract<OverlayAction, { kind: "rotate_handle" }>;
      return {
        kind: "start_rotate",
        ids: a.ids,
        corner: a.corner,
        initial_shape: a.initial_shape,
      };
    }
    case Scenario.HandleEndpoint: {
      const a = ui_action as Extract<
        OverlayAction,
        { kind: "endpoint_handle" }
      >;
      return {
        kind: "start_endpoint",
        id: a.id,
        endpoint: a.endpoint,
        p1: a.p1,
        p2: a.p2,
      };
    }
    // ── Vertex axis ──────────────────────────────────────────────────────
    //
    // ∉ paths (Replace / Add) — singleton, eager `select_vertex` on-down via
    // `start_translate_vertex.select`. Subsequent drag operates on this
    // newly-selected singleton via the singleton-indexed `translate_vertex`
    // gesture.
    //
    // ∈ paths (NarrowOrDrag / ToggleOrDrag) — defer the select; on click-
    // no-drag emit `select_vertex` with replace/toggle. On drag, the
    // deferred cancellation rule preserves the multi-vertex sub-selection
    // and promotes to `translate_vector_selection` (host expands the
    // sub-selection itself; `additional_vertex_indices` is empty).
    case Scenario.HandleVertexReplace:
    case Scenario.HandleVertexAdd: {
      const a = ui_action as Extract<OverlayAction, { kind: "vertex_handle" }>;
      return {
        kind: "start_translate_vertex",
        node_id: a.node_id,
        index: a.index,
        pos: a.pos,
        select: { mode: modifiers.shift ? "toggle" : "replace" },
      };
    }
    case Scenario.HandleVertexNarrowOrDrag:
    case Scenario.HandleVertexToggleOrDrag: {
      const a = ui_action as Extract<OverlayAction, { kind: "vertex_handle" }>;
      return {
        kind: "pend",
        pending: {
          ids_at_down: [],
          deferred: {
            kind: "select_vertex",
            node_id: a.node_id,
            index: a.index,
            shift: modifiers.shift,
          },
          promote_to: {
            kind: "translate_vector_selection",
            node_id: a.node_id,
            additional_vertex_indices: [],
          },
        },
      };
    }

    // ── Tangent axis ─────────────────────────────────────────────────────
    //
    // ∉ paths — singleton, eager `select_tangent`. Singleton tangent
    // translate gesture (`set_tangent` semantics; mirror modifiers in
    // scope at the gesture level).
    //
    // ∈ paths — defer. On drag promotion, branch on `is_singleton_this`:
    //   - singleton-this (only this tangent selected anywhere) → singleton
    //     `start_translate_tangent` (curve/set_tangent gesture).
    //   - else (multi/mixed) → `translate_vector_selection` (delta-translate
    //     the whole sub-selection; host applies delta to selected tangents
    //     too, with parent-vertex exclusion — see svg-editor's
    //     `handle_translate_vector_selection`).
    case Scenario.HandleTangentReplace:
    case Scenario.HandleTangentAdd: {
      const a = ui_action as Extract<OverlayAction, { kind: "tangent_handle" }>;
      return {
        kind: "start_translate_tangent",
        node_id: a.node_id,
        tangent: a.tangent,
        pos: a.pos,
        select: { mode: modifiers.shift ? "toggle" : "replace" },
      };
    }
    case Scenario.HandleTangentNarrowOrDrag:
    case Scenario.HandleTangentToggleOrDrag: {
      const a = ui_action as Extract<OverlayAction, { kind: "tangent_handle" }>;
      const singleton_this = isSingletonThisTangent(
        a.tangent,
        input.sub_selection
      );
      const promote_to: PendingPromote = singleton_this
        ? {
            kind: "translate_tangent_singleton",
            node_id: a.node_id,
            tangent: a.tangent,
            pos: a.pos,
          }
        : {
            kind: "translate_vector_selection",
            node_id: a.node_id,
            additional_vertex_indices: [],
          };
      return {
        kind: "pend",
        pending: {
          ids_at_down: [],
          deferred: {
            kind: "select_tangent",
            node_id: a.node_id,
            tangent: a.tangent,
            shift: modifiers.shift,
          },
          promote_to,
        },
      };
    }

    // ── Segment axis ─────────────────────────────────────────────────────
    //
    // ∉ paths — singleton via `immediate_select_segment` (eager segment-
    // select); promote_to carries `[a_idx, b_idx]` so drag translates the
    // newly-selected segment's endpoints even before the host's mirror
    // echo lands. Meta+∉ → bend at projected pivot.
    //
    // ∈ paths — defer the select. Drag-promote branches on Meta AND on
    // "is sub-selection exactly { segments: [this one] }, nothing else":
    //   - singleton-this + Meta → bend at projected pivot.
    //   - else (multi/mixed OR no Meta) → `translate_vector_selection`
    //     with empty additions (segment endpoints already in the union
    //     via the host's sub-selection expansion).
    case Scenario.HandleSegmentReplace:
    case Scenario.HandleSegmentAdd: {
      const a = ui_action as Extract<OverlayAction, { kind: "segment_strip" }>;
      const pivot_t = input.segment_pivot_t ?? 0.5;
      // Bend signal: Meta-held OR host's sticky bend tool active.
      const bend = modifiers.meta || input.bend_mode === "always";
      const promote_to: PendingPromote = bend
        ? {
            kind: "bend_segment",
            node_id: a.node_id,
            segment: a.segment,
            ca: pivot_t,
          }
        : {
            kind: "translate_vector_selection",
            node_id: a.node_id,
            additional_vertex_indices: [a.a_idx, a.b_idx],
          };
      return {
        kind: "immediate_select_segment",
        node_id: a.node_id,
        segment: a.segment,
        mode: modifiers.shift ? "toggle" : "replace",
        pending: {
          ids_at_down: [],
          promote_to,
        },
      };
    }
    case Scenario.HandleSegmentNarrowOrDrag:
    case Scenario.HandleSegmentToggleOrDrag: {
      const a = ui_action as Extract<OverlayAction, { kind: "segment_strip" }>;
      const pivot_t = input.segment_pivot_t ?? 0.5;
      const singleton_this = isSingletonThisSegment(
        a.segment,
        input.sub_selection
      );
      // Per user direction: "when point A, B and line AB is selected (3 in
      // total) or similar (A + AB), the intent is always to translate, not
      // bend." Bend is reserved for the strictly-singleton-segment case.
      // Sticky bend tool counts as Meta-held here too.
      const bend = modifiers.meta || input.bend_mode === "always";
      const promote_to: PendingPromote =
        bend && singleton_this
          ? {
              kind: "bend_segment",
              node_id: a.node_id,
              segment: a.segment,
              ca: pivot_t,
            }
          : {
              kind: "translate_vector_selection",
              node_id: a.node_id,
              additional_vertex_indices: [],
            };
      return {
        kind: "pend",
        pending: {
          ids_at_down: [],
          deferred: {
            kind: "select_segment",
            node_id: a.node_id,
            segment: a.segment,
            shift: modifiers.shift,
          },
          promote_to,
        },
      };
    }
    case Scenario.HandleGhostSplit: {
      const a = ui_action as Extract<OverlayAction, { kind: "ghost_handle" }>;
      // Cursor is ON the ghost insertion knob — eager dispatch. The
      // press inserts the vertex AND starts translating it in one pass.
      // Click-no-drag → vertex is just inserted (translate gesture
      // ends with zero delta — host translate_vertices(0, 0) is a no-op
      // semantically). Drag → the new vertex moves with the cursor.
      const t = input.segment_split_t ?? 0.5;
      return {
        kind: "start_split_and_translate",
        node_id: a.node_id,
        segment: a.segment,
        t,
      };
    }

    // ── Enter edit ──────────────────────────────────────────────────────
    case Scenario.EnterEdit: {
      // dblclick target: hovered_id wins; for body-region with single-id
      // chrome and no hover, fall back to the chrome's id.
      const chrome_ids =
        ui_action && ui_action.kind === "translate_handle"
          ? ui_action.ids
          : null;
      const id =
        hovered_id ??
        (chrome_ids && chrome_ids.length === 1 ? chrome_ids[0] : null);
      if (id === null) return { kind: "noop" };
      return { kind: "enter_edit", id };
    }

    // ── Exit edit (dblclick away while in content-edit) ─────────────────
    case Scenario.ExitEdit:
      return { kind: "exit_edit" };

    // ── Tier-2 content: singleton ───────────────────────────────────────
    case Scenario.ContentReplace: {
      const id = contentId(ui_action, hovered_id)!;
      return {
        kind: "immediate_select",
        select_ids: [id],
        mode: "replace",
        pending: { ids_at_down: [id] },
      };
    }
    case Scenario.ContentAdd: {
      const id = contentId(ui_action, hovered_id)!;
      return {
        kind: "immediate_select",
        select_ids: [id],
        mode: "toggle",
        pending: {
          ids_at_down: [id, ...selection_ids.filter((s) => s !== id)],
        },
      };
    }

    // ── Tier-2 content: ambiguous ───────────────────────────────────────
    case Scenario.ContentNarrowOrDrag:
    case Scenario.ContentToggleOrDrag: {
      const id = contentId(ui_action, hovered_id)!;
      return {
        kind: "pend",
        pending: {
          ids_at_down: [...selection_ids],
          deferred: { kind: "select", node_id: id, shift: modifiers.shift },
        },
      };
    }

    // ── Body region (all variants defer) ────────────────────────────────
    case Scenario.BodyDragOnly: {
      const chrome_ids = (
        ui_action as Extract<OverlayAction, { kind: "translate_handle" }>
      ).ids;
      return { kind: "pend", pending: { ids_at_down: [...chrome_ids] } };
    }
    case Scenario.BodyNarrowOrDrag:
    case Scenario.BodyToggleOrDrag:
    case Scenario.BodySwapOrDrag:
    case Scenario.BodyAddOrDrag: {
      const chrome_ids = (
        ui_action as Extract<OverlayAction, { kind: "translate_handle" }>
      ).ids;
      return {
        kind: "pend",
        pending: {
          ids_at_down: [...chrome_ids],
          deferred: {
            kind: "select",
            node_id: hovered_id!,
            shift: modifiers.shift,
          },
        },
      };
    }

    // ── Empty space ─────────────────────────────────────────────────────
    case Scenario.EmptyDeselectThenMarquee:
      return { kind: "start_marquee_pend", emit_on_down: "deselect_all" };
    case Scenario.EmptyClearSubSelectionThenMarquee:
      return {
        kind: "start_marquee_pend",
        emit_on_down: "clear_vector_selection",
      };
    case Scenario.EmptyMarquee:
    case Scenario.EmptyAdditiveMarquee:
      return { kind: "start_marquee_pend", emit_on_down: "none" };
  }
}

/** Resolve the id that the user clicked on for content-class scenarios. */
function contentId(
  ui_action: OverlayAction | null,
  hovered_id: NodeId | null
): NodeId | null {
  if (ui_action && ui_action.kind === "select_node") return ui_action.id;
  return hovered_id;
}

// ════════════════════════════════════════════════════════════════════════════
// Idle-cursor decision — reads the same inputs as classification
// ════════════════════════════════════════════════════════════════════════════

/**
 * What the cursor should show while idle. Drives the cursor in lockstep
 * with the pointer-down decision — both read the same inputs, so cursor
 * and intent can't drift.
 *
 * Hover (the visual outline) is NOT decided here — it's always
 * `hovered_id`. Cursor is about INTENT (what the next pointer-down would
 * do), not what's visually under the pointer.
 */
export function decideIdleCursor(input: {
  ui_action: OverlayAction | null;
  hovered_id: NodeId | null;
  selection_ids: readonly NodeId[];
}): CursorIcon {
  const { ui_action, hovered_id, selection_ids } = input;
  if (ui_action) {
    switch (ui_action.kind) {
      case "resize_handle":
        return {
          kind: "resize",
          direction: ui_action.direction,
          baseAngle: shape_screen_angle_rad(ui_action.initial_shape),
        };
      case "rotate_handle":
        return {
          kind: "rotate",
          corner: ui_action.corner,
          baseAngle: shape_screen_angle_rad(ui_action.initial_shape),
        };
      case "translate_handle":
        return "move";
      case "select_node":
      case "endpoint_handle":
      case "vertex_handle":
      case "tangent_handle":
        return "pointer";
      case "segment_strip":
        // Off-ghost segment body: click = select segment, drag = bend.
        // (Figma uses the pen-add cursor here; v1 sticks with `pointer`.)
        return "pointer";
      case "ghost_handle":
        // On the half-point insertion knob: click splits, drag bends.
        return "pointer";
    }
  }
  if (hovered_id && selection_ids.includes(hovered_id)) {
    return "move";
  }
  return "default";
}

/**
 * Doc-space rotation of a `SelectionShape` in radians. For `transformed`
 * shapes this is the angle baked into `matrix`; for `rect`/`line` it's 0.
 *
 * Used by `decideIdleCursor` and by the rotate-gesture cursor compositor
 * so the resize / rotate cursor always tilts to match the selection's
 * orientation — without requiring the HUD's camera to be axis-aligned
 * for the doc-space angle to be the right thing to render (the renderer
 * draws the cursor in screen px, and in svg-editor the camera contributes
 * scale + translate only, so doc-space == screen-space rotation).
 *
 * For hosts that ROTATE the HUD camera, this should compose with the
 * camera's angle at consume time. Not relevant for svg-editor.
 */
function shape_screen_angle_rad(shape: SelectionShape): number {
  if (shape.kind !== "transformed") return 0;
  return (cmath.transform.angle(shape.matrix) * Math.PI) / 180;
}

// Re-export cmath for downstream tests that want to construct vectors
// without an extra import.
export type { cmath };
