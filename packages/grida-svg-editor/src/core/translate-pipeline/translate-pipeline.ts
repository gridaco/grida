// Translate pipeline — the funnel every position-mutating call flows
// through.
//
// Editor-agnostic. This file MUST NOT import any DOM type. It composes
// pure stages against a frozen context, and writes through
// `SvgDocument`'s typed attr-set chokepoint.
//
// Coordinate space: the pipeline operates in **world space** — the
// root SVG's own user-coordinate system. Plan deltas, snap-session
// inputs, pixel-grid quantization, and baseline rects all live in this
// space. `intent.apply` writes raw attributes (own-frame); for flat
// docs (no `<g transform>` ancestor, no nested `<svg>`) world ≡ own
// and no projection step exists. The DOM adapter is responsible for
// converting CSS-pixel cursor deltas to world deltas at the intent
// boundary (`camera.transform.invert`) and for projecting snap guides
// world → screen at HUD paint time. `getScreenCTM` does not feed
// pipeline math.
//
// See ./README.md for the boundary discipline that keeps the directory
// extractable to a shared package.

import cmath from "@grida/cmath";
import type { guide as _guide } from "@grida/cmath/_snap";
import { SVGPathData, SVGPathDataTransformer } from "@grida/svg/pathdata";
import { svg_parse } from "@grida/svg/parse";
import type { NodeId, Vec2 } from "../../types";
import type { SvgDocument } from "../document";
import { transform } from "../transform";
import type { SnapSession, SnapGuidePolicy } from "../snap";

export type TranslateBaseline =
  | { type: "viaTransform"; transform: string | null }
  | { type: "rect"; x: number; y: number }
  | { type: "circle"; cx: number; cy: number }
  | { type: "ellipse"; cx: number; cy: number }
  | { type: "line"; x1: number; y1: number; x2: number; y2: number }
  | { type: "polyline"; points: string }
  | { type: "polygon"; points: string }
  | { type: "path"; d: string }
  | { type: "text"; x: number; y: number }
  // A `<tspan>` is positioned by text flow, not (necessarily) by `x`/`y`.
  // Translating it via absolute `x`/`y` would teleport a flow-positioned span
  // to the origin (absent attr read as 0). SVG `transform` does not apply to
  // `<tspan>` either. So we move it with RELATIVE `dx`/`dy` offsets, composed
  // on top of whatever positioning it already has. `d{x,y}` is the leading
  // offset value (0 when absent); `d{x,y}_attr` is the original attribute
  // string, retained so revert restores it exactly — including removal when
  // the attribute was absent.
  | {
      type: "tspan";
      dx: number;
      dy: number;
      dx_attr: string | null;
      dy_attr: string | null;
    }
  | { type: "image"; x: number; y: number }
  | { type: "use"; x: number; y: number }
  | { type: "unsupported" };

/** Input to the pipeline. `movement` is cmath's axis-aware carrier in
 *  **world space** (one document unit per integer): `null` on an axis
 *  means "locked — no contribution this frame". Stages downstream of
 *  `stages.axis_lock` see plan.delta (Vec2) instead. */
export type TranslateInput = {
  ids: ReadonlyArray<NodeId>;
  movement: cmath.ext.movement.Movement;
};

export type TranslateModifiers = {
  /** Shift-drag axis lock. `"by_dominance"` snaps to the larger of
   *  |dx|, |dy|. */
  axis_lock: "off" | "by_dominance";
  /** Hard override — skip the snap stage regardless of session /
   *  options. Used by RPC and align / distribute commands. */
  force_disable_snap: boolean;
  /** Alt-drag translate-with-clone (gridaco/grida#817). Consumed ONLY by
   *  the orchestrator's session reconciliation (clone/unclone at toggle
   *  edges); pipeline stages never read it — stage purity holds. Absent
   *  = off, so nudge / RPC / dwell constructors stay untouched. */
  clone?: boolean;
};

export type TranslateOptions = {
  /** `null` (or `<= 0`) = pixel-grid stage is identity. */
  pixel_grid_quantum: number | null;
  snap_enabled: boolean;
  snap_threshold_px: number;
};

export type TranslateContext = {
  input: TranslateInput;
  modifiers: TranslateModifiers;
  options: TranslateOptions;
  snap_session: SnapSession | null;
  snap_policy: SnapGuidePolicy;
};

/** The mutating shape that flows through stages. `delta` starts at
 *  `{x:0,y:0}` (stages.axis_lock populates from ctx.input.movement). */
