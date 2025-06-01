import type { Editor } from "../editor";

export class EditorFollowPlugin {
  private __unsubscribe_cursor: (() => void) | null = null;

  constructor(private readonly editor: Editor) {}

  public follow(cursor_id: string) {
    this.__unsubscribe_cursor = this.editor.subscribeWithSelector(
      (state) => state.cursors.find((c) => c.id === cursor_id),
      (cursor) => {
        if (cursor?.transform) {
          this.editor.transform(cursor.transform);
        }
      }
    );
  }

  public unfollow() {
    this.__unsubscribe_cursor?.();
  }
}
