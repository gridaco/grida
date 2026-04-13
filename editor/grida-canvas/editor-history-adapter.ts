/**
 * Adapter between @grida/history and the editor store.
 *
 * Recording modes (passed per-dispatch):
 *
 *   "record"          — default. Time-bucketed: rapid dispatches of the same
 *                       action type within BUCKET_TIMEOUT_MS are merged into
 *                       one undo step. Different action types flush the bucket.
 *   "record-immediate"— one undo step per dispatch, no bucketing.
 *   "silent"          — apply state, skip history.
 *   "begin-gesture"   — open a gesture transaction.
 *   "end-gesture"     — commit gesture as one undo step.
 *   "abort-gesture"   — revert to before-snapshot, discard.
 *
 * Preview methods (previewStart/Set/Commit/Discard) are separate because
 * they have different semantics (tentative single-delta, not accumulated).
 */
import {
  HistoryImpl,
  type Delta,
  type History,
  type Transaction,
  type Preview,
} from "@grida/history";
import type { editor } from "@/grida-canvas";
import type { Action } from "./action";

// ---- Recording modes ---------------------------------------------------

export type DispatchRecording =
  | "record"
  | "record-immediate"
  | "silent"
  | "begin-gesture"
  | "end-gesture"
  | "abort-gesture";

// ---- Document field tracking -------------------------------------------

const DOCUMENT_KEYS = [
  "selection",
  "scene_id",
  "isolation_root_node_id",
  "document",
  "document_ctx",
  "content_edit_mode",
  "document_key",
] as const;

type DocumentKey = (typeof DOCUMENT_KEYS)[number];

export function filterDocumentPatches(
  patches: editor.history.Patch[]
): editor.history.Patch[] {
  return patches.filter((patch) => {
    const [key] = patch.path;
    return DOCUMENT_KEYS.includes(key as DocumentKey);
  });
}

function captureDocumentSnapshot(
  state: editor.state.IEditorState
): Pick<editor.state.IEditorState, DocumentKey> {
  return {
    selection: state.selection,
    scene_id: state.scene_id,
    isolation_root_node_id: state.isolation_root_node_id,
    document: state.document,
    document_ctx: state.document_ctx,
    content_edit_mode: state.content_edit_mode,
    document_key: state.document_key,
  };
}

function applyDocumentSnapshot(
  state: editor.state.IEditorState,
  snapshot: Pick<editor.state.IEditorState, DocumentKey>
): editor.state.IEditorState {
  return {
    ...state,
    selection: snapshot.selection,
    scene_id: snapshot.scene_id,
    isolation_root_node_id: snapshot.isolation_root_node_id,
    document: snapshot.document,
    document_ctx: snapshot.document_ctx,
    content_edit_mode: snapshot.content_edit_mode,
    document_key: snapshot.document_key,
    hovered_node_id: null,
  };
}

// ---- Adapter -----------------------------------------------------------

export interface EditorDeltaDescriptor {
  actionType: Action["type"];
  patches: editor.history.Patch[];
  inversePatches: editor.history.Patch[];
}

/**
 * Default bucket timeout in milliseconds. Rapid dispatches of the same
 * action type within this window are merged into one undo step.
 */
const BUCKET_TIMEOUT_MS = 300;

export class EditorHistoryAdapter {
  private readonly _history: HistoryImpl;

  private _getState!: () => editor.state.IEditorState;
  private _setState!: (state: editor.state.IEditorState) => void;

  private _pastLabels: string[] = [];
  private _futureLabels: string[] = [];

  // Gesture transaction state
  private _gestureTx: Transaction | null = null;
  private _gestureBeforeSnapshot: Pick<
    editor.state.IEditorState,
    DocumentKey
  > | null = null;

  // Preview state
  private _activePreview: Preview | null = null;
  private _previewOriginalSnapshot: Pick<
    editor.state.IEditorState,
    DocumentKey
  > | null = null;

