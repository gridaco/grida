type Run = {
  abort: AbortController;
  stream?: MediaStream;
  session?: Dictation.Session;
};

export namespace Dictation {
  export type State =
    | { phase: "idle" | "starting" | "finishing" }
    | { phase: "recording"; stream: MediaStream }
    | { phase: "error"; error: Error };

  export type Session = {
    /** Settles when recognition finishes, including after cancellation. */
    result: Promise<string>;
    /** Stop consuming audio and finish recognizing the audio already received. */
    stop(): void;
  };

  export type Recognizer = (
    stream: MediaStream,
    signal: AbortSignal
  ) => Session;
}

/** Owns a single dictation session and the microphone tracks it acquires. */
export class Dictation {
  private state: Dictation.State = { phase: "idle" };
  private run: Run | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly capture: (signal: AbortSignal) => Promise<MediaStream>
  ) {}

  readonly getSnapshot = (): Dictation.State => this.state;

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** An empty string is a completed dictation with no speech. Null is no result. */
  async start(recognize: Dictation.Recognizer): Promise<string | null> {
    this.cancel();
    const run: Run = { abort: new AbortController() };
    this.run = run;
    this.publish({ phase: "starting" });

    try {
      const stream = await this.capture(run.abort.signal);
      if (this.run !== run) {
        stream.getTracks().forEach((track) => track.stop());
        return null;
      }
      run.stream = stream;
      const session = recognize(stream, run.abort.signal);
      run.session = session;
      this.publish({ phase: "recording", stream });

      const text = await session.result;
      if (this.run !== run) return null;
      this.finish(run, { phase: "idle" });
      return text.trim();
    } catch (error) {
      this.fail(run, error);
      return null;
    }
  }

  stop(): void {
    const run = this.run;
    if (!run) return;
    if (this.state.phase === "starting") {
      this.cancel();
      return;
    }
    if (this.state.phase !== "recording" || !run.session) return;

    this.publish({ phase: "finishing" });
    try {
      run.session.stop();
      this.releaseStream(run);
    } catch (error) {
      this.fail(run, error);
    }
  }

  cancel(): void {
    if (this.run) this.finish(this.run, { phase: "idle" });
    else if (this.state.phase !== "idle") this.publish({ phase: "idle" });
  }

  private fail(run: Run, error: unknown): void {
    if (this.run !== run) return;
    this.finish(run, {
      phase: "error",
      error: error instanceof Error ? error : new Error(String(error)),
    });
  }

  private finish(run: Run, state: Dictation.State): void {
    this.run = null;
    run.abort.abort();
    this.releaseStream(run);
    this.publish(state);
  }

  private releaseStream(run: Run): void {
    run.stream?.getTracks().forEach((track) => track.stop());
    run.stream = undefined;
  }

  private publish(state: Dictation.State): void {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
}
