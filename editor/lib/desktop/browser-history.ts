import { DesktopBrowser } from "@grida/desktop-bridge";
import { Browser } from "./browser";

/** Versioned local history observations shared by address and Settings views. */
export namespace BrowserHistory {
  export type State = Readonly<{
    supported: boolean;
    query: string;
    entries: readonly DesktopBrowser.History.Entry[];
    loading: boolean;
    error: string | null;
    removing: ReadonlySet<string>;
  }>;

  export class Controller {
    private state: State;
    private listeners = new Set<() => void>();
    private api: DesktopBrowser.History.Bridge | null = null;
    private identity: DesktopBrowser.History.Bridge | null = null;
    private unsubscribe?: () => void;
    private generation = 0;
    private revision = 0;
    private removals = new Map<string, object>();
    private disposed = false;

    constructor(
      private readonly native: () =>
        | DesktopBrowser.History.Bridge
        | null
        | undefined = () => Browser.getBridge()?.history,
      private readonly limit = 8
    ) {
      this.state = {
        supported: native()?.version === DesktopBrowser.History.VERSION,
        query: "",
        entries: [],
        loading: false,
        error: null,
        removing: new Set(),
      };
    }
    readonly read = (): State => this.state;
    readonly subscribe = (listener: () => void): (() => void) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    };
    readonly setQuery = (query: string): void => {
      if (this.disposed || query === this.state.query) return;
      this.publish({ query, entries: [], error: null });
      void this.refresh();
    };
    readonly refresh = async (): Promise<void> => {
      if (this.disposed) return;
      const api = this.native();
      if (!api || api.version !== DesktopBrowser.History.VERSION) {
        this.cancel();
        this.publish({
          supported: false,
          entries: [],
          loading: false,
          error: null,
        });
        return;
      }
      if (api !== this.api) {
        this.unsubscribe?.();
        this.api = api;
        if (this.identity !== api) this.revision = 0;
        this.identity = api;
        this.unsubscribe = api.subscribe((value) => {
          const change = DesktopBrowser.History.parseChange(value);
          if (!change || change.revision <= this.revision) return;
          this.revision = change.revision;
          void this.refresh();
        });
      }
      const generation = ++this.generation;
      const request = DesktopBrowser.History.parseQuery({
        query: this.state.query,
        limit: this.limit,
      });
      if (!request) {
        this.publish({
          supported: true,
          entries: [],
          loading: false,
          error: "Enter a shorter history search.",
        });
        return;
      }
      this.publish({
        supported: true,
        loading: true,
        entries: [],
        error: null,
      });
      try {
        const snapshot = DesktopBrowser.History.parseSnapshot(
          await api.query(request)
        );
        if (generation !== this.generation || this.disposed || this.api !== api)
          return;
        if (!snapshot) throw new Error("Invalid history snapshot");
        if (snapshot.revision < this.revision) {
          this.publish({ loading: false });
          return;
        }
        this.revision = snapshot.revision;
        this.publish({
          entries: snapshot.entries.slice(0, request.limit),
          loading: false,
        });
      } catch {
        if (generation === this.generation && !this.disposed)
          this.publish({
            entries: [],
            loading: false,
            error: "Couldn’t load browser history. Try again.",
          });
      }
    };
    readonly remove = async (url: string): Promise<void> => {
      if (this.disposed || this.removals.has(url)) return;
      const request = DesktopBrowser.History.parseRemoval({ url });
      const api = this.api ?? this.native();
      if (!request || !api || api.version !== DesktopBrowser.History.VERSION)
        return;
      const token = {};
      this.removals.set(url, token);
      this.publish({ removing: new Set(this.removals.keys()), error: null });
      try {
        await api.remove(request);
        if (this.disposed || this.removals.get(url) !== token) return;
        await this.refresh();
      } catch {
        if (!this.disposed && this.removals.get(url) === token)
          this.publish({
            error: "Couldn’t remove this history entry. Try again.",
          });
      } finally {
        if (this.removals.get(url) === token) {
          this.removals.delete(url);
          this.publish({ removing: new Set(this.removals.keys()) });
        }
      }
    };
    cancel(): void {
      this.generation++;
      this.unsubscribe?.();
      this.unsubscribe = undefined;
      this.api = null;
      this.removals.clear();
      if (!this.disposed) this.publish({ loading: false, removing: new Set() });
    }
    dispose(): void {
      this.cancel();
      this.disposed = true;
      this.listeners.clear();
    }
    private publish(patch: Partial<State>): void {
      this.state = { ...this.state, ...patch };
      for (const listener of this.listeners) listener();
    }
  }
}