export type TranslatePlan = {
  ids: ReadonlyArray<NodeId>;
  baselines: ReadonlyMap<NodeId, TranslateBaseline>;
  delta: Vec2;
};

/** Side effects a stage may emit. The shell aggregates these into
 *  PipelineResult.guides. Stages MUST NOT mutate plan/ctx. */
export type StageEmission = {
  guide?: _guide.SnapGuide;
};

export type TranslateStage = {
  readonly name: string;
  run(
    plan: TranslatePlan,
    ctx: TranslateContext
  ): { plan: TranslatePlan; emit?: StageEmission };
};

export type PipelineResult = {
  plan: TranslatePlan;
  guides: ReadonlyArray<_guide.SnapGuide>;
};

export namespace translate_pipeline {
  // ─── intent — pure per-element baseline + apply ──────────────────────

  export namespace intent {
    function num(
      doc: SvgDocument,
      id: NodeId,
      name: string,
      fallback = 0
    ): number {
      return svg_parse.parse_number(doc.get_attr(id, name), fallback);
    }

    export function capture_baseline(
      doc: SvgDocument,
      id: NodeId
    ): TranslateBaseline {
      const tag = doc.tag_of(id);
      const own_transform = doc.get_attr(id, "transform");
      if (own_transform !== null || tag === "g") {
        return { type: "viaTransform", transform: own_transform };
      }
      switch (tag) {
        case "rect":
          return {
            type: "rect",
            x: num(doc, id, "x"),
            y: num(doc, id, "y"),
          };
        case "circle":
          return {
            type: "circle",
            cx: num(doc, id, "cx"),
            cy: num(doc, id, "cy"),
          };
        case "ellipse":
          return {
            type: "ellipse",
            cx: num(doc, id, "cx"),
            cy: num(doc, id, "cy"),
          };
        case "line":
          return {
            type: "line",
            x1: num(doc, id, "x1"),
            y1: num(doc, id, "y1"),
            x2: num(doc, id, "x2"),
            y2: num(doc, id, "y2"),
          };
        case "polyline":
          return {
            type: "polyline",
            points: doc.get_attr(id, "points") ?? "",
          };
        case "polygon":
          return {
            type: "polygon",
            points: doc.get_attr(id, "points") ?? "",
          };
        case "path":
          return { type: "path", d: doc.get_attr(id, "d") ?? "" };
        case "text":
          return { type: "text", x: num(doc, id, "x"), y: num(doc, id, "y") };
        case "tspan": {
          // Move via relative `dx`/`dy`; capture the leading offset (whole-run
          // shift) plus the original attribute string for faithful revert.
          const dx_attr = doc.get_attr(id, "dx");
          const dy_attr = doc.get_attr(id, "dy");
          return {
            type: "tspan",
            dx: svg_parse.parse_number(dx_attr),
            dy: svg_parse.parse_number(dy_attr),
            dx_attr,
            dy_attr,
          };
        }
        case "image":
          return {
            type: "image",
            x: num(doc, id, "x"),
            y: num(doc, id, "y"),
          };
        case "use":
          return { type: "use", x: num(doc, id, "x"), y: num(doc, id, "y") };
        default:
          return { type: "unsupported" };
      }
    }

    /**
     * Batch variant of {@link capture_baseline} — captures baselines for
     * a set of ids into a `ReadonlyMap`. Used wherever a translate
     * operation needs to remember the pre-translation state of multiple
     * nodes (drag gesture, RPC, dwell detection).
     */
    export function capture_baselines(
      doc: SvgDocument,
      ids: ReadonlyArray<NodeId>
    ): ReadonlyMap<NodeId, TranslateBaseline> {
      const out = new Map<NodeId, TranslateBaseline>();
      for (const id of ids) out.set(id, capture_baseline(doc, id));
      return out;
    }

