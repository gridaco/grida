// `SnapSession` integration with `cmath._snap`. No DOM — feeds raw
// rects and verifies the corrected-delta + guide contract.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_SNAP_OPTIONS,
  SnapSession,
  type SnapOptions,
} from "../src/core/snap";
import { rect } from "./_helpers";
import type { Rect } from "../src/types";

const opts_on: SnapOptions = { ...DEFAULT_SNAP_OPTIONS, threshold_px: 10 };
const opts_off: SnapOptions = { ...DEFAULT_SNAP_OPTIONS, enabled: false };

describe("SnapSession", () => {
  it("returns identity when disabled", () => {
    const s = new SnapSession({
      agents: [rect(0, 0)],
      neighbors: [rect(50, 0)],
    });
    const r = s.snap({ x: 50, y: 0 }, opts_off);
    expect(r.delta).toEqual({ x: 50, y: 0 });
    expect(r.guide).toBeUndefined();
  });

  it("returns identity with no neighbors", () => {
    const s = new SnapSession({ agents: [rect(0, 0)], neighbors: [] });
    const r = s.snap({ x: 5, y: 0 }, opts_on);
    expect(r.delta).toEqual({ x: 5, y: 0 });
    expect(r.guide).toBeUndefined();
  });

  it("returns identity with no agents", () => {
    const s = new SnapSession({ agents: [], neighbors: [rect(50, 0)] });
    const r = s.snap({ x: 5, y: 0 }, opts_on);
    expect(r.delta).toEqual({ x: 5, y: 0 });
    expect(r.guide).toBeUndefined();
  });

  it("edge-aligns when a sibling is within threshold", () => {
    // Agent at x=0 width=10; sibling at x=48 width=10.
    // Drag toward the sibling — at delta=37, agent's right edge sits at 47,
    // sibling's left edge at 48 → distance 1, well inside threshold 10.
    // Snap should align: agent's right edge (translated.x + 10) === sibling.x
    // i.e. translated.x = 38, so corrected delta.x = 38.
    const s = new SnapSession({
      agents: [rect(0, 0)],
      neighbors: [rect(48, 0)],
    });
    const r = s.snap({ x: 37, y: 0 }, opts_on);
    expect(r.delta.x).toBe(38);
    expect(r.delta.y).toBe(0);
    expect(r.guide).toBeDefined();
    // some kind of visual feedback was emitted
    const guide = r.guide!;
    expect(
      guide.lines.length + guide.points.length + guide.rules.length
    ).toBeGreaterThan(0);
  });

  it("does not snap beyond threshold", () => {
    // Agent at (0,0); neighbor at (200, 200) — far away on both axes,
    // well beyond threshold 10. Identity expected; no guide.
    const s = new SnapSession({
      agents: [rect(0, 0)],
      neighbors: [rect(200, 200)],
    });
    const r = s.snap({ x: 0, y: 0 }, opts_on);
    expect(r.delta).toEqual({ x: 0, y: 0 });
    expect(r.guide).toBeUndefined();
  });

  it("dispose() degrades subsequent calls to identity", () => {
    const s = new SnapSession({
      agents: [rect(0, 0)],
      neighbors: [rect(48, 0)],
    });
    s.dispose();
    const r = s.snap({ x: 37, y: 0 }, opts_on);
    expect(r.delta).toEqual({ x: 37, y: 0 });
    expect(r.guide).toBeUndefined();
  });

  // Nudge faux-snap contract: when agent is EXACTLY aligned to an
  // anchor on at least one axis, `"aligned"` policy emits a guide
  // identical to what drag would emit on the same exact alignment.
  //
  // Fixture: both rects share left edge at x=10, vertically separated
  // (y=100 vs y=200, beyond threshold) so y-axis doesn't snap. The
  // lock-in behavior in cmath's `snap1D` selects different alignments
  // depending on threshold — to test "identical when aligned", use a
  // fixture where the answer is the same regardless of threshold:
  // exact-zero-distance match on all left-edge points.
  it('"aligned" emits guide when agent is exactly aligned', () => {
    const s = new SnapSession({
      agents: [rect(10, 100, 5, 5)],
      neighbors: [rect(10, 200, 5, 5)],
    });
    const engine = s.snap({ x: 0, y: 0 }, opts_on, "engine");
    const aligned = s.snap({ x: 0, y: 0 }, opts_on, "aligned");
    expect(engine.delta).toEqual({ x: 0, y: 0 });
    expect(aligned.delta).toEqual({ x: 0, y: 0 });
    expect(aligned.guide).toBeDefined();
    // Drag (engine) and nudge (aligned) emit IDENTICAL guides when the
    // alignment is exact AND the engine doesn't lock onto a competing
    // non-zero alignment — the whole point of the aligned-threshold
    // trick is to mask out competing matches that would diverge.
    expect(aligned.guide).toEqual(engine.guide);
  });

  // Phantom suppression: when the engine WOULD correct the agent (i.e.
  // close but not aligned on any axis), `"aligned"` policy emits NO
  // guide. Drag's `"engine"` policy still emits because drag will apply
  // the correction. Y is offset so no axis-incidental alignment exists.
  it('"aligned" suppresses guide when correction would be needed', () => {
    // Agent right x=20, top y=0; anchor left x=22, top y=100.
    // No axis exactly aligned. Distance 2 on x is in threshold 10 →
    // correction (2, …). Y is way out of threshold → no y correction.
    const s = new SnapSession({
      agents: [rect(10, 0)],
      neighbors: [rect(22, 100)],
    });
    const engine = s.snap({ x: 0, y: 0 }, opts_on, "engine");
    const aligned = s.snap({ x: 0, y: 0 }, opts_on, "aligned");

    expect(engine.delta.x).toBe(2);
    expect(aligned.delta.x).toBe(2);

    // Drag (engine) draws a line — it will apply the correction.
    expect(engine.guide).toBeDefined();

    // Nudge (aligned) draws NOTHING — agent isn't actually on alignment
    // on any axis; showing a line that doesn't touch both rects' edges
    // is the "phantom" the user reported.
    expect(aligned.guide).toBeUndefined();
    expect(s.last_guide).toBeUndefined();
  });

  it("emits no guide at rest when nothing aligns", () => {
    const s = new SnapSession({
      agents: [rect(0, 0)],
      neighbors: [rect(200, 200)],
    });
    const r = s.snap({ x: 0, y: 0 }, opts_on, "aligned");
    expect(r.delta).toEqual({ x: 0, y: 0 });
    expect(r.guide).toBeUndefined();
  });

  // Regression pin: snap engagement must NOT round agent or anchor
  // edges to integer pixels. With pixel-grid OFF, a translate snap
  // that engages on a fractional-anchor edge should produce a
  // fractional corrected delta (not silently turn into a pixel-grid
  // quantizer of its own).
  it("snap to a fractional anchor preserves fractional precision", () => {
    // Agent at x=10 (integer), anchor at x=37.7 (fractional). Drag 25
    // → translated right edge at 45, anchor left at 37.7, distance
    // 7.3 (in threshold). Snap should align agent.right (20+25) to
    // anchor.left (37.7) → corrected dx = 27.7 (fractional).
    const s = new SnapSession({
      agents: [rect(10, 0)],
      neighbors: [rect(37.7, 0)],
    });
    const r = s.snap({ x: 25, y: 0 }, opts_on);
    expect(r.delta.x).toBeCloseTo(27.7, 6);
    expect(r.delta.y).toBe(0);
    expect(r.guide).toBeDefined();
  });

  // Regression pin for the jitter fix: fractional baseline + cursor
  // sweep crosses a quantization boundary inside a single snap
  // alignment. Corrected delta must be dx-invariant.
  it("does NOT jitter as the cursor moves through a single snap alignment", () => {
    const baseline_x = 77.2065;
    const s = new SnapSession({
      agents: [rect(baseline_x, 0)],
      neighbors: [rect(baseline_x + 12, 0)],
    });
    const opts: SnapOptions = { enabled: true, threshold_px: 10 };
    const samples: number[] = [];
    for (let i = 0; i <= 12; i++) {
      const r = s.snap({ x: i * 0.1, y: 0 }, opts);
      samples.push(r.delta.x);
    }
    const max = Math.max(...samples);
    const min = Math.min(...samples);
    expect(max - min).toBeLessThan(0.01);
  });
});

