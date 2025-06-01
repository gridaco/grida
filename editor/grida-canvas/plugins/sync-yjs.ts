import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import type { Awareness } from "y-protocols/awareness";
import type { Editor } from "../editor";
import type { editor } from "..";

type AwarenessPayload = {
  player: {
    color: string;
    position: [number, number];
    marquee_a: [number, number] | null;
  };
};

export class EditorSyncYjsPlugin {
  public readonly doc: Y.Doc;
  public readonly provider: WebsocketProvider;
  public readonly awareness: Awareness;
  private readonly __unsubscribe_editor: () => void;

  constructor(
    private readonly editor: Editor,
    private readonly room_id: string
  ) {
    this.doc = new Y.Doc();
    this.provider = new WebsocketProvider(
      "ws://localhost:1234",
      room_id,
      this.doc
    );

    this.awareness = this.provider.awareness;

    const update = () => {
      const states = Array.from(this.awareness.getStates().entries())
        .filter(([id]) => id !== this.awareness.clientID)
        .map((_: any) => {
          const [id, state] = _ as [string, AwarenessPayload];
          const {
            color = "#000",
            position = [0, 0],
            marquee_a,
          } = state.player ?? {};

          const marquee = marquee_a ? { a: marquee_a, b: position } : null;

          return {
            t: Date.now(),
            id,
            position,
            color,
            marquee: marquee,
          } satisfies editor.state.MultiplayerCursor;
        });

      this.editor.__sync_cursors(states);
    };

    this.awareness.on("change", update);
    this.awareness.on("remove", update);
    update();

    //
    this.__unsubscribe_editor = this.editor.subscribe((editor) => {
      const snapshot = editor.getSnapshot();
      const { pointer, marquee } = snapshot;
      this.awareness.setLocalStateField("player", {
        color: "#000",
        position: pointer.position,
        marquee_a: marquee?.a ?? null,
      } satisfies AwarenessPayload["player"]);
    });
  }

  public destroy() {
    this.__unsubscribe_editor();
    this.provider.destroy();
    this.doc.destroy();
  }
}
