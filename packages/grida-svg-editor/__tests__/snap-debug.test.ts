// Deterministic snap-guide inspection harness — the tooling we need to
// actually diagnose snap-rendering bugs without relying on browser
// screenshots (which are continuous, sub-pixel, and uncapturable for
// transient 500ms HUD draws).
//
// `trace_guide` runs a snap session on synthetic named rects and
// annotates EVERY emitted primitive against the 9-point grid of every
// rect. Lines/points that can't be explained as `agent.<edge>` or
// `anchor.<edge>` are flagged as phantoms.
//
// The original bug ("phantom line on nudge faux-snap") was found by
// running this harness, NOT by browser inspection. The asserts below
// pin the contract this harness uncovered:
//
//   1. Engine policy (drag): emits guide whenever an anchor is in
//      threshold. Guide is anchored to the engine's `translated`.
//   2. Aligned policy (nudge faux-snap): emits guide ONLY when
//      correction is exactly zero. When emitted, the guide is byte-
//      identical to engine's at the same fixture (drag and nudge
//      render the same lines).

import { describe, it, expect } from "vitest";
import {
  SnapSession,
  DEFAULT_SNAP_OPTIONS,
  type SnapOptions,
  type SnapGuidePolicy,
} from "../src/core/snap";
import type { Rect } from "../src/types";

// ─── 9-point provenance ────────────────────────────────────────────────────

type NinePoint = "left" | "center_x" | "right" | "top" | "middle_y" | "bottom";

function match_axis(
  axis: "x" | "y",
  value: number,
  named: Record<string, Rect>,
  tol = 0.5
): Array<{ name: string; point: NinePoint }> {
  const out: Array<{ name: string; point: NinePoint }> = [];
  for (const [name, r] of Object.entries(named)) {
    const pts =
      axis === "x"
        ? ({
            left: r.x,
            center_x: r.x + r.width / 2,
            right: r.x + r.width,
          } as Record<NinePoint, number>)
        : ({
            top: r.y,
            middle_y: r.y + r.height / 2,
            bottom: r.y + r.height,
          } as Record<NinePoint, number>);
    for (const [pname, v] of Object.entries(pts) as [NinePoint, number][]) {
      if (Math.abs(v - value) <= tol) out.push({ name, point: pname });
    }
  }
  return out;
}

type Annotated = {
  raw: { x1: number; y1: number; x2: number; y2: number; label?: string };
  axis: "vertical" | "horizontal" | "diagonal";
  /** Spacing / distribution markers (lines with a `label`) are drawn
   *  at mid-pair positions, NOT on 9-point edges. They're not
   *  "phantoms" in the bug sense — they're showing gap distances.
   *  The harness flags them so the test can ignore them when asking
   *  "is anything misaligned with rect edges?". */
  is_spacing_marker: boolean;
  shared_coord: number;
  shared_explains: Array<{ name: string; point: NinePoint }>;
  endpoints: Array<{
    coord: number;
    explains: Array<{ name: string; point: NinePoint }>;
  }>;
};

function annotate(
  l: { x1: number; y1: number; x2: number; y2: number; label?: string },
  named: Record<string, Rect>
): Annotated {
  const is_spacing_marker = typeof l.label === "string" && l.label.length > 0;
  if (l.x1 === l.x2) {
    return {
      raw: l,
      axis: "vertical",
      is_spacing_marker,
      shared_coord: l.x1,
      shared_explains: match_axis("x", l.x1, named),
      endpoints: [
        { coord: l.y1, explains: match_axis("y", l.y1, named) },
        { coord: l.y2, explains: match_axis("y", l.y2, named) },
      ],
    };
  }
  if (l.y1 === l.y2) {
    return {
      raw: l,
      axis: "horizontal",
      is_spacing_marker,
      shared_coord: l.y1,
      shared_explains: match_axis("y", l.y1, named),
      endpoints: [
        { coord: l.x1, explains: match_axis("x", l.x1, named) },
        { coord: l.x2, explains: match_axis("x", l.x2, named) },
      ],
    };
  }
  return {
    raw: l,
    axis: "diagonal",
    is_spacing_marker,
    shared_coord: NaN,
    shared_explains: [],
    endpoints: [],
  };
}

