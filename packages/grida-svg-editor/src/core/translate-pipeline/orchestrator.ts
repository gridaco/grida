// TranslateOrchestrator — owns snap-session, history-preview, and
// baseline-capture lifecycles for translate gestures. Bridges the
// editor-agnostic pipeline (pipeline.ts / stages.ts) to the editor-
// specific SvgDocument + history + DOM unproject layer.
//
// See `./README.md` for the lifecycle contract (gesture frame N → commit;
// nudge → detect_after_commit + dwell timer; clone toggle edges).

import type { Preview, Delta } from "@grida/history";
import type { guide as _guide } from "@grida/cmath/_snap";
import type { NodeId } from "../../types";
import type { SvgDocument } from "../document";
import type { SnapSession, SnapGuidePolicy } from "../snap";
import { subtree } from "../subtree";
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

/**
 * Keyboard-modifier state for a gesture frame: the pipeline's
 * {@link TranslateModifiers} plus the clone toggle. `clone` is an
 * orchestrator concern (Alt-drag translate-with-clone, gridaco/grida#817)
 * — it is consumed by session reconciliation at toggle edges and is
 * deliberately NOT part of the editor-agnostic pipeline vocabulary, so a
 * stage cannot even reference it statically (`run_pass` narrows the
 * context back to `TranslateModifiers`).
 */
export type GestureModifiers = TranslateModifiers & {
  /** Alt-drag translate-with-clone. Absent = off. */
  clone?: boolean;
};

/** The cloned half of a gesture session — present while the gesture is
 *  translating CLONES instead of the at-open origins. */
type CloneState = {
  plan: subtree.SubtreeClonePlan;
  /** The clones, in plan order — the active movers while cloned. */
  ids: ReadonlyArray<NodeId>;
  /** Key-swapped baselines: a clone is a verbatim copy at rest, so its
   *  origin's baseline VALUE is its own. */
  baselines: ReadonlyMap<NodeId, TranslateBaseline>;
};

/** Frozen state for an in-flight translate gesture. `ids` / `baselines`
 *  are the at-open capture (the origins) and never change; while `clone`
 *  is non-null the active movers are the clone set instead. */
type ActiveSession = {
  ids: ReadonlyArray<NodeId>;
  baselines: ReadonlyMap<NodeId, TranslateBaseline>;
  snap: SnapSession | null;
  /** The `opts.snap` the gesture opened with — reused when the snap
   *  session is reopened against a retargeted id set. */
  snap_requested: boolean;
  preview: Preview;
  /** Last frame's inputs — retained so `redrive_modifiers` can re-run
   *  the pipeline when a modifier key flips between pointer-move events
   *  (e.g. Shift down/up mid-drag → axis-lock toggle). */
  last_movement: TranslateInput["movement"];
  last_policy: SnapGuidePolicy;
  last_stages: ReadonlyArray<TranslateStage>;
  clone: CloneState | null;
};

const movers = (s: ActiveSession): ReadonlyArray<NodeId> =>
  s.clone?.ids ?? s.ids;
