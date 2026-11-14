import type {
  DesktopNativeChat,
  NativeChatBackgroundProcess,
} from "@grida/desktop-bridge";

type ProcessBridge = Required<
  Pick<
    DesktopNativeChat,
    | "acceptsBackgroundProcesses"
    | "backgroundProcesses"
    | "stopBackgroundProcesses"
  >
>;
type View = Readonly<{
  processes: readonly NativeChatBackgroundProcess[];
  /** Processes still running; the indicator shows only while this is > 0. */
  running: number;
  /** The processes a stop request is waiting on, or `"all"`. */
  stopping: readonly number[] | "all" | null;
  error: string | null;
}>;

const EMPTY: View = Object.freeze({
  processes: [],
  running: 0,
  stopping: null,
  error: null,
});

/**
 * The background processes of one attached chat: commands the agent kept
 * running after a short wait. The agent sends the complete list whenever it
 * changes; this view keeps the latest list and stops processes on request.
 */
export class NativeBackgroundProcessController {
  private readonly listeners = new Set<() => void>();
  private view: View = EMPTY;
  private disposed = false;
  private stopping?: Promise<boolean>;
  /** Bumped by every list, so an older read never replaces a newer one. */
  private revision = 0;

  constructor(
    private readonly bridge: ProcessBridge,
    private readonly attachmentId: string
  ) {}

  static supported(
    bridge: DesktopNativeChat
  ): bridge is DesktopNativeChat & ProcessBridge {
    return (
      !!bridge.acceptsBackgroundProcesses &&
      !!bridge.backgroundProcesses &&
      !!bridge.stopBackgroundProcesses
    );
  }

  readonly read = () => this.view;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Reads the current list once, for a chat attached after it changed. */
  async load(): Promise<void> {
    const revision = ++this.revision;
    try {
      const processes = await this.bridge.backgroundProcesses(
        this.attachmentId
      );
      if (!this.disposed && revision === this.revision) this.receive(processes);
    } catch {
      // Live updates still deliver the next change.
    }
  }

  /** A live update: the chat's complete current list. */
  receive(processes: readonly NativeChatBackgroundProcess[]): void {
    if (this.disposed) return;
    this.revision++;
    this.update({
      processes,
      running: processes.filter((process) => process.state === "running")
        .length,
    });
  }

  /**
   * Stops the named processes, or every process of the chat when omitted.
   * Resolves whether the agent confirmed the stop. A request made while
   * another stop is pending shares that stop's outcome.
   */
  stop(processIds?: readonly number[]): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    this.stopping ??= this.request(processIds).finally(() => {
      this.stopping = undefined;
    });
    return this.stopping;
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }

  private async request(processIds?: readonly number[]): Promise<boolean> {
    this.update({ stopping: processIds ?? "all", error: null });
    try {
      await this.bridge.stopBackgroundProcesses(this.attachmentId, processIds);
      if (this.disposed) return true;
      this.update({ stopping: null });
      await this.load();
      return true;
    } catch {
      if (!this.disposed)
        this.update({
          stopping: null,
          error: "Couldn't stop the background processes. Try again.",
        });
      return false;
    }
  }

  private update(change: Partial<View>): void {
    this.view = { ...this.view, ...change };
    for (const listener of this.listeners) listener();
  }
}
