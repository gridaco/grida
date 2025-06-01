import type { Editor } from "../editor";

export class EditorFollowPlugin {
  private __unsubscribe_cursor: (() => void) | null = null;

  constructor(private readonly editor: Editor) {}

  public follow(cursor_id: string) {
    this.__unsubscribe_cursor = this.editor.subscribeWithSelector(
      (state) => state.cursors.find((c) => c.id === cursor_id),
      (editor, cursor) => {
        if (cursor?.transform) {
          editor.transform(cursor.transform);
        }
      }
    );
  }

  public unfollow() {
    this.__unsubscribe_cursor?.();
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
