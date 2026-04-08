/**
 * @module document-sync
 *
 * Bridges the SyncClient ↔ EditorDocumentStore.
 *
 * Local → Remote: subscribes to editor document changes, computes diffs,
 *   pushes to the SyncClient.
 *
 * Remote → Local: listens for SyncClient state changes, converts back to
 *   Immer patches, applies via editor.doc.applyDocumentPatches().
 */

import type { Editor, EditorDocumentStore } from "@/grida-canvas/editor";
import { editor } from "@/grida-canvas/editor.i";
import type grida from "@grida/schema";
import {
  SyncClient,
  computeDiff,
  type DocumentState,
} from "@grida/canvas-sync";
import { documentToState, stateToDocument } from "./serialize";

export class DocumentSyncAdapter {
  private _unsubscribeEditor: (() => void) | null = null;
  private _unsubscribeClient: (() => void) | null = null;

  /**
   * Mutex to prevent feedback loops:
   *   local edit → push to sync → sync fires stateChange → apply to editor → editor fires subscription → ...
   */
  private readonly _mutex = editor.createMutex();

  /**
   * Last-seen editor transaction ID. Used to skip duplicate subscription fires.
   */
  private _lastTid: number = 0;

  /**
   * Last DocumentState we synced to the client. Used to compute diffs.
   * Public for test access (flushEditorToServer needs to read/write this).
   */
  lastSyncedState: DocumentState;

  constructor(
    private readonly _editor: Editor,
    private readonly _client: SyncClient
  ) {
    this.lastSyncedState = documentToState(this._editor.doc.state.document);

    this._setupEditorToClient();
    this._setupClientToEditor();
  }

  // -----------------------------------------------------------------------
  // Local → Remote (editor changes → SyncClient push)
  // -----------------------------------------------------------------------

  private _setupEditorToClient(): void {
    this._unsubscribeEditor = this._editor.doc.subscribeWithSelector(
      (state) => state.document,
      editor.throttle(
        (
          store: EditorDocumentStore,
          _next: grida.program.document.Document,
          _prev: grida.program.document.Document
        ) => {
          if (store.locked) return;
          if (this._lastTid === store.tid) return;
          this._lastTid = store.tid;

          this._mutex(() => {
            const currentState = documentToState(
              this._editor.doc.state.document
            );
            const diff = computeDiff(this.lastSyncedState, currentState);
            if (diff) {
              this.lastSyncedState = currentState;
              this._client.pushDiff(diff);
            }
          });
        },
        30, // 30ms throttle, same as old YJS plugin
        { trailing: true }
      )
    );
  }

  // -----------------------------------------------------------------------
  // Remote → Local (SyncClient state changes → editor)
  // -----------------------------------------------------------------------

  private _setupClientToEditor(): void {
    this._unsubscribeClient = this._client.on("stateChange", (newState) => {
      this._mutex(
        () => {
          // Convert sync state back to editor Document
          const newDoc = stateToDocument(newState);

          // Apply as a wholesale document replacement
          this._editor.doc.applyDocumentPatches([
            {
              op: "replace",
              path: ["document"],
              value: newDoc,
            },
          ]);

          // Update our tracked state so next local diff is correct
          this.lastSyncedState = newState;
        },
        () => {
          // Mutex locked — this stateChange was triggered by our own push.
          // Just update the tracked state.
          this.lastSyncedState = newState;
        }
      );
    });
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  destroy(): void {
    this._unsubscribeEditor?.();
    this._unsubscribeClient?.();
    this._unsubscribeEditor = null;
    this._unsubscribeClient = null;
  }
}
