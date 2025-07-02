import type { Editor } from "../editor";
import equal from "fast-deep-equal";
import cmath from "@grida/cmath";
import { domapi } from "../backends/dom";

export class EditorFollowPlugin {
  private _isFollowing: boolean = false;
  private set isFollowing(value: boolean) {
    this._isFollowing = value;
    this.listeners.forEach((fn) => fn());
  }
  public get isFollowing(): boolean {
    return this._isFollowing;
  }

  private __cursor_id: string | null = null;
  public get cursor_id(): string | null {
    return this.__cursor_id;
  }
  private __unsubscribe_cursor: (() => void) | null = null;

  constructor(private readonly editor: Editor) {}

  private listeners: Set<() => void> = new Set();
  public subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  public snapshot() {
    return {
      isFollowing: this._isFollowing,
      cursor: this.__cursor_id,
    };
  }

  public follow(cursor_id: string): boolean {
    if (this._isFollowing) return false;
    const cursor = this.editor.state.cursors.find((c) => c.id === cursor_id);
    if (!cursor) return false;

    const initial =
      cursor.transform ??
      ([
        [1, 0, cursor.position[0]],
        [0, 1, cursor.position[1]],
      ] as cmath.Transform);

    if (cursor.scene_id) this.editor.loadScene(cursor.scene_id);

    this.__cursor_id = cursor_id;

    this.editor.transform(this.fit(initial), false);
    this.__unsubscribe_cursor = this.editor.subscribeWithSelector(
      (state) => state.cursors.find((c) => c.id === cursor_id),
      (editor, cursor) => {
        if (!cursor) return;
        if (cursor.scene_id && cursor.scene_id !== editor.state.scene_id) {
          editor.loadScene(cursor.scene_id);
        }
        if (cursor.transform) {
          editor.transform(this.fit(cursor.transform), false);
        }
      },
      equal
    );

    this.isFollowing = true;
    return true;
  }

  public unfollow(): boolean {
    if (!this._isFollowing) return false;
    this.__unsubscribe_cursor?.();
    this.__unsubscribe_cursor = null;
    this.__cursor_id = null;
    this.isFollowing = false;
    return true;
  }

  /**
   * fit the presenter's viewbox to the viewer's viewbox
   *
   * always fit (scale) the viewer (this) transform to contain the presenter's viewbox.
   * (so the presentor's cursor will always be visible in viewer's viewbox)
   *
   * this works similar to well known css object-fit: contain
   *
   * input:
   * - presenter's viewbox / transform
   * - viewer's viewbox / transform
   *
   * output:
   * - viewer's transform
   */
  private fit(presenter: cmath.Transform): cmath.Transform {
    const { width, height } = this.editor.viewport.size;
    const viewport = { x: 0, y: 0, width, height };
    const inv = cmath.transform.invert(presenter);
    const presenter_viewbox = cmath.rect.transform(viewport, inv);
    return cmath.ext.viewport.transformToFit(viewport, presenter_viewbox);
  }
}
