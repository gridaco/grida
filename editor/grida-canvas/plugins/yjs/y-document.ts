import * as Y from "yjs";
import { editor } from "@/grida-canvas/editor.i";
import type { Editor, EditorDocumentStore } from "@/grida-canvas/editor";
import type grida from "@grida/schema";
import type { Patch } from "immer";
import { YPatchBinder } from "./y-patches";
import assert from "assert";

/**
 * Filters and transforms patches to only include document-level changes,
 * removing the "document" prefix from the path
 */
export function extractDocumentPatches(patches: Patch[]): Patch[] {
  const documentPatches: Patch[] = [];

  for (const patch of patches) {
    // Skip non-document patches
    if (patch.path[0] !== "document") {
      continue;
    }

    // Remove the "document" prefix from the path
    const [, ...rest] = patch.path;
    documentPatches.push({
      ...patch,
      path: rest,
    });
  }

  return documentPatches;
}

/**
 * class for managing document synchronization
 */
export class DocumentSyncManager {
  private __unsubscribe_document_change!: () => void;
  private readonly ymap_document: Y.Map<any>;
  private throttle_ms: number = 30;
  private readonly documentBinder: YPatchBinder<Record<string, any>>;

  /**
   * Unique origin identifier for this client's transactions
   * This is used by YJS to track which transactions originated from this client
   */
  private readonly origin: string = `client-${Math.random().toString(36).slice(2)}`;

  /**
   * Mutex to prevent feedback loops between editor changes and Y.js changes
   */
  private readonly mutex = editor.createMutex();
  private rc: number = 0;
  constructor(
    private readonly _editor: Editor,
    doc: Y.Doc
  ) {
    this.ymap_document = doc.getMap("document");

    const initialDocument = this.ymap_document.toJSON() as Record<string, any>;

    this.documentBinder = new YPatchBinder(
      this.ymap_document,
      initialDocument,
      this.origin,
      (patches) => this._handleRemotePatches(patches)
    );

    this._initializeStateFromSources();
    this._setupDocumentSync();
  }

  private _setupDocumentSync() {
    // Subscribe to editor document changes and sync to Y.Doc
    this.__unsubscribe_document_change = this._editor.doc.subscribeWithSelector(
      (state) => state.document,
      editor.throttle(
        (
          editorStore: EditorDocumentStore,
          next: grida.program.document.Document,
          prev: grida.program.document.Document,
          _action,
          patches = []
        ) => {
          if (editorStore.locked) return;
          if (this.rc === editorStore.tid) return;
          this.rc = editorStore.tid;

          const documentPatches = extractDocumentPatches(patches);

          this.mutex(() => {
            if (documentPatches.length) {
              this.documentBinder.applyLocalPatches(documentPatches);
            }
          });
        },
        this.throttle_ms,
        { trailing: true }
      )
    );
  }

  public destroy() {
    this.documentBinder.destroy();
    this.__unsubscribe_document_change();
  }

  private _initializeStateFromSources() {
    const localDocument = this._editor.doc.state.document;
    const remoteDocument = this.documentBinder.getSnapshot();

    const hasRemoteData = Object.keys(remoteDocument ?? {}).length > 0;
    const hasLocalData =
      Object.keys(localDocument.nodes).length > 0 ||
      (localDocument.scenes_ref?.length ?? 0) > 0;

    // If remote is empty but local has data, push local to remote
    if (this.ymap_document.size === 0 && hasLocalData) {
      this.documentBinder.applyLocalPatches([
        {
          op: "replace",
          path: [],
          value: {
            nodes: localDocument.nodes,
            scenes_ref: localDocument.scenes_ref,
            links: localDocument.links,
            metadata: localDocument.metadata,
          },
        },
      ]);
    }
    // If remote has data, pull it to local
    else if (hasRemoteData) {
      this.mutex(() => {
        this._editor.doc.applyDocumentPatches([
          {
            op: "replace",
            path: ["document"],
            value: remoteDocument,
          },
        ]);
      });
    }
  }

  private _handleRemotePatches(patches: Patch[]) {
    if (!patches.length) {
      return;
    }

    // Add "document" prefix to all patches
    const prefixed = patches.map((patch) => ({
      ...patch,
      path: ["document", ...patch.path],
    }));

    this.mutex(
      () => {
        this._editor.doc.applyDocumentPatches(prefixed);
      },
      () => {
        console.log("sync:down skipped (mutex locked)");
      }
    );
  }
}
