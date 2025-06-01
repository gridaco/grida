import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import type { Awareness } from "y-protocols/awareness";
import type { Editor } from "../editor";
import { editor } from "..";
import type cmath from "@grida/cmath";

type AwarenessPayload = {
  player: {
    palette: editor.state.MultiplayerCursorColorPalette;
    transform: cmath.Transform;
    position: [number, number];
    marquee_a: [number, number] | null;
    selection: string[];
  };
};

export class EditorYSyncPlugin {
  public readonly doc: Y.Doc;
  public readonly provider: WebsocketProvider;
  public readonly awareness: Awareness;
  private readonly __unsubscribe_player_change: () => void;
  private readonly __unsubscribe_document_change: () => void;
  private readonly ymap: Y.Map<any>;
  private isUpdatingFromYjs: boolean = false;
  private throttle_ms: number = 5;

  constructor(
    private readonly _editor: Editor,
    private readonly room_id: string,
    private readonly cursor: {
      palette: editor.state.MultiplayerCursorColorPalette;
    }
  ) {
    this.doc = new Y.Doc();
    this.provider = new WebsocketProvider(
      "ws://localhost:1234",
      room_id,
      this.doc
    );

    this.awareness = this.provider.awareness;
    this.ymap = this.doc.getMap("document");

    // Sync document state
    this.ymap.observe((event) => {
      if (this.isUpdatingFromYjs) return;

      const changes = event.changes.keys;
      changes.forEach((change, key) => {
        if (change.action === "add" || change.action === "update") {
          const value = this.ymap.get(key);
          if (key === "document") {
            this.isUpdatingFromYjs = true;
            const currentState = this._editor.getSnapshot();
            this._editor.reset(
              {
                ...currentState,
                document: value,
              },
              undefined,
              true
            );
            this.isUpdatingFromYjs = false;
          }
        }
      });
    });

    const update = () => {
      const states = Array.from(this.awareness.getStates().entries())
        .filter(([id]) => id !== this.awareness.clientID)
        .map((_: any) => {
          const [id, state] = _ as [string, AwarenessPayload];
          const {
            palette,
            position = [0, 0],
            marquee_a,
            transform,
            selection,
          } = state.player ?? {};

          const marquee = marquee_a ? { a: marquee_a, b: position } : null;

          return {
            t: Date.now(),
            id,
            position,
            palette,
            marquee: marquee,
            transform,
            selection,
          } satisfies editor.state.MultiplayerCursor;
        });

      this._editor.__sync_cursors(states);
    };

    this.awareness.on("change", update);
    this.awareness.on("remove", update);
    update();

    // Subscribe to cursor changes for awareness updates (pointer, marquee, etc.)
    this.__unsubscribe_player_change = this._editor.subscribeWithSelector(
      (state) => ({
        pointer: state.pointer,
        marquee: state.marquee,
        selection: state.selection,
        transform: state.transform,
      }),
      (next) => {
        const { pointer, marquee, selection, transform } = next;

        // Update awareness for cursor position
        this.awareness.setLocalStateField("player", {
          palette: this.cursor.palette, // TODO: palette needs to be synced only once
          position: pointer.position,
          marquee_a: marquee?.a ?? null,
          transform,
          selection,
        } satisfies AwarenessPayload["player"]);
      }
    );

    // Subscribe with selector for document sync
    this.__unsubscribe_document_change = this._editor.subscribeWithSelector(
      (state) => state.document,
      editor.throttle(
        (next) => {
          if (this.isUpdatingFromYjs) return;
          this.ymap.set("document", next);
        },
        this.throttle_ms,
        { trailing: true }
      )
    );
  }

  public destroy() {
    this.__unsubscribe_player_change();
    this.__unsubscribe_document_change();
    this.provider.destroy();
    this.doc.destroy();
  }
}
