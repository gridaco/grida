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

/** The processes one stop request names, or every process of the chat. */
type Targets = ReadonlySet<number> | "all";
type Stop = { targets: Targets; done: Promise<boolean> };

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
  /** The stop request the agent is handling. */
  private running?: Stop;
  /** Processes asked for while `running` was pending, sent after it. */
  private queued?: Stop;
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
   * Resolves whether the agent confirmed the stop. A request the pending stop
   * already covers shares its outcome; any other waits for it, joined with
   * every other request made meanwhile, and is then sent on its own.
   */
  stop(processIds?: readonly number[]): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    const wanted: Targets = processIds ? new Set(processIds) : "all";
    const running = this.running;
    if (!running) return this.send(wanted);
    if (covers(running.targets, wanted)) return running.done;
    if (this.queued) this.queued.targets = union(this.queued.targets, wanted);
    else {
      const queued: Stop = { targets: wanted, done: Promise.resolve(false) };
      queued.done = running.done.then(() => {
        if (this.queued === queued) this.queued = undefined;
        return this.send(queued.targets);
      });
      this.queued = queued;
    }
    this.update({ stopping: this.pending() });
    return this.queued.done;
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }

  private send(targets: Targets): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    const stop: Stop = { targets, done: Promise.resolve(false) };
    this.running = stop;
    stop.done = this.request(
      targets === "all" ? undefined : [...targets]
    ).finally(() => {
      if (this.running === stop) this.running = undefined;
    });
    return stop.done;
  }

  /** Every process a sent or waiting stop request names. */
  private pending(): View["stopping"] {
    const { running, queued } = this;
    if (running && queued) return shown(union(running.targets, queued.targets));
    const only = running ?? queued;
    return only ? shown(only.targets) : null;
  }

  private async request(processIds?: readonly number[]): Promise<boolean> {
    this.update({ stopping: this.pending(), error: null });
    try {
      await this.bridge.stopBackgroundProcesses(this.attachmentId, processIds);
      if (this.disposed) return true;
      this.update({ stopping: this.queuedStopping() });
      await this.load();
      return true;
    } catch {
      if (!this.disposed)
        this.update({
          stopping: this.queuedStopping(),
          error: "Couldn't stop the background processes. Try again.",
        });
      return false;
    }
  }

  /** What stays shown as stopping once the sent request settles. */
  private queuedStopping(): View["stopping"] {
    return this.queued ? shown(this.queued.targets) : null;
  }

  private update(change: Partial<View>): void {
    this.view = { ...this.view, ...change };
    for (const listener of this.listeners) listener();
  }
}

function covers(sent: Targets, wanted: Targets): boolean {
  if (sent === "all") return true;
  if (wanted === "all") return false;
  for (const id of wanted) if (!sent.has(id)) return false;
  return true;
}

function union(a: Targets, b: Targets): Targets {
  return a === "all" || b === "all" ? "all" : new Set([...a, ...b]);
}

function shown(targets: Targets): readonly number[] | "all" {
  return targets === "all" ? "all" : [...targets];
}
