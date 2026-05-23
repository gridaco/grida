// Rotate pipeline — sibling to translate-pipeline and resize-pipeline.
// The funnel every rotate-mutating gesture flows through.
//
// Editor-agnostic. This file MUST NOT import any DOM type. It composes
// pure stages against a frozen context, and writes through
// `SvgDocument`'s typed attr-set chokepoint.
//
// Coordinate space: the pipeline operates in **world space** — `pivot`
// is in root-SVG own user units; `angle` is radians (delta from gesture
// start). `intent.apply` converts to degrees at the boundary (SVG wire
// format). The DOM adapter converts cursor → angle delta at the intent
// boundary; the pipeline never sees screen pixels.
//
// Shape mirrors resize-pipeline deliberately: same stage protocol,
// same plan-threading, same multi-member shape. Per-member baselines +
// shared pivot live on the plan; `apply` loops members and calls
// `intent.apply` once each.
//
// Refuse set (`intent.is_rotatable` returns a `reason`-tagged verdict):
//   1. non-trivial-transform     — `transform=` parses to something
//                                   more complex than a leading
//                                   translate + at most one rotate.
//                                   Includes matrix / scale / skew /
//                                   multiple rotates / out of order.
//                                   Flatten Transform recovers.
//   2. text-with-glyph-rotate    — `<text rotate>` is the per-glyph
//                                   typesetting attribute; composing
//                                   with `transform="rotate(...)"` is
//                                   well-defined math but ambiguous UX.
//   3. css-property-transform    — `style="transform: ..."` (CSS-
//                                   property, not the attribute)
//                                   interacts with `transform-box` and
//                                   the cascade in ways v1 doesn't
//                                   handle. Move the declaration to
//                                   the attribute first.
//   4. animated-transform        — `<animateTransform>` child means
//                                   the static `transform=` is the
//                                   base value under `additive="sum"`
//                                   but is overridden under
//                                   `additive="replace"` (the default).
//                                   User intent ambiguous.
//
// Visual-position-jump caveat: when the source has an existing
// rotation (`single_rotate_only` /
// `leading_translate_then_single_rotate`), `intent.apply` replaces the
// pivot with the bbox-center pivot of the new gesture. If the
// original pivot was elsewhere, the element jumps visually at gesture
// start. This is a v1 limitation; Flatten Transform pre-bakes the
// original to recover. Documented and tested.

import type { NodeId, Vec2 } from "../../types";
import type { SvgDocument } from "../document";
import { transform, type TransformOp } from "../transform";

export type RotatableVerdict =
  | { kind: "yes" }
  | {
      kind: "refuse";
      reason:
        | "non-trivial-transform"
        | "text-with-glyph-rotate"
        | "css-property-transform"
        | "animated-transform";
    };

export type RotateBaseline = {
  /** Original `transform=` verbatim — for byte-equal identity-restore
   *  on angle === 0 (and no pre-existing rotation). */
  transform: string | null;
  /** Leading translate component of the parsed transform list, if any.
   *  Preserved across the rotate so the emit is
   *  `translate(...) rotate(...)`. */
  leading_translate: Vec2 | null;
  /** Pre-existing rotation angle in degrees from the parsed list (the
   *  SVG transform string carries degrees). Zero when the source had
   *  no rotation. */
  current_rotation_deg: number;
  /** World-space pivot, frozen at gesture start. The bbox-center pivot
   *  policy is enforced by the orchestrator; this field doesn't care
   *  where it came from. */
  pivot: Vec2;
};

/** Input to the pipeline. `angle_radians` is the gesture's accumulated
 *  delta from gesture start; positive = CCW per SVG convention (Y-axis
 *  points down, so positive angle rotates clockwise visually). */
export type RotateInput = {
  ids: ReadonlyArray<NodeId>;
  angle_radians: number;
};

export type RotateModifiers = {
  /** Shift-drag angle snap. When `"step"`, the angle quantizes to
   *  integer multiples of `options.angle_snap_step_radians`. */
  angle_snap: "off" | "step";
  /** Hard override — skip the snap stage regardless of session /
   *  options. */
  force_disable_snap: boolean;
};