    /**
     * Representative anchor point of a `TranslateBaseline` — the
     * attribute coordinate `apply` offsets. Used by callers that need
     * to align baselines to an external lattice (pixel-grid, custom
     * snap).
     *
     * Rules per element kind:
     *   - rect / text / image / use: `(x, y)`
     *   - tspan: `null` (moved via relative `dx`/`dy`; no absolute anchor)
     *   - circle / ellipse: `(cx, cy)` (no radius subtracted —
     *     consistent anchor across all kinds, not a true bounds top-
     *     left)
     *   - line / polyline / polygon: min of endpoints / points
     *   - path: first M/m command's coords (best-effort; the path-data
     *     layer would be needed for a tight bbox)
     *   - viaTransform / unsupported: `null` — no document-space anchor
     *     available without the doc itself
     */
    export function baseline_anchor(b: TranslateBaseline): Vec2 | null {
      switch (b.type) {
        case "rect":
        case "text":
        case "image":
        case "use":
          return { x: b.x, y: b.y };
        case "tspan":
          // Moved by relative `dx`/`dy`, so there is no absolute document-
          // space anchor to align to a lattice (pixel-grid / custom snap).
          return null;
        case "circle":
        case "ellipse":
          return { x: b.cx, y: b.cy };
        case "line":
          return { x: Math.min(b.x1, b.x2), y: Math.min(b.y1, b.y2) };
        case "polyline":
        case "polygon":
          return svg_parse.points_top_left(svg_parse.parse_points(b.points));
        case "path":
          return svg_parse.parse_path_first_move(b.d);
        case "viaTransform": {
          const ops = transform.parse(b.transform);
          if (ops === null) return null;
          for (const op of ops) {
            if (op.type === "translate") return { x: op.tx, y: op.ty };
            break;
          }
          return null;
        }
        case "unsupported":
          return null;
      }
    }

    /**
     * Top-left of the union over a collection of `TranslateBaseline`s.
     * Returns `null` when no baseline yields an anchor (e.g. all
     * `viaTransform` / `unsupported`). Callers fall through (no
     * alignment).
     */
    export function baseline_union_top_left(
      baselines: ReadonlyMap<unknown, TranslateBaseline>
    ): Vec2 | null {
      const anchors: Vec2[] = [];
      for (const b of baselines.values()) {
        const p = baseline_anchor(b);
        if (p) anchors.push(p);
      }
      return svg_parse.points_top_left(anchors);
    }

    function shift_points_string(
      points: string,
      dx: number,
      dy: number
    ): string {
      if (dx === 0 && dy === 0) return points;
      return svg_parse
        .parse_points(points)
        .map((p) => `${p.x + dx},${p.y + dy}`)
        .join(" ");
    }

    export function compose_leading_translate(
      existing: string,
      dx: number,
      dy: number
    ): string | null {
      if (dx === 0 && dy === 0) return existing ? existing : null;
      if (!existing) return `translate(${dx} ${dy})`;
      const lead = svg_parse.parse_leading_translate(existing);
      if (lead) {
        const tx = lead.tx + dx;
        const ty = lead.ty + dy;
        return lead.rest
          ? `translate(${tx} ${ty}) ${lead.rest}`
          : `translate(${tx} ${ty})`;
      }
      return `translate(${dx} ${dy}) ${existing}`;
    }

    /** Rewrite the leading value of a `dx`/`dy` offset list to `value`,
     *  preserving any per-glyph kerning tail (`compose("3 1 2", 9)` →
     *  `"9 1 2"`). Empty separators are dropped, so a stray leading comma
     *  doesn't lose the tail. With no original attribute (or a single
     *  value), emit just `value`. The leading value shifts the whole run. */
    function compose_leading_offset(
      attr: string | null,
      value: number
    ): string {
      if (attr === null) return String(value);
      const tokens = attr
        .trim()
        .split(/[\s,]+/)
        .filter((t) => t !== "");
      if (tokens.length <= 1) return String(value);
      tokens[0] = String(value);
      return tokens.join(" ");
    }

    function shift_path_d(d: string, dx: number, dy: number): string {
      if (dx === 0 && dy === 0) return d;
      try {
        return new SVGPathData(d)
          .transform(SVGPathDataTransformer.TRANSLATE(dx, dy))
          .encode();
      } catch {
        return d;
      }
    }

