/**
 * @module presence-sync
 *
 * Bridges cursor/presence between the editor and SyncClient.
 *
 * Reuses the same subscription patterns as the old YJS AwarenessSyncManager
 * but sends/receives via SyncClient.setPresence() / onPresenceChange().
 */

import type { Editor } from "@/grida-canvas/editor";
import { editor } from "@/grida-canvas/editor.i";
import type { SyncClient, PresenceState } from "@grida/canvas-sync";
import type cmath from "@grida/cmath";
import equal from "fast-deep-equal";

export class PresenceSyncAdapter {
  private _unsubscribeGeo: (() => void) | null = null;
  private _unsubscribeFocus: (() => void) | null = null;
  private _unsubscribeCursorChat: (() => void) | null = null;
  private _unsubscribePresence: (() => void) | null = null;

  private _currentGeo: {
    position: [number, number];
    marquee_a: [number, number] | null;
    transform: cmath.Transform;
  } = {
    position: [0, 0],
    marquee_a: null,
    transform: [
      [1, 0, 0],
      [0, 1, 0],
    ],
  };

  private _currentFocus: {
    scene_id: string | undefined;
    selection: string[];
  } = {
    scene_id: undefined,
    selection: [],
  };

  private _currentCursorChat: { txt: string; ts: number } | null = null;

  constructor(
    private readonly _editor: Editor,
    private readonly _client: SyncClient,
    private readonly _cursor: {
      cursor_id: string;
      palette: editor.state.MultiplayerCursorColorPalette;
    }
  ) {
    this._setupLocalToRemote();
    this._setupRemoteToLocal();
  }

  // -----------------------------------------------------------------------
  // Local → Remote
  // -----------------------------------------------------------------------

  private _setupLocalToRemote(): void {
    // High-frequency: pointer, marquee, camera
    this._unsubscribeGeo = this._editor.doc.subscribeWithSelector(
      (state) => ({
        pointer: state.pointer,
        marquee: state.marquee,
        transform: state.transform,
      }),
      (_store, next) => {
        const { pointer, marquee, transform } = next;
        this._currentGeo = {
          position: pointer.position,
          marquee_a: marquee?.a ?? null,
          transform,
        };
        this._pushPresence();
      },
      equal
    );

    // Medium-frequency: selection, scene
    this._unsubscribeFocus = this._editor.doc.subscribeWithSelector(
      (state) => ({
        selection: state.selection,
        scene_id: state.scene_id,
      }),
      (_store, next) => {
        this._currentFocus = {
          scene_id: next.scene_id,
          selection: next.selection,
        };
        this._pushPresence();
      },
      equal
    );

    // Low-frequency: cursor chat
    this._unsubscribeCursorChat = this._editor.doc.subscribeWithSelector(
      (state) => state.local_cursor_chat,
      (_store, next) => {
        this._currentCursorChat = next.message
          ? { txt: next.message, ts: next.last_modified || Date.now() }
          : null;
        this._pushPresence();
      },
      equal
    );
  }

  private _pushPresence(): void {
    this._client.setPresence({
      cursor: {
        cursor_id: this._cursor.cursor_id,
        x: this._currentGeo.position[0],
        y: this._currentGeo.position[1],
        t: Date.now(),
      },
      selection: this._currentFocus.selection,
      scene_id: this._currentFocus.scene_id,
      viewport: {
        x: this._currentGeo.transform[0]?.[2] ?? 0,
        y: this._currentGeo.transform[1]?.[2] ?? 0,
        zoom: this._currentGeo.transform[0]?.[0] ?? 1,
      },
      profile: {
        name: this._cursor.cursor_id,
        color: this._cursor.palette["500"],
      },
    });
  }

  // -----------------------------------------------------------------------
  // Remote → Local
  // -----------------------------------------------------------------------

  private _setupRemoteToLocal(): void {
    this._unsubscribePresence = this._client.on("presenceChange", (peers) => {
      const cursors: Record<string, editor.state.MultiplayerCursor> = {};

      for (const [peerId, presence] of Object.entries(peers)) {
        if (!presence.cursor || !presence.profile?.color) continue;

        const cursor = presence.cursor;
        cursors[cursor.cursor_id] = {
          t: cursor.t,
          id: cursor.cursor_id,
          position: [cursor.x, cursor.y],
          palette: this._colorToPalette(presence.profile.color),
          transform: presence.viewport
            ? [
                [presence.viewport.zoom, 0, presence.viewport.x],
                [0, presence.viewport.zoom, presence.viewport.y],
              ]
            : null,
          selection: [...(presence.selection ?? [])],
          scene_id: presence.scene_id,
          marquee: null, // TODO: encode marquee in presence if needed
          ephemeral_chat: null, // TODO: encode cursor chat in presence
        };
      }

      this._editor.surface.__sync_cursors(cursors);
    });
  }

  /**
   * Build a minimal palette from a single color string.
   * The old YJS system sent the full palette; the new protocol sends
   * just the primary color. We synthesize a palette by using the color
   * for all slots. This is good enough for rendering — the cursor badge
   * primarily uses the "500" slot.
   */
  private _colorToPalette(
    color: string
  ): editor.state.MultiplayerCursorColorPalette {
    return {
      "50": color,
      "100": color,
      "200": color,
      "300": color,
      "400": color,
      "500": color,
      "600": color,
      "700": color,
      "800": color,
      "900": color,
      "950": color,
    };
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  destroy(): void {
    this._unsubscribeGeo?.();
    this._unsubscribeFocus?.();
    this._unsubscribeCursorChat?.();
    this._unsubscribePresence?.();
  }
}
