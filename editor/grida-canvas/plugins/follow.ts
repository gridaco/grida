import type { Editor } from "../editor";
import equal from "fast-deep-equal";

export class EditorFollowPlugin {
  private _isFollowing: boolean = false;
  public get isFollowing(): boolean {
    return this._isFollowing;
  }

  private __unsubscribe_cursor: (() => void) | null = null;

  constructor(private readonly editor: Editor) {}

  public follow(cursor_id: string): boolean {
    if (this._isFollowing) return false;
    const cursor = this.editor.state.cursors.find((c) => c.id === cursor_id);
    if (!cursor) return false;

    this.editor.transform(
      cursor.transform ?? [
        [1, 0, cursor.position[0]], // identity + translate x
        [0, 1, cursor.position[1]], // identity + translate y
      ],
      false
    );
    this.__unsubscribe_cursor = this.editor.subscribeWithSelector(
      (state) => state.cursors.find((c) => c.id === cursor_id),
      (editor, cursor) => {
        if (cursor?.transform) {
          editor.transform(cursor.transform, false);
        }
      },
      equal
    );

    this._isFollowing = true;
    return true;
  }

  public unfollow(): boolean {
    if (!this._isFollowing) return false;
    this.__unsubscribe_cursor?.();
    this.__unsubscribe_cursor = null;

    this._isFollowing = false;
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
  private fit() {
    // TODO: implement
  }
}