function trace_guide(
  agent_named: string,
  named: Record<string, Rect>,
  policy: SnapGuidePolicy,
  opts: SnapOptions
) {
  const agent = named[agent_named];
  const neighbors = Object.entries(named)
    .filter(([n]) => n !== agent_named)
    .map(([, r]) => r);
  const session = new SnapSession({ agents: [agent], neighbors });
  const r = session.snap({ x: 0, y: 0 }, opts, policy);
  if (!r.guide) {
    return {
      corrected: r.delta,
      lines: [] as Annotated[],
      points: [] as Array<{
        coord: [number, number];
        x_explains: ReturnType<typeof match_axis>;
        y_explains: ReturnType<typeof match_axis>;
      }>,
      phantoms: 0,
    };
  }
  const lines = r.guide.lines.map((l) => annotate(l, named));
  const points = r.guide.points.map((p) => ({
    coord: [p[0], p[1]] as [number, number],
    x_explains: match_axis("x", p[0], named),
    y_explains: match_axis("y", p[1], named),
  }));
  // Spacing/distribution markers (lines with labels) are excluded —
  // they legitimately don't sit on 9-point edges.
  const phantoms =
    lines.filter(
      (a) =>
        !a.is_spacing_marker &&
        a.axis !== "diagonal" &&
        (a.shared_explains.length === 0 ||
          a.endpoints.some((e) => e.explains.length === 0))
    ).length +
    points.filter((p) => p.x_explains.length === 0 || p.y_explains.length === 0)
      .length;
  return { corrected: r.delta, lines, points, phantoms };
}

// ─── Scenarios ─────────────────────────────────────────────────────────────

const OPTS: SnapOptions = { ...DEFAULT_SNAP_OPTIONS, threshold_px: 6 };

