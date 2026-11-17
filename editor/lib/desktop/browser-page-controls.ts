import { DesktopBrowser } from "@grida/desktop-bridge";

/** Purpose-specific native page controls; no script or debugger transport. */
export namespace BrowserPageControls {
  export type Binding = Readonly<{
    api: DesktopBrowser.Utilities.Bridge;
    target: DesktopBrowser.Target;
    revision: number;
  }>;
  export type State = Readonly<{
    supported: boolean;
    findOpen: boolean;
    text: string;
    matchCase: boolean;
    result: DesktopBrowser.Utilities.FindResult | null;
    finding: boolean;
    zoom: number;
    error: string | null;
    focusRevision: number;
  }>;
  export class Controller {
    private state: State = {
      supported: false,
      findOpen: false,
      text: "",
      matchCase: false,
      result: null,
      finding: false,
      zoom: 1,
      error: null,
      focusRevision: 0,
    };
    private binding: Binding | null = null;
    private generation = 0;
    private disposed = false;
    private findSequence = 0;
    private zoomSequence = 0;
    private zoomPending = 0;
    private listeners = new Set<() => void>();
    private zoomQueue: Promise<void> = Promise.resolve();
    constructor(private readonly native: () => Binding | null) {
      this.sync();
    }
    readonly read = (): State => this.state;
    readonly subscribe = (listener: () => void): (() => void) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    };
    sync(): void {
      if (this.disposed) return;
      const next = this.native();
      const valid =
        next?.api.version === DesktopBrowser.Utilities.VERSION ? next : null;
      const old = this.binding;
      if (
        old?.api === valid?.api &&
        old?.target.attachmentId === valid?.target.attachmentId &&
        old?.target.pageId === valid?.target.pageId &&
        old?.revision === valid?.revision
      )
        return;
      this.generation++;
      this.findSequence++;
      if (old && this.state.findOpen)
        void old.api.stopFind(old.target).catch(() => {});
      this.binding = valid;
      this.publish({
        supported: valid !== null,
        findOpen: false,
        text: "",
        result: null,
        finding: false,
        zoom: 1,
        error: null,
      });
    }
    readonly openFind = (): boolean => {
      this.sync();
      if (!this.binding) return false;
      this.publish({
        findOpen: true,
        focusRevision: this.state.focusRevision + 1,
        error: null,
      });
      if (this.state.text) void this.find(true, false);
      return true;
    };
    readonly setText = (text: string): void => {
      this.publish({ text, result: null, error: null });
      void this.find(true, false);
    };
    readonly setMatchCase = (matchCase: boolean): void => {
      this.publish({ matchCase });
      void this.find(true, false);
    };
    readonly next = (forward = true): Promise<void> => this.find(forward, true);
    readonly closeFind = (): void => {
      this.findSequence++;
      const binding = this.binding;
      this.publish({
        findOpen: false,
        result: null,
        finding: false,
        error: null,
      });
      if (binding) void binding.api.stopFind(binding.target).catch(() => {});
    };
    readonly refreshZoom = async (): Promise<void> => {
      this.sync();
      const binding = this.binding;
      const generation = this.generation;
      const sequence = this.zoomSequence;
      if (!binding || this.zoomPending) return;
      try {
        const zoom = DesktopBrowser.Utilities.parseZoomFactor(
          await binding.api.getZoom(binding.target)
        );
        if (
          generation === this.generation &&
          sequence === this.zoomSequence &&
          !this.zoomPending &&
          zoom !== null
        )
          this.publish({ zoom });
      } catch {
        /* Optional menu observation keeps the last usable value. */
      }
    };
    readonly zoom = (direction: "in" | "out" | "reset"): Promise<void> => {
      this.sync();
      const binding = this.binding;
      const generation = this.generation;
      if (!binding) return Promise.resolve();
      this.zoomSequence++;
      this.zoomPending++;
      const operation = this.zoomQueue.then(async () => {
        if (generation !== this.generation) return;
        try {
          const current = DesktopBrowser.Utilities.parseZoomFactor(
            await binding.api.getZoom(binding.target)
          );
          if (current === null || generation !== this.generation) return;
          const factor =
            direction === "reset"
              ? 1
              : Math.max(
                  DesktopBrowser.Utilities.MIN_ZOOM_FACTOR,
                  Math.min(
                    DesktopBrowser.Utilities.MAX_ZOOM_FACTOR,
                    Math.round(
                      current * (direction === "in" ? 1.2 : 1 / 1.2) * 100
                    ) / 100
                  )
                );
          const zoom = DesktopBrowser.Utilities.parseZoomFactor(
            await binding.api.setZoom({ ...binding.target, factor })
          );
          if (generation === this.generation && zoom !== null)
            this.publish({ zoom, error: null });
        } catch {
          if (generation === this.generation)
            this.publish({ error: "Couldn’t change page zoom. Try again." });
        }
      });
      const completed = operation.finally(() => {
        this.zoomPending--;
      });
      this.zoomQueue = completed;
      return completed;
    };
    readonly print = (): Promise<void> => this.action("print");
    readonly inspect = (): Promise<void> => this.action("inspect");
    dispose(): void {
      this.closeFind();
      this.disposed = true;
      this.generation++;
      this.binding = null;
      this.publish({ supported: false });
      this.listeners.clear();
    }
    private async find(forward: boolean, findNext: boolean): Promise<void> {
      const binding = this.binding;
      const sequence = ++this.findSequence;
      const generation = this.generation;
      if (!binding || !this.state.findOpen) return;
      if (!this.state.text) {
        this.publish({ result: null, finding: false });
        await binding.api.stopFind(binding.target).catch(() => {});
        return;
      }
      const request = DesktopBrowser.Utilities.parseFind({
        ...binding.target,
        text: this.state.text,
        forward,
        findNext,
        matchCase: this.state.matchCase,
      });
      if (!request) {
        this.publish({ finding: false, error: "Enter shorter find text." });
        return;
      }
      this.publish({ finding: true, error: null });
      try {
        const result = DesktopBrowser.Utilities.parseFindResult(
          await binding.api.find(request)
        );
        if (generation !== this.generation || sequence !== this.findSequence)
          return;
        if (!result) throw new Error("Invalid find result");
        this.publish({ result, finding: false });
      } catch {
        if (generation === this.generation && sequence === this.findSequence)
          this.publish({
            finding: false,
            error: "Couldn’t find text on this page. Try again.",
          });
      }
    }
    private async action(action: "print" | "inspect"): Promise<void> {
      this.sync();
      const binding = this.binding;
      const generation = this.generation;
      if (!binding) return;
      this.publish({ error: null });
      try {
        await binding.api[action](binding.target);
      } catch {
        if (generation === this.generation)
          this.publish({
            error: `Couldn’t ${action === "print" ? "print" : "inspect"} this page. Try again.`,
          });
      }
    }
    private publish(patch: Partial<State>): void {
      this.state = { ...this.state, ...patch };
      for (const listener of this.listeners) listener();
    }
  }
}