const mover_baselines = (
  s: ActiveSession
): ReadonlyMap<NodeId, TranslateBaseline> => s.clone?.baselines ?? s.baselines;

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
  /** World→local delta projector (nested-viewport / transformed-ancestor
   *  correctness). Omit for flat-doc / DOM-less hosts; absent ⇒ raw world
   *  delta is written. See `translate_pipeline.DeltaProjector`. */
  project_delta?: translate_pipeline.DeltaProjector;
  /** Retarget the editor's selection when the clone modifier toggles the
   *  gesture between origins and clones. Optional — a host that doesn't
   *  wire it still gets correct document mutations; only the selection
   *  chrome lags. */
  set_selection?: (ids: ReadonlyArray<NodeId>) => void;
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
    modifiers: GestureModifiers,
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
    this.reconcile_clone(session, modifiers);
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

    if (opts.phase === "commit" && session.clone !== null) {
      this.write_commit_composite(session, result.plan);
    } else {
      this.write_preview_delta(session, result.plan);
    }

    if (opts.phase === "commit") {
      session.preview.commit();
      this.dispose_session();
    }
    return result;
  }

  /** Re-run the current preview frame with new modifiers, reusing the
   *  last-known movement / policy / stages. Used when a modifier key
   *  changes between pointer-move events (Shift down/up mid-drag,
   *  Alt down/up → clone toggle). No-op when no session is active. */
  redrive_modifiers(modifiers: GestureModifiers): PipelineResult | null {
    if (!this.active) return null;
    const session = this.active;
    this.reconcile_clone(session, modifiers);
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
    const session = this.active;
    // Discard first: the preview's revert writes baseline attrs onto
    // whichever id set is currently active (clones, when cloned).
    session.preview.discard();
    if (session.clone !== null) {
      // Structural rollback — the clones were inserted OUTSIDE the
      // preview (at the toggle edge), so they are removed here, and the
      // selection returns to the origins. Origins are already at rest
      // (enter_clone reverted them). Byte-exact restore. No snap reopen
      // (unlike exit_clone) — the session is disposed right after.
      subtree.remove_plan(this.deps.get_doc(), session.clone.plan);
      this.deps.set_selection?.(session.ids);
      this.deps.emit();
    }
    this.dispose_session();
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  /** Build a plan + context, run the pipeline, stash guides. Pure
   *  computation — does not touch the preview. The context's modifiers
   *  are the pipeline's own vocabulary: stages never see `clone`. */
  private run_pass(
    session: ActiveSession,
    movement: TranslateInput["movement"],
    modifiers: TranslateModifiers,
    policy: SnapGuidePolicy,
    stages: ReadonlyArray<TranslateStage>
  ): PipelineResult {
    const plan0: TranslatePlan = {
      ids: movers(session),
      baselines: mover_baselines(session),
      delta: { x: 0, y: 0 },
    };
    const ctx: TranslateContext = {
      input: { ids: plan0.ids, movement },
      modifiers,
      options: this.deps.options(),
      snap_session: session.snap,
      snap_policy: policy,
    };
    const result = translate_pipeline.run(plan0, stages, ctx);
    this._last_guides = result.guides;
    return result;
  }

  /**
   * Clone-modifier state machine (Alt-drag translate-with-clone). Runs
   * before each pipeline pass so a toggle takes effect on the very frame
   * it happens — lazy clone on the first frame with the modifier held.
   *
   * Both edges and the composite commit below depend on one invariant:
   * `translate_pipeline.*.revert` writes ABSOLUTE baseline values (incl.
   * tspan's exact-attr restore), so re-reverting an already-reverted set
   * is a no-op. A future relative-write baseline kind would break this.
   */
  private reconcile_clone(
    session: ActiveSession,
    modifiers: GestureModifiers
  ): void {
    const want = modifiers.clone === true;
    const cloned = session.clone !== null;
    if (want && !cloned) this.enter_clone(session);
    else if (!want && cloned) this.exit_clone(session);
  }

  /** Enter the cloned state: origins back to rest, verbatim clones
   *  inserted next to them, gesture + selection + snap retargeted to the
   *  clones. The origin set stays untouched for the rest of the cloned
   *  gesture — the CLONE moves, the origin stays (Figma convention). */
  private enter_clone(session: ActiveSession): void {
    const doc = this.deps.get_doc();
    // Origins back to baseline so each clone serializes at rest — the
    // in-flight displacement belongs to the gesture, not the document.
    translate_pipeline.revert(doc, {
      ids: session.ids,
      baselines: session.baselines,
      delta: { x: 0, y: 0 },
    });
    const plan = subtree.clone_plan(doc, session.ids);
    // Nothing cloneable (root / nested-<svg> / stale members only) —
    // stay uncloned; the gesture keeps moving the origins.
    if (plan.length === 0) return;
    subtree.insert_plan(doc, plan);

    // Key-swap is total: plan origins are a subset of the at-open ids,
    // and `capture_baselines` covered every one of them.
    const baselines = new Map<NodeId, TranslateBaseline>();
    for (const p of plan)
      baselines.set(p.clone, session.baselines.get(p.origin)!);
    session.clone = { plan, ids: plan.map((p) => p.clone), baselines };
    this.retarget(session, session.clone.ids);
  }

  /** Exit the cloned state: clones removed, gesture + selection + snap
   *  retargeted back to the origins, which resume following the cursor
   *  on the next pass. Removed clones stay in the document's id map
   *  (standard removed-node policy) and are never serialized; a stale
   *  preview delta auto-reverting onto them later is harmless. Re-press
   *  = fresh enter with new clones. */
  private exit_clone(session: ActiveSession): void {
    subtree.remove_plan(this.deps.get_doc(), session.clone!.plan);
    session.clone = null;
    this.retarget(session, session.ids);
  }

  /** Point selection + snap at the new mover set. Selection + emit run
   *  BEFORE the snap reopen: the surface re-renders on notify, so freshly
   *  inserted clones are measurable when the new snap session captures
   *  its neighborhood (where the origins are legitimate snap targets). */
  private retarget(session: ActiveSession, ids: ReadonlyArray<NodeId>): void {
    this.deps.set_selection?.(ids);
    this.deps.emit();
    session.snap?.dispose();
    session.snap = session.snap_requested ? this.deps.open_snap(ids) : null;
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
      snap_requested: snap,
      preview: this.deps.open_preview(label),
      last_movement: [0, 0],
      last_policy: "engine",
      last_stages: translate_pipeline.stages.DEFAULT,
      clone: null,
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
    const project = this.deps.project_delta;
    session.preview.set({
      providerId: PROVIDER_ID,
      apply: () => {
        translate_pipeline.apply(doc, plan, project);
        emit();
      },
      revert: () => {
        translate_pipeline.revert(doc, plan);
        emit();
      },
    } as Delta);
  }

  /** Commit-time delta for a CLONED gesture. Per-frame deltas stay
   *  translate-only; the structural insert happened at the toggle edge,
   *  outside the preview. The one delta that gets committed must own the
   *  whole outcome, so a single undo removes clone + move and a redo
   *  restores both:
   *    apply  = insert clones (idempotent reposition when live) +
   *             translate + select clones
   *    revert = un-translate + remove clones + select origins
   *  `preview.set` reverts the previous translate-only delta first
   *  (clones back to rest), then runs this apply — the document passes
   *  through exactly the states the closures describe.
   *  Captures locals only (not the session), so the committed delta
   *  retains the minimum undo/redo needs. */
  private write_commit_composite(
    session: ActiveSession,
    plan: TranslatePlan
  ): void {
    const doc = this.deps.get_doc();
    const emit = this.deps.emit;
    const project = this.deps.project_delta;
    const set_selection = this.deps.set_selection;
    const clone_plan = session.clone!.plan;
    const clone_ids = session.clone!.ids;
    const origin_ids = session.ids;
    session.preview.set({
      providerId: PROVIDER_ID,
      apply: () => {
        subtree.insert_plan(doc, clone_plan);
        translate_pipeline.apply(doc, plan, project);
        set_selection?.(clone_ids);
        emit();
      },
      revert: () => {
        translate_pipeline.revert(doc, plan);
        subtree.remove_plan(doc, clone_plan);
        set_selection?.(origin_ids);
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
