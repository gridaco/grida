import type {
  NativeChatEditorSurfaces,
  NativeChatWorkbenchTarget,
} from "@/lib/agent-chat/native-chat-controller";
import { NativeEditorSurfaces } from "@grida/desktop-bridge";
import { getDesktopBridge } from "@/lib/desktop/bridge";
import { WorkspaceArtifact } from "@/lib/desktop/workspace-artifact";
import { WorkspaceViewState } from "@/lib/desktop/workspace-view-state";
import { WorkspaceBrowserSession } from "./workspace-browser-session";
import type { WorkspaceBrowserTabs } from "./workspace-browser-tabs";
import { WorkspaceSurfaceHost } from "./workspace-surface-host";
import { WorkbenchTab } from "./workbench-tab";

type View = Readonly<{
  session: WorkspaceBrowserSession;
  ready: boolean;
}>;

let nextViewId = 0;

/** Switches the tab group while the window's file editors and chat stay mounted. */
export class WorkspaceChatWorkbench implements NativeChatEditorSurfaces {
  private view: View;
  private viewId = 0;
  private target?: NativeChatWorkbenchTarget;
  private starting?: Promise<void>;
  private unbindAutomation?: () => void;
  private stopObservingGroup?: () => void;
  private mounted = false;
  private readonly listeners = new Set<() => void>();
  private readonly tabListeners = new Set<() => void>();
  private readonly previousFiles = new Map<string, ReadonlySet<string>>();
  private readonly surfaceHost: WorkspaceSurfaceHost;
  private routePath?: string;

  constructor(
    private readonly workspaceId: string,
    private readonly document: Document | null,
    private readonly storage: WorkspaceBrowserTabs.Storage,
    readdir: WorkspaceArtifact.Readdir,
    private initialPath?: string
  ) {
    this.routePath = initialPath;
    this.view = this.newView();
    this.surfaceHost = new WorkspaceSurfaceHost(readdir, {
      getSnapshot: () => this.view.session.group.getSnapshot(),
      subscribe: (listener) => {
        this.tabListeners.add(listener);
        return () => this.tabListeners.delete(listener);
      },
      open: (tab) => this.view.session.group.open(tab),
      restore: (state) => this.view.session.group.restore(state),
    });
    this.observeGroup();
  }

  get surfaces(): WorkspaceSurfaceHost {
    return this.surfaceHost;
  }

  get editorSelection(): WorkspaceSurfaceHost["editorSelection"] {
    return this.surfaceHost.editorSelection;
  }

  readonly readEditorSurfaces = () => this.surfaceHost.readEditorSurfaces();
  readonly subscribeToEditorSurfaces = (listener: () => void) =>
    this.surfaceHost.subscribeToEditorSurfaces(listener);

  readonly open = (path: string, isCurrent: () => boolean) =>
    this.surfaceHost.open(path, isCurrent);

  readonly read = (): View => this.view;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  mount(): () => void {
    this.mounted = true;
    if (!getDesktopBridge()?.nativeChat) void this.openProjectView();
    return () => {
      this.mounted = false;
      queueMicrotask(() => {
        if (this.mounted) return;
        void this.retireAutomation();
        this.stopObservingGroup?.();
        this.view.session.dispose();
      });
    };
  }

  /** The project can restore its own tabs when no chat connection is usable. */
  readonly openProjectView = (): Promise<void> => {
    if (this.target) return Promise.resolve();
    const path = this.initialPath;
    this.initialPath = undefined;
    return this.start(path);
  };

  beforeWorkbenchChange(
    isCurrent: () => boolean,
    target?: NativeChatWorkbenchTarget
  ): boolean | Promise<boolean> {
    if (target && this.matches(target)) return true;
    return this.view.session.browsers.prepareLeave(isCurrent);
  }

  cancelWorkbenchChange(): void {
    this.view.session.browsers.resumeAfterLeave();
  }

  activateWorkbench(
    target: NativeChatWorkbenchTarget,
    isCurrent: () => boolean,
    initialPath?: string
  ): Promise<void> {
    if (!isCurrent()) return Promise.resolve();
    if (this.matches(target)) {
      this.target = target;
      return this.start();
    }

    const path = initialPath ?? this.initialPath;
    this.initialPath = undefined;
    this.rememberReferences();
    const retired = this.retireAutomation();
    this.stopObservingGroup?.();
    this.view.session.dispose();
    this.target = target;
    this.previousFiles.delete(this.workbenchId(target));
    this.view = this.newView();
    this.starting = undefined;
    this.observeGroup();
    this.publish();
    return this.start(path, retired);
  }

  promoteWorkbench(draftId: string, sessionId: string): void {
    if (this.target?.kind !== "draft" || this.target.id !== draftId) return;
    const to: NativeChatWorkbenchTarget = { kind: "chat", id: sessionId };
    this.target = to;
    this.view.session.browsers.rememberAs(this.workbenchId(to));
  }

  forgetWorkbench(sessionId: string): void {
    const key = this.workbenchId({ kind: "chat", id: sessionId });
    if (this.target?.kind === "chat" && this.target.id === sessionId) {
      this.target = undefined;
      this.view.session.browsers.rememberAs(null);
    }
    this.previousFiles.delete(key);
    WorkspaceViewState.forget(this.storage, key);
    this.publish();
  }

