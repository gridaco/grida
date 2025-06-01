import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import type { Awareness } from "y-protocols/awareness";
import type { Editor } from "../editor";
import type { editor } from "..";
import type cmath from "@grida/cmath";

type AwarenessPayload = {
  player: {
    palette: editor.state.MultiplayerCursorColorPalette;
    transform: cmath.Transform;
    position: [number, number];
    marquee_a: [number, number] | null;
  };
};

export class EditorYSyncPlugin {
  public readonly doc: Y.Doc;
  public readonly provider: WebsocketProvider;
  public readonly awareness: Awareness;
  private readonly __unsubscribe_editor: () => void;
  private readonly ymap: Y.Map<any>;
  private isUpdatingFromYjs: boolean = false;

  constructor(
    private readonly editor: Editor,
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
            const currentState = this.editor.getSnapshot();
            this.editor.reset(
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
          } = state.player ?? {};

          const marquee = marquee_a ? { a: marquee_a, b: position } : null;

          return {
            t: Date.now(),
            id,
            position,
            palette,
            marquee: marquee,
            transform,
          } satisfies editor.state.MultiplayerCursor;
        });

      this.editor.__sync_cursors(states);
    };

    this.awareness.on("change", update);
    this.awareness.on("remove", update);
    update();

    // Subscribe to editor changes and sync document state
    this.__unsubscribe_editor = this.editor.subscribe((editor) => {
      const snapshot = editor.getSnapshot();
      const { pointer, marquee, transform, document } = snapshot;

      // Update awareness for cursor position
      this.awareness.setLocalStateField("player", {
        palette: this.cursor.palette,
        position: pointer.position,
        marquee_a: marquee?.a ?? null,
        transform,
      } satisfies AwarenessPayload["player"]);

      if (this.isUpdatingFromYjs) return;
      // Update document state
      this.ymap.set("document", document);
    });
  }

  public destroy() {
    this.__unsubscribe_editor();
    this.provider.destroy();
    this.doc.destroy();
  }
}
