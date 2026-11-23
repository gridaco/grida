import type {
  DesktopHooks,
  NativeGlobalHookInspection,
} from "@grida/desktop-bridge";

/** Global hook inspection and native trust review, independent of chat state. */
export namespace SettingsHooks {
  export type State = Readonly<{
    supported: boolean;
    loading: boolean;
    action: string | null;
    inspection: NativeGlobalHookInspection | null;
    error: string | null;
  }>;

  export class Controller {
    private state: State = {
      supported: false,
      loading: true,
      action: null,
      inspection: null,
      error: null,
    };
    private listeners = new Set<() => void>();
    private generation = 0;
    private pending = false;
    constructor(private readonly native: () => DesktopHooks | undefined) {}
    readonly read = (): State => this.state;
    readonly subscribe = (listener: () => void): (() => void) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    };
    cancel(): void {
      this.generation += 1;
      this.pending = false;
    }
    readonly refresh = async (): Promise<void> => {
      await this.run(null, (api) => api.inspect());
    };
    readonly reload = async (): Promise<void> => {
      await this.run("reload", (api) => api.reload());
    };
    readonly openConfig = async (): Promise<void> => {
      await this.run("open", async (api) => {
        await api.open_config();
        return null;
      });
    };
    async review(id: string): Promise<void> {
      const hook = this.state.inspection?.hooks.find((hook) => hook.id === id);
      if (!hook || hook.trusted) return;
      await this.run(id, (api) => api.review(hook.id, hook.revision));
    }
    private async run(
      action: State["action"],
      operation: (
        api: DesktopHooks
      ) => Promise<NativeGlobalHookInspection | null>
    ): Promise<void> {
      if (this.pending) return;
      const api = this.native();
      if (!api) {
        this.publish({ supported: false, loading: false });
        return;
      }
      this.pending = true;
      const generation = ++this.generation;
      this.publish({
        supported: true,
        loading: action === null || this.state.inspection === null,
        action,
        error: null,
      });
      try {
        const inspection = await operation(api);
        if (generation === this.generation && inspection)
          this.publish({ inspection });
      } catch {
        if (generation === this.generation)
          this.publish({
            ...(action === null && { inspection: null }),
            error:
              action === "open"
                ? "Couldn't open config.toml."
                : action && action !== "reload"
                  ? "Couldn't review this hook. Reload the configuration and try again."
                  : "Couldn't read config.toml.",
          });
      } finally {
        // Creating the file and opening it are separate effects. The file
        // can exist even when the system reports that opening it failed.
        const inspection =
          action === "open" && generation === this.generation
            ? await api.inspect().catch(() => null)
            : undefined;
        if (generation === this.generation) {
          this.pending = false;
          this.publish({
            ...(inspection !== undefined && { inspection }),
            loading: false,
            action: null,
          });
        }
      }
    }
    private publish(patch: Partial<State>): void {
      this.state = { ...this.state, ...patch };
      for (const listener of this.listeners) listener();
    }
  }
}
