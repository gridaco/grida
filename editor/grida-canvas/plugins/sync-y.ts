import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import type { Awareness } from "y-protocols/awareness";
import type { Editor } from "../editor";
import { type Action, editor } from "..";
import type cmath from "@grida/cmath";
import { dq } from "../query";
import equal from "fast-deep-equal";

type AwarenessPayload = {
  player: {
    cursor_id: string;
    palette: editor.state.MultiplayerCursorColorPalette;
    transform: cmath.Transform;
    position: [number, number];
    marquee_a: [number, number] | null;
    selection: string[];
    scene_id: string | undefined;
  };
};

export class EditorYSyncPlugin {
  public readonly doc: Y.Doc;
  public readonly provider: WebsocketProvider;
  public readonly awareness: Awareness;
  private readonly __unsubscribe_player_change: () => void;
  private readonly __unsubscribe_document_change: () => void;
  private readonly ymap: Y.Map<any>;
  private throttle_ms: number = 5;
  private _tid: number = 0;

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
    this.ymap = this.doc.getMap("document");

    // Sync document state
    this.ymap.observe((event) => {
      const changes = event.changes.keys;
      const currentState = this._editor.getSnapshot();
      const updates = Object.fromEntries(
        Array.from(changes.entries())
          .filter(
            ([_, change]) =>
              change.action === "add" || change.action === "update"
          )
          .map(([key]) => [key, this.ymap.get(key)])
      );

      if (Object.keys(updates).length > 0) {
        this._tid = this._editor.reset(
          {
            ...currentState,
            document: { ...currentState.document, ...updates },
            document_ctx: dq.Context.from({
              ...currentState.document,
              ...updates,
            }),
          },
          undefined,
          true
        );
      }
    });

    const aware = () => {
      const states = Array.from(this.awareness.getStates().entries())
        .filter(([id]) => id !== this.awareness.clientID)
        .filter(([_, state]) => {
          // Only process states that have a complete player object with palette
          return state && state.player && state.player.palette;
        })
        .map((_: any) => {
          const [id, state] = _ as [string, AwarenessPayload];
          const {
            cursor_id,
            palette,
            position = [0, 0],
            marquee_a,
            transform,
            selection,
            scene_id,
          } = state.player;

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

      this._editor.__sync_cursors(cursorsObject);
    };

    this.awareness.on("change", aware);
    this.awareness.on("remove", aware);
    aware();

    // Subscribe to cursor changes for awareness updates (pointer, marquee, etc.)
    this.__unsubscribe_player_change = this._editor.subscribeWithSelector(
      (state) => ({
        pointer: state.pointer,
        marquee: state.marquee,
        selection: state.selection,
        transform: state.transform,
        scene_id: state.scene_id,
      }),
      (editor, next) => {
        if (editor.locked) return;
        const { pointer, marquee, selection, transform, scene_id } = next;

        // Update awareness for cursor position
        this.awareness.setLocalStateField("player", {
          cursor_id: this.cursor.cursor_id,
          palette: this.cursor.palette, // TODO: palette needs to be synced only once
          position: pointer.position,
          marquee_a: marquee?.a ?? null,
          transform,
          selection,
          scene_id,
        } satisfies AwarenessPayload["player"]);
      },
      equal
    );

    // Subscribe with selector for document sync
    this.__unsubscribe_document_change = this._editor.subscribeWithSelector(
      (state) => state.document,
      editor.throttle(
        (editor: Editor, next, __, action?: Action) => {
          if (editor.locked) return;
          // prevent loop mirroring
          if (editor.tid === this._tid) return;
          this.ymap.set("nodes", next.nodes);
          this.ymap.set("scenes", next.scenes);
          this.ymap.set("properties", next.properties);
        },
        this.throttle_ms,
        { trailing: true }
      )
    );
  }

  public destroy() {
    // Clean up awareness state immediately
    this.awareness.setLocalState(null);

    this.__unsubscribe_player_change();
    this.__unsubscribe_document_change();
    this.provider.destroy();
    this.doc.destroy();
  }
}