    export function apply(
      doc: SvgDocument,
      id: NodeId,
      baseline: TranslateBaseline,
      dx: number,
      dy: number
    ): void {
      switch (baseline.type) {
        case "viaTransform":
          doc.set_attr(
            id,
            "transform",
            compose_leading_translate(baseline.transform ?? "", dx, dy)
          );
          return;
        case "rect":
        case "image":
        case "use":
        case "text":
          doc.set_attr(id, "x", String(baseline.x + dx));
          doc.set_attr(id, "y", String(baseline.y + dy));
          return;
        case "tspan":
          // Relative offsets — never absolute x/y (would teleport a
          // flow-positioned span). Composed on top of the original offsets.
          doc.set_attr(
            id,
            "dx",
            compose_leading_offset(baseline.dx_attr, baseline.dx + dx)
          );
          doc.set_attr(
            id,
            "dy",
            compose_leading_offset(baseline.dy_attr, baseline.dy + dy)
          );
          return;
        case "circle":
        case "ellipse":
          doc.set_attr(id, "cx", String(baseline.cx + dx));
          doc.set_attr(id, "cy", String(baseline.cy + dy));
          return;
        case "line":
          doc.set_attr(id, "x1", String(baseline.x1 + dx));
          doc.set_attr(id, "y1", String(baseline.y1 + dy));
          doc.set_attr(id, "x2", String(baseline.x2 + dx));
          doc.set_attr(id, "y2", String(baseline.y2 + dy));
          return;
        case "polyline":
        case "polygon":
          doc.set_attr(
            id,
            "points",
            shift_points_string(baseline.points, dx, dy)
          );
          return;
        case "path":
          doc.set_attr(id, "d", shift_path_d(baseline.d, dx, dy));
          return;
        case "unsupported":
          return;
      }
    }

    /** Restore an element to its pre-translate state. For most kinds this is
     *  `apply(..., 0, 0)` (baseline values, delta zero). `<tspan>` is special:
     *  its `dx`/`dy` must be restored to the EXACT original attribute strings
     *  — including removal when they were absent — so undo cannot leave a
     *  fabricated `dx="0"` / `dy="0"` behind. */
    export function revert(
      doc: SvgDocument,
      id: NodeId,
      baseline: TranslateBaseline
    ): void {
      if (baseline.type === "tspan") {
        doc.set_attr(id, "dx", baseline.dx_attr);
        doc.set_attr(id, "dy", baseline.dy_attr);
        return;
      }
      apply(doc, id, baseline, 0, 0);
    }
  }

  // ─── stages — pure functions composed by `run` ───────────────────────
  //
  // See `./README.md` for order / contracts.

  export namespace stages {
    /** Bridges `ctx.input.movement` (Movement) → `plan.delta` (Vec2),
     *  collapsing the lesser axis when
     *  `axis_lock === "by_dominance"`. */
    export const axis_lock: TranslateStage = {
      name: "axis_lock",
      run(plan, ctx) {
        const m = ctx.input.movement;
        const locked =
          ctx.modifiers.axis_lock === "by_dominance"
            ? cmath.ext.movement.axisLockedByDominance(m)
            : m;
        const [x, y] = cmath.ext.movement.normalize(locked);
        return { plan: { ...plan, delta: { x, y } } };
      },
    };

    /** Consults `ctx.snap_session` for geometry-aligned correction;
     *  emits a guide per `ctx.snap_policy`. Identity on
     *  `force_disable_snap`, missing session, or
     *  `snap_enabled === false`. */
    export const snap: TranslateStage = {
      name: "snap",
      run(plan, ctx) {
        if (ctx.modifiers.force_disable_snap) return { plan };
        if (!ctx.snap_session) return { plan };
        if (!ctx.options.snap_enabled) return { plan };
        const r = ctx.snap_session.snap(
          plan.delta,
          { enabled: true, threshold_px: ctx.options.snap_threshold_px },
          ctx.snap_policy
        );
        return {
          plan: { ...plan, delta: r.delta },
          emit: r.guide ? { guide: r.guide } : undefined,
        };
      },
    };

    /** Quantizes the agent-union origin + plan.delta to integer
     *  multiples of `options.pixel_grid_quantum`. Anchor comes from
     *  the snap session when open; falls back to
     *  `intent.baseline_union_top_left` (RPC path). Identity when
     *  quantum is `null` or `<= 0`. */
    export const pixel_grid: TranslateStage = {
      name: "pixel_grid",
      run(plan, ctx) {
        const q = ctx.options.pixel_grid_quantum;
        if (q === null || q <= 0) return { plan };
        const anchor =
          ctx.snap_session?.baseline_union_readonly ??
          intent.baseline_union_top_left(plan.baselines);
        if (!anchor) return { plan };
        const qx = Math.round((anchor.x + plan.delta.x) / q) * q - anchor.x;
        const qy = Math.round((anchor.y + plan.delta.y) / q) * q - anchor.y;
        return { plan: { ...plan, delta: { x: qx, y: qy } } };
      },
    };

    export const DEFAULT: ReadonlyArray<TranslateStage> = Object.freeze([
      axis_lock,
      snap,
      pixel_grid,
    ]);

