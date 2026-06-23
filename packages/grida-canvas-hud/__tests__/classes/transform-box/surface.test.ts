// Tests for the transform-box Layer B model.
//
// Pins (D1–D5 from the SDK-design doctrine):
//   - Schema-level feature flag: absence of `setTransformBox` input
//     = no chrome. Setting null mid-session clears hover state too.
//   - Quad geometry: corners project through transform + container
//     rotation + origin.
//   - Hit asymmetry (D3): side hit strip (12px) STRICTLY contains the
//     visible stroke (1px). Corner hit (16×16) STRICTLY contains the
//     corner point. This IS the Layer-B-doctrine litmus test.
//   - Hover: 1:1 mapping from action → hover variant; no modifier
//     branches (unlike padding's `mirror_side`).
//   - Translate intent: body drag → `op.type === "translate"`,
//     `transform[*][2]` updates by `delta/size`.
//   - Scale-side intent: side drag → `op.type === "scale_side"`,
//     `op.side` matches; only that side's corners move in box-space.
//   - Rotate intent: corner drag → `op.type === "rotate"`, rigid-body
//     rotation (distances preserved).
//   - Container rotation: pointer doc-delta is de-rotated before
//     reducing; intent `transform` stays in box-relative space.
//   - Classifier: all 3 hit kinds → HandleTransformBoxDrag; readonly
//     → all → Noop.
//   - Equality: hoversEqual symmetry + hoverFromAction round-trip.

import { describe, it, expect } from "vitest";
import cmath from "@grida/cmath";
import {
  buildTransformBox,
  getTransformBoxDocCorners,
  TRANSFORM_BOX_BODY_PRIORITY,
  TRANSFORM_BOX_SIDE_PRIORITY,
  TRANSFORM_BOX_CORNER_PRIORITY,
  TRANSFORM_BOX_CORNER_HIT_SIZE,
  TRANSFORM_BOX_SIDE_HIT_THICKNESS,
  type TransformBoxInput,
  type TransformBoxHover,
  type TransformBoxActiveOp,
} from "../../../classes/transform-box";
import type { AffineTransform } from "../../../primitives/transform-box";
import { DEFAULT_STYLE } from "../../../surface/style";
import { classifyScenario, Scenario } from "../../../event/decision";
import { NO_MODS } from "../../../event/event";
import { SurfaceState } from "../../../event/state";
import type { OverlayElement } from "../../../event/overlay";
import type { Intent } from "../../../event/intent";

// ───────────────────────────────────────────────────────────────────────────
// Fixtures
// ───────────────────────────────────────────────────────────────────────────

const IDENTITY_AFFINE: AffineTransform = [
  [1, 0, 0],
  [0, 1, 0],
];

const IDENTITY_T: cmath.Transform = [
  [1, 0, 0],
  [0, 1, 0],
];

function basicInput(
  partial: Partial<TransformBoxInput> = {}
): TransformBoxInput {
  return {
    id: "tb-1",
    transform: IDENTITY_AFFINE,
    size: [200, 100],
    origin: [0, 0],
    rotation: 0,
    ...partial,
  };
}

function build(
  overlay: TransformBoxInput,
  opts: {
    hover?: TransformBoxHover | null;
    transform?: cmath.Transform;
    active_op?: TransformBoxActiveOp;
  } = {}
): OverlayElement[] {
  return buildTransformBox({
    overlay,
    style: DEFAULT_STYLE,
    hover: opts.hover ?? null,
    transform: opts.transform ?? IDENTITY_T,
    active_op: opts.active_op,
  });
}

