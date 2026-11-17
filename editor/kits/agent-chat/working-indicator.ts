/** Presentation timing for an active turn whose visible progress has gone quiet. */
export class WorkingIndicator {
  static readonly delayMs = 1500;

  private state: Readonly<{ progress: unknown; visible: boolean }> = {
    progress: undefined,
    visible: false,
  };
  private readonly listeners = new Set<() => void>();
  private pending?: object;
  private cancel?: () => void;

  readonly read = () => this.state;

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Show immediately before first output; later progress starts a quiet delay. */
  watch(progress: unknown, immediate = false): () => void {
    this.cancel?.();
    const pending = {};
    this.pending = pending;
    this.update(progress, immediate);
    const timer = immediate
      ? undefined
      : setTimeout(() => {
          if (this.pending === pending) this.update(progress, true);
        }, WorkingIndicator.delayMs);
    const cancel = () => {
      clearTimeout(timer);
      if (this.pending !== pending) return;
      this.pending = undefined;
      this.cancel = undefined;
      this.update(progress, false);
    };
    this.cancel = cancel;
    return cancel;
  }

  private update(progress: unknown, visible: boolean): void {
    if (
      Object.is(this.state.progress, progress) &&
      this.state.visible === visible
    )
      return;
    this.state = { progress, visible };
    for (const listener of this.listeners) listener();
  }
}
