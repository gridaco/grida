import { editor } from "..";
import type { Action } from "../action";
import type { Editor } from "../editor";

type Buffer = {
  a: Action;
  t: number;
};

export class EditorRecorder {
  private readonly editor: Editor;
  private ussubscribe: (() => void) | null = null;
  private initial: editor.state.IEditorState | null = null;
  private final: editor.state.IEditorState | null = null;
  private buffer: Buffer[] = [];
  private status: "idle" | "playing" | "recording" = "idle";

  private listeners: Set<(status: "idle" | "playing" | "recording") => void> =
    new Set();

  constructor(editor: Editor) {
    this.editor = editor;
  }

  start() {
    if (this.status === "recording")
      throw new Error("Cannot start recording while recording");

    this.initial = this.editor.getSnapshot();
    this.status = "recording";

    this.ussubscribe = this.editor.subscribe((_, action) => {
      if (!action) return;
      this.buffer.push({
        a: action,
        t: Date.now(),
      });
    });
    this.__notify_status_change();
  }

  stop() {
    if (this.status !== "recording")
      throw new Error("Cannot stop recording while not recording");

    this.final = this.editor.getSnapshot();
    this.status = "idle";
    this.ussubscribe?.();
    this.ussubscribe = null;
    this.__notify_status_change();
  }

  flush() {
    this.status = "idle";
    this.buffer = [];
    this.initial = null;
    this.ussubscribe?.();
    this.ussubscribe = null;
    this.__notify_status_change();
  }

  __notify_status_change() {
    this.listeners.forEach((fn) => fn(this.status));
  }

  subscribeStatusChange(
    fn: (status: "idle" | "playing" | "recording") => void
  ) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getStatus() {
    return this.status;
  }

  async replay() {
    if (this.status !== "idle")
      throw new Error("Cannot replay while recording");

    if (!this.initial || this.buffer.length === 0) return;

    this.status = "playing";
    this.editor.locked = true;
    this.editor.reset(this.initial, true);
    this.__notify_status_change();

    for (let i = 0; i < this.buffer.length; i++) {
      const current = this.buffer[i];
      const prev = this.buffer[i - 1] ?? this.buffer[0];
      const delay = i === 0 ? 0 : current.t - prev.t;

      await new Promise((resolve) => setTimeout(resolve, delay));

      requestAnimationFrame(() => {
        this.editor.dispatch(current.a, true);
      });
    }
  }

  exit() {
    this.status = "idle";
    this.editor.locked = false;
    this.editor.reset(this.final!);
    this.__notify_status_change();
  }

  /**
   * dumps the buffer as a jsonl string
   */
  dumps() {
    return this.buffer.map((entry) => JSON.stringify(entry)).join("\n");
  }
}
