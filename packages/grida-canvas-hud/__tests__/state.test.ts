import { describe, it, expect, beforeEach } from "vitest";
import cmath from "@grida/cmath";
import { SurfaceState, type StateDeps } from "../event/state";
import type { Intent } from "../event/intent";
import type { TapOutcome } from "../event/tap";
import type { NodeId, Rect } from "../event/gesture";
import { NO_MODS } from "../event/event";

// ── Stub scene ──────────────────────────────────────────────────────────────
// Three nodes in a horizontal strip, no overlap.
const SCENE: Record<NodeId, Rect> = {
  a: { x: 0, y: 0, width: 100, height: 100 },
  b: { x: 150, y: 0, width: 100, height: 100 },
  c: { x: 300, y: 0, width: 100, height: 100 },
};

function pointInRect(p: [number, number], r: Rect): boolean {
  return (
    p[0] >= r.x &&
    p[0] <= r.x + r.width &&
    p[1] >= r.y &&
    p[1] <= r.y + r.height
  );
}

function makeDeps(): {
  deps: StateDeps;
  intents: Intent[];
  taps: TapOutcome[];
} {
  const intents: Intent[] = [];
  const taps: TapOutcome[] = [];
  const deps: StateDeps = {
    pick: (p) => {
      for (const [id, r] of Object.entries(SCENE)) {
        if (pointInRect([p[0], p[1]], r)) return id;
      }
      return null;
    },
    shapeOf: (id) => {
      const r = SCENE[id];
      return r ? { kind: "rect", rect: r } : null;
    },
    emitIntent: (i) => intents.push(i),
    emitTap: (t) => taps.push(t),
  };
  return { deps, intents, taps };
}

function makeState(selection: NodeId[] = []): SurfaceState {
  const s = new SurfaceState();
  s.setSelection(selection);
  return s;
}