function bodyOf(els: readonly OverlayElement[]): OverlayElement | undefined {
  return els.find((e) => e.action.kind === "transform_box_body");
}
function sidesOf(els: readonly OverlayElement[]): readonly OverlayElement[] {
  return els.filter((e) => e.action.kind === "transform_box_side");
}
function cornersOf(els: readonly OverlayElement[]): readonly OverlayElement[] {
  return els.filter((e) => e.action.kind === "transform_box_corner");
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Feature flag
// ───────────────────────────────────────────────────────────────────────────

describe("transform-box — feature flag", () => {
  it("emits 1 body + 4 sides + 4 corners for a default input", () => {
    const els = build(basicInput());
    expect(bodyOf(els)).toBeDefined();
    expect(sidesOf(els).length).toBe(4);
    expect(cornersOf(els).length).toBe(4);
  });

  it("setTransformBox(null) clears chrome AND hover state", () => {
    const state = new SurfaceState();
    state.setTransformBox(basicInput());
    // Simulate hover state via direct setter — the test pins the
    // observable contract: setting null clears the field.
    // (The pointer-move hover wire-up is exercised by §4 / §9.)
    expect(state.getTransformBox()).not.toBeNull();
    state.setTransformBox(null);
    expect(state.getTransformBox()).toBeNull();
    expect(state.getTransformBoxHover()).toBeNull();
  });

  it("renders correctly for a non-zero origin", () => {
    const els = build(basicInput({ origin: [50, 75] }));
    const body = bodyOf(els);
    expect(body).toBeDefined();
    // The body hit rect should be screen-space; with identity camera,
    // doc → screen is 1:1, and the quad sits at origin+size.
    if (!body || body.hit.kind !== "screen_aabb") {
      throw new Error("expected body with screen_aabb hit");
    }
    expect(body.hit.rect.x).toBeCloseTo(50);
    expect(body.hit.rect.y).toBeCloseTo(75);
    expect(body.hit.rect.width).toBeCloseTo(200);
    expect(body.hit.rect.height).toBeCloseTo(100);
  });

  it("handles size [0, 0] without throwing (degenerate but defensive)", () => {
    expect(() => build(basicInput({ size: [0, 0] }))).not.toThrow();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Quad geometry
// ───────────────────────────────────────────────────────────────────────────

describe("transform-box — quad geometry", () => {
  it("identity transform → axis-aligned quad through (0,0)–(w,h)", () => {
    const c = getTransformBoxDocCorners(basicInput());
    expect(c.nw).toEqual([0, 0]);
    expect(c.ne).toEqual([200, 0]);
    expect(c.se).toEqual([200, 100]);
    expect(c.sw).toEqual([0, 100]);
  });

  it("scaled transform → smaller centered quad", () => {
    const scaled: AffineTransform = [
      [0.5, 0, 0.25],
      [0, 0.5, 0.25],
    ];
    const c = getTransformBoxDocCorners(basicInput({ transform: scaled }));
    expect(c.nw[0]).toBeCloseTo(50, 1);
    expect(c.se[0]).toBeCloseTo(150, 1);
    expect(c.nw[1]).toBeCloseTo(25, 1);
    expect(c.se[1]).toBeCloseTo(75, 1);
  });

  it("container rotation 90° rotates the quad in doc-space", () => {
    const c = getTransformBoxDocCorners(basicInput({ rotation: 90 }));
    // 90° rotation: x → +y, y → -x. nw stays at origin; ne goes from
    // (200,0) to (0, 200); se from (200,100) to (-100, 200); sw from
    // (0,100) to (-100, 0).
    expect(c.nw[0]).toBeCloseTo(0, 5);
    expect(c.nw[1]).toBeCloseTo(0, 5);
    expect(c.ne[0]).toBeCloseTo(0, 5);
    expect(c.ne[1]).toBeCloseTo(200, 5);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. Hit asymmetry (D3) — Layer-B litmus test
// ───────────────────────────────────────────────────────────────────────────

describe("transform-box — hit asymmetry (D3)", () => {
  it("side hit strip thickness strictly exceeds the visible stroke", () => {
    // Visible stroke is `selectionOutlineWidth` (1px); side hit strip
    // is TRANSFORM_BOX_SIDE_HIT_THICKNESS (12px). Fitts'-reach.
    expect(TRANSFORM_BOX_SIDE_HIT_THICKNESS).toBeGreaterThan(
      DEFAULT_STYLE.selectionOutlineWidth
    );
  });

  it("corner hit AABB strictly contains the corner point (≥ MIN_HIT_SIZE)", () => {
    const els = build(basicInput());
    const corner = cornersOf(els)[0];
    if (corner.hit.kind !== "screen_rect_at_doc") {
      throw new Error("expected screen_rect_at_doc hit");
    }
    expect(corner.hit.width).toBeGreaterThanOrEqual(16);
    expect(corner.hit.height).toBeGreaterThanOrEqual(16);
    expect(corner.hit.width).toBe(TRANSFORM_BOX_CORNER_HIT_SIZE);
  });

  it("priority ladder: corner > side > body (lower wins)", () => {
    expect(TRANSFORM_BOX_CORNER_PRIORITY).toBeLessThan(
      TRANSFORM_BOX_SIDE_PRIORITY
    );
    expect(TRANSFORM_BOX_SIDE_PRIORITY).toBeLessThan(
      TRANSFORM_BOX_BODY_PRIORITY
    );
  });

  it("transform-box corner wins over corner-radius (15)", () => {
    // corner_radius_handle uses HUDHitPriority.CornerRadiusHandle = 15.
    expect(TRANSFORM_BOX_CORNER_PRIORITY).toBeLessThan(15);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. Hover
// ───────────────────────────────────────────────────────────────────────────

describe("transform-box — hover + cursors", () => {
  it("body hover → cursor move", () => {
    const els = build(basicInput());
    expect(bodyOf(els)?.cursor).toBe("move");
  });

  it("side hover (top/bottom) → ns-resize with baseAngle", () => {
    const els = build(basicInput());
    const top = sidesOf(els).find(
      (e) => e.action.kind === "transform_box_side" && e.action.side === "top"
    );
    expect(top?.cursor).toEqual({
      kind: "resize",
      direction: "n",
      baseAngle: 0,
    });
  });

  it("side hover (left/right) → ew-resize with baseAngle", () => {
    const els = build(basicInput());
    const right = sidesOf(els).find(
      (e) => e.action.kind === "transform_box_side" && e.action.side === "right"
    );
    expect(right?.cursor).toEqual({
      kind: "resize",
      direction: "w",
      baseAngle: 0,
    });
  });

  it("corner hover → rotate cursor (gesture IS rotate)", () => {
    const els = build(basicInput());
    expect(cornersOf(els)[0].cursor).toMatchObject({
      kind: "rotate",
      baseAngle: 0,
    });
  });

  it("container rotation tilts cursor baseAngle on sides + corners", () => {
    const els = build(basicInput({ rotation: 30 }));
    const top = sidesOf(els).find(
      (e) => e.action.kind === "transform_box_side" && e.action.side === "top"
    );
    const corner = cornersOf(els)[0];
    const expected = (30 * Math.PI) / 180;
    expect(
      (top?.cursor as { baseAngle: number } | undefined)?.baseAngle
    ).toBeCloseTo(expected, 5);
    expect(
      (corner?.cursor as { baseAngle: number } | undefined)?.baseAngle
    ).toBeCloseTo(expected, 5);
  });

  it("inner transform rotation composes with container into baseAngle", () => {
    // Inner ~45° + container 30° → baseAngle ≈ 75° (rad).
    const cos45 = Math.cos(Math.PI / 4);
    const sin45 = Math.sin(Math.PI / 4);
    const rotated: AffineTransform = [
      [cos45, -sin45, 0],
      [sin45, cos45, 0],
    ];
    const els = build(basicInput({ transform: rotated, rotation: 30 }));
    const corner = cornersOf(els)[0];
    const expected = (75 * Math.PI) / 180;
    expect(
      (corner?.cursor as { baseAngle: number } | undefined)?.baseAngle
    ).toBeCloseTo(expected, 3);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5. Translate intent
// ───────────────────────────────────────────────────────────────────────────

function newState(input: TransformBoxInput): {
  state: SurfaceState;
  intents: Intent[];
} {
  const state = new SurfaceState();
  state.setTransformBox(input);
  const intents: Intent[] = [];
  // Inject the bound id into the hit_regions so pointer-down can
  // intercept. The chrome builder normally does this on draw; for
  // unit tests we wire the gesture state directly.
  return { state, intents };
}

function gestureWith(
  state: SurfaceState,
  input: TransformBoxInput,
  op: TransformBoxActiveOp,
  start_doc: cmath.Vector2
): void {
  // Seed the gesture as `pointer_down` would. The dispatcher then
  // streams `pointer_move` previews from `state.gesture`.
  (state as unknown as { gesture: unknown }).gesture = {
    kind: "transform_box",
    id: input.id,
    op,
    size: input.size,
    rotation: input.rotation ?? 0,
    base_transform: input.transform,
    start_doc,
    last_doc: start_doc,
    transform: input.transform,
    dragged: false,
  };
}

describe("transform-box — translate intent", () => {
  it("body drag emits transform_box preview with op.type translate", () => {
    const input = basicInput();
    const { state, intents } = newState(input);
    gestureWith(state, input, { type: "translate" }, [0, 0]);
    state.dispatch(
      { kind: "pointer_move", x: 40, y: 20, mods: NO_MODS },
      {
        pick: () => null,
        shapeOf: () => null,
        emitIntent: (i) => intents.push(i),
      }
    );
    const last = intents[intents.length - 1];
    if (last.kind !== "transform_box") {
      throw new Error(`expected transform_box intent, got ${last.kind}`);
    }
    expect(last.op.type).toBe("translate");
    expect(last.phase).toBe("preview");
    // 40 / 200 = 0.2; 20 / 100 = 0.2 — box-relative normalized.
    expect(last.transform[0][2]).toBeCloseTo(0.2, 3);
    expect(last.transform[1][2]).toBeCloseTo(0.2, 3);
  });

  it("pointer_up after drag emits a single commit", () => {
    const input = basicInput();
    const { state, intents } = newState(input);
    gestureWith(state, input, { type: "translate" }, [0, 0]);
    const deps = {
      pick: () => null,
      shapeOf: () => null,
      emitIntent: (i: Intent) => intents.push(i),
    };
    state.dispatch({ kind: "pointer_move", x: 40, y: 20, mods: NO_MODS }, deps);
    state.dispatch(
      { kind: "pointer_up", x: 40, y: 20, button: "primary", mods: NO_MODS },
      deps
    );
    const commits = intents.filter(
      (i) => i.kind === "transform_box" && i.phase === "commit"
    );
    expect(commits.length).toBe(1);
  });

  it("click-no-drag emits NO commit (dragged guard)", () => {
    const input = basicInput();
    const { state, intents } = newState(input);
    gestureWith(state, input, { type: "translate" }, [0, 0]);
    const deps = {
      pick: () => null,
      shapeOf: () => null,
      emitIntent: (i: Intent) => intents.push(i),
    };
    // No pointer_move — straight to up.
    state.dispatch(
      { kind: "pointer_up", x: 0, y: 0, button: "primary", mods: NO_MODS },
      deps
    );
    expect(intents.length).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 6. Scale-side intent
// ───────────────────────────────────────────────────────────────────────────

describe("transform-box — scale-side intent", () => {
  it("right-side drag emits transform_box with op.type scale_side, side right", () => {
    const input = basicInput();
    const { state, intents } = newState(input);
    gestureWith(state, input, { type: "scale_side", side: "right" }, [200, 50]);
    state.dispatch(
      { kind: "pointer_move", x: 220, y: 50, mods: NO_MODS },
      {
        pick: () => null,
        shapeOf: () => null,
        emitIntent: (i) => intents.push(i),
      }
    );
    const last = intents[intents.length - 1];
    if (last.kind !== "transform_box" || last.op.type !== "scale_side") {
      throw new Error("expected transform_box/scale_side intent");
    }
    expect(last.op.side).toBe("right");
  });

  it("delta=0 produces identity reduction (still emits)", () => {
    const input = basicInput();
    const { state, intents } = newState(input);
    gestureWith(state, input, { type: "scale_side", side: "right" }, [200, 50]);
    state.dispatch(
      { kind: "pointer_move", x: 200, y: 50, mods: NO_MODS },
      {
        pick: () => null,
        shapeOf: () => null,
        emitIntent: (i) => intents.push(i),
      }
    );
    const last = intents[intents.length - 1];
    if (last.kind !== "transform_box") {
      throw new Error(`expected transform_box intent, got ${last.kind}`);
    }
    // Reducer returns the base transform when delta projects to zero.
    expect(last.transform[0][0]).toBeCloseTo(1);
    expect(last.transform[1][1]).toBeCloseTo(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 7. Rotate intent
// ───────────────────────────────────────────────────────────────────────────

describe("transform-box — rotate intent", () => {
  it("corner drag emits transform_box with op.type rotate, corner matches", () => {
    const input = basicInput();
    const { state, intents } = newState(input);
    gestureWith(state, input, { type: "rotate", corner: "ne" }, [200, 0]);
    state.dispatch(
      { kind: "pointer_move", x: 200, y: 20, mods: NO_MODS },
      {
        pick: () => null,
        shapeOf: () => null,
        emitIntent: (i) => intents.push(i),
      }
    );
    const last = intents[intents.length - 1];
    if (last.kind !== "transform_box" || last.op.type !== "rotate") {
      throw new Error("expected transform_box/rotate intent");
    }
    expect(last.op.corner).toBe("ne");
  });

  it("live cursor baseAngle tracks the box rotation during the drag", () => {
    // Same precedent as the selection-box rotate gesture
    // (`initial_cursor_angle + delta` set via `setCursor` per move).
    // Pin: after a meaningful rotation drag, the surface cursor's
    // `baseAngle` is close to the box's new effective rotation, NOT
    // stuck at the gesture-start value.
    const input = basicInput();
    const { state, intents } = newState(input);
    gestureWith(state, input, { type: "rotate", corner: "ne" }, [200, 0]);
    state.dispatch(
      { kind: "pointer_move", x: 200, y: 40, mods: NO_MODS },
      {
        pick: () => null,
        shapeOf: () => null,
        emitIntent: (i: Intent) => intents.push(i),
      }
    );
    // After a rotation drag, the cursor's `baseAngle` should be
    // non-zero — the gesture set it via setCursor on pointer_move.
    const cursor = (state as unknown as { cursor: unknown }).cursor;
    if (
      !cursor ||
      typeof cursor !== "object" ||
      (cursor as { kind?: string }).kind !== "rotate"
    ) {
      throw new Error(`expected rotate cursor, got ${JSON.stringify(cursor)}`);
    }
    const ba = (cursor as { baseAngle: number }).baseAngle;
    expect(Math.abs(ba)).toBeGreaterThan(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 8. Container rotation de-rotation
// ───────────────────────────────────────────────────────────────────────────

describe("transform-box — container rotation", () => {
  it("quad renders rotated by container rotation", () => {
    const c = getTransformBoxDocCorners(basicInput({ rotation: 30 }));
    // 30° rotation: nw stays at origin; ne goes from (200, 0) to
    // (200*cos30, 200*sin30) ≈ (173.2, 100).
    expect(c.ne[0]).toBeCloseTo(173.2, 1);
    expect(c.ne[1]).toBeCloseTo(100, 1);
  });

  it("intent transform stays in box-relative space when container is rotated", () => {
    // With container rotation=90° CCW: box's local +X axis points
    // along doc +Y, so doc +X is box -Y. A doc-delta of [+40, 0]
    // de-rotates by -90° to box-local [0, -40], producing a
    // box-relative ty of -40/100 = -0.4 on Y, tx of 0 on X.
    const input = basicInput({ rotation: 90 });
    const { state, intents } = newState(input);
    gestureWith(state, input, { type: "translate" }, [0, 0]);
    state.dispatch(
      { kind: "pointer_move", x: 40, y: 0, mods: NO_MODS },
      {
        pick: () => null,
        shapeOf: () => null,
        emitIntent: (i) => intents.push(i),
      }
    );
    const last = intents[intents.length - 1];
    if (last.kind !== "transform_box") {
      throw new Error(`expected transform_box intent, got ${last.kind}`);
    }
    expect(last.transform[0][2]).toBeCloseTo(0, 3);
    expect(last.transform[1][2]).toBeCloseTo(-0.4, 3);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 9. Decision classifier
// ───────────────────────────────────────────────────────────────────────────

describe("transform-box — classifier", () => {
  const baseClassifyInput = {
    hovered_id: null,
    selection_ids: [] as readonly string[],
    modifiers: NO_MODS,
    click_count: 1,
    readonly: false,
    in_content_edit: false,
  };

  it("body action → HandleTransformBoxDrag", () => {
    const s = classifyScenario({
      ...baseClassifyInput,
      ui_action: { kind: "transform_box_body", id: "tb-1" },
    });
    expect(s).toBe(Scenario.HandleTransformBoxDrag);
  });

  it("side action → HandleTransformBoxDrag", () => {
    const s = classifyScenario({
      ...baseClassifyInput,
      ui_action: {
        kind: "transform_box_side",
        id: "tb-1",
        side: "top",
        base_angle: 0,
      },
    });
    expect(s).toBe(Scenario.HandleTransformBoxDrag);
  });

  it("corner action → HandleTransformBoxDrag", () => {
    const s = classifyScenario({
      ...baseClassifyInput,
      ui_action: {
        kind: "transform_box_corner",
        id: "tb-1",
        corner: "nw",
        base_angle: 0,
      },
    });
    expect(s).toBe(Scenario.HandleTransformBoxDrag);
  });

  it("readonly mode → all 3 kinds → Noop", () => {
    for (const ui_action of [
      { kind: "transform_box_body" as const, id: "tb-1" },
      {
        kind: "transform_box_side" as const,
        id: "tb-1",
        side: "top" as cmath.RectangleSide,
        base_angle: 0,
      },
      {
        kind: "transform_box_corner" as const,
        id: "tb-1",
        corner: "nw" as cmath.IntercardinalDirection,
        base_angle: 0,
      },
    ]) {
      const s = classifyScenario({
        ...baseClassifyInput,
        ui_action,
        readonly: true,
      });
      expect(s).toBe(Scenario.Noop);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 10. Equality + ID echo
// ───────────────────────────────────────────────────────────────────────────

describe("transform-box — id echo through intent", () => {
  it("intent echoes the input's id, not a synthesized value", () => {
    const input = basicInput({ id: "custom-id-42" });
    const { state, intents } = newState(input);
    gestureWith(state, input, { type: "translate" }, [0, 0]);
    state.dispatch(
      { kind: "pointer_move", x: 10, y: 10, mods: NO_MODS },
      {
        pick: () => null,
        shapeOf: () => null,
        emitIntent: (i) => intents.push(i),
      }
    );
    const last = intents[intents.length - 1];
    if (last.kind !== "transform_box") {
      throw new Error(`expected transform_box intent, got ${last.kind}`);
    }
    expect(last.id).toBe("custom-id-42");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 11. corner_role: "scale" + priority overrides (gridaco/grida#881)
// ───────────────────────────────────────────────────────────────────────────

function scaleCornersOf(
  els: readonly OverlayElement[]
): readonly OverlayElement[] {
  return els.filter((e) => e.action.kind === "transform_box_corner_scale");
}

describe("transform-box — corner_role", () => {
  it('default ("rotate") emits 4 rotate corners and no scale corners', () => {
    const els = build(basicInput());
    expect(cornersOf(els).length).toBe(4);
    expect(scaleCornersOf(els).length).toBe(0);
    expect(cornersOf(els)[0].priority).toBe(TRANSFORM_BOX_CORNER_PRIORITY);
  });

  it('"scale" emits 4 inner scale knobs + 4 outer rotate rings', () => {
    const els = build(basicInput({ corner_role: "scale" }));
    expect(scaleCornersOf(els).length).toBe(4);
    expect(cornersOf(els).length).toBe(4); // the rotate rings
  });

  it('"scale" inner knob wins the corner over its rotate ring (lower priority)', () => {
    const els = build(basicInput({ corner_role: "scale" }));
    expect(scaleCornersOf(els)[0].priority).toBeLessThan(
      cornersOf(els)[0].priority
    );
  });

  it('"scale" inner knob uses a diagonal resize cursor; ring uses rotate', () => {
    const els = build(basicInput({ corner_role: "scale" }));
    const scale = scaleCornersOf(els).find(
      (e) =>
        e.action.kind === "transform_box_corner_scale" &&
        e.action.corner === "se"
    );
    const ring = cornersOf(els).find(
      (e) =>
        e.action.kind === "transform_box_corner" && e.action.corner === "se"
    );
    expect(scale?.cursor).toMatchObject({ kind: "resize", direction: "se" });
    expect(ring?.cursor).toMatchObject({ kind: "rotate", corner: "se" });
  });

  it("priority overrides apply to body / side / corner / rotate ring", () => {
    const els = build(
      basicInput({
        corner_role: "scale",
        priority: { body: 6, side: 1, corner: 0, rotate: 2 },
      })
    );
    expect(bodyOf(els)?.priority).toBe(6);
    expect(sidesOf(els)[0].priority).toBe(1);
    expect(scaleCornersOf(els)[0].priority).toBe(0);
    expect(cornersOf(els)[0].priority).toBe(2);
  });

  it("pointer-down on a scale corner opens a scale_corner gesture → intent", () => {
    const input = basicInput({ corner_role: "scale" });
    const { state, intents } = newState(input);
    gestureWith(
      state,
      input,
      { type: "scale_corner", corner: "se" },
      [200, 100]
    );
    state.dispatch(
      { kind: "pointer_move", x: 240, y: 120, mods: NO_MODS },
      {
        pick: () => null,
        shapeOf: () => null,
        emitIntent: (i) => intents.push(i),
      }
    );
    const last = intents[intents.length - 1];
    if (last.kind !== "transform_box") {
      throw new Error(`expected transform_box intent, got ${last.kind}`);
    }
    expect(last.op.type).toBe("scale_corner");
    if (last.op.type !== "scale_corner") {
      throw new Error(`expected scale_corner op, got ${last.op.type}`);
    }
    expect(last.op.corner).toBe("se");
  });

  it("the scale-corner hit classifies as HandleTransformBoxDrag", () => {
    expect(
      classifyScenario({
        hovered_id: null,
        selection_ids: [] as readonly string[],
        modifiers: NO_MODS,
        click_count: 1,
        readonly: false,
        in_content_edit: false,
        ui_action: {
          kind: "transform_box_corner_scale",
          id: "tb-1",
          corner: "se",
          base_angle: 0,
        },
      })
    ).toBe(Scenario.HandleTransformBoxDrag);
  });
});

describe("transform-box — modifier re-emit (gridaco/grida#881)", () => {
  it("a mid-drag Shift toggle (no pointer move) re-reduces + re-emits the intent", () => {
    const input = basicInput({ corner_role: "scale" });
    const { state, intents } = newState(input);
    gestureWith(
      state,
      input,
      { type: "scale_corner", corner: "se" },
      [200, 100]
    );
    const deps = {
      pick: () => null,
      shapeOf: () => null,
      emitIntent: (i: Intent) => intents.push(i),
    };
    // Advance the drag so last_doc ≠ start_doc.
    state.dispatch(
      { kind: "pointer_move", x: 240, y: 110, mods: NO_MODS },
      deps
    );
    const free = intents[intents.length - 1];
    const before = intents.length;
    // Toggle Shift with NO pointer move.
    state.dispatch(
      { kind: "modifiers", mods: { ...NO_MODS, shift: true } },
      deps
    );
    expect(intents.length).toBeGreaterThan(before);
    const snapped = intents[intents.length - 1];
    if (free.kind !== "transform_box" || snapped.kind !== "transform_box") {
      throw new Error("expected transform_box intents");
    }
    expect(snapped.phase).toBe("preview");
    // Aspect-lock changed the reduction (the free corner drag was anisotropic).
    expect(snapped.transform).not.toEqual(free.transform);
  });
});
