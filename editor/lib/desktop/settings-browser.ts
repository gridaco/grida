import { DesktopBrowser } from "@grida/desktop-bridge";

/** Settings clears the shared browser profile without attaching to pages. */
export namespace SettingsBrowser {
  type Native = Pick<DesktopBrowser.Bridge, "clearBrowsingData" | "management">;
  export type State = Readonly<{
    supported: boolean;
    clearing: boolean;
    result: "cleared" | "cancelled" | null;
    error: string | null;
    managementSupported: boolean;
    canOpenHistory: boolean;
    downloads: DesktopBrowser.Management.DownloadPreferences | null;
    action: string | null;
    notice: string | null;
  }>;

  export class Controller {
    private state: State = {
      supported: false,
      clearing: false,
      result: null,
      error: null,
      managementSupported: false,
      canOpenHistory: false,
      downloads: null,
      action: null,
      notice: null,
    };
    private listeners = new Set<() => void>();
    private generation = 0;
    private pending = false;
    private readGeneration = 0;

    constructor(private readonly native: () => Native | null | undefined) {
      this.state = { ...this.state, supported: !!native()?.clearBrowsingData };
    }

    readonly read = (): State => this.state;
    readonly subscribe = (listener: () => void): (() => void) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    };

    /** Stop observing an in-flight action; accepted native work keeps its owner. */
    cancel(): void {
      this.generation++;
      this.readGeneration++;
      this.pending = false;
      this.publish({ action: null, clearing: false });
    }

    readonly refresh = (): void => {
      if (this.pending) return;
      if (!this.native()?.clearBrowsingData) {
        this.unsupported();
        return;
      }
      this.publish({ supported: true, clearing: false });
      const management = this.management();
      this.publish({
        managementSupported: !!management,
        canOpenHistory: typeof management?.openPage === "function",
      });
      if (management) void this.loadPreferences(management);
    };

    readonly clear = async (): Promise<void> => {
      if (this.pending) return;
      const api = this.native();
      if (!api?.clearBrowsingData) {
        this.unsupported();
        return;
      }
      this.pending = true;
      this.readGeneration++;
      const generation = ++this.generation;
      this.publish({
        supported: true,
        clearing: true,
        result: null,
        error: null,
      });
      try {
        // Main confirms the same app-wide operation from Settings and toolbar.
        const cleared = await api.clearBrowsingData();
        if (typeof cleared !== "boolean")
          throw new Error("Invalid browser clear result");
        if (generation === this.generation)
          this.publish({ result: cleared ? "cleared" : "cancelled" });
      } catch {
        if (generation === this.generation)
          this.publish({ error: "Couldn’t clear browsing data. Try again." });
      } finally {
        if (generation === this.generation) {
          this.pending = false;
          this.publish({ clearing: false });
          this.loadInitialPreferences();
        }
      }
    };

    readonly clearHistory = (): Promise<void> =>
      this.perform("history", async (api) =>
        this.completed(await api.clearHistory(), "Browsing history cleared.")
      );
    readonly clearCache = (): Promise<void> =>
      this.perform("cache", async (api) =>
        this.completed(await api.clearCache(), "Browser cache cleared.")
      );
    readonly resetPermissions = (): Promise<void> =>
      this.perform("permissions", async (api) =>
        this.completed(
          await api.resetPermissions(),
          "Site permission reset requested. Open pages reload; restart Desktop if prompted.",
          "Reset cancelled."
        )
      );
    readonly chooseDownloadDirectory = (): Promise<void> =>
      this.perform("download-directory", async (api) => {
        const value = await api.chooseDownloadDirectory();
        if (value === null) return null;
        const preferences =
          DesktopBrowser.Management.parseDownloadPreferences(value);
        if (!preferences) throw new Error("Invalid browser preferences");
        return { preferences, notice: "Download location updated." };
      });
    readonly setDownloadPrompt = (askBeforeDownload: boolean): Promise<void> =>
      this.perform("download-prompt", async (api) => {
        const preferences = DesktopBrowser.Management.parseDownloadPreferences(
          await api.setDownloadPrompt({ askBeforeDownload })
        );
        if (!preferences) throw new Error("Invalid browser preferences");
        return { preferences, notice: null };
      });
    readonly openHistory = (url: string): Promise<void> =>
      this.perform("open-page", async (api) => {
        const request = DesktopBrowser.Management.parseOpenPage({ url });
        if (!request || !api.openPage) return null;
        const opened = await api.openPage(request);
        if (typeof opened !== "boolean")
          throw new Error("Invalid browser open result");
        return opened
          ? null
          : "Open a workspace to view this page in the built-in browser.";
      });

    private loadInitialPreferences(): void {
      const api = this.management();
      if (!this.state.downloads && api) void this.loadPreferences(api);
    }

    private completed(
      value: unknown,
      success: string,
      cancelled = "Clearing cancelled."
    ): string {
      if (typeof value !== "boolean")
        throw new Error("Invalid browser management result");
      return value ? success : cancelled;
    }

    private management(): DesktopBrowser.Management.Bridge | null {
      const api = this.native()?.management;
      return api?.version === DesktopBrowser.Management.VERSION ? api : null;
    }
    private async loadPreferences(
      api: DesktopBrowser.Management.Bridge
    ): Promise<void> {
      const generation = ++this.readGeneration;
      try {
        const value = DesktopBrowser.Management.parseDownloadPreferences(
          await api.downloadPreferences()
        );
        if (generation !== this.readGeneration || this.pending) return;
        if (!value) throw new Error("Invalid browser preferences");
        this.publish({ downloads: value });
      } catch {
        if (generation === this.readGeneration && !this.pending)
          this.publish({
            error: "Couldn’t load browser preferences. Try again.",
          });
      }
    }
    private async perform(
      action: string,
      operation: (api: DesktopBrowser.Management.Bridge) => Promise<
        | string
        | null
        | {
            preferences: DesktopBrowser.Management.DownloadPreferences;
            notice: string | null;
          }
      >
    ): Promise<void> {
      if (this.pending) return;
      const api = this.management();
      if (!api) return;
      this.pending = true;
      this.readGeneration++;
      const generation = ++this.generation;
      this.publish({ action, error: null, notice: null, result: null });
      try {
        const result = await operation(api);
        if (generation !== this.generation) return;
        if (result && typeof result === "object")
          this.publish({
            downloads: result.preferences,
            notice: result.notice,
          });
        else this.publish({ notice: result });
      } catch {
        if (generation === this.generation)
          this.publish({
            error: "The browser action could not be completed. Try again.",
          });
      } finally {
        if (generation === this.generation) {
          this.pending = false;
          this.publish({ action: null });
          this.loadInitialPreferences();
        }
      }
    }

    private unsupported(): void {
      this.readGeneration++;
      this.publish({
        supported: false,
        clearing: false,
        result: null,
        error: null,
        managementSupported: false,
        canOpenHistory: false,
        downloads: null,
        action: null,
        notice: null,
      });
    }
    private publish(patch: Partial<State>): void {
      this.state = { ...this.state, ...patch };
      for (const listener of this.listeners) listener();
    }
  }
}
