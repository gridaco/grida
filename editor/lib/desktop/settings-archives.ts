import type { DesktopArchivedChat, DesktopBridge } from "@grida/desktop-bridge";

/** Archived-chat metadata and restoration without selecting or loading a chat. */
export namespace SettingsArchives {
  type Native = NonNullable<DesktopBridge["archives"]>;
  export type State = Readonly<{
    supported: boolean;
    loading: boolean;
    entries: readonly DesktopArchivedChat[];
    nextCursor: string | null;
    restoring: string | null;
    unavailableWorkspaces: readonly string[];
    error: string | null;
  }>;

  export class Controller {
    private state: State = {
      supported: false,
      loading: true,
      entries: [],
      nextCursor: null,
      restoring: null,
      unavailableWorkspaces: [],
      error: null,
    };
    private listeners = new Set<() => void>();
    private pending = false;
    constructor(private readonly native: () => Native | undefined) {}
    readonly read = (): State => this.state;
    readonly subscribe = (listener: () => void): (() => void) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    };
    readonly refresh = async (): Promise<void> => {
      await this.list(null);
    };
    readonly more = async (): Promise<void> => {
      if (this.state.nextCursor) await this.list(this.state.nextCursor);
    };
    async unarchive(id: string): Promise<boolean> {
      if (this.pending) return false;
      const api = this.native();
      const entry = this.state.entries.find((entry) => entry.id === id);
      if (!api || !entry) return false;
      this.pending = true;
      this.publish({ restoring: id, error: null });
      try {
        await api.unarchive(entry.id, entry.revision);
        this.publish({
          entries: this.state.entries.filter((entry) => entry.id !== id),
        });
        return true;
      } catch (error) {
        this.publish({
          error:
            unavailableMessage(error) ??
            "Couldn't unarchive this chat. Refresh the list and try again.",
        });
        return false;
      } finally {
        this.pending = false;
        this.publish({ restoring: null });
      }
    }
    private async list(cursor: string | null): Promise<void> {
      if (this.pending) return;
      const api = this.native();
      if (!api) {
        this.publish({ supported: false, loading: false });
        return;
      }
      this.pending = true;
      this.publish({ supported: true, loading: true, error: null });
      try {
        const page = await api.list(cursor);
        const entries = cursor
          ? [...this.state.entries, ...page.entries]
          : page.entries;
        this.publish({
          entries: Array.from(
            new Map(entries.map((entry) => [entry.id, entry])).values()
          ),
          nextCursor: page.nextCursor,
          unavailableWorkspaces: cursor
            ? [
                ...new Set([
                  ...this.state.unavailableWorkspaces,
                  ...(page.unavailableWorkspaces ?? []),
                ]),
              ]
            : (page.unavailableWorkspaces ?? []),
        });
      } catch (error) {
        this.publish({
          error:
            unavailableMessage(error) ??
            "Couldn't load archived chats. Try refreshing the list.",
        });
      } finally {
        this.pending = false;
        this.publish({ loading: false });
      }
    }
    private publish(patch: Partial<State>): void {
      this.state = { ...this.state, ...patch };
      for (const listener of this.listeners) listener();
    }
  }

  /** Electron prefixes native rejection messages; match only known safe codes. */
  function unavailableMessage(error: unknown): string | null {
    const message = error instanceof Error ? error.message : "";
    if (
      /No handler registered for ['"]grida:archives:(list|unarchive)['"]/.test(
        message
      )
    ) {
      return "Restart Desktop to load archived-chat support. Refreshing this page won't update the native app.";
    }
    if (message.includes("native_archive_unavailable")) {
      return "Archived chats aren't available in this Desktop session. Restart Desktop and try again.";
    }
    if (message.includes("native_archive_settings_required")) {
      return "Archived chats couldn't be accessed from this Settings window. Restart Desktop and try again.";
    }
    return null;
  }
}
