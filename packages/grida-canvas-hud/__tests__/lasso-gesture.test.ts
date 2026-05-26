// UX-spec tests for the `lasso` gesture — sibling of `marquee`.
//
// Rule: when the host has switched the surface's selection mode to
// "lasso", an empty-space drag promotes to a `lasso` gesture (not
// `marquee`) and the surface emits `lasso_select` intents — preview on
// every move, commit on release. Mode swap is the host's responsibility
// (a tool toggle on its side), so these tests just flip the surface's
// mode setter and verify the state-machine output.

import { describe, it, expect } from "vitest";
import { SurfaceState, type StateDeps } from "../event/state";
import type { Intent } from "../event/intent";
import { NO_MODS } from "../event/event";

function makeDeps(): { deps: StateDeps; intents: Intent[] } {
  const intents: Intent[] = [];
  const deps: StateDeps = {
    // Empty-space pick = null, so the pending pointer_down falls into the
    // empty-drag branch (which is what produces marquee / lasso).
    pick: () => null,
    shapeOf: () => null,
    emitIntent: (i) => intents.push(i),
  };
  return { deps, intents };
}

describe("lasso gesture — host swaps selection mode to lasso", () => {
  it("empty-space drag past threshold promotes to `lasso`, NOT `marquee`", () => {
    // Why: the HUD reads `vectorSelectionMode` only at promotion time.
    // The host owns the tool toggle (e.g. Q key); the HUD just produces
    // the gesture the host asked for.
    const state = new SurfaceState();
    const { deps } = makeDeps();
    state.setVectorSelectionMode("lasso");
    state.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch({ kind: "pointer_move", x: 60, y: 70, mods: NO_MODS }, deps);
    expect(state.gesture.kind).toBe("lasso");
  });

  it("first preview carries a polygon containing the anchor and the live cursor", () => {
    // Why: the gesture is born with [anchor, current] so the very first
    // preview is already a meaningful (≥2-point) polyline the host can
    // see; the host's pointInPolygon test then runs once the polygon
    // grows to ≥3 distinct points.
    const state = new SurfaceState();
    const { deps, intents } = makeDeps();
    state.setVectorSelectionMode("lasso");
    state.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch({ kind: "pointer_move", x: 60, y: 70, mods: NO_MODS }, deps);
    const previews = intents.filter(
      (i): i is Extract<Intent, { kind: "lasso_select" }> =>
        i.kind === "lasso_select" && i.phase === "preview"
    );
    expect(previews.length).toBeGreaterThanOrEqual(1);
    const first = previews[0];
    expect(first.polygon[0]).toEqual([50, 50]);
    expect(first.polygon[first.polygon.length - 1]).toEqual([60, 70]);
    expect(first.additive).toBe(false);
  });

  it("each pointer_move appends a distinct screen-px sample to the polygon", () => {
    // Why: the gesture's job is to capture the user's freehand path;
    // we should see the polygon grow each frame as long as the rounded
    // screen-px differs.
    const state = new SurfaceState();
    const { deps, intents } = makeDeps();
    state.setVectorSelectionMode("lasso");
    state.dispatch(
      { kind: "pointer_down", x: 0, y: 0, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch({ kind: "pointer_move", x: 10, y: 0, mods: NO_MODS }, deps);
    state.dispatch({ kind: "pointer_move", x: 10, y: 10, mods: NO_MODS }, deps);
    state.dispatch({ kind: "pointer_move", x: 0, y: 10, mods: NO_MODS }, deps);
    const previews = intents.filter(
      (i): i is Extract<Intent, { kind: "lasso_select" }> =>
        i.kind === "lasso_select" && i.phase === "preview"
    );
    // Polygon length grows monotonically across the 3 moves; final
    // preview contains all 4 distinct samples.
    const last = previews[previews.length - 1];
    expect(last.polygon.length).toBe(4);
  });

  it("sub-pixel moves (same rounded screen-px) do NOT append duplicates", () => {
    // Why: dedupe in screen-px keeps the polygon size bounded on slow
    // drags and avoids feeding identical samples to pointInPolygon.
    const state = new SurfaceState();
    const { deps, intents } = makeDeps();
    state.setVectorSelectionMode("lasso");
    state.dispatch(
      { kind: "pointer_down", x: 0, y: 0, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch({ kind: "pointer_move", x: 10, y: 10, mods: NO_MODS }, deps);
    // A "twitch" that rounds to the same screen-px as the last sample.
    state.dispatch(
      { kind: "pointer_move", x: 10.4, y: 10.4, mods: NO_MODS },
      deps
    );
    state.dispatch(
      { kind: "pointer_move", x: 10.2, y: 10.3, mods: NO_MODS },
      deps
    );
    const previews = intents.filter(
      (i): i is Extract<Intent, { kind: "lasso_select" }> =>
        i.kind === "lasso_select" && i.phase === "preview"
    );
    const last = previews[previews.length - 1];
    // anchor + (10,10); the 10.4 / 10.2 twitches round to (10,10) and
    // are suppressed.
    expect(last.polygon.length).toBe(2);
  });

  it("pointer_up emits commit with the same polygon as the last preview", () => {
    // Why: commit is the host's source-of-truth selection; whatever the
    // user saw at release is what gets committed.
    const state = new SurfaceState();
    const { deps, intents } = makeDeps();
    state.setVectorSelectionMode("lasso");
    state.dispatch(
      { kind: "pointer_down", x: 0, y: 0, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch({ kind: "pointer_move", x: 10, y: 0, mods: NO_MODS }, deps);
    state.dispatch({ kind: "pointer_move", x: 10, y: 10, mods: NO_MODS }, deps);
    state.dispatch(
      { kind: "pointer_up", x: 10, y: 10, button: "primary", mods: NO_MODS },
      deps
    );
    const lassos = intents.filter(
      (i): i is Extract<Intent, { kind: "lasso_select" }> =>
        i.kind === "lasso_select"
    );
    const commit = lassos[lassos.length - 1];
    expect(commit.phase).toBe("commit");
    // Same polygon shape as the last preview.
    expect(commit.polygon.length).toBe(3);
    expect(state.gesture.kind).toBe("idle");
  });

  it("Shift propagates to additive on both preview and commit", () => {
    // Why: matches the additive semantics of marquee selection.
    const state = new SurfaceState();
    const { deps, intents } = makeDeps();
    state.setVectorSelectionMode("lasso");
    const SHIFT = { ...NO_MODS, shift: true };
    state.dispatch(
      { kind: "pointer_down", x: 0, y: 0, button: "primary", mods: SHIFT },
      deps
    );
    state.dispatch({ kind: "pointer_move", x: 10, y: 0, mods: SHIFT }, deps);
    state.dispatch({ kind: "pointer_move", x: 10, y: 10, mods: SHIFT }, deps);
    state.dispatch(
      { kind: "pointer_up", x: 10, y: 10, button: "primary", mods: SHIFT },
      deps
    );
    const lassos = intents.filter(
      (i): i is Extract<Intent, { kind: "lasso_select" }> =>
        i.kind === "lasso_select"
    );
    expect(lassos.length).toBeGreaterThan(0);
    for (const l of lassos) expect(l.additive).toBe(true);
  });

  it("default mode is `marquee` — no regression for hosts that don't opt in", () => {
    // Why: lasso is opt-in. A surface that never receives
    // setVectorSelectionMode keeps drawing rectangles, and tests
    // exercising marquee continue to pass.
    const state = new SurfaceState();
    const { deps, intents } = makeDeps();
    state.dispatch(
      { kind: "pointer_down", x: 0, y: 0, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch({ kind: "pointer_move", x: 30, y: 30, mods: NO_MODS }, deps);
    expect(state.gesture.kind).toBe("marquee");
    const marqs = intents.filter(
      (i): i is Extract<Intent, { kind: "marquee_select" }> =>
        i.kind === "marquee_select"
    );
    expect(marqs.length).toBeGreaterThan(0);
    expect(intents.find((i) => i.kind === "lasso_select")).toBeUndefined();
  });

  it("setVectorSelectionMode swap mid-session affects only the NEXT gesture", () => {
    // Why: documents the rule — flipping mid-drag must not yank the
    // active gesture from under the user. The next pending → drag
    // promotion picks up the new mode.
    const state = new SurfaceState();
    const { deps } = makeDeps();
    state.setVectorSelectionMode("lasso");
    state.dispatch(
      { kind: "pointer_down", x: 0, y: 0, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch({ kind: "pointer_move", x: 10, y: 10, mods: NO_MODS }, deps);
    expect(state.gesture.kind).toBe("lasso");
    // Mid-gesture mode swap.
    state.setVectorSelectionMode("marquee");
    expect(state.gesture.kind).toBe("lasso"); // unchanged
    state.dispatch(
      { kind: "pointer_up", x: 10, y: 10, button: "primary", mods: NO_MODS },
      deps
    );
    // Next drag starts a marquee.
    state.dispatch(
      { kind: "pointer_down", x: 50, y: 50, button: "primary", mods: NO_MODS },
      deps
    );
    state.dispatch({ kind: "pointer_move", x: 60, y: 60, mods: NO_MODS }, deps);
    expect(state.gesture.kind).toBe("marquee");
  });
});
