// Perf gate for Plan B / Phase 2 (Figma-shaped group snap descent).
//
// Worst-case fan-out scenario: agent group with 100 rendered leaves
// dragged near a neighbor group with 100 rendered leaves. Under naive
// O(N×M) the per-frame snap call would do ~10,000 candidate alignments.
// SnapSession unions agents into a single envelope before running cmath
// and prunes neighbors with a per-axis envelope reject — so the actual
// cost should stay well under the 16ms frame budget.
//
// Pass threshold from the plan: snap() p95 ≤ 4ms per frame on this
// stress fixture. If we miss, add a spatial prune to `compute_neighborhood`
// or gate descent behind `EditorStyle.snap_descend_groups`. The bench is
// the gate — re-run after any neighborhood / snap change.
//
// Baseline contrast: same number of cmath snap() calls against the
// pre-Phase-2 candidate set (just `[agent_group_bbox]` vs
// `[neighbor_group_bbox]`) so the descent overhead is visible.

import { bench, describe } from "vitest";
import { SvgDocument } from "../src/core/document";
import {
  compute_neighborhood,
  DEFAULT_SNAP_OPTIONS,
  snap_descent,
  SnapSession,
  type SnapOptions,
} from "../src/core/snap";
import type { NodeId, Rect } from "../src/types";

const LEAVES_PER_GROUP = 100;
const opts: SnapOptions = { ...DEFAULT_SNAP_OPTIONS, threshold_px: 10 };

function build_stress_doc(): SvgDocument {
  // Two sibling <g>s, each containing LEAVES_PER_GROUP rects.
  // Agent group leaves at x = i*5 (so they don't overlap each other).
  // Neighbor group leaves at x = 800 + i*5 (well outside snap threshold
  // from agent group, but a few share x-edges to give cmath real work).
  const agent_rects: string[] = [];
  for (let i = 0; i < LEAVES_PER_GROUP; i++) {
    agent_rects.push(
      `<rect x="${i * 5}" y="${(i % 10) * 12}" width="4" height="10"/>`
    );
  }
  const neighbor_rects: string[] = [];
  for (let i = 0; i < LEAVES_PER_GROUP; i++) {
    neighbor_rects.push(
      `<rect x="${800 + i * 5}" y="${(i % 10) * 12}" width="4" height="10"/>`
    );
  }
  return new SvgDocument(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 200">` +
      `<g>${agent_rects.join("")}</g>` +
      `<g>${neighbor_rects.join("")}</g>` +
      `</svg>`
  );
}

function ids_by_tag(doc: SvgDocument, tag: string): string[] {
  const out: string[] = [];
  for (const id of doc.all_elements()) {
    if (doc.tag_of(id) === tag) out.push(id);
  }
  return out;
}

// Synthesize rects matching how getBBox+getCTM would resolve them in
// real DOM. Done once outside the hot loop — bench measures snap, not
// rect resolution.
function rects_for_ids(doc: SvgDocument, ids: ReadonlyArray<NodeId>): Rect[] {
  const out: Rect[] = [];
  for (const id of ids) {
    const tag = doc.tag_of(id);
    if (tag === "rect") {
      const x = parseFloat(doc.get_attr(id, "x") ?? "0");
      const y = parseFloat(doc.get_attr(id, "y") ?? "0");
      const w = parseFloat(doc.get_attr(id, "width") ?? "0");
      const h = parseFloat(doc.get_attr(id, "height") ?? "0");
      out.push({ x, y, width: w, height: h });
    } else if (tag === "g") {
      // Union the immediate-rect children for a synthetic group bbox.
      let minx = Infinity,
        miny = Infinity,
        maxx = -Infinity,
        maxy = -Infinity;
      for (const c of doc.element_children_of(id)) {
        if (doc.tag_of(c) !== "rect") continue;
        const x = parseFloat(doc.get_attr(c, "x") ?? "0");
        const y = parseFloat(doc.get_attr(c, "y") ?? "0");
        const w = parseFloat(doc.get_attr(c, "width") ?? "0");
        const h = parseFloat(doc.get_attr(c, "height") ?? "0");
        if (x < minx) minx = x;
        if (y < miny) miny = y;
        if (x + w > maxx) maxx = x + w;
        if (y + h > maxy) maxy = y + h;
      }
      if (minx !== Infinity) {
        out.push({ x: minx, y: miny, width: maxx - minx, height: maxy - miny });
      }
    }
  }
  return out;
}

describe("group snap descent — stress (100-leaf × 100-leaf)", () => {
  // ── pre-build (excluded from hot loop) ───────────────────────────────
  const doc = build_stress_doc();
  const [agent_g, neighbor_g] = ids_by_tag(doc, "g");

  // Phase 2 expanded sets
  const phase2_neighbor_ids = compute_neighborhood(doc, [agent_g]);
  const phase2_agent_ids = snap_descent(doc, agent_g);
  const phase2_agents = rects_for_ids(doc, phase2_agent_ids);
  const phase2_neighbors = rects_for_ids(doc, phase2_neighbor_ids);

  // Pre-Phase-2 (opaque) sets — single bbox each side, for contrast
  const opaque_agents = rects_for_ids(doc, [agent_g]);
  const opaque_neighbors = rects_for_ids(doc, [neighbor_g]);

  // Per-frame: open SnapSession once at gesture start, then call
  // snap() many times. Bench measures per-call cost.
  const phase2_session = new SnapSession({
    agents: phase2_agents,
    neighbors: phase2_neighbors,
  });
  const opaque_session = new SnapSession({
    agents: opaque_agents,
    neighbors: opaque_neighbors,
  });

  let tick = 0;

  bench("Phase 2 (descent) — SnapSession.snap() per frame", () => {
    // Sweep the agent across the gap so neighbors actually qualify
    // for snap-engine consideration during the run (not all frames
    // are out-of-range early-rejects).
    tick = (tick + 1) % 800;
    phase2_session.snap({ x: tick, y: 0 }, opts);
  });

  bench("Pre-Phase-2 (opaque baseline) — SnapSession.snap() per frame", () => {
    tick = (tick + 1) % 800;
    opaque_session.snap({ x: tick, y: 0 }, opts);
  });

  bench("Phase 2 (descent) — full open: snap_descent + compute_neighborhood + rect build", () => {
    compute_neighborhood(doc, [agent_g]);
    snap_descent(doc, agent_g);
  });
});
