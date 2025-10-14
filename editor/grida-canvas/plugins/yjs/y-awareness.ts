import type { Awareness } from "y-protocols/awareness";
import type { Editor } from "@/grida-canvas/editor";
import { editor } from "@/grida-canvas/editor.i";
import equal from "fast-deep-equal";

/**
 * class for managing awareness/cursor synchronization
 */
export class AwarenessSyncManager {
  private __unsubscribe_geo_change!: () => void;
  private __unsubscribe_focus_change!: () => void;

  private _currentState: Partial<
    Omit<editor.multiplayer.AwarenessPayload, "cursor_id" | "profile">
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
          const [id, state] = _ as [
            string,
            editor.multiplayer.AwarenessPayload,
          ];
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
    } satisfies editor.multiplayer.AwarenessPayload);
  }

  public destroy() {
    this.__unsubscribe_geo_change();
    this.__unsubscribe_focus_change();
    this.__unsubscribe_cursor_chat_change();
  }
}
