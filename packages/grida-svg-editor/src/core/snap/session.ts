// Gesture-scoped snap state.
//
// Editor-agnostic — this file MUST NOT import any document, DOM, or
// editor type. It is a candidate to extract to a shared snap package
// (see `./README.md`).
//
// Coordinate space: callers feed rects, deltas, and thresholds in **world
// space** — the root SVG's own user-coordinate system. The session is
// space-agnostic per the constructor docs below; "world" is the choice
// made by the editor's DOM adapter so that pipeline math stays exact
// across camera zooms. CSS-pixel thresholds are converted to world
// units by the adapter (`threshold_world = px / camera.zoom`) before
// being passed to `SnapOptions`.
//
// No internal integer-pixel quantization. Earlier versions quantized
// anchors and the translated agent at q=1 to defend against the
// sub-pixel float noise that `getBBox()` ∘ `getScreenCTM()` produced
// under the container-space pipeline. The world-space refactor sources
// rects directly from parsed attributes (exact), so the defense is no
// longer warranted, and the quantization was making the snap engine
// force every snap-engaged delta onto integer pixels — turning "snap
// to alignment" into "snap to alignment AND to the pixel grid",
// independent of the `snap_to_pixel_grid` setting. Pixel-grid is now
// solely the responsibility of `stage_pixel_grid` downstream.

import cmath from "@grida/cmath";
import { guide as _guide, snapToCanvasGeometry } from "@grida/cmath/_snap";
import type { Rect, Vec2 } from "../../types";
import type { SnapOptions } from "./options";

/** Which edge of an effective rect is "moving" along an axis, for the
 *  resize-snap pass. `null` means that axis is fixed for the current
 *  gesture (e.g. E-handle drag fixes y entirely). */
export type ResizeMovingEdges = {
  x: "left" | "right" | null;
  y: "top" | "bottom" | null;
};

/** Result of a single resize-snap call: the corrections to apply to the
 *  moving corner's x / y, plus a guide for HUD rendering. Both are zero
 *  when no snap fires; corrections are signed in the same space as the
 *  effective rect. */
export type ResizeSnapStepResult = {
  /** Signed correction on the moving x edge. `0` when no x snap fired or
   *  `edges.x` is `null`. */
  dx: number;
  /** Signed correction on the moving y edge. `0` when no y snap fired or
   *  `edges.y` is `null`. */
  dy: number;
  guide: _guide.SnapGuide | undefined;
};

/**
 * Sub-pixel tolerance used as the effective threshold for `"aligned"`
 * policy. cmath's `snap1D` only fires when |delta| ≤ threshold, so
 * setting the threshold near zero means the engine only matches
 * alignments that are already exact (within rounding noise). We can't
 * use a post-hoc `correction == 0` check instead — `snap1D` locks in
 * the FIRST signed delta it finds (lexicographic over the 9-point
 * order), so a touching pair where `agent.left↔anchor.left` needs +10
 * while `agent.right↔anchor.left` needs 0 will return correction = 10,
 * not 0. The tiny-threshold trick lets only the 0-delta matches pass.
 */
const ALIGNED_THRESHOLD = 0.5;

/**
 * Guide emission policy.
 *
 *  - `"engine"` (default, drag): emit the cmath guide whenever the
 *    engine finds any anchor within threshold. The caller is expected
 *    to apply the returned corrected delta, so the agent ends up at
 *    `translated` — exactly where cmath plots the guide. Drag-snap UX.
 *
 *  - `"aligned"` (nudge faux-snap, any detection-only consumer): emit
 *    the guide ONLY when the corrected delta is exactly zero — i.e.
 *    the agent IS already aligned to an anchor. When the engine could
 *    correct but the caller won't, "within threshold but not aligned"
 *    is not alignment, so no guide is shown. This makes drag and nudge
 *    render IDENTICAL guides whenever a guide appears: at the exact
 *    alignment, on both sides' edge.
 */
export type SnapGuidePolicy = "engine" | "aligned";

export type SnapStepResult = {
  delta: Vec2;
  guide: _guide.SnapGuide | undefined;
};

/**
 * Gesture-scoped snap state. Constructor freezes agent + neighbor rects
 * once; `snap()` runs the cmath engine per frame against the frozen
 * inputs. Rects are in whatever space the caller chose (svg-editor uses
 * HUD-container CSS px); the engine is space-agnostic as long as agents,
 * neighbors, delta, and threshold all share that space.
 */
