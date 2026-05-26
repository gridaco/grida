// Tests for the padding-overlay Layer B model.
//
// Pins:
//   - Schema-level feature flag: absence of `setPaddingOverlay` input
//     = no chrome; absent / zero sides skipped.
//   - Per-side geometry: inset rect from container + padding values.
//   - Hit-priority: handle (12) wins over region (35); region wins
//     over translate body (40); region loses to resize (30/31).
//   - Paint states: idle (no render), hover (paddingHoverPaint),
//     mirror-hover (alt → both sides), selected (paddingSelectedPaint),
//     mirror-selected (alt + active_side → both sides).
//   - Handle visibility: suppressed for active_side; present otherwise.
//   - Intent dispatch: drag emits `padding_handle` preview stream;
//     commit on release; mirror reflects current alt; value clamps.
//   - Classifier: `padding_handle` → HandlePaddingDrag (noop in
//     dispatch — eager intercept in state); `padding_region` → Noop.
//   - Hover derivation: region hover; alt populates mirror_side;
//     handle preempts region.
//   - Semantic group propagation.
//   - Snapshot/equality: hoversEqual variants; identity preserved.

import { describe, it, expect } from "vitest";
import cmath from "@grida/cmath";
import {
  buildPaddingOverlay,
  paddingSideRect,
  projectPaddingValue,
  PADDING_HANDLE_PRIORITY,
  PADDING_REGION_PRIORITY,
  type PaddingOverlayInput,
  type PaddingHover,
} from "../../../classes/padding";
import { DEFAULT_STYLE } from "../../../surface/style";
import {
  classifyScenario,
  decidePointerDown,
  decideIdleCursor,
  Scenario,
} from "../../../event/decision";
import { NO_MODS } from "../../../event/event";
import { SurfaceState } from "../../../event/state";
import { HUDHitPriority } from "../../../event/selection-controls";
import type { OverlayElement } from "../../../event/overlay";
import type { Intent } from "../../../event/intent";

// ───────────────────────────────────────────────────────────────────────────
// Fixtures
// ───────────────────────────────────────────────────────────────────────────

/** 400×300 container at origin with all four sides padded. */
function fourSideOverlay(): PaddingOverlayInput {
  return {
    node_id: "container",
    rect: { x: 0, y: 0, width: 400, height: 300 },
    padding: { top: 24, right: 16, bottom: 32, left: 16 },
  };
}

/** Same container, only `top` padding non-zero. */
function topOnlyOverlay(): PaddingOverlayInput {
  return {
    node_id: "container",
    rect: { x: 0, y: 0, width: 400, height: 300 },
    padding: { top: 24 },
  };
}

const IDENTITY: cmath.Transform = [
  [1, 0, 0],
  [0, 1, 0],
];

function build(
  overlay: PaddingOverlayInput,
  opts: {
    hover?: PaddingHover | null;
    alt?: boolean;
    transform?: cmath.Transform;
    active_side?: cmath.RectangleSide;
  } = {}
): OverlayElement[] {
  return buildPaddingOverlay({
    overlay,
    style: DEFAULT_STYLE,
    hover: opts.hover ?? null,
    alt_held: opts.alt ?? false,
    transform: opts.transform ?? IDENTITY,
    active_side: opts.active_side,
  });
}

function regions(els: readonly OverlayElement[]): readonly OverlayElement[] {
  return els.filter((e) => e.action.kind === "padding_region");
}

function handles(els: readonly OverlayElement[]): readonly OverlayElement[] {
  return els.filter((e) => e.action.kind === "padding_handle");
}