describe("SurfaceState dispatch", () => {
  let state: SurfaceState;
  let deps: StateDeps;
  let intents: Intent[];

  beforeEach(() => {
    state = makeState();
    const m = makeDeps();
    deps = m.deps;
    intents = m.intents;
  });

  it("click on a node emits replace-select intent", () => {
    state.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    expect(intents.length).toBe(1);
    expect(intents[0]).toEqual({
      kind: "select",
      ids: ["a"],
      mode: "replace",
    });
  });

  it("click empty space deselects (when there was a selection)", () => {
    state.setSelection(["a"]);
    state.dispatch(
      {
        kind: "pointer_down",
        x: 500,
        y: 500,
        button: "primary",
        mods: NO_MODS,
      },
      deps
    );
    expect(intents[0]).toEqual({ kind: "deselect_all" });
  });

  // UX spec: empty-space single-click while in content-edit emits
  // `clear_vector_selection` (NOT `deselect_all`). Without this
  // discrimination, the only way to drop a vertex sub-selection would be
  // to exit content-edit entirely — same drop, but loses the editing
  // context. Mirrors the dblclick `exit_content_edit` gesture: same
  // "click outside" interaction, one fewer step, with the more granular
  // outcome.
  it("click empty space WHILE in content-edit emits clear_vector_selection (NOT deselect_all)", () => {
    state.setSelection(["editing-path"]);
    state.setVectorSelection({
      node_id: "editing-path",
      vertices: [0, 1],
      segments: [],
      tangents: [],
    });
    state.dispatch(
      {
        kind: "pointer_down",
        x: 500,
        y: 500,
        button: "primary",
        mods: NO_MODS,
      },
      deps
    );
    expect(intents.length).toBe(1);
    expect(intents[0]).toEqual({ kind: "clear_vector_selection" });
  });

  it("shift-click toggles selection", () => {
    state.setSelection(["a"]);
    state.dispatch(
      {
        kind: "pointer_down",
        x: 200,
        y: 50,
        button: "primary",
        mods: { ...NO_MODS, shift: true },
      },
      deps
    );
    expect(intents[0]).toEqual({
      kind: "select",
      ids: ["b"],
      mode: "toggle",
    });
  });

  it("click on already-selected defers until pointer up", () => {
    state.setSelection(["a"]);
    state.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    expect(intents.length).toBe(0);
    state.dispatch(
      { kind: "pointer_up", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    expect(intents).toEqual([{ kind: "select", ids: ["a"], mode: "replace" }]);
  });

  it("drag selected node → translate preview intents, commit on up", () => {
    state.setSelection(["a"]);
    state.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    // Move past drag threshold.
    state.dispatch({ kind: "pointer_move", x: 60, y: 60, mods: NO_MODS }, deps);
    state.dispatch({ kind: "pointer_move", x: 80, y: 70, mods: NO_MODS }, deps);
    state.dispatch(
      { kind: "pointer_up", x: 80, y: 70, button: "primary", mods: NO_MODS },
      deps
    );

    // Deferred selection cancelled by drag.
    expect(intents.find((i) => i.kind === "select")).toBeUndefined();

    const translates = intents.filter(
      (i): i is Extract<Intent, { kind: "translate" }> => i.kind === "translate"
    );
    expect(translates.length).toBeGreaterThanOrEqual(2);
    const previews = translates.filter((i) => i.phase === "preview");
    const commits = translates.filter((i) => i.phase === "commit");
    expect(previews.length).toBeGreaterThanOrEqual(1);
    expect(commits.length).toBe(1);
    const commit = commits[0];
    expect(commit.dx).toBe(30);
    expect(commit.dy).toBe(20);
  });

  it("dblclick emits enter_content_edit", () => {
    state.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch(
      { kind: "pointer_up", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    // 2nd pointer_down triggers click_count >= 2.
    expect(intents.find((i) => i.kind === "enter_content_edit")).toBeTruthy();
  });

  // ── UX spec: "dblclick to exit content-edit" ──────────────────────────────
  //
  // While a vector sub-selection is mirrored on the surface (set by the host
  // via `setVectorSelection`), a dblclick on anything OTHER than a vector
  // control (vertex / tangent / segment-strip) emits `exit_content_edit`.
  // This is the symmetric exit to `enter_content_edit`. The HUD's mirror
  // stays in lockstep with the host — the surface itself does NOT clear
  // the mirror on the exit signal; the host pushes `setVectorSelection(null)`
  // as its commit of the exit.
  it("dblclick on empty space WHILE in content-edit emits exit_content_edit", () => {
    state.setVectorSelection({
      node_id: "editing",
      vertices: [],
      segments: [],
      tangents: [],
    });
    // Empty space → 500,500 is outside every scene rect, no overlay.
    state.dispatch(
      {
        kind: "pointer_down",
        x: 500,
        y: 500,
        button: "primary",
        mods: NO_MODS,
      },
      deps
    );
    state.dispatch(
      { kind: "pointer_up", x: 500, y: 500, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch(
      {
        kind: "pointer_down",
        x: 500,
        y: 500,
        button: "primary",
        mods: NO_MODS,
      },
      deps
    );
    expect(intents.find((i) => i.kind === "exit_content_edit")).toBeTruthy();
    // Must NOT also fire enter_content_edit — exit and enter are mutually
    // exclusive on the same dblclick.
    expect(
      intents.find((i) => i.kind === "enter_content_edit")
    ).toBeUndefined();
  });

  it("dblclick on a different node WHILE in content-edit emits exit_content_edit (not enter)", () => {
    state.setVectorSelection({
      node_id: "editing",
      vertices: [],
      segments: [],
      tangents: [],
    });
    // Dblclick on scene node "a" (50,50). Without content-edit this would
    // fire enter_content_edit on "a"; with content-edit on it exits the
    // current edit and lets the host decide what to do next.
    state.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch(
      { kind: "pointer_up", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    expect(intents.find((i) => i.kind === "exit_content_edit")).toBeTruthy();
    expect(
      intents.find((i) => i.kind === "enter_content_edit")
    ).toBeUndefined();
  });

  it("dblclick OUTSIDE content-edit still emits enter_content_edit (the gate works both ways)", () => {
    // No setVectorSelection call → in_content_edit defaults to false →
    // dblclick on content classifies as EnterEdit. Pins the gate.
    state.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch(
      { kind: "pointer_up", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    expect(intents.find((i) => i.kind === "enter_content_edit")).toBeTruthy();
    expect(intents.find((i) => i.kind === "exit_content_edit")).toBeUndefined();
  });

  it("drag empty space → marquee preview intents on move, commit on up", () => {
    state.dispatch(
      {
        kind: "pointer_down",
        x: 500,
        y: 500,
        button: "primary",
        mods: NO_MODS,
      },
      deps
    );
    state.dispatch(
      { kind: "pointer_move", x: 550, y: 550, mods: NO_MODS },
      deps
    );
    state.dispatch(
      {
        kind: "pointer_up",
        x: 550,
        y: 550,
        button: "primary",
        mods: NO_MODS,
      },
      deps
    );
    // Every pointer_move emits a preview-phase `marquee_select` so the
    // host can run its hit-test live (cheap for vector content-edit where
    // geometry is already resolved). pointer_up emits the final commit.
    // Both carry the same rect.
    const marqs = intents.filter(
      (i): i is Extract<Intent, { kind: "marquee_select" }> =>
        i.kind === "marquee_select"
    );
    const preview = marqs.find((i) => i.phase === "preview");
    const commit = marqs[marqs.length - 1];
    expect(preview).toBeTruthy();
    expect(preview!.rect.width).toBe(50);
    expect(preview!.rect.height).toBe(50);
    expect(commit).toBeTruthy();
    expect(commit.rect.width).toBe(50);
    expect(commit.rect.height).toBe(50);
    expect(commit.phase).toBe("commit");
  });

  it("hover updates on pointer_move over a node", () => {
    state.dispatch({ kind: "pointer_move", x: 50, y: 50, mods: NO_MODS }, deps);
    expect(state.hover).toBe("a");
    state.dispatch(
      { kind: "pointer_move", x: 200, y: 50, mods: NO_MODS },
      deps
    );
    expect(state.hover).toBe("b");
    state.dispatch(
      { kind: "pointer_move", x: 500, y: 500, mods: NO_MODS },
      deps
    );
    expect(state.hover).toBeNull();
  });

  it("hit-region (resize handle) takes precedence on pointer_down", () => {
    const regions = state.hitRegions();
    regions.push({
      rect: { x: 95, y: 95, width: 10, height: 10 },
      action: {
        kind: "resize_handle",
        direction: "se",
        ids: ["a"],
        initial_shape: { kind: "rect", rect: SCENE.a },
      },
      priority: 31,
      label: "resize_handle:se",
    });
    state.dispatch(
      {
        kind: "pointer_down",
        x: 100,
        y: 100,
        button: "primary",
        mods: NO_MODS,
      },
      deps
    );
    // Gesture should be resize, not a select intent.
    expect(state.gesture.kind).toBe("resize");
    expect(intents.find((i) => i.kind === "select")).toBeUndefined();
  });

  // ── Rotate gesture: cursor tracks rotation (Phase A.5) ───────────────────
  //
  // Regression test: before A.5, the cursor was set once at `start_rotate`
  // (no `baseAngle`) and the rotate `pointer_move` arm never touched the
  // cursor again. The user saw the rotation arrow frozen at the
  // gesture-start orientation while the element rotated under it.

  it("rotate pointer_move updates cursor baseAngle to track rotation", () => {
    // Set up an active rotate gesture directly — the chrome / hit-region
    // wiring needed to drive this through `pointer_down` is more setup
    // than this unit needs to assert.
    state.gesture = {
      kind: "rotate",
      ids: ["a"],
      corner: "ne",
      center_doc: [50, 50],
      anchor_angle: 0, // anchor: pointer was to the right of center
      current_angle: 0,
      initial_cursor_angle: 0,
    };

    // Pointer drag: from right-of-center (angle 0) to below-center
    // (angle π/2). Delta = π/2; cursor's baseAngle = initial(0) + delta(π/2).
    const r1 = state.dispatch(
      { kind: "pointer_move", x: 50, y: 100, mods: NO_MODS },
      deps
    );
    expect(state.cursor).toEqual({
      kind: "rotate",
      corner: "ne",
      baseAngle: Math.PI / 2,
    });
    expect(r1.cursorChanged).toBe(true);
  });

  it("rotate sub-bucket pointer drift does NOT fire cursorChanged", () => {
    // The `cursorEquals` bucket size (0.5° = π/360) means tiny pointer
    // drift inside one bucket must not re-emit the cursor — otherwise
    // the host repaints needlessly on every frame.
    state.gesture = {
      kind: "rotate",
      ids: ["a"],
      corner: "se",
      center_doc: [50, 50],
      anchor_angle: 0,
      current_angle: 0,
      initial_cursor_angle: 0,
    };
    state.dispatch(
      { kind: "pointer_move", x: 50, y: 100, mods: NO_MODS },
      deps
    );
    // Same pointer position again — cursor identical, no change.
    const r2 = state.dispatch(
      { kind: "pointer_move", x: 50, y: 100, mods: NO_MODS },
      deps
    );
    expect(r2.cursorChanged).toBeFalsy();
  });

  // ── Resize on transformed shape: local-frame math ────────────────────────
  //
  // Drag the SE corner of a 100×100 rect rotated 90° around its center.
  // World delta (+10, +10) maps to local delta (+10, -10) under 90° CCW
  // (y-up math; visually CW in y-down screen). SE corner extends both x
  // (width +) and y (height +) in local space, so after this drag:
  //   local.width  = 100 + (+10) = 110
  //   local.height = 100 + (-10) = 90
  // The matrix is preserved unchanged. The emitted intent's `rect` field
  // is the doc-space AABB of the new transformed shape (legacy hosts
  // ignore `shape` and consume `rect`); `shape` carries the local truth.

  it("resize pointer_move applies delta in the LOCAL frame for transformed shapes", () => {
    const local: Rect = { x: 0, y: 0, width: 100, height: 100 };
    // 90° rotation around the rect center.
    const matrix = cmath.transform.rotate(
      cmath.transform.identity,
      90,
      [50, 50]
    );
    const initial_shape = { kind: "transformed" as const, local, matrix };

    state.gesture = {
      kind: "resize",
      ids: ["a"],
      direction: "se",
      initial_shape,
      anchor_doc: [0, 0],
      last_doc: [0, 0],
      current_shape: initial_shape,
      preview_shape: initial_shape,
    };

    state.dispatch({ kind: "pointer_move", x: 10, y: 10, mods: NO_MODS }, deps);

    expect(state.gesture.kind).toBe("resize");
    if (state.gesture.kind !== "resize") return;
    const next = state.gesture.current_shape;
    expect(next.kind).toBe("transformed");
    if (next.kind !== "transformed") return;
    // World (+10, +10) → local (+10, -10) under R(90° CCW around center).
    expect(next.local.width).toBeCloseTo(110, 6);
    expect(next.local.height).toBeCloseTo(90, 6);
    // Matrix preserved (rotation unchanged by resize).
    expect(next.matrix).toEqual(matrix);

    // Intent carries both AABB (`rect`) and full shape (`shape`).
    const last = intents[intents.length - 1];
    expect(last.kind).toBe("resize");
    if (last.kind !== "resize") return;
    expect(last.shape).toEqual(next);
  });

  // ── Resize: mid-drag Alt toggle refreshes the dashed preview ──
  //
  // The host redrives its resize on an Alt flip even with the pointer at
  // rest, so the HUD must refresh `preview_shape` on the same `modifiers`
  // event — otherwise the dashed box lags the anchor switch until the next
  // pointer move (the exact flow this feature supports).
  it("resize: Alt toggle with no pointer move refreshes preview_shape (center), current_shape unchanged", () => {
    const initial = {
      kind: "rect" as const,
      rect: { x: 0, y: 0, width: 100, height: 50 },
    };
    state.gesture = {
      kind: "resize",
      ids: ["a"],
      direction: "se",
      initial_shape: initial,
      anchor_doc: [0, 0],
      last_doc: [0, 0],
      current_shape: initial,
      preview_shape: initial,
    };

    // Drag SE by (20, 10), no modifier → opposite-anchored.
    state.dispatch({ kind: "pointer_move", x: 20, y: 10, mods: NO_MODS }, deps);
    if (state.gesture.kind !== "resize") return;
    expect(state.gesture.current_shape).toEqual({
      kind: "rect",
      rect: { x: 0, y: 0, width: 120, height: 60 },
    });
    expect(state.gesture.preview_shape).toEqual(state.gesture.current_shape);

    // Toggle Alt with the pointer at rest (no pointer_move).
    const res = state.dispatch(
      { kind: "modifiers", mods: { ...NO_MODS, alt: true } },
      deps
    );
    expect(res.needsRedraw).toBe(true);
    if (state.gesture.kind !== "resize") return;
    // current_shape (intent dims) is anchor-independent — unchanged.
    expect(state.gesture.current_shape).toEqual({
      kind: "rect",
      rect: { x: 0, y: 0, width: 120, height: 60 },
    });
    // preview_shape is now symmetric about the initial center.
    expect(state.gesture.preview_shape).toEqual({
      kind: "rect",
      rect: { x: -20, y: -10, width: 140, height: 70 },
    });

    // Release Alt → preview snaps back to the opposite-anchored shape.
    state.dispatch({ kind: "modifiers", mods: NO_MODS }, deps);
    if (state.gesture.kind !== "resize") return;
    expect(state.gesture.preview_shape).toEqual(state.gesture.current_shape);
  });

  // ── Rotate gesture: cursor composes initial + delta on transformed ──
  //
  // For a transformed selection at θ_initial, mid-gesture cursor should
  // be `θ_initial + delta`, not just `delta`. Regression cover for
  // pre-A.5 bug where the cursor snapped back to the corner's static
  // orientation on rotated selections.

  it("rotate cursor on transformed selection = initial_cursor_angle + delta", () => {
    // Set up a rotate gesture as if the selection was already at 90°
    // before the user grabbed the rotation handle.
    state.gesture = {
      kind: "rotate",
      ids: ["a"],
      corner: "ne",
      center_doc: [50, 50],
      anchor_angle: 0,
      current_angle: 0,
      initial_cursor_angle: Math.PI / 2, // selection was already rotated 90°
    };

    // Drag the pointer to angle π/4 from center (delta = π/4).
    // Pointer at (75 + 50, 25 + 50) ≈ atan2(25-50, 75-50) — let's just
    // use a clean point: (50 + 1, 50 + 1) → atan2(1, 1) = π/4.
    state.dispatch({ kind: "pointer_move", x: 51, y: 51, mods: NO_MODS }, deps);

    // Expected: baseAngle = initial (π/2) + delta (π/4) = 3π/4.
    expect(state.cursor).toMatchObject({ kind: "rotate", corner: "ne" });
    if (typeof state.cursor === "string" || state.cursor.kind !== "rotate")
      return;
    expect(state.cursor.baseAngle).toBeCloseTo((3 * Math.PI) / 4, 9);
  });
});

// ── Tap outcome (observe-only press+release) ─────────────────────────────────
//
// A tap is the surface's report that a discrete press+release landed at a
// document-space point over a particular node (or empty canvas), WITHOUT it
// being a drag. It is observe-only — delivered through `emitTap`, never the
// intent stream — so a host can anchor a tap-driven tool to the click point
// and scope it to the hit without the surface mutating selection. Only the
// surface owns the press/release stream, the camera, and the click-vs-drag
// discrimination, so only the surface can report this fact.
describe("SurfaceState tap outcome", () => {
  let state: SurfaceState;
  let deps: StateDeps;
  let intents: Intent[];
  let taps: TapOutcome[];

  beforeEach(() => {
    state = makeState();
    const m = makeDeps();
    deps = m.deps;
    intents = m.intents;
    taps = m.taps;
  });

  type Btn = "primary" | "secondary" | "middle";
  const down = (x: number, y: number, button: Btn = "primary") =>
    state.dispatch({ kind: "pointer_down", x, y, button, mods: NO_MODS }, deps);
  const up = (x: number, y: number, button: Btn = "primary") =>
    state.dispatch({ kind: "pointer_up", x, y, button, mods: NO_MODS }, deps);
  const move = (x: number, y: number) =>
    state.dispatch({ kind: "pointer_move", x, y, mods: NO_MODS }, deps);

  // UX spec: a primary click-no-drag on a node taps with the down point and
  // the node hit. This is the base case the whole contract exists for — a
  // tap-driven tool wants "a click landed at P; the topmost hit was N." The
  // surface resolves the hit via the host's own `pick`, so the host observes
  // the same node the surface saw.
  it("primary click-no-drag on a node taps with the down point and hit id", () => {
    down(50, 50);
    up(50, 50);
    expect(taps).toEqual([
      { point: [50, 50], button: "primary", hit: "a", mods: NO_MODS },
    ]);
  });

  // UX spec: a tap on an ALREADY-SELECTED node — which commits selection on
  // pointer-UP via the deferred drag-candidate path — still reports the
  // pointer-DOWN point, not the up point. This is the test that justifies the
  // whole contract living in the surface: the down and up points differ by up
  // to the drag threshold, and only the surface still holds the down point at
  // commit time. A host watching pointer-up would anchor its UI to the wrong
  // place by a few pixels every time.
  it("tap on already-selected node (deferred, commits on up) reports the DOWN point, not the up point", () => {
    state.setSelection(["a"]);
    down(50, 50);
    // Sub-threshold wobble between down and up (2px < 3px threshold): the
    // selection still commits on up (it's a click, not a drag), and the tap
    // must report the DOWN point (50,50), not the up point (52,51).
    move(52, 51);
    up(52, 51);
    // The deferred select still fired (it was a click) …
    expect(intents).toEqual([{ kind: "select", ids: ["a"], mode: "replace" }]);
    // … and the tap reports the DOWN point.
    expect(taps).toEqual([
      { point: [50, 50], button: "primary", hit: "a", mods: NO_MODS },
    ]);
  });

  // UX spec: a primary drag past the threshold is a gesture, not a tap — it
  // emits NO tap. The whole point of the drag-vs-click discriminator is that
  // dragging expresses a different intent (translate / marquee); a tap-driven
  // tool must not fire mid-drag or on drag-release.
  it("primary drag past threshold emits NO tap", () => {
    state.setSelection(["a"]);
    down(50, 50);
    move(60, 60); // 14px > 3px threshold → promotes to translate gesture
    move(80, 70);
    up(80, 70);
    expect(taps).toEqual([]);
  });

  // UX spec: a SECONDARY (right-button) drag past the threshold also emits NO
  // tap. Regression guard: a secondary press never creates a `pending`, so the
  // primary gesture-promotion path cannot drop its tap candidate — the
  // candidate must be dropped by the button-agnostic drag-cancel in
  // `onPointerMove`. Without it, a right-button drag mis-fires as a context
  // click at the down point (a tap-driven tool would treat a drag as a click).
  it("secondary drag past threshold emits NO tap", () => {
    down(50, 50, "secondary");
    move(60, 60); // 14px > 3px threshold
    move(80, 70);
    up(80, 70, "secondary");
    expect(taps).toEqual([]);
  });

  // UX spec: a secondary click taps AND leaves selection untouched. A
  // right-click-driven tool (context action) needs the same "click landed at
  // P over N" fact, but the secondary button must never mutate selection —
  // the surface is not a selection store, and a context click changing the
  // selection out from under the user is the classic right-click bug. The tap
  // is the ONLY thing a secondary click produces.
  it("secondary click taps AND emits no select (selection unchanged)", () => {
    state.setSelection(["a"]);
    down(200, 50, "secondary"); // over node "b", which is NOT selected
    up(200, 50, "secondary");
    expect(intents).toEqual([]); // selection untouched
    expect(taps).toEqual([
      { point: [200, 50], button: "secondary", hit: "b", mods: NO_MODS },
    ]);
  });

  // UX spec: the middle button is pan, not a click — it produces NO tap. The
  // requested outcome is button-agnostic across primary/secondary, but the
  // middle button is reserved for panning the viewport; firing a tap there
  // would mis-report a pan-start as a click.
  it("middle-button press emits NO tap", () => {
    down(50, 50, "middle");
    up(50, 50, "middle");
    expect(taps).toEqual([]);
  });

  // UX spec: an empty-canvas click taps with `hit: null`. The host's
  // tap-driven tool must be able to distinguish "clicked node N" from
  // "clicked empty canvas" — which it can't do from `deselect_all` alone (a
  // selection that happened to become empty is indistinguishable from an
  // empty-canvas click). The tap carries the point AND the null hit.
  it("empty-canvas click taps with hit: null", () => {
    down(500, 500); // no node there
    up(500, 500);
    expect(taps).toEqual([
      { point: [500, 500], button: "primary", hit: null, mods: NO_MODS },
    ]);
  });
});

// UX spec: SurfaceState.isInteracting() captures the "interaction phase"
// — the seam chrome uses to gate preview-only affordances. Preview
// overlays (ghost insertion knob today; any future hover-derived
// preview tomorrow) appear in `false` and vanish in `true`. The flag
// flips on the FIRST pointer event of an interaction (not on the
// drag-threshold crossing) — the user has expressed intent the moment
// they press the mouse.
describe("SurfaceState.isInteracting() (interaction phase)", () => {
  it("is false in pristine idle state", () => {
    const s = new SurfaceState();
    expect(s.isInteracting()).toBe(false);
  });

  it("flips true on pointer_down that defers (pending pointer-down)", () => {
    const s = makeState(["a"]);
    const { deps } = makeDeps();
    // Pointer-down on a selected node defers (drag-vs-toggle ambiguous).
    s.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    expect(s.isInteracting()).toBe(true);
  });

  it("flips back to false on pointer_up (click-no-drag)", () => {
    const s = makeState(["a"]);
    const { deps } = makeDeps();
    s.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    s.dispatch(
      { kind: "pointer_up", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    expect(s.isInteracting()).toBe(false);
  });

  it("requests a redraw on the idle → active transition (chrome must re-render to hide previews)", () => {
    const s = makeState(["a"]);
    const { deps } = makeDeps();
    const r = s.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    expect(r.needsRedraw).toBe(true);
  });
});
