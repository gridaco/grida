import { produce, applyPatches } from "immer";
import type { editor } from "@/grida-canvas";
import type { Action } from "./action";

function getMergableEntry(
  snapshots: editor.history.HistoryEntry[],
  currentTimestamp: number,
  timeout: number = 300
): editor.history.HistoryEntry | undefined {
  if (snapshots.length === 0) {
    return;
  }

  const previousEntry = snapshots[snapshots.length - 1];

  if (
    // actionType !== previousEntry.actionType ||
    currentTimestamp - previousEntry.ts >
    timeout
  ) {
    return;
  }

  return previousEntry;
}

function filterDocumentPatches(
  patches: editor.history.Patch[]
): editor.history.Patch[] {
  return patches.filter((patch) => {
    const [key] = patch.path;
    return (
      key === "selection" ||
      key === "scene_id" ||
      key === "document" ||
      key === "document_ctx" ||
      key === "content_edit_mode" ||
      key === "document_key"
    );
  });
}

export type HistorySnapshot = {
  past: readonly editor.history.HistoryEntry[];
  future: readonly editor.history.HistoryEntry[];
};

/**
 * Manages document history with mathematical integrity for state synchronization.
 *
 * @remarks
 * This class implements the principle of information preservation:
 * - Every state change must be accompanied by its patch representation
 * - Undo/redo operations return both the new state AND the patches that were applied
 * - This ensures the sync system can properly synchronize undo/redo changes to remote clients
 * - Without this design, undo/redo operations would be invisible to the sync system
 *
 * The return signature `[state, patches]` is not arbitrary - it's mathematically necessary
 * for maintaining consistency between local and remote state across all operations.
 */
export class DocumentHistoryManager {
  private past: editor.history.HistoryEntry[] = [];
  private future: editor.history.HistoryEntry[] = [];

  constructor(private readonly maxEntries: number = 100) {}

  get snapshot(): HistorySnapshot {
    return {
      past: this.past,
      future: this.future,
    };
  }

  clear() {
    this.past = [];
    this.future = [];
  }

  record({
    actionType,
    patches,
    inversePatches,
  }: {
    actionType: Action["type"];
    patches: editor.history.Patch[];
    inversePatches: editor.history.Patch[];
  }) {
    const filteredPatches = filterDocumentPatches(patches);
    const filteredInverse = filterDocumentPatches(inversePatches);

    if (filteredPatches.length === 0 && filteredInverse.length === 0) {
      return;
    }

    const entry = this.entry(actionType, filteredPatches, filteredInverse);

    const mergeTarget = getMergableEntry(this.past, entry.ts);

    if (mergeTarget) {
      this.past[this.past.length - 1] = {
        actionType,
        ts: entry.ts,
        patches: mergeTarget.patches.concat(entry.patches),
        inversePatches: entry.inversePatches.concat(mergeTarget.inversePatches),
      };
    } else {
      if (this.past.length >= this.maxEntries) {
        this.past.shift();
      }
      this.past.push(entry);
    }

    this.future = [];
  }

  /**
   * Undoes the last recorded action and returns both the new state and the patches that were applied.
   *
   * @param state - The current editor state
   * @returns A tuple containing:
   *   - [0] The new state after applying the inverse patches
   *   - [1] The inverse patches that were applied to achieve the undo
   *
   * @remarks
   * This signature is mathematically necessary for information preservation:
   * - Every state change must be accompanied by its patch representation
   * - The sync system depends on patches to know what to synchronize to remote clients
   * - Without patches, undo operations would be invisible to the sync system
   * - This ensures undo/redo changes are properly synchronized across all clients
   *
   * @example
   * ```typescript
   * const [newState, patches] = historyManager.undo(currentState);
   * // patches contain the inverse patches that were applied
   * // These patches can be sent to remote clients for synchronization
   * ```
   */
  undo(
    state: editor.state.IEditorState
  ): [editor.state.IEditorState, editor.history.Patch[]] {
    if (this.past.length === 0) {
      return [state, []];
    }

    const entry = this.past.pop()!;
    const nextState = produce(state, (draft) => {
      this.apply(draft, entry.inversePatches);
    });

    this.future.unshift({ ...entry, ts: Date.now() });
    return [nextState, entry.inversePatches];
  }

  /**
   * Redoes the next action from the future and returns both the new state and the patches that were applied.
   *
   * @param state - The current editor state
   * @returns A tuple containing:
   *   - [0] The new state after applying the patches
   *   - [1] The patches that were applied to achieve the redo
   *
   * @remarks
   * This signature is mathematically necessary for information preservation:
   * - Every state change must be accompanied by its patch representation
   * - The sync system depends on patches to know what to synchronize to remote clients
   * - Without patches, redo operations would be invisible to the sync system
   * - This ensures undo/redo changes are properly synchronized across all clients
   *
   * @example
   * ```typescript
   * const [newState, patches] = historyManager.redo(currentState);
   * // patches contain the patches that were applied
   * // These patches can be sent to remote clients for synchronization
   * ```
   */
  redo(
    state: editor.state.IEditorState
  ): [editor.state.IEditorState, editor.history.Patch[]] {
    if (this.future.length === 0) {
      return [state, []];
    }

    const entry = this.future.shift()!;
    const nextState = produce(state, (draft) => {
      this.apply(draft, entry.patches);
    });

    this.past.push({ ...entry, ts: Date.now() });
    return [nextState, entry.patches];
  }

  private entry(
    actionType: editor.history.HistoryEntry["actionType"],
    patches: editor.history.Patch[],
    inversePatches: editor.history.Patch[]
  ): editor.history.HistoryEntry {
    return {
      actionType,
      patches,
      inversePatches,
      ts: Date.now(),
    };
  }

  private toSnapshot(
    state: editor.state.IDocumentState
  ): editor.state.IDocumentState {
    return {
      selection: state.selection,
      scene_id: state.scene_id,
      document: state.document,
      document_ctx: state.document_ctx,
      content_edit_mode: state.content_edit_mode,
      document_key: state.document_key,
    };
  }

  private apply(
    draft: editor.state.IEditorState,
    patches: editor.history.Patch[]
  ) {
    const snapshotState = this.toSnapshot(draft);
    const nextState = this.applyPatchesToSnapshot(snapshotState, patches);
    draft.selection = nextState.selection;
    draft.scene_id = nextState.scene_id;
    draft.document = nextState.document;
    draft.document_ctx = nextState.document_ctx;
    draft.content_edit_mode = nextState.content_edit_mode;
    draft.document_key = nextState.document_key;

    draft.hovered_node_id = null;
  }

  private applyPatchesToSnapshot(
    base: editor.state.IDocumentState,
    patches: editor.history.Patch[]
  ): editor.state.IDocumentState {
    if (patches.length === 0) {
      return base;
    }

    return applyPatches(base, patches);
  }
}
