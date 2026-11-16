import { ComposerTransfer } from "./composer-transfer";

/**
 * Drop target state for a surface larger than the composer editor — e.g. a
 * whole chat pane — that accepts operating-system file and folder drops and
 * forwards them through the same {@link ComposerTransfer} intake as the editor.
 *
 * Rules:
 * - Only drags that carry OS files (`DataTransfer.types` includes `"Files"`)
 *   are accepted. Text, HTML, link and element drags are ignored.
 * - Drags that began inside this document (`dragstart` seen on the window) are
 *   ignored even when they advertise `"Files"`, because Chromium does so for
 *   in-page image drags. In-app drag sources therefore keep their behaviour.
 * - Hover is tracked as a dragenter/dragleave depth, so moving across child
 *   elements does not flicker the highlight.
 * - The highlight clears on leave, drop, drag end (Escape/cancel) and window
 *   blur.
 * - A drop whose default was already prevented — the composer editor consumed
 *   it — is not forwarded again, so one gesture is handled exactly once.
 *
 * Listeners are attached with {@link ComposerDropZone.connect}; the React side
 * only subscribes to {@link ComposerDropZone.getSnapshot}.
 */
export class ComposerDropZone {
  /** The `DataTransfer.types` entry browsers add for operating-system files. */
  static readonly FILES_TYPE = "Files";

  private depth = 0;
  private active = false;
  private internalDrag = false;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly onTransfer: (event: ComposerTransfer.Event) => void
  ) {}

  /** True when a transfer advertises operating-system files. */
  static carriesFiles(data: Pick<DataTransfer, "types"> | null): boolean {
    if (!data) return false;
    return Array.from(data.types ?? []).includes(ComposerDropZone.FILES_TYPE);
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Whether an accepted file drag is currently over the surface. */
  readonly getSnapshot = (): boolean => this.active;

  /** Whether this drag is one the zone owns. */
  accepts(event: ComposerDropZone.DragLike): boolean {
    return (
      !this.internalDrag && ComposerDropZone.carriesFiles(event.dataTransfer)
    );
  }

  enter(event: ComposerDropZone.DragLike): void {
    if (!this.accepts(event)) return;
    event.preventDefault();
    this.depth += 1;
    this.setActive(true);
  }

  over(event: ComposerDropZone.DragLike): void {
    if (!this.accepts(event)) return;
    // Required for the browser to allow a drop here (and, in Electron, to keep
    // a missed file drop from navigating the window to the file).
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    if (this.depth === 0) this.depth = 1;
    this.setActive(true);
  }

  leave(event: ComposerDropZone.DragLike): void {
    if (!this.accepts(event) || this.depth === 0) return;
    this.depth -= 1;
    if (this.depth === 0) this.setActive(false);
  }

  /**
   * Forward an accepted drop. Returns the forwarded transfer, or null when the
   * drop was ignored (not a file drag, in-app drag, already handled by a child
   * such as the composer editor, or empty).
   */
  drop(event: ComposerDropZone.DragLike): ComposerTransfer.Event | null {
    const accepted = this.accepts(event);
    this.reset();
    if (!accepted) return null;
    if (event.defaultPrevented) return null;
    event.preventDefault();
    const transfer = ComposerTransfer.fromDrop(event.dataTransfer);
    if (transfer.resources.length === 0) return null;
    this.onTransfer(transfer);
    return transfer;
  }

  /** A drag began inside this document; ignore it until it ends. */
  internalDragStarted(): void {
    this.internalDrag = true;
    this.reset();
  }

  /** The current drag ended (dropped, cancelled with Escape, or released). */
  dragEnded(): void {
    this.internalDrag = false;
    this.reset();
  }

  /** Clear the highlight without changing drag provenance (e.g. window blur). */
  reset(): void {
    this.depth = 0;
    this.setActive(false);
  }

  /**
   * Attach the zone to its surface element and to the window. Returns a
   * disposer. Window listeners run in the capture phase so a source that stops
   * propagation cannot hide its own `dragstart`/`dragend`.
   */
  connect(surface: EventTarget, window: EventTarget): () => void {
    const enter = (e: Event) =>
      this.enter(e as unknown as ComposerDropZone.DragLike);
    const over = (e: Event) =>
      this.over(e as unknown as ComposerDropZone.DragLike);
    const leave = (e: Event) =>
      this.leave(e as unknown as ComposerDropZone.DragLike);
    const drop = (e: Event) => {
      this.drop(e as unknown as ComposerDropZone.DragLike);
    };
    const started = () => this.internalDragStarted();
    const ended = () => this.dragEnded();
    const cleared = () => this.reset();
    surface.addEventListener("dragenter", enter);
    surface.addEventListener("dragover", over);
    surface.addEventListener("dragleave", leave);
    surface.addEventListener("drop", drop);
    window.addEventListener("dragstart", started, true);
    window.addEventListener("dragend", ended, true);
    // Any drop in the window clears the highlight first (capture), even when a
    // child stops propagation; `dragend` does not fire for drags that came from
    // outside the document. Provenance is cleared only after the surface has
    // seen the drop (bubble), so an in-app drag stays ignored through it.
    window.addEventListener("drop", cleared, true);
    window.addEventListener("drop", ended);
    window.addEventListener("blur", cleared);
    return () => {
      surface.removeEventListener("dragenter", enter);
      surface.removeEventListener("dragover", over);
      surface.removeEventListener("dragleave", leave);
      surface.removeEventListener("drop", drop);
      window.removeEventListener("dragstart", started, true);
      window.removeEventListener("dragend", ended, true);
      window.removeEventListener("drop", cleared, true);
      window.removeEventListener("drop", ended);
      window.removeEventListener("blur", cleared);
      this.dragEnded();
    };
  }

  private setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    for (const listener of this.listeners) listener();
  }
}

export namespace ComposerDropZone {
  /** The part of a `DragEvent` the zone reads. */
  export type DragLike = {
    readonly dataTransfer: DataTransfer | null;
    readonly defaultPrevented: boolean;
    preventDefault(): void;
  };
}