export type RotateOptions = {
  /** Step size for shift-drag angle snap. `null` (or `<= 0`) disables. */
  angle_snap_step_radians: number | null;
};

export type RotateContext = {
  input: RotateInput;
  modifiers: RotateModifiers;
  options: RotateOptions;
};

/** The mutating shape that flows through stages.
 *
 *  - `members` carries per-member baselines captured at gesture open.
 *    Each member's `RotateBaseline.pivot` is the **shared** pivot, by
 *    construction at capture time.
 *  - `angle_radians` is the gesture's accumulated rotation; stages may
 *    quantize it (snap-to-step). `apply` passes it verbatim to
 *    `intent.apply` for each member. */
export type RotatePlan = {
  members: ReadonlyArray<{ id: NodeId; baseline: RotateBaseline }>;
  pivot: Vec2;
  angle_radians: number;
};

export type RotateStageEmission = {
  // Rotation has no snap-guide concept in v1 — angle snap is silent.
  // Field reserved for future edge-parallel snap engine.
};

export type RotateStage = {
  readonly name: string;
  run(
    plan: RotatePlan,
    ctx: RotateContext
  ): { plan: RotatePlan; emit?: RotateStageEmission };
};

export type RotatePipelineResult = {
  plan: RotatePlan;
};

/** Result of a one-shot rotate preparation. `verdicts` lets the caller
 *  surface refusal chips if any member's baseline isn't rotatable; the
 *  caller decides whether to commit or discard. */
export type PreparedRotate = {
  plan: RotatePlan;
  verdicts: ReadonlyMap<NodeId, RotatableVerdict>;
  apply: () => void;
  revert: () => void;
};

export namespace rotate_pipeline {
  // ─── intent — pure per-element baseline + apply ──────────────────────

  export namespace intent {
    /**
     * Inspect a node and decide whether the rotate gesture is safe to
     * apply. Used by the rotate-orchestrator at gesture commit to drop
     * the preview with a chip rather than emit a defensible-but-noisy
     * `transform=`.
     *
     * This function is a **composer**, not a fact source: each branch
     * delegates to either the `transform` module (for transform-string
     * parsing/classification) or the `SvgDocument` structural-fact
     * predicates (`has_glyph_rotate`, `has_inline_css_transform`,
     * `has_animate_transform_child`). The composition (intent-level
     * verdict) lives here; the facts live in their proper layers.
     *
     * Order of checks matches the order the user is most likely to
     * see; the first failure short-circuits.
     */
    export function is_rotatable(
      doc: SvgDocument,
      id: NodeId
    ): RotatableVerdict {
      // 1. Transform attribute parses to an appendable shape.
      //    (Owned by the transform module.)
      const own_transform = doc.get_attr(id, "transform");
      const ops = transform.parse(own_transform);
      if (ops === null) {
        return { kind: "refuse", reason: "non-trivial-transform" };
      }
      const cls = transform.classify(ops);
      if (cls === "mixed") {
        return { kind: "refuse", reason: "non-trivial-transform" };
      }
      // 2. No per-glyph `<text rotate="...">` conflict.
      if (doc.has_glyph_rotate(id)) {
        return { kind: "refuse", reason: "text-with-glyph-rotate" };
      }
      // 3. No inline CSS `style="transform: ..."` shadowing our writes.
      if (doc.has_inline_css_transform(id)) {
        return { kind: "refuse", reason: "css-property-transform" };
      }
      // 4. No `<animateTransform>` child producing a time-varying
      //    transform.
      if (doc.has_animate_transform_child(id)) {
        return { kind: "refuse", reason: "animated-transform" };
      }
      return { kind: "yes" };
    }

    function find_op<K extends TransformOp["type"]>(
      ops: ReadonlyArray<TransformOp>,
      type: K
    ): Extract<TransformOp, { type: K }> | null {
      for (const op of ops) {
        if (op.type === type) return op as Extract<TransformOp, { type: K }>;
      }
      return null;
    }