export class SnapSession {
  private agents: readonly Rect[] | null;
  /** Pre-quantized neighbor rects. Frozen at construction so the
   *  per-frame snap call doesn't reallocate them every pointermove. */
  private anchors: readonly cmath.Rectangle[] | null;
  /** `cmath.rect.union(agents)` at the un-translated, un-quantized
   *  baseline. The corrected delta is derived from this — using the
   *  quantized candidate-translated rect instead makes `corrected`
   *  discontinuous in dx (1-px jitter inside a snap zone). */
  private baseline_union: cmath.Rectangle | null;
  /** Pre-flattened candidate x/y offsets (each anchor contributes
   *  left/center/right and top/center/bottom). Built once here so
   *  `snap_resize` doesn't rebuild a 3·N-length array per pointer-move. */
  private anchor_xs: readonly number[] | null;
  private anchor_ys: readonly number[] | null;
  /** Most recent guide from `snap()`. Cleared on dispose. */
  private _last_guide: _guide.SnapGuide | undefined = undefined;

  constructor(opts: {
    agents: ReadonlyArray<Rect>;
    neighbors: ReadonlyArray<Rect>;
  }) {
    // Drop 0-area rects on both sides. An empty `<g>` reports
    // bbox `{0,0,0,0}` via `getBBox()`; without this filter the snap
    // engine would align (0,0) edges against any neighbor within
    // threshold of the origin, producing a visible "jerk to origin"
    // when an empty group is selected and dragged (or selected as a
    // neighbor). A degenerate line (width>0 || height>0) survives —
    // a horizontal line is a valid snap target on its y edge.
    const live_agents = opts.agents.filter((r) => r.width > 0 || r.height > 0);
    const live_neighbors = opts.neighbors.filter(
      (r) => r.width > 0 || r.height > 0
    );
    this.agents = live_agents;
    this.anchors = live_neighbors;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const a of live_neighbors) {
      xs.push(a.x, a.x + a.width / 2, a.x + a.width);
      ys.push(a.y, a.y + a.height / 2, a.y + a.height);
    }
    this.anchor_xs = xs;
    this.anchor_ys = ys;
    this.baseline_union =
      live_agents.length > 0 ? cmath.rect.union([...live_agents]) : null;
  }

  /** Read-only snapshot of the most recent guide. Host code consumes
   *  this from `compute_snap_extra()` style helpers. */
  get last_guide(): _guide.SnapGuide | undefined {
    return this._last_guide;
  }

  /** Read-only snapshot of the pre-translation agent-union rect.
   *  Consumed by the translate pipeline's `stage_pixel_grid` to anchor
   *  the integer-grid quantization on the gesture's starting origin
   *  (so a rect at `x=0.5` settles to `x=1` after first nudge, not on
   *  every fractional drag). Returns `null` when no agents were frozen. */
  get baseline_union_readonly(): cmath.Rectangle | null {
    return this.baseline_union;
  }

  /**
   * Run snap for a candidate cumulative delta.
   *
   * Returns the corrected delta (== input when no snap fires or snap
   * is disabled) and a `SnapGuide` for HUD rendering (`undefined` when
   * no guide should be drawn). Guide emission is governed by `policy`
   * — see `SnapGuidePolicy`.
   *
   * The same guide is also stashed on `last_guide`.
   */
  snap(
    delta: Vec2,
    opts: SnapOptions,
    policy: SnapGuidePolicy = "engine"
  ): SnapStepResult {
    const baseline = this.baseline_union;
    if (
      !opts.enabled ||
      !baseline ||
      !this.agents ||
      !this.anchors ||
      this.anchors.length === 0
    ) {
      this._last_guide = undefined;
      return { delta, guide: undefined };
    }

    const dx = delta.x;
    const dy = delta.y;

    const translated: cmath.Rectangle[] = [];
    for (const r of this.agents) {
      translated.push({
        x: r.x + dx,
        y: r.y + dy,
        width: r.width,
        height: r.height,
      });
    }
    const agent_rect = cmath.rect.union(translated);

    // O(N · 9) protection: pad by threshold + agent extent on each
    // axis, drop anchors that are out of range on BOTH axes. cmath
    // snaps each axis independently — an anchor far on y can still
    // contribute an x-axis match (e.g., two elements vertically far
    // apart but sharing a left edge), so the filter must keep anchors
    // that overlap the envelope on EITHER axis. A pure box-box AABB
    // overlap test would silently drop those legitimate cross-axis
    // alignments.
    const padX = opts.threshold_px + agent_rect.width;
    const padY = opts.threshold_px + agent_rect.height;
    const minX = agent_rect.x - padX;
    const maxX = agent_rect.x + agent_rect.width + padX;
    const minY = agent_rect.y - padY;
    const maxY = agent_rect.y + agent_rect.height + padY;
    const nearby: cmath.Rectangle[] = [];
    for (const r of this.anchors) {
      const rMaxX = r.x + r.width;
      const rMaxY = r.y + r.height;
      const x_overlap = rMaxX >= minX && r.x <= maxX;
      const y_overlap = rMaxY >= minY && r.y <= maxY;
      if (x_overlap || y_overlap) nearby.push(r);
    }

    // For correction (the returned delta) always use the caller's
    // threshold — drag and nudge both compute "could this snap?" against
    // the configured threshold. The GUIDE under `"aligned"` policy, by
    // contrast, must reflect "is this exactly aligned NOW?", so we run
    // cmath a second time with a sub-pixel threshold. That second pass
    // only fires on already-touching alignments → the guide it emits is
    // byte-identical to what drag would render at exact alignment, and
    // silent otherwise.
    const result = snapToCanvasGeometry(
      agent_rect,
      { objects: nearby },
      { x: opts.threshold_px, y: opts.threshold_px }
    );

    const corrected: Vec2 = result.by_objects
      ? {
          x: result.by_objects.translated.x - baseline.x,
          y: result.by_objects.translated.y - baseline.y,
        }
      : { x: dx, y: dy };

    const guide_source =
      policy === "aligned"
        ? snapToCanvasGeometry(
            agent_rect,
            { objects: nearby },
            { x: ALIGNED_THRESHOLD, y: ALIGNED_THRESHOLD }
          )
        : result;

    const sg = _guide.plot(guide_source);
    const has_guide =
      sg.lines.length > 0 || sg.points.length > 0 || sg.rules.length > 0;
    const guide = has_guide ? sg : undefined;
    this._last_guide = guide;
    return { delta: corrected, guide };
  }

  /**
   * Resize-snap pass.
   *
   * Snaps the *moving edges* of an effective rect (post per-element
   * constraint) against the frozen neighbor anchors. The caller is
   * responsible for computing the effective rect — see
   * `effective_resize` in `../resize-capability.ts`. This entrypoint
   * does NOT understand circle / text uniformity; it only sees the rect
   * and the edge mask.
   *
   * Per-axis snap candidates are the neighbors' left / center-x / right
   * (for x) and top / center-y / bottom (for y), exactly what
   * translate-snap uses. Only the moving edge participates as the agent
   * — the opposite edge is fixed by the resize anchor and must not
   * contribute corrections.
   *
   * Returns signed corrections in the rect's space. Guide is a SnapGuide
   * compatible with `snapGuideToHUDDraw`.
   */
  snap_resize(
    effective_rect: Rect,
    edges: ResizeMovingEdges,
    opts: SnapOptions
  ): ResizeSnapStepResult {
    if (
      !opts.enabled ||
      !this.anchor_xs ||
      this.anchor_xs.length === 0 ||
      (edges.x === null && edges.y === null)
    ) {
      this._last_guide = undefined;
      return { dx: 0, dy: 0, guide: undefined };
    }

    const agent_x =
      edges.x === "left"
        ? effective_rect.x
        : edges.x === "right"
          ? effective_rect.x + effective_rect.width
          : null;
    const agent_y =
      edges.y === "top"
        ? effective_rect.y
        : edges.y === "bottom"
          ? effective_rect.y + effective_rect.height
          : null;

    let dx = 0;
    let dy = 0;
    let hit_x_offset: number | null = null;
    let hit_y_offset: number | null = null;

    if (agent_x !== null) {
      const r = cmath.ext.snap.snap1D(
        [agent_x],
        this.anchor_xs as number[],
        opts.threshold_px
      );
      if (Number.isFinite(r.distance)) {
        dx = r.distance;
        hit_x_offset = agent_x + r.distance;
      }
    }
    if (agent_y !== null && this.anchor_ys) {
      const r = cmath.ext.snap.snap1D(
        [agent_y],
        this.anchor_ys as number[],
        opts.threshold_px
      );
      if (Number.isFinite(r.distance)) {
        dy = r.distance;
        hit_y_offset = agent_y + r.distance;
      }
    }

    let guide: _guide.SnapGuide | undefined = undefined;
    if (hit_x_offset !== null || hit_y_offset !== null) {
      const rules: cmath.ui.Rule[] = [];
      if (hit_x_offset !== null) rules.push(["x", hit_x_offset]);
      if (hit_y_offset !== null) rules.push(["y", hit_y_offset]);
      guide = { lines: [], points: [], rules };
    }
    this._last_guide = guide;
    return { dx, dy, guide };
  }

  /** Release frozen refs. After dispose, `snap()` returns identity and
   *  `last_guide` is undefined. */
  dispose(): void {
    this.agents = null;
    this.anchors = null;
    this.anchor_xs = null;
    this.anchor_ys = null;
    this.baseline_union = null;
    this._last_guide = undefined;
  }
}
