import { describe, it, expect, beforeEach } from "vitest";
import { SurfaceState, type StateDeps } from "../event/state";
import type { Intent } from "../event/intent";
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

function makeDeps(): { deps: StateDeps; intents: Intent[] } {
  const intents: Intent[] = [];
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
  };
  return { deps, intents };
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

  it("drag empty space → marquee commit intent on up", () => {
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
    const marq = intents.find(
      (i): i is Extract<Intent, { kind: "marquee_select" }> =>
        i.kind === "marquee_select"
    );
    expect(marq).toBeTruthy();
    expect(marq!.rect.width).toBe(50);
    expect(marq!.rect.height).toBe(50);
    expect(marq!.phase).toBe("commit");
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
        initial_rect: SCENE.a,
      },
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
});