    export function capture_baseline(
      doc: SvgDocument,
      id: NodeId,
      pivot: Vec2
    ): RotateBaseline {
      const transform_str = doc.get_attr(id, "transform");
      const ops = transform.parse(transform_str) ?? [];
      const lead = find_op(ops, "translate");
      const rot = find_op(ops, "rotate");
      return {
        transform: transform_str,
        leading_translate: lead ? { x: lead.tx, y: lead.ty } : null,
        current_rotation_deg: rot?.angle ?? 0,
        pivot,
      };
    }

    export function capture_baselines(
      doc: SvgDocument,
      ids: ReadonlyArray<NodeId>,
      pivot: Vec2
    ): ReadonlyMap<NodeId, RotateBaseline> {
      const out = new Map<NodeId, RotateBaseline>();
      for (const id of ids) out.set(id, capture_baseline(doc, id, pivot));
      return out;
    }

    const RAD_TO_DEG = 180 / Math.PI;

    /** Snap trailing FP noise off the 10th decimal place. The rad→deg
     *  conversion + addition produce e.g. `29.999999999999996` for
     *  what the user dragged as "30°"; rounding to 1e-9 absorbs the
     *  noise without losing any user-meaningful precision (SVG
     *  coordinates rarely go past 4 decimals in authored content).
     *
     *  Limits drift accumulation across a long gesture: each frame's
     *  emit re-renders from `current_rotation_deg + delta_deg`, where
     *  the delta is recomputed against the gesture-start anchor — not
     *  accumulated. So noise stays bounded per-frame. */
    function fmt_angle(n: number): string {
      return String(Math.round(n * 1e9) / 1e9);
    }

    /**
     * Compose
     * `baseline.current_rotation_deg + degrees(angle_radians)` into a
     * single `rotate(θ_total cx cy)` token, preserving any leading
     * translate the baseline captured. Pivot is expressed in pre-
     * translate local space (`pivot - leading_translate`), which is
     * the correct space for `rotate(θ cx cy)` per SVG 1.1 §7.6.
     *
     * Identity-restore: when angle === 0 AND current_rotation === 0,
     * restore the original `transform=` byte-equal (may have been
     * null). This is the round-trip invariant the "rotated then
     * rotated back" test locks down.
     */
    export function apply(
      doc: SvgDocument,
      id: NodeId,
      baseline: RotateBaseline,
      angle_radians: number
    ): void {
      const angle_deg = angle_radians * RAD_TO_DEG;
      const total = baseline.current_rotation_deg + angle_deg;
      // Identity-restore: only when both the gesture delta AND any
      // pre-existing rotation are zero. Otherwise we have to write a
      // rotate token.
      if (total === 0 && angle_deg === 0) {
        doc.set_attr(id, "transform", baseline.transform);
        return;
      }
      const tx = baseline.leading_translate?.x ?? 0;
      const ty = baseline.leading_translate?.y ?? 0;
      const cx = baseline.pivot.x - tx;
      const cy = baseline.pivot.y - ty;
      // 3-arg canonical: a re-parse yields `explicit_pivot: true`,
      // which the resize gate requires to consider the element editor-
      // authored.
      const rotate_token = `rotate(${fmt_angle(total)} ${cx} ${cy})`;
      const str = baseline.leading_translate
        ? `translate(${tx} ${ty}) ${rotate_token}`
        : rotate_token;
      doc.set_attr(id, "transform", str);
    }
  }

  // ─── stages — pure functions composed by `run` ───────────────────────
  //
  // v1 ships one stage: `stages.angle_snap`. Shift-drag snaps the
  // angle to integer multiples of `options.angle_snap_step_radians`
  // (default π/12 = 15°). The snap is applied to the *total* angle
  // from gesture start — the user expects "shift" to mean "land on a
  // clean increment from the baseline rotation", not "round the delta-
  // this-frame."
  //
  // Identity-restore: when `current_rotation_deg + delta = 0`, no
  // rotation is written; `intent.apply` honors the byte-equal restore.
  // This stage doesn't need a special-case — `angle_radians = 0`
  // round-trips through the snap math unchanged when the step divides
  // 0 (it always does).

