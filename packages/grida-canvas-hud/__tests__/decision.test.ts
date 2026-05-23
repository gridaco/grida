/**
 * Contract tests for `event/decision.ts`.
 *
 * Organized by `Scenario`. Every scenario is pinned twice:
 *   1. `classifyScenario(input) === Scenario.X`  — classification is correct
 *   2. `decidePointerDown(input)` returns the expected outcome — dispatch is
 *      correct
 *
 * When changing a rule, the matching test, the matching `Scenario` constant,
 * the matching classification branch, AND the matching dispatch branch all
 * move together. That is the point of centralizing.
 */

import { describe, it, expect } from "vitest";
import cmath from "@grida/cmath";
import {
  Scenario,
  classifyScenario,
  decidePointerDown,
  decideIdleCursor,
  type PointerDownDecision,
  type PointerDownInput,
} from "../event/decision";
import { NO_MODS } from "../event/event";
import type { OverlayAction } from "../event/hit-regions";

const RECT = { x: 0, y: 0, width: 100, height: 100 };

const SHIFT = { ...NO_MODS, shift: true };

function input(overrides: Partial<PointerDownInput>): PointerDownInput {
  return {
    ui_action: null,
    hovered_id: null,
    selection_ids: [],
    modifiers: NO_MODS,
    click_count: 1,
    readonly: false,
    ...overrides,
  };
}

/**
 * Assert the decision's `kind` discriminator and return the narrowed variant.
 * Replaces the `expect(d.kind).toBe(...); if (d.kind === "...") { ... }`
 * boilerplate.
 */
function expectKind<K extends PointerDownDecision["kind"]>(
  d: PointerDownDecision,
  kind: K
): Extract<PointerDownDecision, { kind: K }> {
  expect(d.kind).toBe(kind);
  return d as Extract<PointerDownDecision, { kind: K }>;
}

// ════════════════════════════════════════════════════════════════════════════
// Handle scenarios (singleton — commit on down)
// ════════════════════════════════════════════════════════════════════════════

describe("Scenario.HandleResize", () => {
  const i = input({
    ui_action: {
      kind: "resize_handle",
      direction: "se",
      ids: ["a"],
      initial_shape: { kind: "rect", rect: RECT },
    },
    selection_ids: ["a"],
  });

  it("classifies", () => {
    expect(classifyScenario(i)).toBe(Scenario.HandleResize);
  });

  it("dispatches start_resize", () => {
    expect(decidePointerDown(i).kind).toBe("start_resize");
  });

  it("classifies NOOP when readonly", () => {
    expect(classifyScenario({ ...i, readonly: true })).toBe(Scenario.Noop);
  });
});

describe("Scenario.HandleRotate", () => {
  const i = input({
    ui_action: {
      kind: "rotate_handle",
      corner: "ne",
      ids: ["a"],
      initial_shape: { kind: "rect", rect: RECT },
    },
    selection_ids: ["a"],
  });

  it("classifies and dispatches", () => {
    expect(classifyScenario(i)).toBe(Scenario.HandleRotate);
    expect(decidePointerDown(i).kind).toBe("start_rotate");
  });
});

