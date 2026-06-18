// ResizeOrchestrator — owns snap-session, history-preview, and baseline-
// capture lifecycles for resize gestures. Mirrors `TranslateOrchestrator`.
//
// Multi-member groups: the HUD passes `intent.ids` (the group's member
// ids) per frame. The orchestrator captures per-member baselines at
// gesture open, derives a union bbox, and runs the pipeline against a
// synthesized free `rect`-kind baseline over the union. Apply writes
// each member's attrs using the shared `(sx, sy, origin)` — per-tag
// constraint arms inside `apply_resize` execute against each member's
// own captured baseline (circle uniform, text edge no-op, etc.).
//
// Single-member groups are a special case of the multi path with
// `members.length === 1`; the pipeline baseline is the member's own
// baseline so `eff.uniform` snap correction still fires for circles
// and text-on-corner drags.

import type { Preview, Delta } from "@grida/history";
import type { guide as _guide } from "@grida/cmath/_snap";
import cmath from "@grida/cmath";
import type { NodeId, Rect } from "../../types";
import type { SvgDocument } from "../document";
import type { SnapSession } from "../snap";
import {
  resize_pipeline,
  type ResizeBaseline,
  type ResizeDirection,
  type ResizeContext,
  type ResizeModifiers,
  type ResizeOptions,
  type ResizePipelineResult,
  type ResizePlan,
  type ResizeStage,
} from "./resize-pipeline";

const PROVIDER_ID = "svg-editor";

/** West/north-anchor flips invert the corresponding world delta so a
 *  positive value always grows the moving edge outward — the convention
 *  `compute_resize_factors` consumes. */
function sign_adjust(
  dir: ResizeDirection,
  dx_world: number,
  dy_world: number
): { dx: number; dy: number } {
  const dx = dir === "w" || dir === "nw" || dir === "sw" ? -dx_world : dx_world;
  const dy = dir === "n" || dir === "ne" || dir === "nw" ? -dy_world : dy_world;
  return { dx, dy };
}

/** Stable, order-independent key for an id set — used by `is_active_for`
 *  to decide whether the current session targets the same group. */
function ids_key(ids: ReadonlyArray<NodeId>): string {
  return [...ids].sort().join("\0");
}

/** Frozen state for an in-flight resize gesture. */
type ActiveSession = {
  /** Order-independent key over `members.map(m => m.id)`. */
  ids_key: string;
  /** Primary id — placeholder for `ResizePlan.id` (the pipeline doesn't
   *  consume it; we keep the field so the plan type stays single-shape
   *  for both single- and multi-member groups). */
  primary_id: NodeId;
  direction: ResizeDirection;
  members: ReadonlyArray<{ id: NodeId; baseline: ResizeBaseline }>;
  /** Pipeline baseline — equals `members[0].baseline` for single-member
   *  groups (so per-element snap constraints fire); a synthesized free
   *  `rect`-kind baseline over the union bbox for multi-member groups. */
  baseline: ResizeBaseline;
  snap: SnapSession | null;
  preview: Preview;
  /** Last frame's input — retained so `redrive_modifiers` can re-run
   *  the pipeline without a new pointer event. */
  last_dx: number;
  last_dy: number;
  last_stages: ReadonlyArray<ResizeStage>;
};

export type ResizeOrchestratorDeps = {
  get_doc: () => SvgDocument;
  emit: () => void;
  open_preview: (label: string) => Preview;
  open_snap: (ids: ReadonlyArray<NodeId>) => SnapSession | null;
  options: () => ResizeOptions;
  /** World-space bbox of the node, captured once at gesture start. The
   *  pipeline derives effective rects from this; `apply_resize` writes
   *  back using the same baseline. For flat docs (the design target —
   *  no `<g transform>` ancestor, no nested `<svg>`) world ≡ own-frame
   *  and this is just `getBBox()`. */
  bbox_world: (id: NodeId) => Rect;
};

export class ResizeOrchestrator {
  private active: ActiveSession | null = null;
  private _last_guides: ReadonlyArray<_guide.SnapGuide> = [];

  constructor(private readonly deps: ResizeOrchestratorDeps) {}

  /** Guides emitted by the most recent pipeline run. Cleared on
   *  cancel/dispose. */
  get last_guides(): ReadonlyArray<_guide.SnapGuide> {
    return this._last_guides;
  }

  has_active_session(): boolean {
    return this.active !== null;
  }

  /** Is the gesture currently targeting `ids` with `direction`? Used by
   *  the HUD dispatch to decide whether to reset the session on a new
   *  handle / target. Order-independent. */
  is_active_for(
    ids: ReadonlyArray<NodeId>,
    direction: ResizeDirection
  ): boolean {
    return (
      this.active !== null &&
      this.active.direction === direction &&
      this.active.ids_key === ids_key(ids)
    );
  }