function sideOf(el: OverlayElement): cmath.RectangleSide | undefined {
  if (
    el.action.kind === "padding_region" ||
    el.action.kind === "padding_handle"
  ) {
    return el.action.side;
  }
  return undefined;
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Feature flag — schema-level opt-in
// ───────────────────────────────────────────────────────────────────────────

describe("padding — feature flag (schema-level)", () => {
  it("emits 4 regions + 4 handles for all-sided padding", () => {
    const els = build(fourSideOverlay());
    expect(regions(els).length).toBe(4);
    expect(handles(els).length).toBe(4);
  });

  it("skips sides whose value is 0 or undefined", () => {
    const els = build(topOnlyOverlay());
    expect(regions(els).length).toBe(1);
    expect(handles(els).length).toBe(1);
    expect(sideOf(regions(els)[0])).toBe("top");
  });

  it("emits nothing when all four sides are 0", () => {
    const els = build({
      node_id: "n",
      rect: { x: 0, y: 0, width: 10, height: 10 },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    expect(els.length).toBe(0);
  });

  it("emits nothing when padding object is empty", () => {
    const els = build({
      node_id: "n",
      rect: { x: 0, y: 0, width: 10, height: 10 },
      padding: {},
    });
    expect(els.length).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Geometry — inset rects from container + padding
// ───────────────────────────────────────────────────────────────────────────

describe("padding — geometry", () => {
  it("top side inset rect = full width × top padding", () => {
    const r = paddingSideRect(
      { x: 0, y: 0, width: 400, height: 300 },
      { top: 24, right: 16, bottom: 32, left: 16 },
      "top"
    );
    expect(r).toEqual({ x: 0, y: 0, width: 400, height: 24 });
  });

  it("right side inset rect = right padding × full height, anchored to right edge", () => {
    const r = paddingSideRect(
      { x: 10, y: 20, width: 400, height: 300 },
      { right: 16 },
      "right"
    );
    expect(r).toEqual({ x: 394, y: 20, width: 16, height: 300 });
  });

  it("bottom side inset rect = full width × bottom padding, anchored to bottom edge", () => {
    const r = paddingSideRect(
      { x: 0, y: 0, width: 400, height: 300 },
      { bottom: 32 },
      "bottom"
    );
    expect(r).toEqual({ x: 0, y: 268, width: 400, height: 32 });
  });

  it("left side inset rect = left padding × full height, anchored to left edge", () => {
    const r = paddingSideRect(
      { x: 0, y: 0, width: 400, height: 300 },
      { left: 16 },
      "left"
    );
    expect(r).toEqual({ x: 0, y: 0, width: 16, height: 300 });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. Hit-priority
// ───────────────────────────────────────────────────────────────────────────

describe("padding — hit priority", () => {
  it("handle priority is strictly above region priority (lower wins)", () => {
    expect(PADDING_HANDLE_PRIORITY).toBeLessThan(PADDING_REGION_PRIORITY);
  });

  it("region wins over translate body (PADDING_REGION_PRIORITY < TRANSLATE_BODY)", () => {
    expect(PADDING_REGION_PRIORITY).toBeLessThan(HUDHitPriority.TRANSLATE_BODY);
  });

  it("region loses to resize controls (PADDING_REGION_PRIORITY > RESIZE_HANDLE_CORNER)", () => {
    expect(PADDING_REGION_PRIORITY).toBeGreaterThan(
      HUDHitPriority.RESIZE_HANDLE_CORNER
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. Paint states — idle / hover / mirror-hover / selected / mirror-selected
// ───────────────────────────────────────────────────────────────────────────

describe("padding — paint states", () => {
  function regionFor(
    els: readonly OverlayElement[],
    side: cmath.RectangleSide
  ): OverlayElement {
    const r = regions(els).find((e) => sideOf(e) === side);
    if (!r) throw new Error(`no region for side ${side}`);
    return r;
  }

  it("idle = no render (fillPaint not present, render omitted)", () => {
    const els = build(fourSideOverlay());
    for (const r of regions(els)) {
      expect(r.render).toBeUndefined();
    }
  });

  it("hover on side N → only that side has fillPaint (hover paint)", () => {
    const els = build(fourSideOverlay(), {
      hover: { kind: "padding_region", node_id: "container", side: "top" },
    });
    const top = regionFor(els, "top");
    const bottom = regionFor(els, "bottom");
    if (top.render?.kind !== "doc_polyline") throw new Error("top no render");
    expect(top.render.fillPaint).toEqual(DEFAULT_STYLE.paddingHoverPaint);
    expect(bottom.render).toBeUndefined();
  });

  it("hover on the side's drag HANDLE also paints the side's stripe (handle is part of the side's affordance)", () => {
    const els = build(fourSideOverlay(), {
      hover: { kind: "padding_handle", node_id: "container", side: "top" },
    });
    const top = regionFor(els, "top");
    if (top.render?.kind !== "doc_polyline") throw new Error("top no render");
    expect(top.render.fillPaint).toEqual(DEFAULT_STYLE.paddingHoverPaint);
  });

  it("alt-hover on side N → BOTH N and its opposite get hover paint", () => {
    const els = build(fourSideOverlay(), {
      hover: { kind: "padding_region", node_id: "container", side: "top" },
      alt: true,
    });
    const top = regionFor(els, "top");
    const bottom = regionFor(els, "bottom");
    if (top.render?.kind !== "doc_polyline") throw new Error("top no render");
    if (bottom.render?.kind !== "doc_polyline")
      throw new Error("bottom no render");
    expect(top.render.fillPaint).toEqual(DEFAULT_STYLE.paddingHoverPaint);
    expect(bottom.render.fillPaint).toEqual(DEFAULT_STYLE.paddingHoverPaint);
    // Sides perpendicular to top/bottom stay unpainted.
    expect(regionFor(els, "left").render).toBeUndefined();
    expect(regionFor(els, "right").render).toBeUndefined();
  });

  it("active_side → that side renders a STROKED OUTLINE (no stripe fill); stronger than hover", () => {
    const els = build(fourSideOverlay(), { active_side: "left" });
    const left = regionFor(els, "left");
    if (left.render?.kind !== "doc_polyline") throw new Error("left no render");
    expect(left.render.stroke).toBe(true);
    expect(left.render.fill).toBe(false);
    expect(left.render.color).toBe(DEFAULT_STYLE.paddingSelectedStroke);
    expect(left.render.fillPaint).toBeUndefined();
  });

  it("active_side + alt → BOTH active and its opposite render the STROKED outline", () => {
    const els = build(fourSideOverlay(), { active_side: "left", alt: true });
    const left = regionFor(els, "left");
    const right = regionFor(els, "right");
    if (
      left.render?.kind !== "doc_polyline" ||
      right.render?.kind !== "doc_polyline"
    )
      throw new Error("missing render");
    expect(left.render.stroke).toBe(true);
    expect(left.render.fill).toBe(false);
    expect(left.render.color).toBe(DEFAULT_STYLE.paddingSelectedStroke);
    expect(right.render.stroke).toBe(true);
    expect(right.render.fill).toBe(false);
    expect(right.render.color).toBe(DEFAULT_STYLE.paddingSelectedStroke);
  });

  it("active_side beats hover on the same side — outline wins, no stripe fill", () => {
    const els = build(fourSideOverlay(), {
      active_side: "top",
      hover: { kind: "padding_region", node_id: "container", side: "top" },
    });
    const top = regionFor(els, "top");
    if (top.render?.kind !== "doc_polyline") throw new Error("top no render");
    expect(top.render.stroke).toBe(true);
    expect(top.render.fill).toBe(false);
    expect(top.render.fillPaint).toBeUndefined();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5. Handle visibility — suppressed for active_side
// ───────────────────────────────────────────────────────────────────────────

describe("padding — handle visibility", () => {
  it("ALL handles disappear while a drag is in flight (any active_side suppresses every knob)", () => {
    const els = build(fourSideOverlay(), { active_side: "top" });
    expect(handles(els).length).toBe(0);
  });

  it("no active_side → all 4 handles present", () => {
    const els = build(fourSideOverlay());
    expect(handles(els).length).toBe(4);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 6. Intent dispatch — drag stream + commit
// ───────────────────────────────────────────────────────────────────────────

describe("padding — intent dispatch", () => {
  function setupSurface() {
    const intents: Intent[] = [];
    const state = new SurfaceState();
    state.setTransform(IDENTITY);
    const deps = {
      pick: () => null,
      shapeOf: () => null,
      emitIntent: (i: Intent) => {
        intents.push(i);
      },
    };
    // Register a padding-handle hit region at screen [200, 50] (top edge mid).
    const overlay = fourSideOverlay();
    const els = build(overlay);
    const top_handle = handles(els).find((h) => sideOf(h) === "top")!;
    // Forge a fake registry entry — the gesture-open path reads
    // `ui_action` from the hit-test, so we register the action directly.
    const regions = state.hitRegions();
    regions.push({
      rect: { x: 195, y: 45, width: 20, height: 20 },
      action: top_handle.action,
      priority: PADDING_HANDLE_PRIORITY,
      label: "padding_handle:top",
    });
    return { intents, state, deps };
  }

  it("pointer_down on handle opens gesture; pointer_move emits preview with 2× math", () => {
    const { intents, state, deps } = setupSurface();
    state.dispatch(
      { kind: "pointer_down", x: 200, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch(
      { kind: "pointer_move", x: 200, y: 100, mods: NO_MODS },
      deps
    );
    expect(intents.length).toBe(1);
    expect(intents[0].kind).toBe("padding_handle");
    const i = intents[0] as Extract<Intent, { kind: "padding_handle" }>;
    expect(i.side).toBe("top");
    expect(i.phase).toBe("preview");
    // top: value = 2 × (cursor_y - rect.y) = 2 × (100 - 0) = 200.
    // Handle sits at center of padding strip; padding changes at 2× cursor
    // displacement so the visual knob tracks the cursor 1:1.
    expect(i.value).toBe(200);
    expect(i.mirror).toBe(false);
  });

  it("pointer_up after drag emits commit", () => {
    const { intents, state, deps } = setupSurface();
    state.dispatch(
      { kind: "pointer_down", x: 200, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch(
      { kind: "pointer_move", x: 200, y: 80, mods: NO_MODS },
      deps
    );
    state.dispatch(
      { kind: "pointer_up", x: 200, y: 80, button: "primary", mods: NO_MODS },
      deps
    );
    const commit = intents.find(
      (i) => i.kind === "padding_handle" && i.phase === "commit"
    );
    expect(commit).toBeDefined();
  });

  it("mirror reflects current alt state, live per frame", () => {
    const { intents, state, deps } = setupSurface();
    state.dispatch(
      { kind: "pointer_down", x: 200, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch(
      {
        kind: "pointer_move",
        x: 200,
        y: 80,
        mods: { ...NO_MODS, alt: true },
      },
      deps
    );
    const i = intents[0] as Extract<Intent, { kind: "padding_handle" }>;
    expect(i.mirror).toBe(true);
  });

  it("value clamps to 0 when cursor goes above the top edge", () => {
    const { intents, state, deps } = setupSurface();
    state.dispatch(
      { kind: "pointer_down", x: 200, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch(
      { kind: "pointer_move", x: 200, y: -100, mods: NO_MODS },
      deps
    );
    const i = intents[0] as Extract<Intent, { kind: "padding_handle" }>;
    expect(i.value).toBe(0);
  });

  it("click-no-drag (pointer_down then pointer_up at same point) does NOT emit commit", () => {
    const { intents, state, deps } = setupSurface();
    state.dispatch(
      { kind: "pointer_down", x: 200, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch(
      { kind: "pointer_up", x: 200, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    expect(
      intents.find((i) => i.kind === "padding_handle" && i.phase === "commit")
    ).toBeUndefined();
  });

  it("during drag, gesture is `padding_handle` carrying the dragged side", () => {
    // Pin the HUD-internal source of `active_side` for the chrome
    // builder: the surface reads its own gesture state and passes the
    // dragged side into `buildPaddingOverlay` — no host shadow.
    const { state, deps } = setupSurface();
    state.dispatch(
      { kind: "pointer_down", x: 200, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch(
      { kind: "pointer_move", x: 200, y: 100, mods: NO_MODS },
      deps
    );
    expect(state.gesture).toMatchObject({
      kind: "padding_handle",
      side: "top",
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 7. Decision classifier — padding_handle / padding_region routing
// ───────────────────────────────────────────────────────────────────────────

describe("padding — decision classifier", () => {
  it("`padding_handle` action → HandlePaddingDrag scenario", () => {
    const scenario = classifyScenario({
      ui_action: {
        kind: "padding_handle",
        node_id: "n",
        side: "top",
        rect: { x: 0, y: 0, width: 100, height: 100 },
        initial_value: 10,
      },
      hovered_id: null,
      selection_ids: [],
      modifiers: NO_MODS,
      click_count: 1,
      readonly: false,
    });
    expect(scenario).toBe(Scenario.HandlePaddingDrag);
  });

  it("`padding_region` action falls through to Tier-2 — body is event-transparent", () => {
    // No hovered_id, no selection, no shift → empty-space marquee. The
    // padding_region ui_action does NOT short-circuit classification —
    // only the handle is interactive; the body's stripe / outline never
    // blocks click events on whatever lives behind it.
    const scenario = classifyScenario({
      ui_action: { kind: "padding_region", node_id: "n", side: "top" },
      hovered_id: null,
      selection_ids: [],
      modifiers: NO_MODS,
      click_count: 1,
      readonly: false,
    });
    expect(scenario).toBe(Scenario.EmptyMarquee);
  });

  it("`padding_region` over a selected container → ContentNarrowOrDrag (drag = translate the container)", () => {
    const scenario = classifyScenario({
      ui_action: { kind: "padding_region", node_id: "container", side: "top" },
      hovered_id: "container",
      selection_ids: ["container"],
      modifiers: NO_MODS,
      click_count: 1,
      readonly: false,
    });
    expect(scenario).toBe(Scenario.ContentNarrowOrDrag);
  });

  it("`padding_region` drag dispatches a `pend` whose pending.ids_at_down is the selection (drag → translate)", () => {
    const decision = decidePointerDown({
      ui_action: { kind: "padding_region", node_id: "container", side: "top" },
      hovered_id: "container",
      selection_ids: ["container"],
      modifiers: NO_MODS,
      click_count: 1,
      readonly: false,
    });
    expect(decision).toMatchObject({
      kind: "pend",
      pending: { ids_at_down: ["container"] },
    });
  });

  it("readonly: padding_handle → Noop", () => {
    const scenario = classifyScenario({
      ui_action: {
        kind: "padding_handle",
        node_id: "n",
        side: "top",
        rect: { x: 0, y: 0, width: 100, height: 100 },
        initial_value: 10,
      },
      hovered_id: null,
      selection_ids: [],
      modifiers: NO_MODS,
      click_count: 1,
      readonly: true,
    });
    expect(scenario).toBe(Scenario.Noop);
  });

  it("decideIdleCursor for `padding_handle` → axis-appropriate resize cursor", () => {
    const top_cursor = decideIdleCursor({
      ui_action: {
        kind: "padding_handle",
        node_id: "n",
        side: "top",
        rect: { x: 0, y: 0, width: 100, height: 100 },
        initial_value: 10,
      },
      hovered_id: null,
      selection_ids: [],
    });
    expect(top_cursor).toEqual({ kind: "resize", direction: "n" });

    const left_cursor = decideIdleCursor({
      ui_action: {
        kind: "padding_handle",
        node_id: "n",
        side: "left",
        rect: { x: 0, y: 0, width: 100, height: 100 },
        initial_value: 10,
      },
      hovered_id: null,
      selection_ids: [],
    });
    expect(left_cursor).toEqual({ kind: "resize", direction: "w" });
  });

  it("dispatch HandlePaddingDrag → noop (eager intercept already handled it)", () => {
    const decision = decidePointerDown({
      ui_action: {
        kind: "padding_handle",
        node_id: "n",
        side: "top",
        rect: { x: 0, y: 0, width: 100, height: 100 },
        initial_value: 10,
      },
      hovered_id: null,
      selection_ids: [],
      modifiers: NO_MODS,
      click_count: 1,
      readonly: false,
    });
    expect(decision.kind).toBe("noop");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 8. Hover derivation — SurfaceState integration
// ───────────────────────────────────────────────────────────────────────────

describe("padding — hover derivation", () => {
  function setupHoverable() {
    const state = new SurfaceState();
    state.setTransform(IDENTITY);
    state.hitRegions().push({
      rect: { x: 0, y: 0, width: 400, height: 24 },
      action: { kind: "padding_region", node_id: "container", side: "top" },
      priority: PADDING_REGION_PRIORITY,
      label: "padding_region:top",
    });
    return state;
  }

  it("pointer over region body → PaddingHover with kind 'padding_region'", () => {
    const state = setupHoverable();
    state.dispatch(
      { kind: "pointer_move", x: 100, y: 10, mods: NO_MODS },
      { pick: () => null, shapeOf: () => null, emitIntent: () => undefined }
    );
    const h = state.getPaddingHover();
    expect(h).toEqual({
      kind: "padding_region",
      node_id: "container",
      side: "top",
      mirror_side: undefined,
    });
  });

  it("alt-held over region → mirror_side populated with opposite", () => {
    const state = setupHoverable();
    state.dispatch(
      {
        kind: "pointer_move",
        x: 100,
        y: 10,
        mods: { ...NO_MODS, alt: true },
      },
      { pick: () => null, shapeOf: () => null, emitIntent: () => undefined }
    );
    expect(state.getPaddingHover()).toEqual({
      kind: "padding_region",
      node_id: "container",
      side: "top",
      mirror_side: "bottom",
    });
  });

  it("pointer moves OFF region → hover clears to null", () => {
    const state = setupHoverable();
    const deps = {
      pick: () => null,
      shapeOf: () => null,
      emitIntent: () => undefined,
    };
    state.dispatch(
      { kind: "pointer_move", x: 100, y: 10, mods: NO_MODS },
      deps
    );
    expect(state.getPaddingHover()).not.toBeNull();
    state.dispatch(
      { kind: "pointer_move", x: 100, y: 100, mods: NO_MODS },
      deps
    );
    expect(state.getPaddingHover()).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 9. Semantic group propagation
// ───────────────────────────────────────────────────────────────────────────

describe("padding — semantic group", () => {
  it("every emitted overlay carries the input's `group` field", () => {
    const overlay: PaddingOverlayInput = {
      ...fourSideOverlay(),
      group: "paddingOverlay",
    };
    const els = build(overlay);
    for (const e of els) {
      expect(e.group).toBe("paddingOverlay");
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 10. Value projection — pure math
// ───────────────────────────────────────────────────────────────────────────

describe("padding — projectPaddingValue (2× the handle displacement)", () => {
  const rect = { x: 0, y: 0, width: 100, height: 100 };

  it("top: value = 2 × (cursor_y - rect.y), clamped to [0, height]", () => {
    expect(projectPaddingValue(rect, "top", [50, 30])).toBe(60);
    expect(projectPaddingValue(rect, "top", [50, -10])).toBe(0);
    expect(projectPaddingValue(rect, "top", [50, 200])).toBe(100);
  });

  it("right: value = 2 × ((rect.x + rect.width) - cursor_x), clamped", () => {
    expect(projectPaddingValue(rect, "right", [70, 50])).toBe(60);
    expect(projectPaddingValue(rect, "right", [200, 50])).toBe(0);
    expect(projectPaddingValue(rect, "right", [-10, 50])).toBe(100);
  });

  it("bottom: value = 2 × ((rect.y + rect.height) - cursor_y), clamped", () => {
    expect(projectPaddingValue(rect, "bottom", [50, 70])).toBe(60);
    expect(projectPaddingValue(rect, "bottom", [50, 200])).toBe(0);
    expect(projectPaddingValue(rect, "bottom", [50, -10])).toBe(100);
  });

  it("left: value = 2 × (cursor_x - rect.x), clamped", () => {
    expect(projectPaddingValue(rect, "left", [30, 50])).toBe(60);
    expect(projectPaddingValue(rect, "left", [-10, 50])).toBe(0);
    expect(projectPaddingValue(rect, "left", [200, 50])).toBe(100);
  });

  it("click-no-drag preserves initial value: cursor at handle center (initial/2) → value = initial", () => {
    // Top handle for initial value 40 is at y = 20 (center of 0..40 strip).
    expect(projectPaddingValue(rect, "top", [50, 20])).toBe(40);
    // Right handle for initial value 30 sits at x = 100 - 15 = 85.
    expect(projectPaddingValue(rect, "right", [85, 50])).toBe(30);
  });
});
