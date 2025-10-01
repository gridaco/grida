import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import type { Awareness } from "y-protocols/awareness";
import type { Editor, EditorDocumentStore } from "../editor";
import { type Action, editor } from "..";
import type cmath from "@grida/cmath";
import { dq } from "../query";
import equal from "fast-deep-equal";
import type grida from "@grida/schema";

type AwarenessPayload = {
  /**
   * user-window-session unique cursor id
   *
   * one user can have multiple cursors (if multiple windows are open)
   */
  cursor_id: string;
  /**
   * player profile information (rarely changes)
   */
  profile: {
    /**
     * theme colors for this player within collaboration ui
     */
    palette: editor.state.MultiplayerCursorColorPalette;
  };
  /**
   * current focus state (changes when switching pages/selecting)
   */
  focus: {
    /**
     * player's current scene (page)
     */
    scene_id: string | undefined;
    /**
     * the selection (node ids) of this player
     */
    selection: string[];
  };
  /**
   * geometric state (changes frequently with mouse movement)
   */
  geo: {
    /**
     * current transform (camera)
     */
    transform: cmath.Transform;
    /**
     * current cursor position
     */
    position: [number, number];
    /**
     * marquee start point
     * the full marquee is a rect with marquee_a and position (current cursor position)
     */
    marquee_a: [number, number] | null;
  };
  /**
   * cursor chat is a ephemeral message that lives for a short time and disappears after few seconds (as configured)
   * only the last message is kept
   */
  cursor_chat: {
    txt: string;
    ts: number;
  } | null;
};

// Internal class for managing document synchronization
class DocumentSyncManager {
  private __unsubscribe_document_change!: () => void;
  private readonly ymap_nodes: Y.Map<grida.program.nodes.Node>;
  private readonly ymap_scenes: Y.Map<grida.program.document.Scene>;
  private throttle_ms: number = 5;

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
    private readonly _doc: Y.Doc
  ) {
    this.ymap_nodes = _doc.getMap("nodes");
    this.ymap_scenes = _doc.getMap("scenes");

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
          prev: grida.program.document.Document
        ) => {
          if (editorStore.locked) return;
          if (this.rc === editorStore.tid) return;
          this.rc = editorStore.tid;

          // Use mutex to prevent feedback loops
          this.mutex(() => {
            this._doc.transact(() => {
              Object.entries(next.nodes).forEach(([key, node]) => {
                this.ymap_nodes.set(key, node);
              });

              Object.entries(next.scenes).forEach(([key, scene]) => {
                this.ymap_scenes.set(key, scene);
              });
              // this.ymap.set("properties", next.properties);

              // console.log("sync:up (local)");
            }, this.origin); // Use this client's origin identifier
          });
        },
        this.throttle_ms,
        { trailing: true }
      )
    );

    // Sync document state from Y.Doc to Editor
    this.ymap_nodes.observe((event) => {
      // Filter out local transactions and transactions that originated from this client
      if (event.transaction.local) return;
      if (event.transaction.origin === this.origin) return;

      // console.log("sync:down", event.transaction.local);
      const changes = event.changes.keys;
      const updates: Record<string, grida.program.nodes.Node> =
        Object.fromEntries(
          Array.from(changes.entries())
            .filter(
              ([_, change]) =>
                change.action === "add" || change.action === "update"
            )
            .map(([key]) => [key, this.ymap_nodes.get(key)!])
        );

      if (Object.keys(updates).length > 0) {
        // Use mutex to prevent feedback loops - the applyEdits will trigger
        // our subscription, but the mutex will prevent it from syncing back to Y.js
        this.mutex(
          () => {
            this._editor.doc.applyEdits({ nodes: updates });
          },
          () => {
            console.log("sync:down skipped (mutex locked)");
          }
        );
      }
    });

    // Also observe scenes changes
    this.ymap_scenes.observe((event) => {
      // Filter out local transactions and transactions that originated from this client
      if (event.transaction.local) return;
      if (event.transaction.origin === this.origin) return;

      const changes = event.changes.keys;
      const updates: Record<string, grida.program.document.Scene> =
        Object.fromEntries(
          Array.from(changes.entries())
            .filter(
              ([_, change]) =>
                change.action === "add" || change.action === "update"
            )
            .map(([key]) => [key, this.ymap_scenes.get(key)!])
        );

      if (Object.keys(updates).length > 0) {
        // Use mutex to prevent feedback loops
        this.mutex(
          () => {
            this._editor.doc.applyEdits({ scenes: updates });
          },
          () => {
            console.log("sync:down skipped (mutex locked)");
          }
        );
      }
    });
  }

  public destroy() {
    this.__unsubscribe_document_change();
  }
}

// Internal class for managing awareness/cursor synchronization
class AwarenessSyncManager {
  private __unsubscribe_geo_change!: () => void;
  private __unsubscribe_focus_change!: () => void;

  private _currentState: Partial<
    Omit<AwarenessPayload, "cursor_id" | "profile">
  > = {};

  private __unsubscribe_cursor_chat_change!: () => void;

  constructor(
    private readonly _editor: Editor,
    private readonly _awareness: Awareness,
    private readonly _cursor: {
      palette: editor.state.MultiplayerCursorColorPalette;
      cursor_id: string;
    }
  ) {
    this._setupAwarenessSync();
  }

