// Surface-side observer that shows a brief after-the-fact snap guide
// whenever a translate intent with no in-gesture guide of its own —
// arrow-key nudge or RPC `commands.translate` — lands the selection on
// an alignment. Drag commits are intentionally off the bus: drag has
// its own live guides via `TranslateOrchestrator.last_guides` that
// clear on release (instant-hide is the right UX); routing them here
// would add the dwell hold after every drag.
//
// Triggered by the translate-commit bus (P4: subscribe to outcomes,
// not events) rather than a raw geometry firehose, so non-translate
// mutations (text edit exit, undo of a non-translate change,
// programmatic `set_text`, property writes) do NOT trigger spurious
// dwell guides. Detection runs inside `requestAnimationFrame` so the
// layout reads in `open_snap` happen after the frame's writes have
// settled — no forced flushes.

import type { guide as _guide } from "@grida/cmath/_snap";
import type { NodeId } from "../../types";
import {
  run_translate_pipeline,
  type TranslateContext,
  type TranslatePlan,
  type TranslateOptions,
} from "./pipeline";
import { STAGES_DEFAULT } from "./stages";
import { capture_translate_baselines } from "../intents";
import type { SnapSession } from "../snap";
import type { SvgDocument } from "../document";

/** Subset of `SvgEditor` the watcher consumes. Narrow on purpose — only
 *  signals + queries, no commands. The watcher MUST NOT mutate; a wider
 *  port would invite re-entering the keystroke-flush problem this
 *  module exists to avoid. */
export interface NudgeDwellEditorPort {
  get document(): SvgDocument;
  readonly state: { readonly selection: ReadonlyArray<NodeId> };
  /** Fires after a translate intent (drag-commit, nudge, or RPC
   *  translate) commits and any in-flight orchestrator session is
   *  disposed. The watcher only ever wakes on this channel — see file
   *  header. */
  subscribe_translate_commit(cb: () => void): () => void;
}

export type NudgeDwellWatcherDeps = {
  editor: NudgeDwellEditorPort;
  open_snap: (ids: ReadonlyArray<NodeId>) => SnapSession | null;
  options: () => TranslateOptions;
  on_guides_change: () => void;
  window: Window;
};

/** Hold-time after the last firing detection. Show is immediate (next
 *  frame); only the hide edge is delayed. */
const HIDE_MS = 500;

export class NudgeDwellWatcher {
  private _guides: ReadonlyArray<_guide.SnapGuide> = [];
  private raf_id: number | null = null;
  private hide_timer: number | null = null;
  private unsubscribe: () => void;

  constructor(private readonly deps: NudgeDwellWatcherDeps) {
    this.unsubscribe = deps.editor.subscribe_translate_commit(() =>
      this.schedule_detect()
    );
  }

  /** Currently-published dwell guides. Empty between detections. */
  get guides(): ReadonlyArray<_guide.SnapGuide> {
    return this._guides;
  }

  /** Drop any pending detection / held guide. Idempotent. */
  cancel_pending(): void {
    this.clear_raf();
    this.clear_hide();
    this.publish_guides([]);
  }

  dispose(): void {
    this.unsubscribe();
    this.cancel_pending();
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  private schedule_detect(): void {
    if (this.raf_id !== null) return;
    this.raf_id = this.deps.window.requestAnimationFrame(() => {
      this.raf_id = null;
      this.detect();
    });
  }

  private detect(): void {
    const ids = this.deps.editor.state.selection;
    if (ids.length === 0) {
      this.publish_guides([]);
      this.clear_hide();
      return;
    }

    // SnapSession is local to this detection — neighbor / agent rects
    // may differ from frame to frame. Disposed via `try`/exits below.
    const snap = this.deps.open_snap(ids);
    if (!snap) {
      this.publish_guides([]);
      this.clear_hide();
      return;
    }
    try {
      const plan0: TranslatePlan = {
        ids: [...ids],
        baselines: capture_translate_baselines(this.deps.editor.document, ids),
        delta: { x: 0, y: 0 },
      };
      const ctx: TranslateContext = {
        input: { ids: plan0.ids, movement: [0, 0] },
        modifiers: { axis_lock: "off", force_disable_snap: false },
        options: this.deps.options(),
        snap_session: snap,
        snap_policy: "aligned",
      };
      const result = run_translate_pipeline(plan0, STAGES_DEFAULT, ctx);

      if (result.guides.length === 0) {
        this.publish_guides([]);
        this.clear_hide();
        return;
      }
      this.publish_guides(result.guides);
      this.arm_hide();
    } finally {
      snap.dispose();
    }
  }

  private arm_hide(): void {
    this.clear_hide();
    this.hide_timer = this.deps.window.setTimeout(() => {
      this.hide_timer = null;
      this.publish_guides([]);
    }, HIDE_MS);
  }

  private publish_guides(next: ReadonlyArray<_guide.SnapGuide>): void {
    if (next.length === 0 && this._guides.length === 0) return;
    this._guides = next;
    this.deps.on_guides_change();
  }

  private clear_raf(): void {
    if (this.raf_id === null) return;
    this.deps.window.cancelAnimationFrame(this.raf_id);
    this.raf_id = null;
  }

  private clear_hide(): void {
    if (this.hide_timer === null) return;
    this.deps.window.clearTimeout(this.hide_timer);
    this.hide_timer = null;
  }
}
