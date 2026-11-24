import { getDesktopBridge } from "@/lib/desktop/bridge";
import { BrowserGuestMounts } from "./browser-guest-mounts";
import { EditorGroup } from "./editor-group";
import { WorkbenchTab } from "./workbench-tab";
import { WorkspaceBrowserTabs } from "./workspace-browser-tabs";

/** Document lifetime, deliberately independent of React mount subscriptions. */
export class WorkspaceBrowserSession {
  private static readonly documents = new WeakMap<
    Document,
    Map<string, WorkspaceBrowserSession>
  >();
  private static readonly active = new WeakMap<
    Document,
    WorkspaceBrowserSession
  >();
  readonly group = new EditorGroup({ reopenable: WorkbenchTab.reopenable });
  readonly browsers: WorkspaceBrowserTabs;
  readonly mounts: BrowserGuestMounts | null;
  private started: Promise<void> | null = null;
  private lastUI: object | null = null;
  private disposed = false;
  private unwatch?: () => void;
  private unsubscribeNavigation?: () => void;
  private initialPath?: string;
  private pathSequence = 0;

  static for(
    document: Document | null,
    workspaceId: string
  ): WorkspaceBrowserSession {
    const sessions = document
      ? (this.documents.get(document) ??
        new Map<string, WorkspaceBrowserSession>())
      : null;
    const known = sessions?.get(workspaceId);
    if (known && !known.disposed) return known;
    const session = new WorkspaceBrowserSession(workspaceId, document);
    if (document && sessions) {
      // Construction during React rendering is inert. Only start activates a
      // workspace; an abandoned concurrent render cannot end the current guest.
      sessions.set(workspaceId, session);
      this.documents.set(document, sessions);
    }
    return session;
  }

  constructor(
    readonly workspaceId: string,
    private readonly document: Document | null
  ) {
    this.browsers = new WorkspaceBrowserTabs(workspaceId, this.group);
    this.mounts = document
      ? new BrowserGuestMounts(document, this.browsers)
      : null;
    this.browsers.mounts = this.mounts;
  }

  start(
    storage: WorkspaceBrowserTabs.Storage,
    resolveFiles: (paths: readonly string[]) => Promise<readonly string[]>,
    initialPath?: string,
    storageId: string | null = this.workspaceId
  ): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.started) {
      if (this.document) {
        const previous = WorkspaceBrowserSession.active.get(this.document);
        if (previous !== this) previous?.dispose();
        WorkspaceBrowserSession.active.set(this.document, this);
      }
      this.unwatch = this.browsers.subscribe(() =>
        this.mounts?.reconcile(this.browsers.getSnapshot().entries)
      );
      this.document?.defaultView?.addEventListener("pagehide", this.dispose);
      this.unsubscribeNavigation =
        getDesktopBridge()?.window.navigation.subscribe(() => {
          const location = this.document?.defaultView?.location;
          if (!location) return;
          const url = new URL(location.href);
          if (
            url.pathname !== "/desktop/workspace" ||
            url.searchParams.get("id") !== this.workspaceId
          )
            this.dispose();
        });
      this.initialPath = initialPath;
      this.started = this.browsers
        .start(storage, resolveFiles, initialPath, storageId)
        .catch((error: unknown) => {
          this.releaseSubscriptions();
          this.started = null;
          throw error;
        });
    } else if (initialPath && initialPath !== this.initialPath) {
      this.initialPath = initialPath;
      const sequence = ++this.pathSequence;
      return this.started.then(async () => {
        const accepted = await resolveFiles([initialPath]);
        if (
          !this.disposed &&
          sequence === this.pathSequence &&
          accepted.includes(initialPath)
        )
          this.group.open(WorkbenchTab.file(initialPath));
      });
    }
    return this.started;
  }

  /** A replacement UI recreates transient panels, never caches old React nodes. */
  bindUI(owner: object): () => void {
    if (this.lastUI && this.lastUI !== owner)
      this.group.closeMatching(
        (key) => WorkbenchTab.parse(key).kind === "panel"
      );
    this.lastUI = owner;
    return () => {
      if (this.lastUI === owner) this.mounts?.hideAll();
    };
  }

  private releaseSubscriptions(): void {
    this.unwatch?.();
    this.unwatch = undefined;
    this.unsubscribeNavigation?.();
    this.unsubscribeNavigation = undefined;
    this.document?.defaultView?.removeEventListener("pagehide", this.dispose);
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  dispose = (): void => {
    if (this.disposed) return;
    this.disposed = true;
    this.pathSequence++;
    this.releaseSubscriptions();
    this.mounts?.dispose();
    this.browsers.stop();
    if (this.document) {
      const sessions = WorkspaceBrowserSession.documents.get(this.document);
      if (sessions?.get(this.workspaceId) === this)
        sessions.delete(this.workspaceId);
      if (WorkspaceBrowserSession.active.get(this.document) === this)
        WorkspaceBrowserSession.active.delete(this.document);
    }
  };
}