  private _setupAwarenessSync() {
    const aware = () => {
      const states = Array.from(this._awareness.getStates().entries())
        .filter(([id]) => id !== this._awareness.clientID)
        .filter(([_, state]) => {
          // Only process states that have a complete player object with palette
          return state && state.profile?.palette;
        })
        .map((_: any) => {
          const [id, state] = _ as [string, AwarenessPayload];
          const {
            cursor_id,
            profile: { palette },
            focus: { scene_id, selection },
            geo: { transform, position = [0, 0], marquee_a },
            cursor_chat,
          } = state;

          const marquee = marquee_a ? { a: marquee_a, b: position } : null;

          return {
            t: Date.now(),
            id: cursor_id, // Use cursor_id instead of awareness clientID
            position,
            palette,
            marquee: marquee,
            transform,
            selection,
            scene_id,
            ephemeral_chat: cursor_chat,
          } satisfies editor.state.MultiplayerCursor;
        });

      // Convert to object format {[cursorId]: cursor} with timestamp-based conflict resolution
      const cursorsObject = states.reduce(
        (acc, state) => {
          const existing = acc[state.id];
          if (!existing || state.t > existing.t) {
            acc[state.id] = state;
          }
          return acc;
        },
        {} as Record<string, (typeof states)[0]>
      );

      this._editor.surface.__sync_cursors(cursorsObject);
    };

    this._awareness.on("change", aware);
    this._awareness.on("remove", aware);
    aware();

    this._setupGeoAwarenessSync();
    this._setupFocusAwarenessSync();
    this._setupCursorChatAwarenessSync();
  }

  private _setupGeoAwarenessSync() {
    // High-frequency updates for geometric data (mouse movement, camera)
    this.__unsubscribe_geo_change = this._editor.doc.subscribeWithSelector(
      (state) => ({
        pointer: state.pointer,
        marquee: state.marquee,
        transform: state.transform,
      }),
      (editor, next) => {
        if (editor.locked) return;
        const { pointer, marquee, transform } = next;

        this._currentState.geo = {
          transform,
          position: pointer.position,
          marquee_a: marquee?.a ?? null,
        };

        this._syncAwarenessState();
      },
      equal
    );
  }

  private _setupFocusAwarenessSync() {
    // Medium-frequency updates for focus changes (page switches, selections)
    this.__unsubscribe_focus_change = this._editor.doc.subscribeWithSelector(
      (state) => ({
        selection: state.selection,
        scene_id: state.scene_id,
      }),
      (editor, next) => {
        if (editor.locked) return;
        const { selection, scene_id } = next;

        this._currentState.focus = {
          scene_id,
          selection,
        };

        this._syncAwarenessState();
      },
      equal
    );
  }

  private _setupCursorChatAwarenessSync() {
    // Sync cursor chat state from editor to awareness
    this.__unsubscribe_cursor_chat_change =
      this._editor.doc.subscribeWithSelector(
        (state) => state.local_cursor_chat,
        (editor, next) => {
          if (editor.locked) return;
          const { message, last_modified } = next;

          this._currentState.cursor_chat = message
            ? { txt: message, ts: last_modified || Date.now() }
            : null;

          this._syncAwarenessState();
        },
        equal
      );
  }

  private _syncAwarenessState() {
    this._awareness.setLocalState({
      cursor_id: this._cursor.cursor_id,
      profile: { palette: this._cursor.palette },
      focus: this._currentState.focus || { scene_id: undefined, selection: [] },
      geo: this._currentState.geo || {
        transform: [
          [1, 0, 0],
          [0, 1, 0],
        ],
        position: [0, 0],
        marquee_a: null,
      },
      cursor_chat: this._currentState.cursor_chat || null,
    } satisfies AwarenessPayload);
  }

  public destroy() {
    this.__unsubscribe_geo_change();
    this.__unsubscribe_focus_change();
    this.__unsubscribe_cursor_chat_change();
  }
}

export class EditorYSyncPlugin {
  public readonly doc: Y.Doc;
  public readonly provider: WebsocketProvider;
  public readonly awareness: Awareness;
  private readonly _documentSync: DocumentSyncManager;
  private readonly _awarenessSync: AwarenessSyncManager;

  constructor(
    private readonly _editor: Editor,
    private readonly room_id: string,
    private readonly cursor: {
      palette: editor.state.MultiplayerCursorColorPalette;
      cursor_id: string;
    }
  ) {
    this.doc = new Y.Doc();
    this.provider = new WebsocketProvider(
      process.env.NODE_ENV === "development"
        ? "wss://localhost:8787/editor"
        : "wss://live.grida.co/editor",
      this.room_id,
      this.doc
    );

    this.awareness = this.provider.awareness;

    // Initialize sub-managers
    this._documentSync = new DocumentSyncManager(this._editor, this.doc);
    this._awarenessSync = new AwarenessSyncManager(
      this._editor,
      this.awareness,
      this.cursor
    );
  }

  public destroy() {
    // Clean up awareness state immediately
    this.awareness.setLocalState(null);

    // Destroy sub-managers
    this._documentSync.destroy();
    this._awarenessSync.destroy();

    this.provider.destroy();
    this.doc.destroy();
  }
}
