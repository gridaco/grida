// TranslateOrchestrator — owns snap-session, history-preview, and
// baseline-capture lifecycles for translate gestures. Bridges the
// editor-agnostic pipeline (pipeline.ts / stages.ts) to the editor-
// specific SvgDocument + history + DOM unproject layer.
//
// See `./README.md` for the lifecycle contract (gesture frame N → commit;
// nudge → detect_after_commit + dwell timer).

import type { Preview, Delta } from "@grida/history";
import type { guide as _guide } from "@grida/cmath/_snap";
import type { NodeId } from "../../types";
import type { SvgDocument } from "../document";
import type { SnapSession, SnapGuidePolicy } from "../snap";
import {
  translate_pipeline,
  type TranslateBaseline,
  type TranslateInput,
  type TranslateModifiers,
  type TranslateOptions,
  type TranslatePlan,
  type TranslateStage,
  type PipelineResult,
  type TranslateContext,
} from "./translate-pipeline";

/** Frozen state for an in-flight translate gesture. */
type ActiveSession = {
  ids: ReadonlyArray<NodeId>;
  baselines: ReadonlyMap<NodeId, TranslateBaseline>;
  snap: SnapSession | null;
  preview: Preview;
  /** Last frame's inputs — retained so `redrive_modifiers` can re-run
   *  the pipeline when a modifier key flips between pointer-move events
   *  (e.g. Shift down/up mid-drag → axis-lock toggle). */
  last_movement: TranslateInput["movement"];
  last_policy: SnapGuidePolicy;
  last_stages: ReadonlyArray<TranslateStage>;
};

export type OrchestratorDeps = {
  /** Live document handle. Called per drive(); orchestrator does not
   *  cache to avoid staleness across editor commands. */
  get_doc: () => SvgDocument;
  /** Emit notification — flushes editor subscribers after a mutation. */
  emit: () => void;
  /** Open a new `history.preview` session. */
  open_preview: (label: string) => Preview;
  /** Open a `SnapSession` against the given ids. Returns `null` to
   *  signal "no snap this gesture" (e.g. policy / configuration). */
  open_snap: (ids: ReadonlyArray<NodeId>) => SnapSession | null;
  /** Derive `TranslateOptions` from the current editor state/style.
   *  Called per drive() so a runtime style flip (e.g. flipping
   *  snap_to_pixel_grid mid-drag) takes effect on the next frame. */
  options: () => TranslateOptions;
};

const PROVIDER_ID = "svg-editor";

export class TranslateOrchestrator {
  private active: ActiveSession | null = null;
  private _last_guides: ReadonlyArray<_guide.SnapGuide> = [];

  constructor(private readonly deps: OrchestratorDeps) {}

  /** Guides emitted by the most recent pipeline run. Cleared on
   *  cancel/dispose. HUD compositors read this to draw snap chrome. */
  get last_guides(): ReadonlyArray<_guide.SnapGuide> {
    return this._last_guides;
  }

  /** True while a gesture session is open. */
  has_active_session(): boolean {
    return this.active !== null;
  }

  /** Per-frame drive: lazily opens a session on first call, runs the
   *  pipeline, writes apply/revert into the preview, and commits when
   *  `opts.phase === "commit"`. */
  drive(
    input: TranslateInput,
    modifiers: TranslateModifiers,
    opts: {
      phase: "preview" | "commit";
      policy: SnapGuidePolicy;
      snap: boolean;
      stages?: ReadonlyArray<TranslateStage>;
      label?: string;
    }
  ): PipelineResult {
    if (this.active === null) {
      this.active = this.open(input.ids, opts.snap, opts.label ?? "move");
    }
    const session = this.active;
    const stages = opts.stages ?? translate_pipeline.stages.DEFAULT;
    const result = this.run_pass(
      session,
      input.movement,
      modifiers,
      opts.policy,
      stages
    );
    session.last_movement = input.movement;
    session.last_policy = opts.policy;
    session.last_stages = stages;

    this.write_preview_delta(session, result.plan);

    if (opts.phase === "commit") {
      session.preview.commit();
      this.dispose_session();
    }
    return result;
  }

  /** Re-run the current preview frame with new modifiers, reusing the
   *  last-known movement / policy / stages. Used when a modifier key
   *  changes between pointer-move events (Shift down/up mid-drag).
   *  No-op when no session is active. */
  redrive_modifiers(modifiers: TranslateModifiers): PipelineResult | null {
    if (!this.active) return null;
    const session = this.active;
    const result = this.run_pass(
      session,
      session.last_movement,
      modifiers,
      session.last_policy,
      session.last_stages
    );
    this.write_preview_delta(session, result.plan);
    return result;
  }

  /** Cancel an in-flight gesture (Escape, programmatic abort). */
  cancel(): void {
    if (!this.active) return;
    this.active.preview.discard();
    this.dispose_session();
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  /** Build a plan + context, run the pipeline, stash guides. Pure
   *  computation — does not touch the preview. */
  private run_pass(
    session: ActiveSession,
    movement: TranslateInput["movement"],
    modifiers: TranslateModifiers,
    policy: SnapGuidePolicy,
    stages: ReadonlyArray<TranslateStage>
  ): PipelineResult {
    const plan0: TranslatePlan = {
      ids: session.ids,
      baselines: session.baselines,
      delta: { x: 0, y: 0 },
    };
    const ctx: TranslateContext = {
      input: { ids: session.ids, movement },
      modifiers,
      options: this.deps.options(),
      snap_session: session.snap,
      snap_policy: policy,
    };
    const result = translate_pipeline.run(plan0, stages, ctx);
    this._last_guides = result.guides;
    return result;
  }

  private open(
    ids: ReadonlyArray<NodeId>,
    snap: boolean,
    label: string
  ): ActiveSession {
    const doc = this.deps.get_doc();
    // Drop descendants whose ancestor is also in the gesture set — the
    // parent's `transform` is the single source of motion for any
    // selected subtree. See `SvgDocument.prune_nested_nodes` for the
    // rationale.
    const filtered = doc.prune_nested_nodes(ids);
    return {
      ids: filtered,
      baselines: translate_pipeline.intent.capture_baselines(doc, filtered),
      // Snap session sees the same id set so its neighborhood policy is
      // consistent with the actual movers.
      snap: snap ? this.deps.open_snap(filtered) : null,
      preview: this.deps.open_preview(label),
      last_movement: [0, 0],
      last_policy: "engine",
      last_stages: translate_pipeline.stages.DEFAULT,
    };
  }

  /** Bind a fresh apply/revert pair (closure over `plan`) into the
   *  preview slot. Called from both `drive` (per pointer frame) and
   *  `redrive_modifiers` (on modifier flip). */
  private write_preview_delta(
    session: ActiveSession,
    plan: TranslatePlan
  ): void {
    const doc = this.deps.get_doc();
    const emit = this.deps.emit;
    session.preview.set({
      providerId: PROVIDER_ID,
      apply: () => {
        translate_pipeline.apply(doc, plan);
        emit();
      },
      revert: () => {
        translate_pipeline.revert(doc, plan);
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