describe("Scenario.HandleEndpoint", () => {
  const i = input({
    ui_action: {
      kind: "endpoint_handle",
      endpoint: "p1",
      id: "L",
      p1: [0, 0],
      p2: [100, 100],
    },
    selection_ids: ["L"],
  });

  it("classifies and dispatches", () => {
    expect(classifyScenario(i)).toBe(Scenario.HandleEndpoint);
    expect(decidePointerDown(i).kind).toBe("start_endpoint");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Sub-selection scenarios (3 axes × 4 variants — mirrors Tier-2 Content*)
// ────────────────────────────────────────────────────────────────────────────
// Doctrine: `docs/wg/feat-editor/ux-surface/selection-intent.md` —
// "would-deselect → always defer; would-select → singleton, on-down."
// Same rule, applied per sub-selection axis. Each scenario name embedded
// verbatim per doctrine § Test coverage grep contract.
// ════════════════════════════════════════════════════════════════════════════

const VERTEX_A: OverlayAction = {
  kind: "vertex_handle",
  node_id: "p1",
  index: 0,
  pos: [10, 10],
};
const TANGENT_A: OverlayAction = {
  kind: "tangent_handle",
  node_id: "p1",
  tangent: [0, 0],
  pos: [12, 10],
};
const SEGMENT_A: OverlayAction = {
  kind: "segment_strip",
  node_id: "p1",
  segment: 3,
  a_idx: 0,
  b_idx: 1,
  a: [0, 0],
  b: [10, 0],
  a_control: [0, 0],
  b_control: [10, 0],
};

// ── Vertex axis ────────────────────────────────────────────────────────────

describe("Scenario.HandleVertexReplace (singleton: would-select, no shift)", () => {
  it("classifies — empty sub-selection", () => {
    const i = input({
      ui_action: VERTEX_A,
      in_content_edit: true,
      sub_selection: { vertices: [], segments: [], tangents: [] },
    });
    expect(classifyScenario(i)).toBe(Scenario.HandleVertexReplace);
  });

  it("classifies — vertex NOT in sub-selection", () => {
    const i = input({
      ui_action: VERTEX_A,
      in_content_edit: true,
      sub_selection: { vertices: [5, 6], segments: [], tangents: [] },
    });
    expect(classifyScenario(i)).toBe(Scenario.HandleVertexReplace);
  });

  it("dispatches start_translate_vertex with select: replace", () => {
    const i = input({ ui_action: VERTEX_A });
    const d = expectKind(decidePointerDown(i), "start_translate_vertex");
    expect(d.select).toEqual({ mode: "replace" });
    expect(d.index).toBe(0);
  });
});

describe("Scenario.HandleVertexAdd (singleton: would-select, shift)", () => {
  it("classifies — vertex ∉ sub-selection, shift", () => {
    const i = input({
      ui_action: VERTEX_A,
      modifiers: SHIFT,
      sub_selection: { vertices: [5], segments: [], tangents: [] },
    });
    expect(classifyScenario(i)).toBe(Scenario.HandleVertexAdd);
  });

  it("dispatches start_translate_vertex with select: toggle", () => {
    const i = input({ ui_action: VERTEX_A, modifiers: SHIFT });
    const d = expectKind(decidePointerDown(i), "start_translate_vertex");
    expect(d.select).toEqual({ mode: "toggle" });
  });
});

describe("Scenario.HandleVertexNarrowOrDrag (ambiguous: would-deselect, no shift)", () => {
  const i = input({
    ui_action: VERTEX_A,
    sub_selection: { vertices: [0, 5, 6], segments: [], tangents: [] },
  });

  it("classifies", () => {
    expect(classifyScenario(i)).toBe(Scenario.HandleVertexNarrowOrDrag);
  });

  it("dispatches pend with deferred select_vertex + translate_vector_selection promote", () => {
    const d = expectKind(decidePointerDown(i), "pend");
    expect(d.pending.deferred).toEqual({
      kind: "select_vertex",
      node_id: "p1",
      index: 0,
      shift: false,
    });
    expect(d.pending.promote_to).toEqual({
      kind: "translate_vector_selection",
      node_id: "p1",
      additional_vertex_indices: [],
    });
  });
});

describe("Scenario.HandleVertexToggleOrDrag (ambiguous: would-deselect, shift)", () => {
  const i = input({
    ui_action: VERTEX_A,
    modifiers: SHIFT,
    sub_selection: { vertices: [0, 5], segments: [], tangents: [] },
  });

  it("classifies", () => {
    expect(classifyScenario(i)).toBe(Scenario.HandleVertexToggleOrDrag);
  });

  it("dispatches pend with deferred select_vertex (shift=true)", () => {
    const d = expectKind(decidePointerDown(i), "pend");
    expect(d.pending.deferred).toEqual({
      kind: "select_vertex",
      node_id: "p1",
      index: 0,
      shift: true,
    });
  });
});

// ── Tangent axis ───────────────────────────────────────────────────────────

describe("Scenario.HandleTangentReplace (singleton: would-select, no shift)", () => {
  it("classifies — tangent ∉ sub-selection", () => {
    const i = input({
      ui_action: TANGENT_A,
      sub_selection: { vertices: [], segments: [], tangents: [[5, 0]] },
    });
    expect(classifyScenario(i)).toBe(Scenario.HandleTangentReplace);
  });

  it("dispatches start_translate_tangent with select: replace", () => {
    const i = input({ ui_action: TANGENT_A });
    const d = expectKind(decidePointerDown(i), "start_translate_tangent");
    expect(d.select).toEqual({ mode: "replace" });
  });
});

describe("Scenario.HandleTangentAdd (singleton: would-select, shift)", () => {
  it("classifies — tangent ∉ sub-selection, shift", () => {
    const i = input({
      ui_action: TANGENT_A,
      modifiers: SHIFT,
      sub_selection: { vertices: [], segments: [], tangents: [[5, 1]] },
    });
    expect(classifyScenario(i)).toBe(Scenario.HandleTangentAdd);
  });

  it("dispatches start_translate_tangent with select: toggle", () => {
    const i = input({ ui_action: TANGENT_A, modifiers: SHIFT });
    const d = expectKind(decidePointerDown(i), "start_translate_tangent");
    expect(d.select).toEqual({ mode: "toggle" });
  });
});

describe("Scenario.HandleTangentNarrowOrDrag (ambiguous: would-deselect, no shift)", () => {
  it("classifies — tangent ∈ sub-selection (multi)", () => {
    const i = input({
      ui_action: TANGENT_A,
      sub_selection: {
        vertices: [],
        segments: [],
        tangents: [
          [0, 0],
          [5, 0],
        ],
      },
    });
    expect(classifyScenario(i)).toBe(Scenario.HandleTangentNarrowOrDrag);
  });

  it("dispatches pend with deferred select_tangent; multi → translate_vector_selection promote", () => {
    const i = input({
      ui_action: TANGENT_A,
      sub_selection: {
        vertices: [],
        segments: [],
        tangents: [
          [0, 0],
          [5, 0],
        ],
      },
    });
    const d = expectKind(decidePointerDown(i), "pend");
    expect(d.pending.deferred).toEqual({
      kind: "select_tangent",
      node_id: "p1",
      tangent: [0, 0],
      shift: false,
    });
    expect(d.pending.promote_to?.kind).toBe("translate_vector_selection");
  });

  it("singleton-this tangent → translate_tangent_singleton promote (curve gesture)", () => {
    const i = input({
      ui_action: TANGENT_A,
      sub_selection: { vertices: [], segments: [], tangents: [[0, 0]] },
    });
    const d = expectKind(decidePointerDown(i), "pend");
    expect(d.pending.promote_to?.kind).toBe("translate_tangent_singleton");
  });
});

describe("Scenario.HandleTangentToggleOrDrag (ambiguous: would-deselect, shift)", () => {
  const i = input({
    ui_action: TANGENT_A,
    modifiers: SHIFT,
    sub_selection: { vertices: [], segments: [], tangents: [[0, 0]] },
  });

  it("classifies", () => {
    expect(classifyScenario(i)).toBe(Scenario.HandleTangentToggleOrDrag);
  });

  it("dispatches pend with deferred select_tangent (shift=true)", () => {
    const d = expectKind(decidePointerDown(i), "pend");
    expect(d.pending.deferred).toMatchObject({
      kind: "select_tangent",
      shift: true,
    });
  });
});

// ── Segment axis ───────────────────────────────────────────────────────────

describe("Scenario.HandleSegmentReplace (singleton: would-select, no shift)", () => {
  it("classifies — segment ∉ sub-selection", () => {
    const i = input({
      ui_action: SEGMENT_A,
      sub_selection: { vertices: [], segments: [99], tangents: [] },
    });
    expect(classifyScenario(i)).toBe(Scenario.HandleSegmentReplace);
  });

  it("dispatches immediate_select_segment carrying [a_idx, b_idx]", () => {
    const i = input({ ui_action: SEGMENT_A });
    const d = expectKind(decidePointerDown(i), "immediate_select_segment");
    expect(d.mode).toBe("replace");
    expect(d.pending.promote_to).toMatchObject({
      kind: "translate_vector_selection",
      additional_vertex_indices: [0, 1],
    });
  });

  it("Meta + ∉ → bend_segment promote", () => {
    const i = input({
      ui_action: SEGMENT_A,
      modifiers: { ...NO_MODS, meta: true },
    });
    const d = expectKind(decidePointerDown(i), "immediate_select_segment");
    expect(d.pending.promote_to?.kind).toBe("bend_segment");
  });

  // Sticky bend tool (host pushes `bend_mode: "always"`). Equivalent to
  // Meta-held; segment-drag bends regardless of physical key state.
  it("bend_mode 'always' + no Meta + ∉ → bend_segment promote", () => {
    const i = input({ ui_action: SEGMENT_A, bend_mode: "always" });
    const d = expectKind(decidePointerDown(i), "immediate_select_segment");
    expect(d.pending.promote_to?.kind).toBe("bend_segment");
  });

  it("bend_mode 'auto' (default) + no Meta + ∉ → translate (locks the gate)", () => {
    const i = input({ ui_action: SEGMENT_A });
    const d = expectKind(decidePointerDown(i), "immediate_select_segment");
    expect(d.pending.promote_to?.kind).toBe("translate_vector_selection");
  });
});

describe("Scenario.HandleSegmentAdd (singleton: would-select, shift)", () => {
  const i = input({
    ui_action: SEGMENT_A,
    modifiers: SHIFT,
    sub_selection: { vertices: [], segments: [99], tangents: [] },
  });

  it("classifies", () => {
    expect(classifyScenario(i)).toBe(Scenario.HandleSegmentAdd);
  });

  it("dispatches immediate_select_segment with mode: toggle", () => {
    const d = expectKind(decidePointerDown(i), "immediate_select_segment");
    expect(d.mode).toBe("toggle");
  });
});

describe("Scenario.HandleSegmentNarrowOrDrag (ambiguous: would-deselect, no shift)", () => {
  it("classifies — segment ∈ sub-selection", () => {
    const i = input({
      ui_action: SEGMENT_A,
      sub_selection: { vertices: [], segments: [3], tangents: [] },
    });
    expect(classifyScenario(i)).toBe(Scenario.HandleSegmentNarrowOrDrag);
  });

  it("dispatches pend with deferred select_segment + translate_vector_selection promote", () => {
    const i = input({
      ui_action: SEGMENT_A,
      sub_selection: { vertices: [], segments: [3], tangents: [] },
    });
    const d = expectKind(decidePointerDown(i), "pend");
    expect(d.pending.deferred).toEqual({
      kind: "select_segment",
      node_id: "p1",
      segment: 3,
      shift: false,
    });
    expect(d.pending.promote_to).toMatchObject({
      kind: "translate_vector_selection",
      additional_vertex_indices: [],
    });
  });

  // Per user direction: "when point A, B and line AB is selected (3 in
  // total) or similar (A + AB), the intent is always to translate, not
  // bend." Bend is reserved for the strictly-singleton-segment case.
  it("singleton-this segment + Meta → bend_segment promote", () => {
    const i = input({
      ui_action: SEGMENT_A,
      modifiers: { ...NO_MODS, meta: true },
      sub_selection: { vertices: [], segments: [3], tangents: [] },
    });
    const d = expectKind(decidePointerDown(i), "pend");
    expect(d.pending.promote_to?.kind).toBe("bend_segment");
  });

  it("multi/mixed sub-selection + Meta → translate_vector_selection (Meta IGNORED)", () => {
    // "point A, B and line AB" — vertex + segment co-selected. Per user
    // direction, intent is translate, not bend.
    const i = input({
      ui_action: SEGMENT_A,
      modifiers: { ...NO_MODS, meta: true },
      sub_selection: { vertices: [0, 1], segments: [3], tangents: [] },
    });
    const d = expectKind(decidePointerDown(i), "pend");
    expect(d.pending.promote_to?.kind).toBe("translate_vector_selection");
  });

  it("multi-segment + Meta → translate_vector_selection (Meta IGNORED)", () => {
    const i = input({
      ui_action: SEGMENT_A,
      modifiers: { ...NO_MODS, meta: true },
      sub_selection: { vertices: [], segments: [3, 4], tangents: [] },
    });
    const d = expectKind(decidePointerDown(i), "pend");
    expect(d.pending.promote_to?.kind).toBe("translate_vector_selection");
  });
});

describe("Scenario.HandleSegmentToggleOrDrag (ambiguous: would-deselect, shift)", () => {
  const i = input({
    ui_action: SEGMENT_A,
    modifiers: SHIFT,
    sub_selection: { vertices: [], segments: [3], tangents: [] },
  });

  it("classifies", () => {
    expect(classifyScenario(i)).toBe(Scenario.HandleSegmentToggleOrDrag);
  });

  it("dispatches pend with deferred select_segment (shift=true)", () => {
    const d = expectKind(decidePointerDown(i), "pend");
    expect(d.pending.deferred).toEqual({
      kind: "select_segment",
      node_id: "p1",
      segment: 3,
      shift: true,
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Content scenarios (Tier 2 — no body region)
// ════════════════════════════════════════════════════════════════════════════

describe("Scenario.ContentReplace (singleton: would-select, no shift)", () => {
  const i = input({ hovered_id: "b", selection_ids: ["a"] });

  it("classifies", () => {
    expect(classifyScenario(i)).toBe(Scenario.ContentReplace);
  });

  it("dispatches immediate replace", () => {
    const d = expectKind(decidePointerDown(i), "immediate_select");
    expect(d.mode).toBe("replace");
    expect(d.select_ids).toEqual(["b"]);
    expect(d.pending.ids_at_down).toEqual(["b"]);
    expect(d.pending.deferred).toBeUndefined();
  });
});

describe("Scenario.ContentAdd (singleton: would-select, shift)", () => {
  const i = input({
    hovered_id: "b",
    selection_ids: ["a"],
    modifiers: SHIFT,
  });

  it("classifies", () => {
    expect(classifyScenario(i)).toBe(Scenario.ContentAdd);
  });

  it("dispatches immediate toggle-add with combined ids_at_down", () => {
    const d = expectKind(decidePointerDown(i), "immediate_select");
    expect(d.mode).toBe("toggle");
    expect(d.select_ids).toEqual(["b"]);
    expect(d.pending.ids_at_down).toEqual(["b", "a"]);
  });
});

describe("Scenario.ContentNarrowOrDrag (ambiguous: would-deselect, no shift)", () => {
  const i = input({ hovered_id: "a", selection_ids: ["a", "b", "c"] });

  it("classifies", () => {
    expect(classifyScenario(i)).toBe(Scenario.ContentNarrowOrDrag);
  });

  it("dispatches pend with deferred replace-narrow", () => {
    const d = expectKind(decidePointerDown(i), "pend");
    expect(d.pending.deferred).toEqual({
      kind: "select",
      node_id: "a",
      shift: false,
    });
    expect(d.pending.ids_at_down).toEqual(["a", "b", "c"]);
  });
});

describe("Scenario.ContentToggleOrDrag (ambiguous: would-deselect, shift)", () => {
  const i = input({
    hovered_id: "b",
    selection_ids: ["a", "b"],
    modifiers: SHIFT,
  });

  it("classifies", () => {
    expect(classifyScenario(i)).toBe(Scenario.ContentToggleOrDrag);
  });

  it("dispatches pend with deferred toggle-off", () => {
    const d = expectKind(decidePointerDown(i), "pend");
    expect(d.pending.deferred).toEqual({
      kind: "select",
      node_id: "b",
      shift: true,
    });
    expect(d.pending.ids_at_down).toEqual(["a", "b"]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Body-region scenarios (Tier 1 — selection chrome claims drag)
// ════════════════════════════════════════════════════════════════════════════

const BODY: OverlayAction = { kind: "translate_handle", ids: ["a"] };

describe("Scenario.BodyDragOnly (no hover)", () => {
  const i = input({ ui_action: BODY, hovered_id: null, selection_ids: ["a"] });

  it("classifies", () => {
    expect(classifyScenario(i)).toBe(Scenario.BodyDragOnly);
  });

  it("dispatches pend, no deferred", () => {
    const d = expectKind(decidePointerDown(i), "pend");
    expect(d.pending.deferred).toBeUndefined();
    expect(d.pending.ids_at_down).toEqual(["a"]);
  });
});

describe("Scenario.BodyNarrowOrDrag (hover ∈ sel, no shift)", () => {
  const i = input({
    ui_action: BODY,
    hovered_id: "a",
    selection_ids: ["a", "b"],
  });

  it("classifies", () => {
    expect(classifyScenario(i)).toBe(Scenario.BodyNarrowOrDrag);
  });

  it("dispatches pend with deferred narrow-to-self", () => {
    const d = expectKind(decidePointerDown(i), "pend");
    expect(d.pending.deferred).toEqual({
      kind: "select",
      node_id: "a",
      shift: false,
    });
  });
});

describe("Scenario.BodyToggleOrDrag (hover ∈ sel, shift)", () => {
  const i = input({
    ui_action: BODY,
    hovered_id: "a",
    selection_ids: ["a", "b"],
    modifiers: SHIFT,
  });

  it("classifies", () => {
    expect(classifyScenario(i)).toBe(Scenario.BodyToggleOrDrag);
  });

  it("dispatches pend with deferred toggle-off", () => {
    const d = expectKind(decidePointerDown(i), "pend");
    expect(d.pending.deferred).toEqual({
      kind: "select",
      node_id: "a",
      shift: true,
    });
  });
});

describe("Scenario.BodySwapOrDrag (hover ∉ sel, no shift)", () => {
  const i = input({ ui_action: BODY, hovered_id: "b", selection_ids: ["a"] });

  it("classifies", () => {
    expect(classifyScenario(i)).toBe(Scenario.BodySwapOrDrag);
  });

  it("dispatches pend with deferred swap-to-hovered", () => {
    const d = expectKind(decidePointerDown(i), "pend");
    expect(d.pending.deferred).toEqual({
      kind: "select",
      node_id: "b",
      shift: false,
    });
    expect(d.pending.ids_at_down).toEqual(["a"]);
  });
});

describe("Scenario.BodyAddOrDrag (hover ∉ sel, shift) — must DEFER", () => {
  // Regression test: with rect selected and circle on top, shift+pointer-down
  // on the circle previously committed an add immediately, forcing both
  // shapes to drag together. Correct behavior is to defer — both
  // "add circle" (click) and "drag rect with axis-lock" (drag) remain
  // candidate intents until the next event discriminates.
  const RECT_BODY: OverlayAction = {
    kind: "translate_handle",
    ids: ["rect"],
  };
  const i = input({
    ui_action: RECT_BODY,
    hovered_id: "circle",
    selection_ids: ["rect"],
    modifiers: SHIFT,
  });

  it("classifies as BodyAddOrDrag, not ContentAdd", () => {
    expect(classifyScenario(i)).toBe(Scenario.BodyAddOrDrag);
  });

  it("dispatches pend with deferred toggle-add (NOT immediate)", () => {
    const d = expectKind(decidePointerDown(i), "pend");
    expect(d.pending.deferred).toEqual({
      kind: "select",
      node_id: "circle",
      shift: true,
    });
    // Drag (if it happens) translates the EXISTING selection only — the
    // hovered circle hasn't been added yet, so ids_at_down stays at the
    // chrome's set.
    expect(d.pending.ids_at_down).toEqual(["rect"]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Enter-edit
// ════════════════════════════════════════════════════════════════════════════

describe("Scenario.EnterEdit", () => {
  it("classifies dblclick over content", () => {
    expect(classifyScenario(input({ hovered_id: "a", click_count: 2 }))).toBe(
      Scenario.EnterEdit
    );
  });

  it("dispatches enter_edit with the hovered id", () => {
    const d = decidePointerDown(input({ hovered_id: "a", click_count: 2 }));
    expect(d).toEqual({ kind: "enter_edit", id: "a" });
  });

  it("dispatches enter_edit with chrome id when dblclick on body with no hover and single-id chrome", () => {
    const d = decidePointerDown(
      input({ ui_action: BODY, hovered_id: null, click_count: 2 })
    );
    expect(d).toEqual({ kind: "enter_edit", id: "a" });
  });

  it("classifies dblclick on body with hover as EnterEdit (prefers hovered id)", () => {
    const d = decidePointerDown(
      input({ ui_action: BODY, hovered_id: "b", click_count: 2 })
    );
    expect(d).toEqual({ kind: "enter_edit", id: "b" });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Exit-edit (UX spec — "dblclick away" while in content-edit)
//
// Default behavior, locked: while the surface mirrors a vector sub-selection
// (`in_content_edit === true`), a dblclick that does NOT land on a vector
// control (vertex / tangent / segment-strip) classifies as `ExitEdit`. A
// dblclick that lands on a vector control runs its normal handler — exit
// must not steal an intra-edit gesture.
// ════════════════════════════════════════════════════════════════════════════

describe("Scenario.ExitEdit", () => {
  it("classifies dblclick on EMPTY space while in content-edit as ExitEdit", () => {
    // No overlay, no hovered scene id, just a dblclick on canvas background.
    // Without in_content_edit this would be EmptyMarquee — the active
    // sub-selection is what flips it to exit.
    const i = input({ click_count: 2, in_content_edit: true });
    expect(classifyScenario(i)).toBe(Scenario.ExitEdit);
    expect(decidePointerDown(i)).toEqual({ kind: "exit_edit" });
  });

  it("classifies dblclick on a DIFFERENT NODE while in content-edit as ExitEdit (NOT EnterEdit)", () => {
    // Dblclick on another node while editing — user wants out, not to
    // re-enter on this one. The HUD signals exit and lets the host decide
    // whether to select / enter-edit the new node next.
    const i = input({
      hovered_id: "other-node",
      click_count: 2,
      in_content_edit: true,
    });
    expect(classifyScenario(i)).toBe(Scenario.ExitEdit);
    expect(decidePointerDown(i)).toEqual({ kind: "exit_edit" });
  });

  it("classifies dblclick on the editing node's BODY (translate_handle) while in content-edit as ExitEdit", () => {
    // The body region's normal dblclick rule is EnterEdit. In-content-edit
    // overrides — exit takes precedence.
    const BODY: OverlayAction = {
      kind: "translate_handle",
      ids: ["editing-node"],
    };
    const i = input({
      ui_action: BODY,
      hovered_id: null,
      click_count: 2,
      in_content_edit: true,
    });
    expect(classifyScenario(i)).toBe(Scenario.ExitEdit);
  });

  it("does NOT exit on dblclick on a VERTEX handle — that's an intra-edit gesture", () => {
    const VERTEX: OverlayAction = {
      kind: "vertex_handle",
      node_id: "editing-node",
      index: 0,
      pos: [0, 0],
    };
    const i = input({
      ui_action: VERTEX,
      click_count: 2,
      in_content_edit: true,
    });
    expect(classifyScenario(i)).toBe(Scenario.HandleVertexReplace);
  });

  it("does NOT exit on dblclick on a TANGENT handle", () => {
    const TANGENT: OverlayAction = {
      kind: "tangent_handle",
      node_id: "editing-node",
      tangent: [0, 0],
      pos: [0, 0],
    };
    const i = input({
      ui_action: TANGENT,
      click_count: 2,
      in_content_edit: true,
    });
    expect(classifyScenario(i)).toBe(Scenario.HandleTangentReplace);
  });

  it("does NOT exit on dblclick on a SEGMENT_STRIP (select / drag-mode dispatch wins)", () => {
    const STRIP: OverlayAction = {
      kind: "segment_strip",
      node_id: "editing-node",
      segment: 0,
      a_idx: 0,
      b_idx: 1,
      a: [0, 0],
      b: [10, 0],
      a_control: [0, 0],
      b_control: [10, 0],
    };
    const i = input({
      ui_action: STRIP,
      click_count: 2,
      in_content_edit: true,
    });
    expect(classifyScenario(i)).toBe(Scenario.HandleSegmentReplace);
  });

  it("preserves EnterEdit when NOT in content-edit — the rule is gated by in_content_edit", () => {
    // Same input as the "different node" case, but with in_content_edit
    // off → must classify as EnterEdit, NOT ExitEdit. This pins the gate.
    const i = input({
      hovered_id: "other-node",
      click_count: 2,
      in_content_edit: false,
    });
    expect(classifyScenario(i)).toBe(Scenario.EnterEdit);
  });

  it("single-click on empty space while in content-edit does NOT exit — it routes to EmptyClearSubSelectionThenMarquee", () => {
    // Single click on empty while in vector edit must NOT exit. It routes
    // through the in-content-edit empty-space scenario, which clears the
    // sub-selection eagerly and starts a vector marquee on drag.
    const i = input({ click_count: 1, in_content_edit: true });
    expect(classifyScenario(i)).toBe(
      Scenario.EmptyClearSubSelectionThenMarquee
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Empty-space scenarios
// ════════════════════════════════════════════════════════════════════════════

describe("Scenario.EmptyDeselectThenMarquee", () => {
  const i = input({ selection_ids: ["a"] });

  it("classifies", () => {
    expect(classifyScenario(i)).toBe(Scenario.EmptyDeselectThenMarquee);
  });

  it("dispatches marquee_pend with emit_on_down = 'deselect_all'", () => {
    expect(decidePointerDown(i)).toEqual({
      kind: "start_marquee_pend",
      emit_on_down: "deselect_all",
    });
  });
});

// UX spec: empty-space single-click while in content-edit clears the
// path-edit sub-selection without exiting content-edit. Mirrors the
// dblclick ExitEdit rule — same "click outside" gesture, one fewer
// step. Pairs with EmptyDeselectThenMarquee outside content-edit.
describe("Scenario.EmptyClearSubSelectionThenMarquee (empty click in content-edit)", () => {
  const i = input({ selection_ids: ["editing-node"], in_content_edit: true });

  it("classifies", () => {
    expect(classifyScenario(i)).toBe(
      Scenario.EmptyClearSubSelectionThenMarquee
    );
  });

  it("dispatches marquee_pend with emit_on_down = 'clear_vector_selection'", () => {
    expect(decidePointerDown(i)).toEqual({
      kind: "start_marquee_pend",
      emit_on_down: "clear_vector_selection",
    });
  });

  // UX spec: shift-empty-click in content-edit still classifies as
  // additive marquee (no clear). Shift is "extend, don't replace" — it
  // would be wrong to clear the existing sub-selection just because
  // shift was held.
  it("shift still routes to EmptyAdditiveMarquee — additive does NOT clear", () => {
    const sh = input({
      selection_ids: ["editing-node"],
      in_content_edit: true,
      modifiers: SHIFT,
    });
    expect(classifyScenario(sh)).toBe(Scenario.EmptyAdditiveMarquee);
  });
});

describe("Scenario.EmptyMarquee (no shift, no selection)", () => {
  const i = input({});

  it("classifies", () => {
    expect(classifyScenario(i)).toBe(Scenario.EmptyMarquee);
  });

  it("dispatches marquee_pend, no deselect", () => {
    expect(decidePointerDown(i)).toEqual({
      kind: "start_marquee_pend",
      emit_on_down: "none",
    });
  });
});

describe("Scenario.EmptyAdditiveMarquee (shift)", () => {
  const i = input({ selection_ids: ["a"], modifiers: SHIFT });

  it("classifies", () => {
    expect(classifyScenario(i)).toBe(Scenario.EmptyAdditiveMarquee);
  });

  it("dispatches marquee_pend, selection preserved", () => {
    expect(decidePointerDown(i)).toEqual({
      kind: "start_marquee_pend",
      emit_on_down: "none",
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Idle cursor
// ════════════════════════════════════════════════════════════════════════════

describe("decideIdleCursor", () => {
  it("resize_handle on rect shape → tagged resize cursor, baseAngle 0", () => {
    expect(
      decideIdleCursor({
        ui_action: {
          kind: "resize_handle",
          direction: "ne",
          ids: ["a"],
          initial_shape: { kind: "rect", rect: RECT },
        },
        hovered_id: null,
        selection_ids: ["a"],
      })
    ).toEqual({ kind: "resize", direction: "ne", baseAngle: 0 });
  });

  it("resize_handle on transformed shape → baseAngle = matrix screen angle", () => {
    // 90° rotation around (50, 50): cmath.transform.angle returns 90 deg.
    const matrix = cmath.transform.rotate(
      cmath.transform.identity,
      90,
      [50, 50]
    );
    const cursor = decideIdleCursor({
      ui_action: {
        kind: "resize_handle",
        direction: "ne",
        ids: ["a"],
        initial_shape: {
          kind: "transformed",
          local: { x: 0, y: 0, width: 100, height: 100 },
          matrix,
        },
      },
      hovered_id: null,
      selection_ids: ["a"],
    });
    expect(cursor).toMatchObject({ kind: "resize", direction: "ne" });
    if (typeof cursor === "string" || cursor.kind !== "resize") return;
    // 90° = π/2 rad. Allow tiny floating-point slack.
    expect(cursor.baseAngle).toBeCloseTo(Math.PI / 2, 9);
  });

  it("rotate_handle on transformed shape → baseAngle = matrix screen angle", () => {
    const matrix = cmath.transform.rotate(
      cmath.transform.identity,
      30,
      [50, 50]
    );
    const cursor = decideIdleCursor({
      ui_action: {
        kind: "rotate_handle",
        corner: "ne",
        ids: ["a"],
        initial_shape: {
          kind: "transformed",
          local: { x: 0, y: 0, width: 100, height: 100 },
          matrix,
        },
      },
      hovered_id: null,
      selection_ids: ["a"],
    });
    expect(cursor).toMatchObject({ kind: "rotate", corner: "ne" });
    if (typeof cursor === "string" || cursor.kind !== "rotate") return;
    expect(cursor.baseAngle).toBeCloseTo((30 * Math.PI) / 180, 9);
  });

  it("translate_handle → move (regardless of hover)", () => {
    expect(
      decideIdleCursor({
        ui_action: { kind: "translate_handle", ids: ["a"] },
        hovered_id: "b",
        selection_ids: ["a"],
      })
    ).toBe("move");
  });

  it("no UI, hover ∈ selection → move", () => {
    expect(
      decideIdleCursor({
        ui_action: null,
        hovered_id: "a",
        selection_ids: ["a"],
      })
    ).toBe("move");
  });

  it("no UI, hover ∉ selection → default", () => {
    expect(
      decideIdleCursor({
        ui_action: null,
        hovered_id: "b",
        selection_ids: ["a"],
      })
    ).toBe("default");
  });
});