  export namespace stages {
    /** Snap the rotation angle to multiples of
     *  `options.angle_snap_step_radians` when shift is held. No-op on
     *  the off / disabled / unset path. */
    export const angle_snap: RotateStage = {
      name: "angle_snap",
      run(plan, ctx) {
        if (ctx.modifiers.force_disable_snap) return { plan };
        if (ctx.modifiers.angle_snap !== "step") return { plan };
        const step = ctx.options.angle_snap_step_radians;
        if (step === null || step <= 0) return { plan };
        const snapped = Math.round(plan.angle_radians / step) * step;
        return { plan: { ...plan, angle_radians: snapped } };
      },
    };

    /** Default stage list for HUD-driven rotate gestures (drag). */
    export const DEFAULT: ReadonlyArray<RotateStage> = Object.freeze([
      angle_snap,
    ]);

    /** Stage list for headless RPC paths (`commands.rotate`,
     *  `rotate_to`). No snap — the caller passed an exact angle on
     *  purpose. */
    export const RPC: ReadonlyArray<RotateStage> = Object.freeze([]);
  }

  // ─── pipeline funnel + plan apply / revert + RPC prep ────────────────

  /** The funnel. Threads `plan` through `stages` in order. Pure: same
   *  inputs → same outputs. */
  export function run(
    init: RotatePlan,
    stages: ReadonlyArray<RotateStage>,
    ctx: RotateContext
  ): RotatePipelineResult {
    let plan = init;
    for (const stage of stages) {
      const out = stage.run(plan, ctx);
      plan = out.plan;
    }
    return { plan };
  }

  export function apply(doc: SvgDocument, plan: RotatePlan): void {
    for (const m of plan.members) {
      intent.apply(doc, m.id, m.baseline, plan.angle_radians);
    }
  }

  /** Reset each member to its baseline rotation (angle_radians = 0).
   *  Used by undo closures. Identity-restore byte-equality kicks in
   *  when the baseline had no pre-existing rotation. */
  export function revert(doc: SvgDocument, plan: RotatePlan): void {
    for (const m of plan.members) {
      intent.apply(doc, m.id, m.baseline, 0);
    }
  }

  /** Headless one-shot rotate. Captures per-member baselines around
   *  the shared pivot, runs the pipeline with `stages` (default
   *  `stages.RPC`), returns ready-to-record closures + per-member
   *  refusal verdicts. The caller wraps the closures in history (e.g.
   *  `history.atomic`).
   *
   *  Verdicts: if any member returns `kind: "refuse"`, the caller
   *  SHOULD drop the gesture and emit a chip instead of committing.
   *  The `apply` closure here doesn't gate on verdicts — that's a
   *  policy decision at the call site (a programmatic
   *  `commands.rotate` may still want to force-write through; the
   *  interactive path does not). */
  export function prepare_rpc(args: {
    doc: SvgDocument;
    ids: ReadonlyArray<NodeId>;
    pivot: Vec2;
    angle_radians: number;
    options: RotateOptions;
    emit: () => void;
    stages?: ReadonlyArray<RotateStage>;
  }): PreparedRotate {
    const {
      doc,
      ids,
      pivot,
      angle_radians,
      options,
      emit,
      stages: stage_list = stages.RPC,
    } = args;
    // Drop descendants whose ancestor is also in the gesture set —
    // otherwise both the parent's `transform` AND the child's own
    // attrs rotate around pivots that differ by the parent's
    // accumulated transform, producing double-displacement. Same
    // rationale as translate / resize.
    const filtered_ids = doc.prune_nested_nodes(ids);
    const baselines = intent.capture_baselines(doc, filtered_ids, pivot);
    const members = filtered_ids.map((id) => ({
      id,
      baseline: baselines.get(id) as RotateBaseline,
    }));
    const verdicts = new Map<NodeId, RotatableVerdict>();
    for (const id of filtered_ids)
      verdicts.set(id, intent.is_rotatable(doc, id));
    const plan0: RotatePlan = { members, pivot, angle_radians };
    const ctx: RotateContext = {
      input: { ids: filtered_ids, angle_radians },
      modifiers: { angle_snap: "off", force_disable_snap: true },
      options,
    };
    const { plan } = run(plan0, stage_list, ctx);
    return {
      plan,
      verdicts,
      apply: () => {
        apply(doc, plan);
        emit();
      },
      revert: () => {
        revert(doc, plan);
        emit();
      },
    };
  }
}
