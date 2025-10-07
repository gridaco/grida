import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import type { Awareness } from "y-protocols/awareness";
import type { Editor } from "@/grida-canvas/editor";
import type { editor } from "@/grida-canvas/editor.i";
import { AwarenessSyncManager } from "./y-awareness";
import { DocumentSyncManager } from "./y-document";

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
    console.log("sync-y::constructor");
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