describe("SnapSession.snap_resize", () => {
  function box(x: number, y: number, w = 10, h = 10): Rect {
    return { x, y, width: w, height: h };
  }

  it("returns zero corrections with no neighbors", () => {
    const s = new SnapSession({ agents: [], neighbors: [] });
    const r = s.snap_resize(
      box(0, 0, 100, 50),
      { x: "right", y: null },
      { enabled: true, threshold_px: 10 }
    );
    expect(r.dx).toBe(0);
    expect(r.dy).toBe(0);
    expect(r.guide).toBeUndefined();
  });

  it("returns zero corrections when disabled", () => {
    const s = new SnapSession({ agents: [], neighbors: [box(120, 0)] });
    const r = s.snap_resize(
      box(0, 0, 100, 50),
      { x: "right", y: null },
      { enabled: false, threshold_px: 10 }
    );
    expect(r.dx).toBe(0);
    expect(r.dy).toBe(0);
  });

  // Pixel-grid is a separate stage downstream; the snap session
  // itself must NOT round to integer pixels. Anchor at a fractional
  // edge → corrected dx is fractional, exactly aligning the moving
  // edge to the anchor.
  it("snaps to a fractional anchor edge without integer rounding", () => {
    const s = new SnapSession({
      agents: [],
      neighbors: [box(120.4, 60, 20, 30)],
    });
    const r = s.snap_resize(
      box(0, 0, 118, 50),
      { x: "right", y: null },
      { enabled: true, threshold_px: 10 }
    );
    expect(r.dx).toBeCloseTo(2.4, 6);
    expect(r.guide!.rules[0]).toEqual(["x", 120.4]);
  });

  it("snaps right edge to a neighbor's left edge when within threshold", () => {
    const s = new SnapSession({
      agents: [],
      neighbors: [box(120, 60, 20, 30)],
    });
    // Effective right edge at 118, neighbor.x at 120 → distance 2.
    const r = s.snap_resize(
      box(0, 0, 118, 50),
      { x: "right", y: null },
      { enabled: true, threshold_px: 10 }
    );
    expect(r.dx).toBe(2);
    expect(r.dy).toBe(0);
    expect(r.guide).toBeDefined();
    expect(r.guide!.rules.length).toBe(1);
    expect(r.guide!.rules[0]).toEqual(["x", 120]);
  });

  it("snaps bottom edge on a SE corner drag", () => {
    const s = new SnapSession({
      agents: [],
      neighbors: [box(120, 60, 20, 30)],
    });
    // Effective bottom at 64, neighbor.y at 60 → distance -4.
    const r = s.snap_resize(
      box(0, 0, 118, 64),
      { x: "right", y: "bottom" },
      { enabled: true, threshold_px: 10 }
    );
    expect(r.dx).toBe(2);
    expect(r.dy).toBe(-4);
    expect(r.guide!.rules.length).toBe(2);
  });

  it("does not snap an edge outside threshold", () => {
    const s = new SnapSession({ agents: [], neighbors: [box(500, 0)] });
    const r = s.snap_resize(
      box(0, 0, 100, 50),
      { x: "right", y: null },
      { enabled: true, threshold_px: 10 }
    );
    expect(r.dx).toBe(0);
    expect(r.guide).toBeUndefined();
  });

  it("returns zero with null edges (gesture has no resizable axes)", () => {
    const s = new SnapSession({ agents: [], neighbors: [box(120, 60)] });
    const r = s.snap_resize(
      box(0, 0, 100, 50),
      { x: null, y: null },
      { enabled: true, threshold_px: 10 }
    );
    expect(r.dx).toBe(0);
    expect(r.dy).toBe(0);
    expect(r.guide).toBeUndefined();
  });

  // Regression pin: resize-snap analog of the translate-snap jitter
  // test at line 153. Sweep a fractional cursor through a single snap
  // alignment on the right edge; the snapped right edge must be
  // dx-invariant inside the zone. Pre-fix `snap_resize` returned
  // `dx = anchor - round(agent_x)`, so the final right edge drifted
  // with `frac(agent_x)` and lurched ~1 px backward at every integer
  // boundary — visible micro-jitter.
  it("snap_resize does NOT jitter as the moving edge sweeps through a snap alignment", () => {
    // Baseline rect right edge sits at 115.0; neighbor left edge at
    // 120 → snap target in threshold across a 5-px sweep.
    const s = new SnapSession({
      agents: [],
      neighbors: [box(120, 0, 20, 20)],
    });
    const opts = { enabled: true, threshold_px: 10 };
    const samples: number[] = [];
    // Cursor sweeps through 5 px of motion at 0.1 px resolution —
    // crosses 4 integer boundaries while staying in a single snap zone.
    for (let i = 0; i <= 50; i++) {
      const dx_in = 15 + i * 0.1; // 15.0 → 20.0
      const right = 100 + dx_in;
      const r = s.snap_resize(
        box(0, 0, right, 50),
        { x: "right", y: null },
        opts
      );
      // Final right edge = pre-snap right + correction.
      samples.push(right + r.dx);
    }
    const max = Math.max(...samples);
    const min = Math.min(...samples);
    expect(max - min).toBeLessThan(0.01);
    // And the converged value should be the anchor itself.
    expect(samples[samples.length - 1]).toBeCloseTo(120, 6);
  });

  it("snap_resize y axis: bottom edge holds steady across a fractional sweep", () => {
    const s = new SnapSession({
      agents: [],
      neighbors: [box(0, 60, 20, 20)],
    });
    const opts = { enabled: true, threshold_px: 10 };
    const samples: number[] = [];
    for (let i = 0; i <= 50; i++) {
      const dy_in = 5 + i * 0.1;
      const bottom = 50 + dy_in;
      const r = s.snap_resize(
        box(0, 0, 100, bottom),
        { x: null, y: "bottom" },
        opts
      );
      samples.push(bottom + r.dy);
    }
    const max = Math.max(...samples);
    const min = Math.min(...samples);
    expect(max - min).toBeLessThan(0.01);
    expect(samples[samples.length - 1]).toBeCloseTo(60, 6);
  });
});
