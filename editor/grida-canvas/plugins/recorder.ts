import { editor } from "..";
import type { Action } from "../action";
import type { Editor } from "../editor";

type Buffer = {
  a: Action;
  t: number;
};

type Status = "idle" | "playing" | "recording";

export class EditorRecorder {
  private readonly editor: Editor;
  private unsubscribe: (() => void) | null = null;
  private initial: editor.state.IEditorState | null = null;
  private final: editor.state.IEditorState | null = null;
  private buffer: Buffer[] | null = null;
  get nframes() {
    return this.buffer?.length ?? 0;
  }

  private _status: Status = "idle";
  private set status(value: Status) {
    if (this._status === value) return;
    this._status = value;
    this.__notify();
  }
  public get status() {
    return this._status;
  }

  private listeners: Set<(status: Status) => void> = new Set();
  private __notify() {
    this.listeners.forEach((fn) => fn(this.status));
  }

  constructor(editor: Editor) {
    this.editor = editor;
  }

  start() {
    if (this.status === "recording")
      throw new Error("Cannot start recording while recording");

    this.initial = this.editor.getSnapshot();
    this.status = "recording";
    this.buffer = [];

    this.unsubscribe = this.editor.subscribe((_, action) => {
      if (!action) return;
      if (!this.buffer) return;
      this.buffer.push({
        a: action,
        t: Date.now(),
      });
    });
  }

  stop() {
    if (this.status !== "recording")
      throw new Error("Cannot stop recording while not recording");

    this.final = this.editor.getSnapshot();
    this.status = "idle";
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  clear() {
    this.status = "idle";
    this.buffer = null;
    this.initial = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.__notify();
  }

  subscribe(fn: (status: "idle" | "playing" | "recording") => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  snapshot() {
    return { status: this.status, nframes: this.nframes };
  }

  async play() {
    if (this.status !== "idle")
      throw new Error("Cannot replay while recording");

    if (!this.initial || !this.buffer || this.buffer.length === 0) return;

    this.status = "playing";
    this.editor.doc.locked = true;
    this.editor.doc.reset(this.initial, undefined, true);

    for (let i = 0; i < this.buffer.length; i++) {
      const current = this.buffer[i];
      const prev = this.buffer[i - 1] ?? this.buffer[0];
      const delay = i === 0 ? 0 : current.t - prev.t;

      await new Promise((resolve) => setTimeout(resolve, delay));

      requestAnimationFrame(() => {
        this.editor.doc.dispatch(current.a, true);
      });
    }

    this.exit();
  }

  exit() {
    this.status = "idle";
    this.editor.doc.locked = false;
    this.editor.doc.reset(this.final!);
  }

  /**
   * dumps the buffer as a jsonl string
   */
  dumps() {
    return this.buffer?.map((entry) => JSON.stringify(entry)).join("\n");
  }
}
