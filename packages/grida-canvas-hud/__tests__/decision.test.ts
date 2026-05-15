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
      initial_rect: RECT,
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
      initial_rect: RECT,
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
    expect(d.pending.deferred).toEqual({ node_id: "a", shift: false });
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
    expect(d.pending.deferred).toEqual({ node_id: "b", shift: true });
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
    expect(d.pending.deferred).toEqual({ node_id: "a", shift: false });
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
    expect(d.pending.deferred).toEqual({ node_id: "a", shift: true });
  });
});

describe("Scenario.BodySwapOrDrag (hover ∉ sel, no shift)", () => {
  const i = input({ ui_action: BODY, hovered_id: "b", selection_ids: ["a"] });

  it("classifies", () => {
    expect(classifyScenario(i)).toBe(Scenario.BodySwapOrDrag);
  });

  it("dispatches pend with deferred swap-to-hovered", () => {
    const d = expectKind(decidePointerDown(i), "pend");
    expect(d.pending.deferred).toEqual({ node_id: "b", shift: false });
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
    expect(d.pending.deferred).toEqual({ node_id: "circle", shift: true });
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
// Empty-space scenarios
// ════════════════════════════════════════════════════════════════════════════

describe("Scenario.EmptyDeselectThenMarquee", () => {
  const i = input({ selection_ids: ["a"] });

  it("classifies", () => {
    expect(classifyScenario(i)).toBe(Scenario.EmptyDeselectThenMarquee);
  });

  it("dispatches marquee_pend with emit_deselect_all", () => {
    expect(decidePointerDown(i)).toEqual({
      kind: "start_marquee_pend",
      emit_deselect_all: true,
    });
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
      emit_deselect_all: false,
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
      emit_deselect_all: false,
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Idle cursor
// ════════════════════════════════════════════════════════════════════════════

describe("decideIdleCursor", () => {
  it("resize_handle → tagged resize cursor", () => {
    expect(
      decideIdleCursor({
        ui_action: {
          kind: "resize_handle",
          direction: "ne",
          ids: ["a"],
          initial_rect: RECT,
        },
        hovered_id: null,
        selection_ids: ["a"],
      })
    ).toEqual({ kind: "resize", direction: "ne" });
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
