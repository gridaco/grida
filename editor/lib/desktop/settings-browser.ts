import type { DesktopBrowser, Workspace } from "@grida/desktop-bridge";

/** Settings may clear one workspace's website data without attaching to pages. */
export namespace SettingsBrowser {
  type Native = Pick<DesktopBrowser.Bridge, "clearWorkspaceData">;
  export type WorkspaceChoice = Readonly<
    Pick<Workspace, "id" | "name" | "root">
  >;
  export type State = Readonly<{
    supported: boolean;
    loading: boolean;
    workspaces: readonly WorkspaceChoice[];
    selectedId: string | null;
    clearing: boolean;
    result: "cleared" | "cancelled" | null;
    error: string | null;
  }>;

  export class Controller {
    private state: State = {
      supported: false,
      loading: true,
      workspaces: [],
      selectedId: null,
      clearing: false,
      result: null,
      error: null,
    };
    private listeners = new Set<() => void>();
    private generation = 0;
    private pending = false;

    constructor(
      private readonly native: () => Native | null | undefined,
      private readonly listWorkspaces: () => Promise<readonly Workspace[]>
    ) {}

    readonly read = (): State => this.state;
    readonly subscribe = (listener: () => void): (() => void) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    };

    /** Stop observing an in-flight action; native accepted work keeps its owner. */
    cancel(): void {
      this.generation++;
      this.pending = false;
    }

    readonly select = (id: string): void => {
      if (
        this.pending ||
        !this.state.workspaces.some((workspace) => workspace.id === id)
      )
        return;
      this.publish({ selectedId: id, result: null, error: null });
    };

    readonly refresh = async (): Promise<void> => {
      if (this.pending) return;
      if (!this.native()?.clearWorkspaceData) {
        this.unsupported();
        return;
      }
      this.pending = true;
      const generation = ++this.generation;
      this.publish({
        supported: true,
        loading: true,
        clearing: false,
        error: null,
      });
      try {
        const workspaces = Array.from(
          new Map(
            (await this.listWorkspaces()).map(({ id, name, root }) => [
              id,
              { id, name, root },
            ])
          ).values()
        );
        if (generation !== this.generation) return;
        const selectedId = workspaces.some(
          (workspace) => workspace.id === this.state.selectedId
        )
          ? this.state.selectedId
          : null;
        this.publish({
          workspaces,
          selectedId,
          ...(selectedId === null ? { result: null } : {}),
        });
      } catch {
        if (generation === this.generation)
          this.publish({
            error: "Couldn’t load workspaces. Try refreshing the list.",
          });
      } finally {
        if (generation === this.generation) {
          this.pending = false;
          this.publish({ loading: false });
        }
      }
    };

    readonly clearSelected = async (): Promise<void> => {
      if (this.pending) return;
      const api = this.native();
      if (!api?.clearWorkspaceData) {
        this.unsupported();
        return;
      }
      const workspace = this.state.workspaces.find(
        (entry) => entry.id === this.state.selectedId
      );
      if (!workspace) return;
      this.pending = true;
      const generation = ++this.generation;
      this.publish({ clearing: true, result: null, error: null });
      try {
        // Main names the registered workspace, confirms, and rechecks admission.
        const cleared = await api.clearWorkspaceData({
          workspaceId: workspace.id,
        });
        if (typeof cleared !== "boolean")
          throw new Error("Invalid browser clear result");
        if (generation === this.generation)
          this.publish({ result: cleared ? "cleared" : "cancelled" });
      } catch {
        if (generation === this.generation)
          this.publish({
            error:
              "Couldn’t clear this workspace’s cookies and site data. Refresh the list and try again.",
          });
      } finally {
        if (generation === this.generation) {
          this.pending = false;
          this.publish({ clearing: false });
        }
      }
    };

    private unsupported(): void {
      this.publish({
        supported: false,
        loading: false,
        clearing: false,
        workspaces: [],
        selectedId: null,
        result: null,
        error: null,
      });
    }
    private publish(patch: Partial<State>): void {
      this.state = { ...this.state, ...patch };
      for (const listener of this.listeners) listener();
    }
  }
}
