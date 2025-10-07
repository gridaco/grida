import * as Y from "yjs";
import { editor } from "@/grida-canvas/editor.i";
import type { Editor, EditorDocumentStore } from "@/grida-canvas/editor";
import type grida from "@grida/schema";
import type { Patch } from "immer";
import { YPatchBinder } from "./y-patches";
import assert from "assert";

export function groupDocumentPatches(patches: Patch[]): {
  nodes: Patch[];
  scenes: Patch[];
} {
  const nodes: Patch[] = [];
  const scenes: Patch[] = [];

  for (const patch of patches) {
    // Skip non-document patches
    if (patch.path[0] !== "document") {
      continue;
    }

    assert(
      patch.path.length > 1,
      "Full document replacement not supported. Use granular patches for nodes and scenes."
    );

    // Handle partial updates (path: ["document", "nodes"|"scenes", ...rest])
    const [, key, ...rest] = patch.path;
    if (key === "nodes") {
      nodes.push({
        ...patch,
        path: rest,
      });
    } else if (key === "scenes") {
      scenes.push({
        ...patch,
        path: rest,
      });
    }
  }

  return { nodes, scenes };
}

/**
 * class for managing document synchronization
 */
export class DocumentSyncManager {
  private __unsubscribe_document_change!: () => void;
  private readonly ymap_nodes: Y.Map<grida.program.nodes.Node>;
  private readonly ymap_scenes: Y.Map<grida.program.document.Scene>;
  private throttle_ms: number = 30;
  private readonly nodesBinder: YPatchBinder<Record<string, any>>;
  private readonly scenesBinder: YPatchBinder<Record<string, any>>;

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
    this.ymap_nodes = doc.getMap("nodes");
    this.ymap_scenes = doc.getMap("scenes");

    const initialNodes = this.ymap_nodes.toJSON() as Record<string, any>;
    const initialScenes = this.ymap_scenes.toJSON() as Record<string, any>;

    this.nodesBinder = new YPatchBinder(
      this.ymap_nodes,
      initialNodes,
      this.origin,
      (patches) => this._handleRemoteNodePatches(patches)
    );

    this.scenesBinder = new YPatchBinder(
      this.ymap_scenes,
      initialScenes,
      this.origin,
      (patches) => this._handleRemoteScenePatches(patches)
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

          const { nodes, scenes } = groupDocumentPatches(patches);

          this.mutex(() => {
            if (nodes.length) {
              this.nodesBinder.applyLocalPatches(nodes);
            }
            if (scenes.length) {
              this.scenesBinder.applyLocalPatches(scenes);
            }
          });
        },
        this.throttle_ms,
        { trailing: true }
      )
    );
  }

  public destroy() {
    this.nodesBinder.destroy();
    this.scenesBinder.destroy();
    this.__unsubscribe_document_change();
  }

  private _initializeStateFromSources() {
    const localDocument = this._editor.doc.state.document;
    const remoteNodes = this.nodesBinder.getSnapshot();
    const remoteScenes = this.scenesBinder.getSnapshot();

    const hasRemoteNodes = Object.keys(remoteNodes ?? {}).length > 0;
    const hasRemoteScenes = Object.keys(remoteScenes ?? {}).length > 0;

    if (this.ymap_nodes.size === 0 && Object.keys(localDocument.nodes).length) {
      this.nodesBinder.applyLocalPatches([
        {
          op: "replace",
          path: [],
          value: localDocument.nodes,
        },
      ]);
    } else if (hasRemoteNodes) {
      this.mutex(() => {
        this._editor.doc.applyDocumentPatches([
          {
            op: "replace",
            path: ["document", "nodes"],
            value: remoteNodes,
          },
        ]);
      });
    }

    if (
      this.ymap_scenes.size === 0 &&
      Object.keys(localDocument.scenes).length
    ) {
      this.scenesBinder.applyLocalPatches([
        {
          op: "replace",
          path: [],
          value: localDocument.scenes,
        },
      ]);
    } else if (hasRemoteScenes) {
      this.mutex(() => {
        this._editor.doc.applyDocumentPatches([
          {
            op: "replace",
            path: ["document", "scenes"],
            value: remoteScenes,
          },
        ]);
      });
    }
  }

  private _handleRemoteNodePatches(patches: Patch[]) {
    if (!patches.length) {
      return;
    }

    const prefixed = patches.map((patch) => ({
      ...patch,
      path: ["document", "nodes", ...patch.path],
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

  private _handleRemoteScenePatches(patches: Patch[]) {
    if (!patches.length) {
      return;
    }

    const prefixed = patches.map((patch) => ({
      ...patch,
      path: ["document", "scenes", ...patch.path],
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
