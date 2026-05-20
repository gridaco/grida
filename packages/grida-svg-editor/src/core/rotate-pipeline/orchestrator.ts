// RotateOrchestrator — owns history-preview and baseline-capture lifecycles
// for rotate gestures. Mirrors `ResizeOrchestrator`.
//
// Multi-member groups: the HUD passes `intent.ids` per frame. The
// orchestrator captures per-member baselines around a shared pivot at
// gesture open, derives one composite plan, and runs the pipeline
// against it. `applyRotatePlan` loops members applying the shared
// `angle_radians` to each.
//
// Single-member groups are a special case of the multi path with
// `members.length === 1` — no different code path.
//
// Snap session: not opened in v1 (no geometry-snap, no pixel-grid for
// rotation). The field stays on `ActiveSession` for symmetry with
// resize/translate; a future angle-aware snap engine fits into the
// same slot.
//
// Refusal handling: `is_rotatable` is checked at gesture open. If any
// member refuses, the orchestrator captures the verdicts on the session
// and on `commit` discards the preview + returns the verdicts to the
// caller (which surfaces the chip). The preview itself still runs every
// frame so the user sees what would have happened.

import type { Preview, Delta } from "@grida/history";
import cmath from "@grida/cmath";
import type { NodeId, Rect, Vec2 } from "../../types";
import type { SvgDocument } from "../document";
import {
  capture_rotate_baselines,
  is_rotatable,
  type RotatableVerdict,
  type RotateBaseline,
} from "../intents";
import {
  run_rotate_pipeline,
  type RotateContext,
  type RotateModifiers,
  type RotateOptions,
  type RotatePipelineResult,
  type RotatePlan,
  type RotateStage,
} from "./pipeline";
import { STAGES_DEFAULT } from "./stages";
import { applyRotatePlan, revertRotatePlan } from "./apply";

const PROVIDER_ID = "svg-editor";

function ids_key(ids: ReadonlyArray<NodeId>): string {
  return [...ids].sort().join("\0");
}

/** Frozen state for an in-flight rotate gesture. */
type ActiveSession = {
  ids_key: string;
  members: ReadonlyArray<{ id: NodeId; baseline: RotateBaseline }>;
  pivot: Vec2;
  verdicts: ReadonlyMap<NodeId, RotatableVerdict>;
  preview: Preview;
  last_angle: number;
  last_stages: ReadonlyArray<RotateStage>;
};

export type RotateOrchestratorDeps = {
  get_doc: () => SvgDocument;
  emit: () => void;
  open_preview: (label: string) => Preview;
  options: () => RotateOptions;
  /** World-space bbox of the node, captured once at gesture start.
   *  Same shape as `ResizeOrchestratorDeps.bbox_world`. */
  bbox_world: (id: NodeId) => Rect;
};

/** Returned to the caller when the gesture commits. Lets the host
 *  decide whether to surface a refusal chip and what message to show. */
export type RotateCommitOutcome =
  | { kind: "committed"; plan: RotatePlan }
  | {
      kind: "refused";
      verdicts: ReadonlyMap<NodeId, RotatableVerdict>;
    };

export class RotateOrchestrator {
  private active: ActiveSession | null = null;

  constructor(private readonly deps: RotateOrchestratorDeps) {}

  has_active_session(): boolean {
    return this.active !== null;
  }

  is_active_for(ids: ReadonlyArray<NodeId>): boolean {
    return this.active !== null && this.active.ids_key === ids_key(ids);
  }

