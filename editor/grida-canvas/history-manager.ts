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

  undo(state: editor.state.IEditorState): editor.state.IEditorState {
    if (this.past.length === 0) {
      return state;
    }

    const entry = this.past.pop()!;
    const nextState = produce(state, (draft) => {
      this.apply(draft, entry.inversePatches);
    });

    this.future.unshift({ ...entry, ts: Date.now() });
    return nextState;
  }

  redo(state: editor.state.IEditorState): editor.state.IEditorState {
    if (this.future.length === 0) {
      return state;
    }

    const entry = this.future.shift()!;
    const nextState = produce(state, (draft) => {
      this.apply(draft, entry.patches);
    });

    this.past.push({ ...entry, ts: Date.now() });
    return nextState;
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