  // Time-bucket state
  private _bucket: {
    actionType: string;
    beforeSnapshot: Pick<editor.state.IEditorState, DocumentKey>;
    afterSnapshot: Pick<editor.state.IEditorState, DocumentKey>;
    patches: editor.history.Patch[];
    inversePatches: editor.history.Patch[];
    clearsFuture: boolean;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  /** Injectable clock for testing. Defaults to Date.now. */
  now: () => number = Date.now;

  /** Bucket timeout in ms. Exposed for testing. */
  bucketTimeoutMs: number = BUCKET_TIMEOUT_MS;

  constructor(maxDepth: number = 100) {
    this._history = new HistoryImpl({ maxDepth });
  }

  bind(
    getState: () => editor.state.IEditorState,
    setState: (state: editor.state.IEditorState) => void
  ): void {
    this._getState = getState;
    this._setState = setState;
  }

  get history(): History {
    return this._history;
  }

  // ---- Snapshot compatibility shim ----------------------------------------

  get snapshot(): {
    past: readonly { actionType: string }[];
    future: readonly { actionType: string }[];
  } {
    return {
      past: this._pastLabels.map((l) => ({ actionType: l })),
      future: this._futureLabels.map((l) => ({ actionType: l })),
    };
  }

  // ---- Core: record a dispatch with a recording mode ----------------------

  record(
    actionType: Action["type"],
    beforeState: editor.state.IEditorState,
    afterState: editor.state.IEditorState,
    patches: editor.history.Patch[],
    inversePatches: editor.history.Patch[],
    recording: DispatchRecording = "record",
    clearsFuture?: boolean
  ): void {
    switch (recording) {
      case "begin-gesture":
        this._flushBucket();
        this._beginGesture(actionType, beforeState);
        return;

      case "end-gesture":
        this._endGesture(afterState);
        return;

      case "abort-gesture":
        this._abortGesture();
        return;

      case "silent":
        return;

      case "record-immediate":
        this._flushBucket();
        if (this._gestureTx || this._activePreview) return;
        this._recordImmediate(
          actionType,
          beforeState,
          afterState,
          patches,
          inversePatches,
          clearsFuture
        );
        return;

      case "record":
        if (this._gestureTx || this._activePreview) return;
        this._recordBucketed(
          actionType,
          beforeState,
          afterState,
          patches,
          inversePatches,
          clearsFuture
        );
        return;
    }
  }

  // ---- Time-bucketed recording --------------------------------------------

  private _recordBucketed(
    actionType: Action["type"],
    beforeState: editor.state.IEditorState,
    afterState: editor.state.IEditorState,
    patches: editor.history.Patch[],
    inversePatches: editor.history.Patch[],
    clearsFuture?: boolean
  ): void {
    const filteredPatches = filterDocumentPatches(patches);
    const filteredInverse = filterDocumentPatches(inversePatches);

    if (filteredPatches.length === 0 && filteredInverse.length === 0) {
      return;
    }

    if (this._bucket && this._bucket.actionType === actionType) {
      // Same action type within the timeout window — extend the bucket.
      // Keep the original beforeSnapshot, update the afterSnapshot.
      clearTimeout(this._bucket.timer);
      this._bucket.afterSnapshot = captureDocumentSnapshot(afterState);
      this._bucket.patches = filteredPatches;
      this._bucket.inversePatches = filteredInverse;
      this._bucket.timer = setTimeout(
        () => this._flushBucket(),
        this.bucketTimeoutMs
      );
      return;
    }

    // Different action type or no bucket — flush previous, start new
    this._flushBucket();

    const beforeSnapshot = captureDocumentSnapshot(beforeState);
    const afterSnapshot = captureDocumentSnapshot(afterState);

    this._bucket = {
      actionType,
      beforeSnapshot,
      afterSnapshot,
      patches: filteredPatches,
      inversePatches: filteredInverse,
      clearsFuture: clearsFuture ?? true,
      timer: setTimeout(() => this._flushBucket(), this.bucketTimeoutMs),
    };
  }

  /**
   * Flush the pending time bucket as one undo step.
   * Called on timeout expiry, on different action type, or on explicit flush
   * (undo, redo, gesture begin, etc).
   */
  _flushBucket(): void {
    const b = this._bucket;
    if (!b) return;

    clearTimeout(b.timer);
    this._bucket = null;

    const {
      beforeSnapshot,
      afterSnapshot,
      actionType,
      patches,
      inversePatches,
      clearsFuture,
    } = b;

    const delta: Delta<EditorDeltaDescriptor> = {
      providerId: "document",
      descriptor: {
        actionType: actionType as Action["type"],
        patches,
        inversePatches,
      },
      apply: () => {
        this._setState(applyDocumentSnapshot(this._getState(), afterSnapshot));
      },
      revert: () => {
        this._setState(applyDocumentSnapshot(this._getState(), beforeSnapshot));
      },
    };

    this._history.atomic(
      actionType,
      (tx) => {
        tx.push(delta);
      },
      { clearsFuture }
    );

    this._pastLabels.push(actionType);
    if (clearsFuture) {
      this._futureLabels.length = 0;
    }
  }

  // ---- Immediate recording (no bucketing) ---------------------------------

  private _recordImmediate(
    actionType: Action["type"],
    beforeState: editor.state.IEditorState,
    afterState: editor.state.IEditorState,
    patches: editor.history.Patch[],
    inversePatches: editor.history.Patch[],
    clearsFuture?: boolean
  ): void {
    const filteredPatches = filterDocumentPatches(patches);
    const filteredInverse = filterDocumentPatches(inversePatches);

    if (filteredPatches.length === 0 && filteredInverse.length === 0) {
      return;
    }

    const beforeSnapshot = captureDocumentSnapshot(beforeState);
    const afterSnapshot = captureDocumentSnapshot(afterState);

    const delta: Delta<EditorDeltaDescriptor> = {
      providerId: "document",
      descriptor: {
        actionType,
        patches: filteredPatches,
        inversePatches: filteredInverse,
      },
      apply: () => {
        this._setState(applyDocumentSnapshot(this._getState(), afterSnapshot));
      },
      revert: () => {
        this._setState(applyDocumentSnapshot(this._getState(), beforeSnapshot));
      },
    };

    const cf = clearsFuture ?? true;
    this._history.atomic(
      actionType,
      (tx) => {
        tx.push(delta);
      },
      { clearsFuture: cf }
    );

    this._pastLabels.push(actionType);
    if (cf) {
      this._futureLabels.length = 0;
    }
  }

  // ---- Gesture transaction internals --------------------------------------

  private _beginGesture(
    label: string,
    beforeState: editor.state.IEditorState
  ): void {
    if (this._gestureTx) return;
    this._gestureBeforeSnapshot = captureDocumentSnapshot(beforeState);
    this._gestureTx = this._history.begin(label);
  }

  private _endGesture(afterState: editor.state.IEditorState): void {
    const tx = this._gestureTx;
    const beforeSnapshot = this._gestureBeforeSnapshot;
    if (!tx || !beforeSnapshot) return;

    this._gestureTx = null;
    this._gestureBeforeSnapshot = null;

    const afterSnapshot = captureDocumentSnapshot(afterState);

    const hasChanges = DOCUMENT_KEYS.some(
      (key) => beforeSnapshot[key] !== afterSnapshot[key]
    );

    if (!hasChanges) {
      tx.abort();
      return;
    }

    tx.push({
      providerId: "document",
      descriptor: {
        actionType: "gesture" as Action["type"],
        patches: [],
        inversePatches: [],
      },
      apply: () => {
        this._setState(applyDocumentSnapshot(this._getState(), afterSnapshot));
      },
      revert: () => {
        this._setState(applyDocumentSnapshot(this._getState(), beforeSnapshot));
      },
    });

    tx.commit();
    this._pastLabels.push("gesture");
    this._futureLabels.length = 0;
  }

  abortGesture(): void {
    this._abortGesture();
  }

  private _abortGesture(): void {
    const tx = this._gestureTx;
    const beforeSnapshot = this._gestureBeforeSnapshot;
    if (!tx || !beforeSnapshot) return;

    this._gestureTx = null;
    this._gestureBeforeSnapshot = null;

    this._setState(applyDocumentSnapshot(this._getState(), beforeSnapshot));
    tx.abort();
  }

  get hasActiveGesture(): boolean {
    return this._gestureTx !== null;
  }

  // ---- Undo / Redo --------------------------------------------------------

  undo(): editor.history.Patch[] | null {
    // Flush any pending bucket so the user undoes the most recent action
    this._flushBucket();

    if (!this._history.stack.canUndo) return null;

    const patches: editor.history.Patch[] = [];
    const sub = this._history.on("onUndo", (tx) => {
      for (const d of tx.deltas) {
        const desc = d.descriptor as EditorDeltaDescriptor | undefined;
        if (desc?.inversePatches) patches.push(...desc.inversePatches);
      }
    });

    const result = this._history.undo();
    sub.dispose();

    // The adapter assumes synchronous undo (no providers with async prepare).
    // If a provider is registered with async prepare(), this will break.
    if (result instanceof Promise) {
      console.error(
        "[@grida/history] EditorHistoryAdapter.undo() received a Promise. " +
          "Async providers are not supported by the editor adapter. " +
          "The undo may not have completed."
      );
      return null;
    }
    if (result === false) return null;

    const label = this._pastLabels.pop();
    if (label) this._futureLabels.push(label);
    return patches;
  }

  redo(): editor.history.Patch[] | null {
    this._flushBucket();

    if (!this._history.stack.canRedo) return null;

    const patches: editor.history.Patch[] = [];
    const sub = this._history.on("onRedo", (tx) => {
      for (const d of tx.deltas) {
        const desc = d.descriptor as EditorDeltaDescriptor | undefined;
        if (desc?.patches) patches.push(...desc.patches);
      }
    });

    const result = this._history.redo();
    sub.dispose();

    if (result instanceof Promise) {
      console.error(
        "[@grida/history] EditorHistoryAdapter.redo() received a Promise. " +
          "Async providers are not supported by the editor adapter."
      );
      return null;
    }
    if (result === false) return null;

    const label = this._futureLabels.pop();
    if (label) this._pastLabels.push(label);
    return patches;
  }

  // ---- Preview (hover/tentative) ------------------------------------------

  previewStart(label: string): void {
    this._flushBucket();
    if (this._activePreview) this._activePreview.discard();
    this._activePreview = this._history.preview(label) as Preview;
    this._previewOriginalSnapshot = captureDocumentSnapshot(this._getState());
  }

  previewSet(afterState: editor.state.IEditorState): void {
    if (!this._activePreview || !this._previewOriginalSnapshot) return;

    const original = this._previewOriginalSnapshot;
    const after = captureDocumentSnapshot(afterState);

    this._activePreview.set({
      providerId: "document",
      apply: () => {
        this._setState(applyDocumentSnapshot(this._getState(), after));
      },
      revert: () => {
        this._setState(applyDocumentSnapshot(this._getState(), original));
      },
    });
  }

  previewCommit(): void {
    if (!this._activePreview) return;
    this._activePreview.commit();
    this._pastLabels.push("preview");
    this._futureLabels.length = 0;
    this._activePreview = null;
    this._previewOriginalSnapshot = null;
  }

  previewDiscard(): void {
    if (!this._activePreview) return;
    this._activePreview.discard();
    this._activePreview = null;
    this._previewOriginalSnapshot = null;
  }

  get hasActivePreview(): boolean {
    return this._activePreview !== null;
  }

  // ---- Lifecycle ----------------------------------------------------------

  clear(): void {
    if (this._bucket) {
      clearTimeout(this._bucket.timer);
      this._bucket = null;
    }
    this._history.clear();
    this._pastLabels.length = 0;
    this._futureLabels.length = 0;
    this._activePreview = null;
    this._previewOriginalSnapshot = null;
    this._gestureTx = null;
    this._gestureBeforeSnapshot = null;
  }

  dispose(): void {
    if (this._bucket) {
      clearTimeout(this._bucket.timer);
      this._bucket = null;
    }
  }
}