  /** Per-frame drive. Opens a session lazily on the first call. The
   *  HUD passes its gesture-target rect dimensions in **world space**;
   *  the orchestrator derives the signed world-frame delta against its
   *  captured `baseline.bbox`. The DOM adapter is responsible for the
   *  CSS-px → world conversion at the intent boundary. */
  drive(
    input: {
      ids: ReadonlyArray<NodeId>;
      direction: ResizeDirection;
      /** Width of the HUD's gesture-target rect in world space. */
      target_width: number;
      /** Height of the HUD's gesture-target rect in world space. */
      target_height: number;
    },
    modifiers: ResizeModifiers,
    opts: {
      phase: "preview" | "commit";
      snap: boolean;
      stages?: ReadonlyArray<ResizeStage>;
      label?: string;
    }
  ): ResizePipelineResult | null {
    if (input.ids.length === 0) return null;
    const doc = this.deps.get_doc();
    // Reject groups containing any non-resizable tag OR any rotated node —
    // resizing a rotated element via local-space attrs diverges from the
    // user's screen-space drag.
    for (const id of input.ids) {
      if (!resize_pipeline.intent.is_resizable_node(doc, id)) return null;
    }
    const key = ids_key(input.ids);
    if (
      this.active &&
      (this.active.ids_key !== key || this.active.direction !== input.direction)
    ) {
      // Switching target / handle mid-flight: discard the in-flight
      // preview and start fresh.
      this.active.preview.discard();
      this.dispose_session();
    }
    if (this.active === null) {
      this.active = this.open(
        input.ids,
        input.direction,
        opts.snap,
        opts.label ?? "resize"
      );
    }
    const session = this.active;
    const bbox = session.baseline.bbox;
    const dx_world = input.target_width - bbox.width;
    const dy_world = input.target_height - bbox.height;
    const d = sign_adjust(input.direction, dx_world, dy_world);
    const stages = opts.stages ?? resize_pipeline.stages.DEFAULT;
    const result = this.run_pass(session, d.dx, d.dy, modifiers, stages);
    session.last_dx = d.dx;
    session.last_dy = d.dy;
    session.last_stages = stages;
    this.write_preview(session, result.plan, opts.phase);
    if (opts.phase === "commit") {
      session.preview.commit();
      this.dispose_session();
    }
    return result;
  }

  /** Re-run the current preview frame with new modifiers. */
  redrive_modifiers(modifiers: ResizeModifiers): ResizePipelineResult | null {
    if (!this.active) return null;
    const session = this.active;
    const result = this.run_pass(
      session,
      session.last_dx,
      session.last_dy,
      modifiers,
      session.last_stages
    );
    this.write_preview(session, result.plan, "preview");
    return result;
  }

  cancel(): void {
    if (!this.active) return;
    this.active.preview.discard();
    this.dispose_session();
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  private run_pass(
    session: ActiveSession,
    dx: number,
    dy: number,
    modifiers: ResizeModifiers,
    stages: ReadonlyArray<ResizeStage>
  ): ResizePipelineResult {
    const plan0: ResizePlan = {
      id: session.primary_id,
      baseline: session.baseline,
      members: session.members,
      direction: session.direction,
      dx,
      dy,
      from_center: modifiers.from_center,
      aspect_lock: modifiers.aspect_lock === "uniform",
    };
    const ctx: ResizeContext = {
      input: {
        id: session.primary_id,
        direction: session.direction,
        dx,
        dy,
      },
      modifiers,
      options: this.deps.options(),
      snap_session: session.snap,
    };
    const result = resize_pipeline.run(plan0, stages, ctx);
    this._last_guides = result.guides;
    return result;
  }

  private open(
    ids: ReadonlyArray<NodeId>,
    direction: ResizeDirection,
    snap: boolean,
    label: string
  ): ActiveSession {
    const doc = this.deps.get_doc();
    const members = ids.map((id) => ({
      id,
      baseline: resize_pipeline.intent.capture_baseline(
        doc,
        id,
        this.deps.bbox_world(id)
      ),
    }));
    // Pipeline baseline: for single-member groups, reuse the member's
    // own baseline so per-element snap (`eff.uniform`) fires correctly.
    // For multi-member groups, synthesize a free `rect`-kind baseline
    // over the union bbox so the group resizes as a whole.
    const baseline =
      members.length === 1
        ? members[0].baseline
        : resize_pipeline.synthesize_group_baseline(
            cmath.rect.union(members.map((m) => m.baseline.bbox))
          );
    return {
      ids_key: ids_key(ids),
      primary_id: members[0].id,
      direction,
      members,
      baseline,
      snap: snap ? this.deps.open_snap(ids) : null,
      preview: this.deps.open_preview(label),
      last_dx: 0,
      last_dy: 0,
      last_stages: resize_pipeline.stages.DEFAULT,
    };
  }

  private write_preview(
    session: ActiveSession,
    plan: ResizePlan,
    phase: "preview" | "commit"
  ): void {
    const doc = this.deps.get_doc();
    const emit = this.deps.emit;
    session.preview.set({
      providerId: PROVIDER_ID,
      apply: () => {
        resize_pipeline.apply(doc, plan, phase);
        emit();
      },
      revert: () => {
        resize_pipeline.revert(doc, plan);
        emit();
      },
    } as Delta);
  }

  private dispose_session(): void {
    if (!this.active) return;
    this.active.snap?.dispose();
    this.active = null;
    this._last_guides = [];
  }
}