    export const NUDGE: ReadonlyArray<TranslateStage> = Object.freeze([
      axis_lock,
      pixel_grid,
    ]);

    export const RPC: ReadonlyArray<TranslateStage> = Object.freeze([
      axis_lock,
    ]);
  }

  // ─── pipeline funnel + plan apply / revert / RPC prep ────────────────

  /** The funnel. Threads `plan` through `stages` in order; aggregates
   *  guide emissions. Pure: same inputs → same outputs. */
  export function run(
    init: TranslatePlan,
    stages: ReadonlyArray<TranslateStage>,
    ctx: TranslateContext
  ): PipelineResult {
    let plan = init;
    const guides: _guide.SnapGuide[] = [];
    for (const stage of stages) {
      const out = stage.run(plan, ctx);
      plan = out.plan;
      if (out.emit?.guide) guides.push(out.emit.guide);
    }
    return { plan, guides };
  }

  /** Projects a world-space delta into the frame the target element's
   *  position attributes are written in (its parent user-space). Identity
   *  for flat docs; non-trivial under a scaled/rotated `<g>` ancestor or a
   *  nested `<svg>` viewport that scales its user space. Supplied by the
   *  DOM layer (see `GeometryProvider.world_delta_to_local`); the pure
   *  pipeline cannot derive it without a layout engine. */
  export type DeltaProjector = (id: NodeId, delta: Vec2) => Vec2;

  /** Apply the plan: for each id, run `intent.apply` with the baseline
   *  + world-space delta. When `project` is given, the world delta is
   *  re-expressed in each element's local frame first (nested-viewport /
   *  transformed-ancestor correctness); absent, the raw world delta is
   *  used (flat-doc fast path). Does NOT emit; caller wraps with history
   *  machinery and calls `emit()` after. */
  export function apply(
    doc: SvgDocument,
    plan: TranslatePlan,
    project?: DeltaProjector
  ): void {
    for (const id of plan.ids) {
      const baseline = plan.baselines.get(id);
      if (!baseline) continue;
      const d = project ? project(id, plan.delta) : plan.delta;
      intent.apply(doc, id, baseline, d.x, d.y);
    }
  }

  /** Reset each id to its baseline (delta = 0). Used by undo
   *  closures. */
  export function revert(doc: SvgDocument, plan: TranslatePlan): void {
    for (const id of plan.ids) {
      const baseline = plan.baselines.get(id);
      if (!baseline) continue;
      intent.revert(doc, id, baseline);
    }
  }

  /** Prepare a one-shot, headless translate. Captures baselines, runs
   *  the pipeline with `stages` (default `stages.RPC`), returns ready-
   *  to-record closures. Caller wraps in history (e.g.
   *  `history.atomic`). See `./README.md` for the per-caller stage
   *  lists. */
  export function prepare_rpc(args: {
    doc: SvgDocument;
    ids: ReadonlyArray<NodeId>;
    delta: Vec2;
    options: TranslateOptions;
    emit: () => void;
    stages?: ReadonlyArray<TranslateStage>;
    /** World→local delta projector (nested-viewport / transformed-ancestor
     *  correctness). Omit for flat-doc callers. See {@link DeltaProjector}. */
    project?: DeltaProjector;
  }): { plan: TranslatePlan; apply: () => void; revert: () => void } {
    const {
      doc,
      ids,
      delta,
      options,
      emit,
      stages: stage_list = stages.RPC,
      project,
    } = args;
    // Drop descendants whose ancestor is also in the gesture set —
    // otherwise both the parent's `transform` AND the child's own
    // attrs shift, double-displacing the child. See
    // `SvgDocument.prune_nested_nodes` for the rationale.
    const filtered_ids = doc.prune_nested_nodes(ids);
    const plan0: TranslatePlan = {
      ids: filtered_ids,
      baselines: intent.capture_baselines(doc, filtered_ids),
      delta: { x: 0, y: 0 },
    };
    const ctx: TranslateContext = {
      input: { ids: plan0.ids, movement: [delta.x, delta.y] },
      modifiers: { axis_lock: "off", force_disable_snap: true },
      options,
      snap_session: null,
      snap_policy: "engine",
    };
    const { plan } = run(plan0, stage_list, ctx);
    return {
      plan,
      apply: () => {
        apply(doc, plan, project);
        emit();
      },
      revert: () => {
        revert(doc, plan);
        emit();
      },
    };
  }
}
