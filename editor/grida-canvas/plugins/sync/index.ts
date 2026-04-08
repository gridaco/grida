/**
 * @module sync
 *
 * EditorSyncPlugin — replaces EditorYSyncPlugin.
 *
 * Wires a SyncClient (from @grida/canvas-sync) to the editor, handling
 * both document synchronization and cursor/presence relay.
 */

import type { Editor } from "@/grida-canvas/editor";
import type { editor } from "@/grida-canvas/editor.i";
import {
  SyncClient,
  WebSocketTransport,
  type DocumentState,
} from "@grida/canvas-sync";
import { documentToState } from "./serialize";
import { DocumentSyncAdapter } from "./document-sync";
import { PresenceSyncAdapter } from "./presence-sync";

const SYNC_URL =
  process.env.NODE_ENV === "development"
    ? "ws://localhost:8787/room"
    : "wss://live.grida.co/room";

export class EditorSyncPlugin {
  public readonly client: SyncClient;
  private readonly _transport: WebSocketTransport;
  private readonly _documentSync: DocumentSyncAdapter;
  private readonly _presenceSync: PresenceSyncAdapter;

  constructor(
    private readonly _editor: Editor,
    private readonly roomId: string,
    private readonly cursor: {
      palette: editor.state.MultiplayerCursorColorPalette;
      cursor_id: string;
    }
  ) {
    console.log("sync::constructor", roomId);

    // Build initial state from editor's current document
    const initialState: DocumentState = documentToState(
      this._editor.doc.state.document
    );

    // Create transport and client
    this._transport = new WebSocketTransport({
      url: `${SYNC_URL}/${this.roomId}`,
      reconnectDelay: 1000,
      maxReconnectAttempts: 50,
    });

    this.client = new SyncClient({
      schema: "0.91.0-beta+20260311", // TODO: import from @grida/schema
      transport: this._transport,
      initialState,
      lastClock: 0, // TODO: load from OPFS sync-state.json
      pushInterval: 50,
    });

    // Wire up adapters
    this._documentSync = new DocumentSyncAdapter(this._editor, this.client);
    this._presenceSync = new PresenceSyncAdapter(
      this._editor,
      this.client,
      this.cursor
    );

    // Connect
    this.client.connect();
  }

  public destroy(): void {
    console.log("sync::destroy");
    this._documentSync.destroy();
    this._presenceSync.destroy();
    this.client.destroy();
  }
}
