import type { Editor } from "../editor";

export class EditorFollowPlugin {
  private __unsubscribe_editor: (() => void) | null = null;

  constructor(private readonly editor: Editor) {}

  public follow(cursor_id: string) {
    this.__unsubscribe_editor = this.editor.subscribe((editor) => {
      const { cursors } = editor.getSnapshot();
      const cursor = cursors.find((c) => c.id === cursor_id);
      if (cursor?.transform) {
        this.editor.transform(cursor.transform);
      }
    });
  }

  public unfollow() {
    this.__unsubscribe_editor?.();
  }
}