describe("snap-debug — guide primitive provenance", () => {
  // Micro fixture: agent vs single neighbor, 2-unit gap, y-offset so
  // no axis-incidental alignment.
  // - engine policy: emits guide (drag would correct & land at anchor edge)
  // - aligned policy: emits NOTHING (correction != 0 → no real alignment)
  it("close-but-not-aligned: engine draws, aligned stays silent", () => {
    const rects: Record<string, Rect> = {
      agent: { x: 10, y: 0, width: 10, height: 10 },
      neighbor: { x: 22, y: 100, width: 10, height: 10 }, // gap 2 on x, far on y
    };
    const engine = trace_guide("agent", rects, "engine", OPTS);
    const aligned = trace_guide("agent", rects, "aligned", OPTS);

    // Drag (engine): guide exists. Every line + point traces to a real
    // rect 9-point — no phantoms.
    expect(engine.lines.length).toBeGreaterThan(0);
    expect(engine.phantoms).toBe(0);

    // Nudge (aligned): no guide AT ALL — agent isn't on alignment.
    expect(aligned.lines).toHaveLength(0);
    expect(aligned.points).toHaveLength(0);
    expect(aligned.corrected.x).toBe(2);
  });

  // Exact-alignment fixture: rects share left edge x=10, separated on
  // y so y-axis stays inert. cmath returns correction=0 for both
  // policies and emits identical guides. The vertically-touching case
  // (right↔left at distance 0) is intentionally NOT used here — cmath's
  // `snap1D` lock-in picks `left↔left` (distance 10) over the better
  // `right↔left`, so drag and nudge guides differ on touching layouts
  // even though both represent "aligned". The aligned-threshold trick
  // resolves that, but the resulting guides legitimately differ between
  // policies on those fixtures.
  it("exact-alignment: engine == aligned (drag and nudge render same)", () => {
    const rects: Record<string, Rect> = {
      agent: { x: 10, y: 100, width: 5, height: 5 },
      neighbor: { x: 10, y: 200, width: 5, height: 5 }, // shared left edge
    };
    const engine = trace_guide("agent", rects, "engine", OPTS);
    const aligned = trace_guide("agent", rects, "aligned", OPTS);

    expect(engine.corrected).toEqual({ x: 0, y: 0 });
    expect(aligned.corrected).toEqual({ x: 0, y: 0 });
    expect(engine.lines.length).toBeGreaterThan(0);
    expect(engine.phantoms).toBe(0);
    expect(aligned.phantoms).toBe(0);
    // Identity: same line set, same point set.
    expect(aligned.lines.map((a) => a.raw)).toEqual(
      engine.lines.map((a) => a.raw)
    );
    expect(aligned.points.map((p) => p.coord)).toEqual(
      engine.points.map((p) => p.coord)
    );
  });

  // Slides-like scenario: many anchors share x=160; agent at x=160
  // (exactly aligned) emits a single x-alignment guide.
  //
  // Note: engine policy may additionally fire spacing/distribution
  // snap on the y-axis (drawing labeled gap markers between rects).
  // Those are intentional spacing UI, not phantoms — the harness
  // excludes them from the phantom count. Aligned policy suppresses
  // spacing snap (sub-pixel threshold) so it draws strictly the
  // x-alignment line(s).
  it("slides-like multi-anchor exact alignment: aligned has no phantoms", () => {
    const rects: Record<string, Rect> = {
      bg: { x: 0, y: 0, width: 1920, height: 1080 },
      hairline: { x: 160, y: 159, width: 260, height: 2 },
      eyebrow: { x: 160, y: 185, width: 200, height: 18 },
      tspan_future: { x: 160, y: 290, width: 720, height: 130 },
      tspan_work: { x: 160, y: 420, width: 460, height: 130 },
      agent: { x: 160, y: 560, width: 120, height: 5 }, // EXACT alignment at x=160
      sub1: { x: 160, y: 615, width: 920, height: 30 },
      date: { x: 160, y: 968, width: 80, height: 17 },
    };
    // Engine policy run for parity; output is documented as not asserted
    // here (drag-time spacing snap legitimately emits points the harness
    // flags as phantoms against the input rect map — see comment below).
    trace_guide("agent", rects, "engine", OPTS);
    const aligned = trace_guide("agent", rects, "aligned", OPTS);

    expect(aligned.corrected.x).toBe(0);
    // Aligned must have zero phantoms — every non-spacing line traces
    // to a real rect edge.
    expect(aligned.phantoms).toBe(0);
    expect(aligned.lines.length).toBeGreaterThan(0);
    // Aligned MUST NOT emit spacing markers (sub-pixel threshold
    // gates them out).
    expect(aligned.lines.filter((a) => a.is_spacing_marker)).toHaveLength(0);
    // Engine policy may emit translated-agent points (drag corrects
    // y here via spacing snap) — those are legitimate for drag but
    // appear as "phantoms" against the input rect map (harness
    // limitation). Not asserted.
  });

  // SVG ROOT BBOX FOLLOWS CHILDREN (fixed): the simple two-rect fixture
  // from `/svg` previously emitted a guide on EVERY nudge of
  // red or blue because `<svg>.getBBox()` returns the union of all
  // descendants — NOT the viewBox / width / height attributes. The
  // leftmost child defined `svg_root.left`; the topmost defined
  // `svg_root.top`; etc. A child could never escape on the side it
  // defined, so aligned policy fired on that side for every arrow
  // press, even when the child sat outside the declared viewBox.
  //
  // Fixed in `DomSurface.container_box`: `<svg>` elements now report
  // their viewport rect (CSSOM `getBoundingClientRect`) rather than
  // the descendant union. The viewport is fixed at viewBox/width/height
  // independent of children, so this test feeds a FIXED root rect
  // (matching the declared viewBox) and asserts that nudging a child
  // OUTSIDE the viewport does NOT fire root-side alignment.
  it("svg-root-follows-children: root is viewport, not descendant union", () => {
    // viewBox-derived root rect — STATIC regardless of where children
    // move. This is what `container_box(svg_root)` now returns post-fix.
    const root: Rect = { x: 0, y: 0, width: 400, height: 240 };
    const blue: Rect = { x: 220, y: 80, width: 60, height: 60 };

    // Push red WAY outside the viewport on x. With the fix, the root's
    // left edge stays at x=0, so red's left at x=999 has no alignment
    // with the root on x. y is still shared (80) with blue — but that's
    // a legitimate sibling alignment, not a root self-reference.
    const red_outside: Rect = { x: 999, y: 80, width: 60, height: 60 };
    const trace_outside = trace_guide(
      "red",
      { red: red_outside, blue, root },
      "aligned",
      OPTS
    );

    // The agent at x=999 cannot align on x to root.left=0, root.center_x=200,
    // or root.right=400 (all well outside threshold). And blue at x=220
    // is also far. So aligned policy emits NO vertical lines.
    const verticals = trace_outside.lines.filter((a) => a.axis === "vertical");
    expect(verticals).toHaveLength(0);

    // Move red back inside the viewport but NOT to x=0 — root.left no
    // longer self-references because root's edges are independent of
    // the agent.
    const red_inside: Rect = { x: 75, y: 80, width: 60, height: 60 };
    const trace_inside = trace_guide(
      "red",
      { red: red_inside, blue, root },
      "aligned",
      OPTS
    );
    // No x-axis alignment to ANY rect at this position.
    const v_inside = trace_inside.lines.filter((a) => a.axis === "vertical");
    expect(v_inside).toHaveLength(0);

    // Sanity: y=80 alignment between red and blue is still emitted
    // (sibling alignment, not root self-reference) for the inside case.
    const top_h_inside = trace_inside.lines.find(
      (a) => a.axis === "horizontal" && a.shared_coord === 80
    );
    expect(top_h_inside).toBeDefined();
    // And the y=80 line only spans red↔blue, never reaches root.top=0.
    const min_y_endpoint = Math.min(
      ...top_h_inside!.endpoints.map((e) => e.coord)
    );
    // The line's x-span lies within red∪blue, not extending to root's left=0.
    // (Endpoints are x-coords for horizontals.)
    expect(min_y_endpoint).toBeGreaterThanOrEqual(red_inside.x);
  });

  // BG RECT BUG: a full-bleed agent and its parent share the EXACT
  // SAME bounds. After any single-axis nudge, the OTHER axis still
  // exactly aligns to the parent → aligned policy fires sweeping
  // full-width / full-height lines on every nudge. Drag doesn't
  // surface this because the user almost never drags to a pixel-
  // perfect center; the snap correction brings them there in one
  // step at the end. Nudge sits IN the aligned state from the start.
  //
  // This is the structural manifestation of Q1 (group / self-bound
  // anchor): the parent shouldn't snap-target a child whose bounds
  // it exactly contains. Pinning the bug here so the fix has a
  // regression test the moment Q1 ships.
  it("bg-rect-bug: agent==parent-bounds, nudge fires phantom-ish axis lines", () => {
    const rects: Record<string, Rect> = {
      svg_root: { x: 0, y: 0, width: 1920, height: 1080 }, // parent
      agent: { x: 1, y: 0, width: 1920, height: 1080 }, // bg rect, nudged +1 on x
    };
    const engine = trace_guide("agent", rects, "engine", OPTS);
    const aligned = trace_guide("agent", rects, "aligned", OPTS);

    // Engine drag: bg's center_x=961 is within threshold 6 of parent's
    // center_x=960 → engine fires center-snap with correction (-1, 0).
    // Drag applies it → bg back to (0,0,..). At rest after drag,
    // aligned would also fire — same alignment, but on all three
    // y-edges + all three x-edges (full-width AND full-height lines).
    expect(engine.lines.length).toBeGreaterThan(0);

    // Nudge: bg at x=1, parent at x=0. x-axis is OFF by 1 (> 0.5
    // threshold). y-axis is EXACT (both at 0/540/1080). Aligned
    // policy must still detect y-alignment and emit horizontal lines.
    // This is the "phantom" UX the user reported on nudge: 3 lines
    // sweeping the full canvas width at y=0, 540, 1080 — visually
    // meaningless because they only express "your y matches the
    // parent's y", which is true for ANY full-bleed child.
    expect(aligned.lines.length).toBeGreaterThan(0);
    const horizontals = aligned.lines.filter((a) => a.axis === "horizontal");
    expect(horizontals.length).toBeGreaterThanOrEqual(3);
    // All horizontals span the full width (touching both rects).
    for (const h of horizontals) {
      expect(h.endpoints[0].coord).toBeLessThanOrEqual(1);
      expect(h.endpoints[1].coord).toBeGreaterThanOrEqual(1920);
    }
  });

  // Slides-like scenario, agent OFF by 1 from alignment: engine emits
  // (drag would correct), aligned stays silent (nudge can't correct).
  it("slides-like multi-anchor off-by-1: aligned suppresses, engine draws", () => {
    const rects: Record<string, Rect> = {
      bg: { x: 0, y: 0, width: 1920, height: 1080 },
      hairline: { x: 160, y: 159, width: 260, height: 2 },
      eyebrow: { x: 160, y: 185, width: 200, height: 18 },
      agent: { x: 159, y: 560, width: 120, height: 5 }, // x=159, one off from 160 anchors
      date: { x: 160, y: 968, width: 80, height: 17 },
    };
    const engine = trace_guide("agent", rects, "engine", OPTS);
    const aligned = trace_guide("agent", rects, "aligned", OPTS);

    expect(engine.corrected.x).toBe(1);
    expect(engine.lines.length).toBeGreaterThan(0);
    // The agent is off by 1, so nudge faux-snap stays silent.
    expect(aligned.lines).toHaveLength(0);
  });
});
