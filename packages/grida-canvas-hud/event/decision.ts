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

import type cmath from "@grida/cmath";
import type { Modifiers } from "./event";
import type { OverlayAction } from "./hit-regions";
import type { NodeId, Rect } from "./gesture";
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
 * - `Noop` — suppressed (readonly + handle hit, etc.).
 */
export const enum Scenario {
  // ── Singleton — commit on down ──────────────────────────────────────────
  HandleResize = "HandleResize",
  HandleRotate = "HandleRotate",
  HandleEndpoint = "HandleEndpoint",
  EnterEdit = "EnterEdit",
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

  // ── Empty space ─────────────────────────────────────────────────────────
  EmptyDeselectThenMarquee = "EmptyDeselectThenMarquee",
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
  deferred?: DeferredSelect;
}

export interface DeferredSelect {
  node_id: NodeId;
  shift: boolean;
}

/**
 * Mechanical outcome of a pointer-down. `state.ts` applies these directly —
 * no further UX choices downstream.
 */
export type PointerDownDecision =
  | {
      kind: "start_resize";
      ids: readonly NodeId[];
      direction: ResizeDirection;
      initial_rect: Rect;
    }
  | {
      kind: "start_rotate";
      ids: readonly NodeId[];
      corner: RotationCorner;
      initial_rect: Rect;
    }
  | {
      kind: "start_endpoint";
      id: NodeId;
      endpoint: "p1" | "p2";
      p1: [number, number];
      p2: [number, number];
    }
  | { kind: "enter_edit"; id: NodeId }
  | {
      kind: "immediate_select";
      select_ids: readonly NodeId[];
      mode: SelectMode;
      pending: PendingPlan;
    }
  | { kind: "pend"; pending: PendingPlan }
  | { kind: "start_marquee_pend"; emit_deselect_all: boolean }
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
  } = input;

  // ── Tier 1 — UI hit ────────────────────────────────────────────────────
  if (ui_action) {
    switch (ui_action.kind) {
      case "resize_handle":
        return readonly ? Scenario.Noop : Scenario.HandleResize;
      case "rotate_handle":
        return readonly ? Scenario.Noop : Scenario.HandleRotate;
      case "endpoint_handle":
        return readonly ? Scenario.Noop : Scenario.HandleEndpoint;

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
        initial_rect: a.initial_rect,
      };
    }
    case Scenario.HandleRotate: {
      const a = ui_action as Extract<OverlayAction, { kind: "rotate_handle" }>;
      return {
        kind: "start_rotate",
        ids: a.ids,
        corner: a.corner,
        initial_rect: a.initial_rect,
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
          deferred: { node_id: id, shift: modifiers.shift },
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
          deferred: { node_id: hovered_id!, shift: modifiers.shift },
        },
      };
    }

    // ── Empty space ─────────────────────────────────────────────────────
    case Scenario.EmptyDeselectThenMarquee:
      return { kind: "start_marquee_pend", emit_deselect_all: true };
    case Scenario.EmptyMarquee:
    case Scenario.EmptyAdditiveMarquee:
      return { kind: "start_marquee_pend", emit_deselect_all: false };
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
        return { kind: "resize", direction: ui_action.direction };
      case "rotate_handle":
        return { kind: "rotate", corner: ui_action.corner };
      case "translate_handle":
        return "move";
      case "select_node":
      case "endpoint_handle":
        return "pointer";
    }
  }
  if (hovered_id && selection_ids.includes(hovered_id)) {
    return "move";
  }
  return "default";
}

// Re-export cmath for downstream tests that want to construct vectors
// without an extra import.
export type { cmath };