  /** Per-frame drive. Opens a session lazily on the first call. Returns
   *  `null` when `ids` is empty. On commit, returns a `RotateCommitOutcome`
   *  the caller uses to surface refusal chips. */
  drive(
    input: {
      ids: ReadonlyArray<NodeId>;
      angle_radians: number;
    },
    modifiers: RotateModifiers,
    opts: {
      phase: "preview" | "commit";
      stages?: ReadonlyArray<RotateStage>;
      label?: string;
    }
  ): {
    result: RotatePipelineResult;
    outcome: RotateCommitOutcome | null;
  } | null {
    if (input.ids.length === 0) return null;
    const key = ids_key(input.ids);
    if (this.active && this.active.ids_key !== key) {
      this.active.preview.discard();
      this.dispose_session();
    }
    if (this.active === null) {
      this.active = this.open(input.ids, opts.label ?? "rotate");
    }
    const session = this.active;
    const stages = opts.stages ?? STAGES_DEFAULT;
    const result = this.run_pass(
      session,
      input.angle_radians,
      modifiers,
      stages
    );
    session.last_angle = input.angle_radians;
    session.last_stages = stages;
    this.write_preview(session, result.plan);
    if (opts.phase === "commit") {
      let outcome: RotateCommitOutcome;
      // If any member is non-rotatable, refuse the commit — discard the
      // preview and report the verdicts. The user saw the preview but no
      // IR mutation lands.
      let refused = false;
      for (const v of session.verdicts.values()) {
        if (v.kind === "refuse") {
          refused = true;
          break;
        }
      }
      if (refused) {
        session.preview.discard();
        outcome = { kind: "refused", verdicts: session.verdicts };
      } else {
        session.preview.commit();
        outcome = { kind: "committed", plan: result.plan };
      }
      this.dispose_session();
      return { result, outcome };
    }
    return { result, outcome: null };
  }

  redrive_modifiers(modifiers: RotateModifiers): RotatePipelineResult | null {
    if (!this.active) return null;
    const session = this.active;
    const result = this.run_pass(
      session,
      session.last_angle,
      modifiers,
      session.last_stages
    );
    this.write_preview(session, result.plan);
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
    angle_radians: number,
    modifiers: RotateModifiers,
    stages: ReadonlyArray<RotateStage>
  ): RotatePipelineResult {
    const plan0: RotatePlan = {
      members: session.members,
      pivot: session.pivot,
      angle_radians,
    };
    const ctx: RotateContext = {
      input: {
        ids: session.members.map((m) => m.id),
        angle_radians,
      },
      modifiers,
      options: this.deps.options(),
    };
    return run_rotate_pipeline(plan0, stages, ctx);
  }

  private open(ids: ReadonlyArray<NodeId>, label: string): ActiveSession {
    const doc = this.deps.get_doc();
    // Drop descendants whose ancestor is also in the gesture set.
    // Same hazard as translate/resize: a parent's transform rotation and
    // a descendant's own rotation would compose into double-rotation.
    const filtered = doc.prune_nested_nodes(ids);
    // Pivot = union-bbox center, frozen at gesture start.
    const pivot = compute_union_center(filtered, this.deps.bbox_world);
    const baselines = capture_rotate_baselines(doc, filtered, pivot);
    const members = filtered.map((id) => ({
      id,
      baseline: baselines.get(id) as RotateBaseline,
    }));
    const verdicts = new Map<NodeId, RotatableVerdict>();
    for (const id of filtered) verdicts.set(id, is_rotatable(doc, id));
    return {
      ids_key: ids_key(ids),
      members,
      pivot,
      verdicts,
      preview: this.deps.open_preview(label),
      last_angle: 0,
      last_stages: STAGES_DEFAULT,
    };
  }

  private write_preview(session: ActiveSession, plan: RotatePlan): void {
    const doc = this.deps.get_doc();
    const emit = this.deps.emit;
    session.preview.set({
      providerId: PROVIDER_ID,
      apply: () => {
        applyRotatePlan(doc, plan);
        emit();
      },
      revert: () => {
        revertRotatePlan(doc, plan);
        emit();
      },
    } as Delta);
  }

  private dispose_session(): void {
    this.active = null;
  }
}

function compute_union_center(
  ids: ReadonlyArray<NodeId>,
  bbox_world: (id: NodeId) => Rect
): Vec2 {
  const rects = ids.map(bbox_world);
  const u = cmath.rect.union(rects);
  return { x: u.x + u.width / 2, y: u.y + u.height / 2 };
}
