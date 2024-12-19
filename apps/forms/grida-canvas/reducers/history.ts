import { Draft } from "immer";
import { HistoryEntry, IDocumentState } from "../state";

export namespace history {
  export function apply(
    draft: Draft<IDocumentState>,
    snapshot: IDocumentState
  ) {
    draft.selection = snapshot.selection;
    draft.document = snapshot.document;
    draft.document_ctx = snapshot.document_ctx;
    draft.content_edit_mode = snapshot.content_edit_mode;
    draft.document_key = snapshot.document_key;
    return;
  }

  export function snapshot(state: IDocumentState): IDocumentState {
    return {
      selection: state.selection,
      document: state.document,
      document_ctx: state.document_ctx,
      content_edit_mode: state.content_edit_mode,
      document_key: state.document_key,
    };
  }

  export function entry(
    actionType: HistoryEntry["actionType"],
    state: IDocumentState
  ): HistoryEntry {
    return {
      actionType,
      state: snapshot(state),
      timestamp: Date.now(),
    };
  }

  export function getMergableEntry(
    snapshots: HistoryEntry[],
    timeout: number = 300
  ): HistoryEntry | undefined {
    if (snapshots.length === 0) {
      return;
    }

    const newTimestamp = Date.now();
    const previousEntry = snapshots[snapshots.length - 1];

    if (
      // actionType !== previousEntry.actionType ||
      newTimestamp - previousEntry.timestamp >
      timeout
    ) {
      return;
    }

    return previousEntry;
  }
}
