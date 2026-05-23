// Tests for the SurfaceState gesture state machine on vector overlays:
// tangent drag, segment-strip click → split, segment-strip drag → bend.
//
// Covers chunks A+B+C HUD wiring. The chrome's render is tested separately
// in vector-chrome-extended.test.ts.

import { describe, it, expect } from "vitest";
import { SurfaceState, type StateDeps } from "../event/state";
import type { Intent } from "../event/intent";
import { NO_MODS } from "../event/event";
import { HitRegions } from "../event/hit-regions";

function makeDeps(): { deps: StateDeps; intents: Intent[] } {
  const intents: Intent[] = [];
  const deps: StateDeps = {
    pick: () => null,
    shapeOf: () => null,
    emitIntent: (i) => intents.push(i),
  };
  return { deps, intents };
}

/**
 * Manually push a hit region into the surface's HitRegions registry. The
 * surface itself only populates hit-regions via `fanOverlays`, which runs
 * in `draw()` — but `draw()` requires a real canvas. For state-machine
 * tests, the simpler path is to seed the registry directly.
 */
function seedHitRegion(
  state: SurfaceState,
  region: Parameters<HitRegions["push"]>[0]
): void {
  state.hitRegions().push(region);
}

describe("translate_tangent gesture", () => {
  it("pointer_down on tangent_handle starts translate_tangent + emits select_tangent", () => {
    const state = new SurfaceState();
    const { deps, intents } = makeDeps();
    seedHitRegion(state, {
      rect: { x: 90, y: 90, width: 20, height: 20 },
      action: {
        kind: "tangent_handle",
        node_id: "p1",
        tangent: [2, 0],
        pos: [100, 100],
      },
      priority: 4,
      label: "tangent:2:0",
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
    expect(intents).toEqual([
      {
        kind: "select_tangent",
        node_id: "p1",
        tangent: [2, 0],
        mode: "replace",
      },
    ]);
    expect(state.gesture.kind).toBe("translate_tangent");
  });

  it("pointer_move emits set_tangent preview with absolute pos", () => {
    const state = new SurfaceState();
    const { deps, intents } = makeDeps();
    seedHitRegion(state, {
      rect: { x: 90, y: 90, width: 20, height: 20 },
      action: {
        kind: "tangent_handle",
        node_id: "p1",
        tangent: [0, 1],
        pos: [100, 100],
      },
      priority: 4,
      label: "tangent:0:1",
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
    intents.length = 0;
    state.dispatch(
      { kind: "pointer_move", x: 130, y: 140, mods: NO_MODS },
      deps
    );
    expect(intents).toEqual([
      {
        kind: "set_tangent",
        node_id: "p1",
        tangent: [0, 1],
        pos: [130, 140],
        mirror: "auto",
        phase: "preview",
      },
    ]);
  });

  it("pointer_up emits set_tangent commit", () => {
    const state = new SurfaceState();
    const { deps, intents } = makeDeps();
    seedHitRegion(state, {
      rect: { x: 90, y: 90, width: 20, height: 20 },
      action: {
        kind: "tangent_handle",
        node_id: "p1",
        tangent: [0, 0],
        pos: [100, 100],
      },
      priority: 4,
      label: "tangent:0:0",
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
    state.dispatch(
      { kind: "pointer_move", x: 110, y: 100, mods: NO_MODS },
      deps
    );
    intents.length = 0;
    state.dispatch(
      { kind: "pointer_up", x: 110, y: 100, button: "primary", mods: NO_MODS },
      deps
    );
    expect(intents).toEqual([
      {
        kind: "set_tangent",
        node_id: "p1",
        tangent: [0, 0],
        pos: [110, 100],
        mirror: "auto",
        phase: "commit",
      },
    ]);
    expect(state.gesture.kind).toBe("idle");
  });

  it("click-no-drag on tangent_handle does NOT emit set_tangent on pointer_up (select-only)", () => {
    // Regression: `translate_tangent` is an absolute-position gesture
    // (commit writes `last_doc`). When the user presses without moving,
    // committing would snap the control point to the cursor's down
    // position — typically a few px off the knob center (Fitts'). The
    // user intent on a no-drag press is "select only".
    //
    // Vertex doesn't have this bug because `translate_vertex` is
    // delta-based — dx=dy=0 on no-move is a natural no-op.
    const state = new SurfaceState();
    const { deps, intents } = makeDeps();
    seedHitRegion(state, {
      rect: { x: 90, y: 90, width: 20, height: 20 },
      action: {
        kind: "tangent_handle",
        node_id: "p1",
        tangent: [0, 0],
        // Knob center at (100, 100); cursor lands at (103, 101) (within
        // the Fitts'-tolerant hit area, not pixel-perfect).
        pos: [100, 100],
      },
      priority: 4,
      label: "tangent:0:0",
    });
    state.dispatch(
      {
        kind: "pointer_down",
        x: 103,
        y: 101,
        button: "primary",
        mods: NO_MODS,
      },
      deps
    );
    // pointer-down emits select_tangent (the doctrine's ∉ singleton path).
    expect(intents).toEqual([
      {
        kind: "select_tangent",
        node_id: "p1",
        tangent: [0, 0],
        mode: "replace",
      },
    ]);
    intents.length = 0;
    // pointer-up at the SAME doc position — no pointer_move fired.
    state.dispatch(
      { kind: "pointer_up", x: 103, y: 101, button: "primary", mods: NO_MODS },
      deps
    );
    // NO set_tangent emit — gesture cleanly closes without mutation.
    expect(intents).toEqual([]);
    expect(state.gesture.kind).toBe("idle");
  });
});

describe("vector_hover derivation from idle pointer_move", () => {
  it("idle pointer_move over vertex_handle sets vector_hover to vertex", () => {
    const state = new SurfaceState();
    const { deps } = makeDeps();
    seedHitRegion(state, {
      rect: { x: 40, y: 40, width: 20, height: 20 },
      action: {
        kind: "vertex_handle",
        node_id: "p1",
        index: 3,
        pos: [50, 50],
      },
      priority: 5,
      label: "vertex:3",
    });
    state.dispatch({ kind: "pointer_move", x: 50, y: 50, mods: NO_MODS }, deps);
    expect(state.getVectorHover()).toEqual({
      kind: "vertex",
      node_id: "p1",
      index: 3,
    });
  });

  it("idle pointer_move over segment_strip sets vector_hover to segment (midpoint mode pins t=0.5)", () => {
    const state = new SurfaceState();
    const { deps } = makeDeps();
    seedHitRegion(state, {
      rect: { x: 40, y: 40, width: 20, height: 20 },
      action: {
        kind: "segment_strip",
        node_id: "p1",
        segment: 2,
        a_idx: 0,
        b_idx: 1,
        a: [40, 50],
        b: [60, 50],
        a_control: [40, 50],
        b_control: [60, 50],
      },
      priority: 8,
      label: "segment:2",
    });
    // Default insertion mode is `"midpoint"` — t is pinned to 0.5
    // regardless of cursor position along the segment.
    state.dispatch({ kind: "pointer_move", x: 45, y: 50, mods: NO_MODS }, deps);
    const vh = state.getVectorHover();
    expect(vh?.kind).toBe("segment");
    if (vh?.kind !== "segment") throw new Error();
    expect(vh.node_id).toBe("p1");
    expect(vh.segment).toBe(2);
    expect(vh.t).toBe(0.5);
  });

  it("`projected` mode tracks the cursor along the curve", () => {
    const state = new SurfaceState();
    state.setVectorInsertionMode("projected");
    const { deps } = makeDeps();
    seedHitRegion(state, {
      rect: { x: 40, y: 40, width: 20, height: 20 },
      action: {
        kind: "segment_strip",
        node_id: "p1",
        segment: 2,
        a_idx: 0,
        b_idx: 1,
        a: [40, 50],
        b: [60, 50],
        a_control: [40, 50],
        b_control: [60, 50],
      },
      priority: 8,
      label: "segment:2",
    });
    // Cursor at the midpoint — symmetric degenerate cubic still yields
    // t=0.5 by symmetry, but the mode flag flowed through (verified
    // separately below by moving the cursor and asserting t changes).
    state.dispatch({ kind: "pointer_move", x: 50, y: 50, mods: NO_MODS }, deps);
    const t_mid = (state.getVectorHover() as { t: number }).t;
    expect(t_mid).toBeCloseTo(0.5, 6);
    // Move the cursor — in `projected` mode, t must change.
    state.dispatch({ kind: "pointer_move", x: 58, y: 50, mods: NO_MODS }, deps);
    const t_right = (state.getVectorHover() as { t: number }).t;
    expect(t_right).toBeGreaterThan(t_mid);
  });

  it("idle pointer_move over empty space clears vector_hover", () => {
    const state = new SurfaceState();
    const { deps } = makeDeps();
    seedHitRegion(state, {
      rect: { x: 40, y: 40, width: 20, height: 20 },
      action: {
        kind: "vertex_handle",
        node_id: "p1",
        index: 3,
        pos: [50, 50],
      },
      priority: 5,
      label: "vertex:3",
    });
    state.dispatch({ kind: "pointer_move", x: 50, y: 50, mods: NO_MODS }, deps);
    state.dispatch(
      { kind: "pointer_move", x: 200, y: 200, mods: NO_MODS },
      deps
    );
    expect(state.getVectorHover()).toBeNull();
  });

  it("midpoint mode: moving within the same segment keeps `t = 0.5` (no chrome thrash)", () => {
    // Default `"midpoint"` mode pins the insertion point regardless of
    // cursor — the chrome doesn't need to repaint as the cursor drifts
    // along the segment.
    const state = new SurfaceState();
    const { deps } = makeDeps();
    seedHitRegion(state, {
      rect: { x: 0, y: 40, width: 200, height: 30 },
      action: {
        kind: "segment_strip",
        node_id: "p1",
        segment: 0,
        a_idx: 0,
        b_idx: 1,
        a: [0, 50],
        b: [100, 50],
        a_control: [0, 50],
        b_control: [100, 50],
      },
      priority: 8,
      label: "segment:0",
    });
    state.dispatch({ kind: "pointer_move", x: 30, y: 50, mods: NO_MODS }, deps);
    expect((state.getVectorHover() as { t: number }).t).toBe(0.5);
    const r2 = state.dispatch(
      { kind: "pointer_move", x: 70, y: 50, mods: NO_MODS },
      deps
    );
    expect((state.getVectorHover() as { t: number }).t).toBe(0.5);
    // Hover identity didn't change → no redraw thrash for in-segment drift.
    expect(r2.needsRedraw).toBe(false);
  });

  // UX spec: the ghost insertion knob is a FIRST-CLASS paired control —
  // its own hit region with its own action kind. Hover identity flips
  // structurally as the cursor moves between the segment body and the
  // ghost knob (different hit region wins → different VectorHover
  // discriminator). No proximity sidecar; no boolean flag inside the
  // segment variant — the hit_regions registry IS the source of truth.
  it("hover discriminator flips from 'segment' to 'ghost' as the cursor moves between the body and the knob", () => {
    const state = new SurfaceState();
    const { deps } = makeDeps();
    // Straight segment from (0,50) → (100,50). Midpoint (50,50).
    // Seed BOTH regions — the ghost at the midpoint with higher priority,
    // the segment body covering the rest. This is exactly what
    // `buildVectorChrome` produces while a segment is hovered.
    seedHitRegion(state, {
      rect: { x: 0, y: 40, width: 200, height: 30 },
      action: {
        kind: "segment_strip",
        node_id: "p1",
        segment: 0,
        a_idx: 0,
        b_idx: 1,
        a: [0, 50],
        b: [100, 50],
        a_control: [0, 50],
        b_control: [100, 50],
      },
      priority: 8,
      label: "segment:0",
    });
    seedHitRegion(state, {
      rect: { x: 42, y: 42, width: 16, height: 16 }, // 16px AABB around (50,50)
      action: {
        kind: "ghost_handle",
        node_id: "p1",
        segment: 0,
        a_idx: 0,
        b_idx: 1,
        a: [0, 50],
        b: [100, 50],
        a_control: [0, 50],
        b_control: [100, 50],
      },
      priority: 7,
      label: "ghost:0",
    });

    // Cursor at (30, 50) — inside segment AABB, outside ghost AABB →
    // segment wins → vector_hover.kind === "segment".
    state.dispatch({ kind: "pointer_move", x: 30, y: 50, mods: NO_MODS }, deps);
    const far = state.getVectorHover();
    expect(far?.kind).toBe("segment");

    // Cursor at (50, 50) — inside both, ghost outranks → vector_hover.kind
    // === "ghost".
    state.dispatch({ kind: "pointer_move", x: 50, y: 50, mods: NO_MODS }, deps);
    const near = state.getVectorHover();
    expect(near?.kind).toBe("ghost");
  });

  // UX spec: in `"projected"` mode the chrome positions the ghost at the
  // cursor's projection each frame. As long as the host re-builds chrome
  // before the cursor leaves the ghost's AABB, hover stays on the ghost.
  // The lower-level invariant tested here: a hit on `ghost_handle`
  // produces `vector_hover.kind === "ghost"` regardless of insertion mode.
  it("hit on a ghost_handle region produces vector_hover.kind === 'ghost'", () => {
    const state = new SurfaceState();
    state.setVectorInsertionMode("projected");
    const { deps } = makeDeps();
    seedHitRegion(state, {
      rect: { x: 22, y: 42, width: 16, height: 16 }, // around (30,50)
      action: {
        kind: "ghost_handle",
        node_id: "p1",
        segment: 0,
        a_idx: 0,
        b_idx: 1,
        a: [0, 50],
        b: [100, 50],
        a_control: [0, 50],
        b_control: [100, 50],
      },
      priority: 7,
      label: "ghost:0",
    });
    state.dispatch({ kind: "pointer_move", x: 30, y: 50, mods: NO_MODS }, deps);
    const vh = state.getVectorHover();
    expect(vh?.kind).toBe("ghost");
  });

  it("projected mode: moving within the same segment updates `t` and requests redraw (ghost vertex follows cursor)", () => {
    const state = new SurfaceState();
    state.setVectorInsertionMode("projected");
    const { deps } = makeDeps();
    seedHitRegion(state, {
      rect: { x: 0, y: 40, width: 200, height: 30 },
      action: {
        kind: "segment_strip",
        node_id: "p1",
        segment: 0,
        a_idx: 0,
        b_idx: 1,
        a: [0, 50],
        b: [100, 50],
        a_control: [0, 50],
        b_control: [100, 50],
      },
      priority: 8,
      label: "segment:0",
    });
    state.dispatch({ kind: "pointer_move", x: 30, y: 50, mods: NO_MODS }, deps);
    const t_first = (state.getVectorHover() as { t: number }).t;
    const r2 = state.dispatch(
      { kind: "pointer_move", x: 70, y: 50, mods: NO_MODS },
      deps
    );
    const t_second = (state.getVectorHover() as { t: number }).t;
    expect(t_second).not.toBeCloseTo(t_first, 3);
    expect(r2.needsRedraw).toBe(true);
  });
});

describe("segment_strip / ghost_handle pointer-down — select / split / bend", () => {
  // Straight horizontal segment from (40, 50) → (60, 50). Two seed
  // helpers — segment-only (off-ghost clicks) and ghost-only
  // (on-ghost clicks). Chrome always emits BOTH while a segment is
  // hovered, but the tests seed selectively to isolate which region
  // claims the click.
  function seed_segment(state: SurfaceState): void {
    seedHitRegion(state, {
      rect: { x: 40, y: 40, width: 20, height: 20 },
      action: {
        kind: "segment_strip",
        node_id: "p1",
        segment: 3,
        a_idx: 0,
        b_idx: 1,
        a: [40, 50],
        b: [60, 50],
        a_control: [40, 50],
        b_control: [60, 50],
      },
      priority: 8,
      label: "segment:3",
    });
  }
  function seed_ghost(state: SurfaceState): void {
    seedHitRegion(state, {
      rect: { x: 42, y: 42, width: 16, height: 16 }, // 16px around (50,50)
      action: {
        kind: "ghost_handle",
        node_id: "p1",
        segment: 3,
        a_idx: 0,
        b_idx: 1,
        a: [40, 50],
        b: [60, 50],
        a_control: [40, 50],
        b_control: [60, 50],
      },
      priority: 7,
      label: "ghost:3",
    });
  }
  // Legacy alias — older tests reference `seed`.
  const seed = seed_segment;
  void seed;

  const DOWN_X = 50;
  const DOWN_Y = 50;
  const EXPECTED_T = 0.5;

  // UX spec: segment selection is IMMEDIATE at pointer-down — parity
  // with vertex/tangent control points (which already select eagerly via
  // `start_translate_*`). Click-no-drag leaves the segment selected;
  // pointer-up no longer needs to re-emit anything.
  it("pointer_down on segment_strip fires select_segment IMMEDIATELY", () => {
    const state = new SurfaceState();
    const { deps, intents } = makeDeps();
    seed(state);
    state.dispatch(
      {
        kind: "pointer_down",
        x: DOWN_X,
        y: DOWN_Y,
        button: "primary",
        mods: NO_MODS,
      },
      deps
    );
    expect(intents.length).toBe(1);
    const sel = intents[0];
    if (sel.kind !== "select_segment") {
      throw new Error(`expected select_segment, got ${sel.kind}`);
    }
    expect(sel.node_id).toBe("p1");
    expect(sel.segment).toBe(3);
    expect(sel.mode).toBe("replace");
    expect(state.gesture.kind).toBe("idle");
  });

  // UX spec: split fires ONLY when the click lands on the ghost knob —
  // matches Figma / Illustrator / our prior editor where the half-point
  // marker is the explicit insertion control, not the whole segment.
  // Without this gate, every segment click would silently insert a
  // vertex, making it impossible to select a segment without mutating it.
  it("midpoint mode: click OFF the ghost fires select_segment (not split)", () => {
    const state = new SurfaceState();
    const { deps, intents } = makeDeps();
    // Seed BOTH regions — mirrors what `buildVectorChrome` produces while
    // a segment is hovered. The priority ladder (ghost=7 wins inside its
    // 16px AABB, segment=8 wins outside it) is what gates the routing.
    seed_segment(state);
    seed_ghost(state);
    // Segment AABB = (40, 40, 20, 20); ghost AABB = (42, 42, 16, 16)
    // (centered on midpoint (50, 50)). Click at (41, 50) — inside the
    // segment AABB, OUTSIDE the ghost AABB → segment wins → split MUST
    // NOT fire; select_segment fires instead.
    state.dispatch(
      {
        kind: "pointer_move",
        x: 41,
        y: 50,
        mods: NO_MODS,
      },
      deps
    );
    state.dispatch(
      {
        kind: "pointer_down",
        x: 41,
        y: 50,
        button: "primary",
        mods: NO_MODS,
      },
      deps
    );
    state.dispatch(
      {
        kind: "pointer_up",
        x: 41,
        y: 50,
        button: "primary",
        mods: NO_MODS,
      },
      deps
    );
    expect(intents.length).toBe(1);
    const got = intents[0];
    if (got.kind !== "select_segment") {
      throw new Error(`expected select_segment, got ${got.kind}`);
    }
    expect(got.node_id).toBe("p1");
    expect(got.segment).toBe(3);
    expect(got.mode).toBe("replace");
  });

  // UX spec: clicking the ghost knob itself splits — the user has
  // expressed explicit intent ("I want a vertex HERE"). Mirrors a real
  // vertex click: the cursor is on the control, and the control's action
  // fires.
  it("midpoint mode: click ON the ghost (at t=0.5) fires split_segment", () => {
    const state = new SurfaceState();
    const { deps, intents } = makeDeps();
    seed_ghost(state);
    state.dispatch(
      {
        kind: "pointer_down",
        x: DOWN_X,
        y: DOWN_Y,
        button: "primary",
        mods: NO_MODS,
      },
      deps
    );
    state.dispatch(
      {
        kind: "pointer_up",
        x: DOWN_X,
        y: DOWN_Y,
        button: "primary",
        mods: NO_MODS,
      },
      deps
    );
    expect(intents.length).toBe(1);
    const split = intents[0];
    if (split.kind !== "split_segment") throw new Error("expected split");
    expect(split.node_id).toBe("p1");
    expect(split.segment).toBe(3);
    expect(split.t).toBeCloseTo(EXPECTED_T, 6);
  });

  // UX spec: default segment-body drag (no modifier) is a TRANSLATE of
  // the sub-selection, NOT a bend. Mirrors the main editor's default
  // cursor-tool behavior (`ve.onDragStart()` in
  // `surface-vector-editor.tsx:339`). Bend is reserved for Meta-down
  // (covered below).
  it("segment-body drag WITHOUT Meta promotes to translate_vector_selection + emits preview", () => {
    const state = new SurfaceState();
    const { deps, intents } = makeDeps();
    seed_segment(state);
    state.dispatch(
      {
        kind: "pointer_down",
        x: DOWN_X,
        y: DOWN_Y,
        button: "primary",
        mods: NO_MODS,
      },
      deps
    );
    state.dispatch({ kind: "pointer_move", x: 80, y: 60, mods: NO_MODS }, deps);
    expect(state.gesture.kind).toBe("translate_vector_selection");
    const t = intents.find((i) => i.kind === "translate_vector_selection");
    if (t?.kind !== "translate_vector_selection") throw new Error();
    expect(t.node_id).toBe("p1");
    // Carries the dragged segment's endpoints so the host can union with
    // its sub-selection — even though `select_segment` already fired at
    // pointer-down, the host's mirror may not have echoed back yet.
    expect(t.additional_vertex_indices).toEqual([0, 1]);
    expect(t.dx).toBe(80 - DOWN_X);
    expect(t.dy).toBe(60 - DOWN_Y);
    expect(t.phase).toBe("preview");
    // Bend must NOT fire on the default-mode drag path.
    expect(intents.find((i) => i.kind === "bend_segment")).toBeUndefined();
  });

  it("after segment-body default drag, pointer_up fires translate_vector_selection commit", () => {
    const state = new SurfaceState();
    const { deps, intents } = makeDeps();
    seed_segment(state);
    state.dispatch(
      {
        kind: "pointer_down",
        x: DOWN_X,
        y: DOWN_Y,
        button: "primary",
        mods: NO_MODS,
      },
      deps
    );
    state.dispatch({ kind: "pointer_move", x: 80, y: 60, mods: NO_MODS }, deps);
    intents.length = 0;
    state.dispatch(
      { kind: "pointer_up", x: 80, y: 60, button: "primary", mods: NO_MODS },
      deps
    );
    expect(intents.length).toBe(1);
    const commit = intents[0];
    if (commit.kind !== "translate_vector_selection") throw new Error();
    expect(commit.dx).toBe(80 - DOWN_X);
    expect(commit.dy).toBe(60 - DOWN_Y);
    expect(commit.phase).toBe("commit");
    expect(intents.find((i) => i.kind === "select_segment")).toBeUndefined();
  });

  // UX spec: holding Meta during a segment-body drag switches the
  // promotion to `bend_segment`. Mirrors the main editor's bend-tool
  // keybind (`hotkeys.tsx:200-224`).
  it("segment-body drag WITH Meta promotes to bend_segment + emits preview", () => {
    const state = new SurfaceState();
    const { deps, intents } = makeDeps();
    seed_segment(state);
    const META = { ...NO_MODS, meta: true };
    state.dispatch(
      {
        kind: "pointer_down",
        x: DOWN_X,
        y: DOWN_Y,
        button: "primary",
        mods: META,
      },
      deps
    );
    state.dispatch({ kind: "pointer_move", x: 80, y: 60, mods: META }, deps);
    expect(state.gesture.kind).toBe("bend_segment");
    const bend = intents.find((i) => i.kind === "bend_segment");
    if (bend?.kind !== "bend_segment") throw new Error();
    // Bend pivot `ca` is the cursor's projection at pointer-down — at
    // (50, 50) on a (40,50)→(60,50) segment this is t = 0.5 by symmetry.
    expect(bend.ca).toBeCloseTo(EXPECTED_T, 6);
    expect(bend.cb).toEqual([80, 60]);
    expect(bend.phase).toBe("preview");
  });

  // UX spec (REGRESSION — the original bug): bend pivot is the cursor's
  // projected `t` at pointer-down, mode-INDEPENDENT. Insertion mode
  // governs the ghost preview position and split-`t`, but MUST NOT
  // govern the bend pivot. Pre-fix, `vector_insertion_mode = "midpoint"`
  // pinned `ca = 0.5` regardless of where the user grabbed.
  it("bend pivot is the projected t at drag-start, not 0.5 — even in midpoint mode", () => {
    const state = new SurfaceState();
    // Explicit: midpoint mode is the default; restate for documentation.
    state.setVectorInsertionMode("midpoint");
    const { deps, intents } = makeDeps();
    seed_segment(state);
    const META = { ...NO_MODS, meta: true };
    // Cursor at (58, 50) — well off the (50, 50) midpoint of the
    // segment. The projection lands clearly to the right of t=0.5
    // (Newton-Raphson on a degenerate-cubic-from-straight-segment yields
    // ~0.80 here — the exact value isn't what matters; the point is
    // "shifted toward the cursor end" and "not 0.5"). Pre-fix this was
    // 0.5 regardless of cursor.
    state.dispatch(
      { kind: "pointer_down", x: 58, y: 50, button: "primary", mods: META },
      deps
    );
    state.dispatch({ kind: "pointer_move", x: 70, y: 65, mods: META }, deps);
    const bend = intents.find((i) => i.kind === "bend_segment");
    if (bend?.kind !== "bend_segment") throw new Error();
    expect(bend.ca).toBeGreaterThan(0.7);
    expect(bend.ca).not.toBeCloseTo(0.5, 2);
  });

  it("midpoint mode (default): split `t` is 0.5 regardless of click position", () => {
    const state = new SurfaceState();
    const { deps, intents } = makeDeps();
    seed_ghost(state);
    // Click anywhere inside the ghost's hit AABB — under `midpoint` mode
    // `t` is pinned to 0.5 regardless of cursor coordinates.
    state.dispatch(
      { kind: "pointer_down", x: 42, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch(
      { kind: "pointer_up", x: 42, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    const split = intents[0];
    if (split.kind !== "split_segment") throw new Error();
    expect(split.t).toBe(0.5);
  });

  it("projected mode: split `t` is the cursor's projection (NOT 0.5)", () => {
    const state = new SurfaceState();
    state.setVectorInsertionMode("projected");
    const { deps, intents } = makeDeps();
    seed_ghost(state);
    // Click toward the right end of the ghost AABB — under `projected`
    // mode the resolved `t` shifts toward 1, NOT 0.5.
    state.dispatch(
      { kind: "pointer_down", x: 58, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch(
      { kind: "pointer_up", x: 58, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    const split = intents[0];
    if (split.kind !== "split_segment") throw new Error();
    expect(split.t).toBeGreaterThan(0.5);
  });
});

// UX spec: press on the ghost knob = "insert AND grab" in a single
// pointer pass. The host receives `split_segment` synchronously on
// pointer_down, inserts the vertex, and pushes the new index into the
// selection mirror. The surface reads the mirror back and opens a
// translate_vertex gesture against the new index. A subsequent drag
// emits `translate_vertices` for the new vertex — no separate
// pointer-up/pointer-down round-trip needed to grab what you just
// inserted. Matches Figma's pen/segment-add behaviour.
describe("ghost split-and-drag (eager insert + translate)", () => {
  // Test fixture: a host that echoes setVectorSelection synchronously
  // when it sees a split_segment intent. Mirrors svg-editor's actual
  // `handle_split_segment` behaviour, which inserts the new vertex AND
  // pushes the selection mirror back to the HUD in the same call stack.
  function makeSplitEchoingDeps(state: SurfaceState): {
    deps: StateDeps;
    intents: Intent[];
  } {
    const intents: Intent[] = [];
    const NEW_VERTEX_IDX = 99;
    const deps: StateDeps = {
      pick: () => null,
      shapeOf: () => null,
      emitIntent: (i) => {
        intents.push(i);
        if (i.kind === "split_segment") {
          state.setVectorSelection({
            node_id: i.node_id,
            vertices: [NEW_VERTEX_IDX],
            segments: [],
            tangents: [],
          });
        }
      },
    };
    return { deps, intents };
  }

  function seed_ghost_at(
    state: SurfaceState,
    cx: number,
    cy: number,
    segment: number
  ): void {
    state.hitRegions().push({
      rect: { x: cx - 8, y: cy - 8, width: 16, height: 16 },
      action: {
        kind: "ghost_handle",
        node_id: "p1",
        segment,
        a_idx: 0,
        b_idx: 1,
        a: [cx - 10, cy],
        b: [cx + 10, cy],
        a_control: [cx - 10, cy],
        b_control: [cx + 10, cy],
      },
      priority: 7,
      label: `ghost:${segment}`,
    });
  }

  it("emits split_segment IMMEDIATELY at pointer_down (not deferred to pointer_up)", () => {
    const state = new SurfaceState();
    const { deps, intents } = makeSplitEchoingDeps(state);
    seed_ghost_at(state, 50, 50, 3);
    state.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    // The split fires synchronously inside dispatch — before pointer_up.
    expect(intents.length).toBe(1);
    expect(intents[0].kind).toBe("split_segment");
  });

  it("opens a translate_vertex gesture targeting the newly-inserted vertex (no separate press required)", () => {
    const state = new SurfaceState();
    const { deps } = makeSplitEchoingDeps(state);
    seed_ghost_at(state, 50, 50, 3);
    state.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    // Gesture is `translate_vertex`, indices = the index the host echoed
    // into the selection mirror in response to the split.
    expect(state.gesture.kind).toBe("translate_vertex");
    if (state.gesture.kind !== "translate_vertex") throw new Error();
    expect(state.gesture.indices).toEqual([99]);
  });

  it("drag immediately after pointer_down emits translate_vertices for the new vertex", () => {
    const state = new SurfaceState();
    const { deps, intents } = makeSplitEchoingDeps(state);
    seed_ghost_at(state, 50, 50, 3);
    state.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch({ kind: "pointer_move", x: 80, y: 60, mods: NO_MODS }, deps);
    const tv = intents.find(
      (i) => i.kind === "translate_vertices" && i.phase === "preview"
    );
    if (tv?.kind !== "translate_vertices") throw new Error("expected preview");
    expect(tv.indices).toEqual([99]);
    expect(tv.dx).toBe(30);
    expect(tv.dy).toBe(10);
  });

  it("press-no-drag leaves the vertex inserted (commit fires with zero delta)", () => {
    // Click-without-move IS a valid outcome: the user just wanted to
    // insert. The translate gesture closes with a zero-delta commit,
    // which the host treats as no-op semantically (the split's history
    // entry stands alone).
    const state = new SurfaceState();
    const { deps, intents } = makeSplitEchoingDeps(state);
    seed_ghost_at(state, 50, 50, 3);
    state.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch(
      { kind: "pointer_up", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    const split = intents.find((i) => i.kind === "split_segment");
    const commit = intents.find(
      (i) => i.kind === "translate_vertices" && i.phase === "commit"
    );
    expect(split).toBeDefined();
    if (commit?.kind !== "translate_vertices") throw new Error();
    expect(commit.dx).toBe(0);
    expect(commit.dy).toBe(0);
    expect(commit.indices).toEqual([99]);
  });

  // UX-spec / regression: in the browser, hosts that go through React /
  // history / d-reconcile may not push setVectorSelection synchronously
  // inside `emitIntent(split_segment)` — the echo can land slightly
  // later (microtask, RAF, React commit). The surface MUST NOT assume
  // synchronous timing: it has to work as long as the mirror has
  // settled BY THE TIME the first pointer_move fires. Reproduces the
  // browser-observed "splits but not selected, drag is no-op" bug.
  it("works when the host echoes the new vertex AFTER emitIntent returns (delayed echo)", () => {
    const state = new SurfaceState();
    const intents: Intent[] = [];
    // Holds the host's deferred echo callback. The {fn} indirection
    // sidesteps TS's reachability narrowing — a bare `let cb: (() =>
    // void) | null = null` gets pinned to `null` after the closure
    // assignment because TS can't see emitIntent runs synchronously
    // during dispatch().
    const pending_echo: { fn: (() => void) | null } = { fn: null };
    const NEW_VERTEX_IDX = 42;
    const deps: StateDeps = {
      pick: () => null,
      shapeOf: () => null,
      emitIntent: (i) => {
        intents.push(i);
        if (i.kind === "split_segment") {
          // Host hasn't pushed selection yet — it queued the push.
          pending_echo.fn = () => {
            state.setVectorSelection({
              node_id: i.node_id,
              vertices: [NEW_VERTEX_IDX],
              segments: [],
              tangents: [],
            });
          };
        }
      },
    };
    seed_ghost_at(state, 50, 50, 3);
    state.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    // At this point the gesture has STARTED but indices is still [].
    // The host hasn't echoed yet. Without lazy resolution, the surface
    // would emit translate_vertices with indices=[] on the next move,
    // and the host's translate handler would do nothing.
    expect(state.gesture.kind).toBe("translate_vertex");
    if (state.gesture.kind !== "translate_vertex") throw new Error();
    expect(state.gesture.indices).toEqual([]);

    // Host's deferred echo settles BEFORE the first pointer_move
    // (matches the real-world cadence: a microtask / RAF runs before
    // the next browser pointer event reaches us).
    pending_echo.fn?.();

    // Now drag — the surface should resolve indices from the mirror.
    state.dispatch({ kind: "pointer_move", x: 80, y: 60, mods: NO_MODS }, deps);
    const tv = intents.find(
      (i) => i.kind === "translate_vertices" && i.phase === "preview"
    );
    if (tv?.kind !== "translate_vertices") {
      throw new Error("expected translate_vertices preview");
    }
    expect(tv.indices).toEqual([NEW_VERTEX_IDX]);
    expect(tv.dx).toBe(30);
    expect(tv.dy).toBe(10);

    // Indices are now locked into the gesture state (no re-read on
    // subsequent moves).
    if (state.gesture.kind !== "translate_vertex") throw new Error();
    expect(state.gesture.indices).toEqual([NEW_VERTEX_IDX]);
  });

  it("ghost press does NOT promote to bend (bend is segment-body-only)", () => {
    const state = new SurfaceState();
    const { deps, intents } = makeSplitEchoingDeps(state);
    seed_ghost_at(state, 50, 50, 3);
    state.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch({ kind: "pointer_move", x: 80, y: 60, mods: NO_MODS }, deps);
    state.dispatch(
      { kind: "pointer_up", x: 80, y: 60, button: "primary", mods: NO_MODS },
      deps
    );
    expect(intents.find((i) => i.kind === "bend_segment")).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Sub-selection multi-preserve gestures — the doctrine's "would-deselect →
// defer" rule applied per axis. Click ∈ sub-selection narrows (no drag);
// click+drag preserves the multi-selection. Mirrors the node-level body
// pattern (BodyNarrowOrDrag / BodyToggleOrDrag) at finer granularity.
// ═══════════════════════════════════════════════════════════════════════════

describe("vertex ∈ sub-selection — defer / drag-cancel / multi-preserve", () => {
  function seedSelectedVertex(state: SurfaceState, index: number) {
    seedHitRegion(state, {
      rect: { x: 45, y: 45, width: 10, height: 10 },
      action: {
        kind: "vertex_handle",
        node_id: "p1",
        index,
        pos: [50, 50],
      },
      priority: 4,
      label: `vertex:${index}`,
    });
  }

  it("pointer_down on selected vertex defers select_vertex (no intent yet)", () => {
    const state = new SurfaceState();
    const { deps, intents } = makeDeps();
    state.setVectorSelection({
      node_id: "p1",
      vertices: [0, 1, 2],
      segments: [],
      tangents: [],
    });
    seedSelectedVertex(state, 0);
    state.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    expect(intents.length).toBe(0); // deferred — no select_vertex on down
    expect(state.gesture.kind).toBe("idle");
  });

  it("click-no-drag fires select_vertex with mode: replace (narrows to 1)", () => {
    const state = new SurfaceState();
    const { deps, intents } = makeDeps();
    state.setVectorSelection({
      node_id: "p1",
      vertices: [0, 1, 2],
      segments: [],
      tangents: [],
    });
    seedSelectedVertex(state, 0);
    state.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch(
      { kind: "pointer_up", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    expect(intents).toEqual([
      {
        kind: "select_vertex",
        node_id: "p1",
        index: 0,
        mode: "replace",
      },
    ]);
  });

  it("shift-click no drag fires select_vertex with mode: toggle (toggles off)", () => {
    const state = new SurfaceState();
    const { deps, intents } = makeDeps();
    const SHIFT_MODS = { ...NO_MODS, shift: true };
    state.setVectorSelection({
      node_id: "p1",
      vertices: [0, 1, 2],
      segments: [],
      tangents: [],
    });
    seedSelectedVertex(state, 0);
    state.dispatch(
      {
        kind: "pointer_down",
        x: 50,
        y: 50,
        button: "primary",
        mods: SHIFT_MODS,
      },
      deps
    );
    state.dispatch(
      { kind: "pointer_up", x: 50, y: 50, button: "primary", mods: SHIFT_MODS },
      deps
    );
    expect(intents).toEqual([
      {
        kind: "select_vertex",
        node_id: "p1",
        index: 0,
        mode: "toggle",
      },
    ]);
  });

  it("drag past threshold cancels deferred — NO select_vertex, gesture is translate_vector_selection", () => {
    const state = new SurfaceState();
    const { deps, intents } = makeDeps();
    state.setVectorSelection({
      node_id: "p1",
      vertices: [0, 1, 2],
      segments: [],
      tangents: [],
    });
    seedSelectedVertex(state, 0);
    state.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch({ kind: "pointer_move", x: 70, y: 60, mods: NO_MODS }, deps);
    expect(state.gesture.kind).toBe("translate_vector_selection");
    expect(intents.find((i) => i.kind === "select_vertex")).toBeUndefined();
    const t = intents.find((i) => i.kind === "translate_vector_selection");
    if (t?.kind !== "translate_vector_selection") throw new Error();
    expect(t.node_id).toBe("p1");
    // ∈ paths pass empty additional — host expands its own sub-selection.
    expect(t.additional_vertex_indices).toEqual([]);
    expect(t.dx).toBe(20);
    expect(t.dy).toBe(10);
  });
});

describe("segment ∈ sub-selection — defer / drag-cancel / Meta cardinality", () => {
  function seedSelectedSegment(
    state: SurfaceState,
    segment: number,
    a_idx: number,
    b_idx: number
  ) {
    seedHitRegion(state, {
      rect: { x: 40, y: 40, width: 20, height: 20 },
      action: {
        kind: "segment_strip",
        node_id: "p1",
        segment,
        a_idx,
        b_idx,
        a: [40, 50],
        b: [60, 50],
        a_control: [40, 50],
        b_control: [60, 50],
      },
      priority: 8,
      label: `seg:${segment}`,
    });
  }

  it("drag past threshold preserves multi sub-selection → translate_vector_selection", () => {
    const state = new SurfaceState();
    const { deps, intents } = makeDeps();
    // Multi: 3 segments selected, including the one we'll drag.
    state.setVectorSelection({
      node_id: "p1",
      vertices: [],
      segments: [3, 4, 5],
      tangents: [],
    });
    seedSelectedSegment(state, 3, 0, 1);
    state.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch({ kind: "pointer_move", x: 80, y: 60, mods: NO_MODS }, deps);
    expect(state.gesture.kind).toBe("translate_vector_selection");
    // No select_segment fired — drag cancelled the defer.
    expect(intents.find((i) => i.kind === "select_segment")).toBeUndefined();
    const t = intents.find((i) => i.kind === "translate_vector_selection");
    if (t?.kind !== "translate_vector_selection") throw new Error();
    expect(t.additional_vertex_indices).toEqual([]);
  });

  // Per user direction: "when point A, B and line AB is selected (3 in
  // total) or similar (A + AB), the intent is always to translate, not
  // bend." Bend reserved for the strict singleton-segment case.
  it("singleton-this + Meta drag → bend_segment (single-segment bend preserved)", () => {
    const state = new SurfaceState();
    const { deps, intents } = makeDeps();
    const META = { ...NO_MODS, meta: true };
    // ONLY this segment selected, nothing else.
    state.setVectorSelection({
      node_id: "p1",
      vertices: [],
      segments: [3],
      tangents: [],
    });
    seedSelectedSegment(state, 3, 0, 1);
    state.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: META },
      deps
    );
    state.dispatch({ kind: "pointer_move", x: 80, y: 60, mods: META }, deps);
    expect(state.gesture.kind).toBe("bend_segment");
    expect(intents.find((i) => i.kind === "bend_segment")).toBeTruthy();
  });

  it("vertex + segment co-selected (A + AB) + Meta drag → translate, NOT bend", () => {
    const state = new SurfaceState();
    const { deps, intents } = makeDeps();
    const META = { ...NO_MODS, meta: true };
    state.setVectorSelection({
      node_id: "p1",
      vertices: [0],
      segments: [3],
      tangents: [],
    });
    seedSelectedSegment(state, 3, 0, 1);
    state.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: META },
      deps
    );
    state.dispatch({ kind: "pointer_move", x: 80, y: 60, mods: META }, deps);
    expect(state.gesture.kind).toBe("translate_vector_selection");
    expect(intents.find((i) => i.kind === "bend_segment")).toBeUndefined();
  });

  it("multi-segment + Meta drag → translate, NOT bend (Meta IGNORED in multi)", () => {
    const state = new SurfaceState();
    const { deps, intents } = makeDeps();
    const META = { ...NO_MODS, meta: true };
    state.setVectorSelection({
      node_id: "p1",
      vertices: [],
      segments: [3, 4],
      tangents: [],
    });
    seedSelectedSegment(state, 3, 0, 1);
    state.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: META },
      deps
    );
    state.dispatch({ kind: "pointer_move", x: 80, y: 60, mods: META }, deps);
    expect(state.gesture.kind).toBe("translate_vector_selection");
    expect(intents.find((i) => i.kind === "bend_segment")).toBeUndefined();
  });

  it("click-no-drag on selected segment fires deferred select_segment (replace)", () => {
    const state = new SurfaceState();
    const { deps, intents } = makeDeps();
    state.setVectorSelection({
      node_id: "p1",
      vertices: [],
      segments: [3, 4],
      tangents: [],
    });
    seedSelectedSegment(state, 3, 0, 1);
    state.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch(
      { kind: "pointer_up", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    const select = intents.find((i) => i.kind === "select_segment");
    if (select?.kind !== "select_segment")
      throw new Error("expected select_segment");
    expect(select.mode).toBe("replace");
    expect(select.segment).toBe(3);
  });
});

describe("tangent ∈ sub-selection — singleton-this vs multi promotion", () => {
  function seedSelectedTangent(state: SurfaceState, ref: [number, 0 | 1]) {
    seedHitRegion(state, {
      rect: { x: 95, y: 95, width: 10, height: 10 },
      action: {
        kind: "tangent_handle",
        node_id: "p1",
        tangent: ref,
        pos: [100, 100],
      },
      priority: 4,
      label: `tangent:${ref[0]}:${ref[1]}`,
    });
  }

  it("singleton-this tangent drag → translate_tangent gesture (curve / set_tangent)", () => {
    const state = new SurfaceState();
    const { deps, intents } = makeDeps();
    state.setVectorSelection({
      node_id: "p1",
      vertices: [],
      segments: [],
      tangents: [[0, 0]],
    });
    seedSelectedTangent(state, [0, 0]);
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
    state.dispatch(
      { kind: "pointer_move", x: 120, y: 110, mods: NO_MODS },
      deps
    );
    expect(state.gesture.kind).toBe("translate_tangent");
    // Singleton-this tangent: set_tangent (absolute, mirror modifiers
    // applicable). NOT translate_vector_selection (delta).
    expect(intents.find((i) => i.kind === "set_tangent")).toBeTruthy();
    expect(
      intents.find((i) => i.kind === "translate_vector_selection")
    ).toBeUndefined();
    // No select intent fired — defer cancelled by drag.
    expect(intents.find((i) => i.kind === "select_tangent")).toBeUndefined();
  });

  it("multi-tangent drag → translate_vector_selection (delta-translate all)", () => {
    const state = new SurfaceState();
    const { deps, intents } = makeDeps();
    state.setVectorSelection({
      node_id: "p1",
      vertices: [],
      segments: [],
      tangents: [
        [0, 0],
        [5, 0],
      ],
    });
    seedSelectedTangent(state, [0, 0]);
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
    state.dispatch(
      { kind: "pointer_move", x: 120, y: 110, mods: NO_MODS },
      deps
    );
    expect(state.gesture.kind).toBe("translate_vector_selection");
    expect(intents.find((i) => i.kind === "set_tangent")).toBeUndefined();
    expect(intents.find((i) => i.kind === "select_tangent")).toBeUndefined();
  });

  it("click-no-drag on selected tangent fires deferred select_tangent", () => {
    const state = new SurfaceState();
    const { deps, intents } = makeDeps();
    state.setVectorSelection({
      node_id: "p1",
      vertices: [],
      segments: [],
      tangents: [[0, 0]],
    });
    seedSelectedTangent(state, [0, 0]);
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
    state.dispatch(
      { kind: "pointer_up", x: 100, y: 100, button: "primary", mods: NO_MODS },
      deps
    );
    const select = intents.find((i) => i.kind === "select_tangent");
    if (select?.kind !== "select_tangent") throw new Error();
    expect(select.mode).toBe("replace");
    expect(select.tangent).toEqual([0, 0]);
  });
});