  referencedFiles(): ReadonlySet<string> {
    return new Set(
      [...this.previousFiles.values()].flatMap((files) => [...files])
    );
  }

  removeTrashedTabs(matches: (tab: string) => boolean): void {
    for (const [id, files] of this.previousFiles) {
      const remaining = [...files].filter(
        (path) => !matches(WorkbenchTab.file(path))
      );
      if (remaining.length === files.size) continue;
      this.previousFiles.set(id, new Set(remaining));
      const saved = WorkspaceViewState.read(this.storage, id);
      if (!saved) continue;
      const content = saved.content;
      const active =
        content?.active == null ? null : content.open[content.active];
      const open = content?.open.filter(
        (tab) => tab.kind !== "file" || !matches(WorkbenchTab.file(tab.relPath))
      );
      WorkspaceViewState.remember(this.storage, id, {
        tabs: { open: remaining, active: saved.tabs.active },
        ...(open && {
          content: { open, active: active ? open.indexOf(active) : null },
        }),
      });
    }
    this.view.session.group.closeMatching(matches);
    this.publish();
  }

  /** A later file route adds a tab to the current view using normal admission. */
  openRoutePath(path: string | undefined): void {
    if (path === this.routePath) return;
    this.routePath = path;
    if (!this.target && !this.starting) this.initialPath = path;
    if (!path) return;
    const session = this.view.session;
    const current = () =>
      session === this.view.session &&
      path === this.routePath &&
      !session.isDisposed();
    if (this.starting)
      void this.starting.then(() => {
        if (!current()) return;
        const virtual = WorkspaceArtifact.toAgentPath(path);
        if (virtual) void this.open(virtual, current);
      });
  }

  private newView(): View {
    this.viewId = ++nextViewId;
    return {
      session: new WorkspaceBrowserSession(this.workspaceId, this.document),
      ready: false,
    };
  }

  private start(path?: string, retired?: Promise<boolean>): Promise<void> {
    if (this.starting) return this.starting;
    const { session } = this.view;
    const viewId = this.viewId;
    const storageId =
      this.target?.kind === "chat"
        ? this.workbenchId(this.target)
        : this.target
          ? null
          : this.workspaceId;
    this.starting = session
      .start(
        this.storage,
        (paths) => this.surfaceHost.resolveRelativePaths(paths),
        path,
        storageId
      )
      .then(async () => {
        if (session !== this.view.session || session.isDisposed()) return;
        const initialFile = path && WorkspaceArtifact.toAgentPath(path);
        if (initialFile && this.readEditorSurfaces().active !== initialFile)
          await this.open(
            initialFile,
            () => session === this.view.session && !session.isDisposed()
          );
        if (retired && !(await retired)) return;
        if (session !== this.view.session || session.isDisposed()) return;
        const automation = getDesktopBridge()?.workspaces.automation;
        if (!automation?.retire) return;
        const page = () => session.browsers.activeAutomationPageId();
        const published = await automation
          .publish(
            NativeEditorSurfaces.capture(this.surfaceHost.listOpen()),
            page(),
            viewId
          )
          .catch(() => false);
        if (!published || session !== this.view.session || session.isDisposed())
          return;
        this.unbindAutomation = this.surfaceHost.bindAutomation(
          automation,
          page,
          session.browsers.subscribe,
          viewId
        );
      })
      .catch(() => {})
      .finally(() => {
        if (session !== this.view.session || session.isDisposed()) return;
        this.view = { session, ready: true };
        this.publish();
      });
    return this.starting;
  }

  private retireAutomation(): Promise<boolean> {
    this.unbindAutomation?.();
    this.unbindAutomation = undefined;
    const automation = getDesktopBridge()?.workspaces.automation;
    return (
      automation?.retire?.(this.viewId).catch(() => false) ??
      Promise.resolve(true)
    );
  }

  private observeGroup(): void {
    this.stopObservingGroup = this.view.session.group.subscribe(() => {
      for (const listener of this.tabListeners) listener();
    });
  }

  private publish(): void {
    this.view = { ...this.view };
    for (const listener of this.tabListeners) listener();
    for (const listener of this.listeners) listener();
  }

  private rememberReferences(): void {
    if (this.target?.kind !== "chat" || !this.view.ready) return;
    const paths = this.view.session.group.getSnapshot().tabs.flatMap((tab) => {
      const path = WorkbenchTab.relPath(tab);
      return path === null ? [] : [path];
    });
    this.previousFiles.set(this.workbenchId(this.target), new Set(paths));
  }

  private matches(target: NativeChatWorkbenchTarget): boolean {
    return (
      !!this.target &&
      this.workbenchId(this.target) === this.workbenchId(target)
    );
  }

  // Keep this policy local. The workspace still owns file admission and the
  // agent connection. Only tab continuity uses the main chat identity.
  private workbenchId(target: NativeChatWorkbenchTarget): string {
    return JSON.stringify([this.workspaceId, target.kind, target.id]);
  }
}
