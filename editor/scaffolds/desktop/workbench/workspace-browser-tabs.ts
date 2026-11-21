import { DesktopBrowser, WebPreview } from "@grida/desktop-bridge";
import { Browser } from "@/lib/desktop/browser";
import { BrowserPageControls } from "@/lib/desktop/browser-page-controls";
import { WorkspaceViewState } from "@/lib/desktop/workspace-view-state";
import type { EditorGroup } from "./editor-group";
import type { BrowserGuestMounts } from "./browser-guest-mounts";
import { WorkbenchTab } from "./workbench-tab";

/** Browser presentation state; native page identity never doubles as file authority. */
export namespace WorkspaceBrowserTabs {
  export type Entry = Readonly<{
    id: string;
    page: DesktopBrowser.Page | null;
    url: string | null;
    error: string | null;
    locationRevision: number;
    /** Changes on navigation, including reloads to the same URL. */
    previewRevision?: number;
    /** Current guest raster metadata; never persisted with URL restore state. */
    favicon?: DesktopBrowser.Favicon | null;
  }>;
  export type State = Readonly<{
    supported: boolean;
    ready: boolean;
    entries: ReadonlyMap<string, Entry>;
    error: string | null;
  }>;
  export type Storage = {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
}

/**
 * Joins document-owned guests to the workbench's opaque tab ordering. A new
 * document or reopened tab reconstructs its URL with a fresh native identity.
 * All coordination lives here so React only subscribes and wires lifecycle.
 */
export class WorkspaceBrowserTabs {
  /** The document owner supplies presentation; subscriptions never own guests. */
  mounts: BrowserGuestMounts | null = null;
  private bridge: DesktopBrowser.Bridge | null = null;
  private attachment: string | null = null;
  private revision = 0;
  private epoch = 0;
  private storage: WorkspaceBrowserTabs.Storage | null = null;
  private pages = new Map<string, DesktopBrowser.Page>();
  private entries = new Map<string, WorkspaceBrowserTabs.Entry>();
  private pending = new Set<string>();
  private creationTasks = new Map<string, Promise<void>>();
  private closeTasks = new Map<string, Promise<boolean>>();
  private closing = new Set<string>();
  private nativeCreations = new Map<
    string,
    { openerPageId: string | null; disposition: "foreground" | "background" }
  >();
  private lastChildren = new Map<string, string>();
  private pageControls = new Map<string, BrowserPageControls.Controller>();
  private pendingLocations = new Map<string, string>();
  private previousTabs = new Set<string>();
  private closedOrder: string[] = [];
  private listeners = new Set<() => void>();
  private unsubscribers: (() => void)[] = [];
  private state: WorkspaceBrowserTabs.State = {
    supported: false,
    ready: false,
    entries: new Map(),
    error: null,
  };
  private resyncing = false;
  private clearing = false;
  private imageEpoch = 0;
  private imageRevisions = new Map<string, number>();
  private buffered: DesktopBrowser.Event[] = [];
  private faviconReads = new Map<
    string,
    { pageId: string; revision: number }
  >();

  constructor(
    private readonly workspaceId: string,
    private readonly group: Pick<
      EditorGroup,
      | "getSnapshot"
      | "subscribe"
      | "restore"
      | "open"
      | "activate"
      | "close"
      | "replace"
      | "closeMatching"
    >,
    private readonly getBridge: () => DesktopBrowser.Bridge | null = Browser.getBridge,
    private readonly newId: () => string = () => crypto.randomUUID()
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = (): WorkspaceBrowserTabs.State => this.state;

  activeAutomationPageId(): string | null {
    const key = this.group.getSnapshot().active;
    if (!key) return null;
    const tab = WorkbenchTab.parse(key);
    return tab.kind === "browser"
      ? (this.entries.get(tab.id)?.page?.id ?? null)
      : null;
  }

  private present = (request: DesktopBrowser.Presentation): void => {
    if (request.attachmentId !== this.attachment) return;
    const tab = this.group.getSnapshot().tabs.find((key) => {
      const entry = WorkbenchTab.parse(key);
      return (
        entry.kind === "browser" &&
        this.entries.get(entry.id)?.page?.id === request.pageId
      );
    });
    if (!tab) return;
    this.group.activate(tab);
    const entry = WorkbenchTab.parse(tab);
    if (request.focus && entry.kind === "browser")
      requestAnimationFrame(() => {
        if (
          this.group.getSnapshot().active === tab &&
          this.attachment === request.attachmentId &&
          this.entries.get(entry.id)?.page?.id === request.pageId
        )
          this.mounts?.focus(entry.id);
      });
  };

  async start(
    storage: WorkspaceBrowserTabs.Storage,
    resolveFiles: (paths: readonly string[]) => Promise<readonly string[]>,
    legacyActivePath?: string
  ): Promise<void> {
    this.stop();
    const epoch = this.epoch;
    this.storage = storage;
    this.bridge = this.getBridge();
    this.entries = new Map();
    this.pages = new Map();
    this.pending = new Set();
    this.creationTasks.clear();
    this.closeTasks.clear();
    this.closing.clear();
    this.nativeCreations.clear();
    this.lastChildren.clear();
    this.pendingLocations = new Map();
    this.imageRevisions.clear();
    this.faviconReads.clear();
    this.closedOrder = [];
    this.state = {
      supported: this.bridge !== null,
      ready: false,
      entries: new Map(),
      error: null,
    };
    this.publish();
    const expectedGroup = this.group.getSnapshot();
    const saved = WorkspaceViewState.read(storage, this.workspaceId);
    const files = WorkspaceViewState.initialTabs(
      storage,
      this.workspaceId,
      legacyActivePath
    );
    const content: WorkspaceViewState.Content = saved?.content ?? {
      open: files.open.map((relPath) => ({ kind: "file" as const, relPath })),
      active: files.active === null ? null : files.open.indexOf(files.active),
    };
    const acceptedFiles = new Set(
      await resolveFiles(
        content.open.flatMap((entry) =>
          entry.kind === "file" ? [entry.relPath] : []
        )
      )
    );
    if (epoch !== this.epoch) return;
    if (this.bridge) {
      const bridge = this.bridge;
      this.unsubscribers.push(bridge.subscribe(this.onEvent));
      if (bridge.subscribePresentation)
        this.unsubscribers.push(bridge.subscribePresentation(this.present));
      try {
        const attached = DesktopBrowser.parseSnapshot(
          await bridge.attach(this.workspaceId)
        );
        if (!attached) throw new Error("Invalid browser attachment");
        if (epoch !== this.epoch) {
          await bridge.detach(attached.attachmentId).catch(() => {});
          return;
        }
        this.attachment = attached.attachmentId;
        for (const event of this.buffered)
          if (
            event.type === "created" &&
            event.attachmentId === this.attachment
          )
            this.nativeCreations.set(event.page.id, event);
        this.applySnapshot(attached);
        this.resyncing = true;
        const snapshot = DesktopBrowser.parseSnapshot(
          await bridge.snapshot(attached.attachmentId)
        );
        if (epoch !== this.epoch) return;
        if (!snapshot) throw new Error("Invalid browser snapshot");
        this.applySnapshot(snapshot);
        this.resyncing = false;
        if (this.drainEvents()) void this.resync();
      } catch {
        if (epoch !== this.epoch) return;
        this.resyncing = false;
        this.state = {
          ...this.state,
          error:
            "The browser is unavailable. Reopen this workspace to try again.",
        };
      }
    }
    if (epoch !== this.epoch) return;
    const tabs: string[] = [];
    let active: string | null = null;
    for (const [index, descriptor] of content.open.entries()) {
      let key: string;
      if (descriptor.kind === "file") {
        if (!acceptedFiles.has(descriptor.relPath)) continue;
        key = WorkbenchTab.file(descriptor.relPath);
      } else {
        const page = null;
        this.entries.set(descriptor.id, {
          id: descriptor.id,
          page,
          url: descriptor.url,
          error:
            this.state.error ??
            (this.bridge
              ? null
              : "Update Grida Desktop to use the built-in browser."),
          locationRevision: 0,
        });
        key = WorkbenchTab.browser(descriptor.id);
      }
      tabs.push(key);
      if (index === content.active) active = key;
    }
    const currentGroup = this.group.getSnapshot();
    const restoredTabs =
      currentGroup === expectedGroup
        ? tabs
        : [
            ...currentGroup.tabs,
            ...tabs.filter(
              (key) =>
                WorkbenchTab.parse(key).kind === "browser" &&
                !currentGroup.tabs.includes(key)
            ),
          ];
    this.group.restore({
      tabs: restoredTabs,
      active: currentGroup === expectedGroup ? active : currentGroup.active,
    });
    this.previousTabs = new Set(restoredTabs);
    this.state = { ...this.state, ready: true };
    this.unsubscribers.push(this.group.subscribe(this.reconcile));
    this.adoptPages();
    this.publish();
    this.remember();
    for (const entry of this.entries.values())
      if (!entry.page) void this.ensurePage(entry.id);
  }

  stop(): void {
    this.epoch++;
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    const bridge = this.bridge;
    const attachmentId = this.attachment;
    this.attachment = null;
    this.bridge = null;
    this.storage = null;
    this.revision = 0;
    this.resyncing = false;
    this.buffered = [];
    this.faviconReads.clear();
    for (const controls of this.pageControls.values()) controls.dispose();
    this.pageControls.clear();
    if (bridge && attachmentId)
      void bridge.detach(attachmentId).catch(() => {});
  }

  canLoadPreview(): boolean {
    return !!(
      this.state.ready &&
      this.attachment &&
      this.bridge?.preview &&
      this.bridge.cancelPreview
    );
  }

  loadPreview: Browser.PreviewLoader = async (url, signal) => {
    const bridge = this.bridge;
    const attachmentId = this.attachment;
    const epoch = this.epoch;
    const normalized = WebPreview.normalizeUrl(url);
    if (
      signal.aborted ||
      !normalized ||
      !this.state.ready ||
      !attachmentId ||
      !bridge?.preview ||
      !bridge.cancelPreview
    )
      return null;
    const id = crypto.randomUUID();
    const cancel = () => {
      void bridge.cancelPreview?.({ attachmentId, id }).catch(() => {});
    };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      const result = await bridge.preview({
        attachmentId,
        id,
        url: normalized,
      });
      return signal.aborted || this.epoch !== epoch
        ? null
        : WebPreview.parseMetadata(result);
    } catch {
      return null;
    } finally {
      signal.removeEventListener("abort", cancel);
    }
  };

  /** Open a fresh tab, optionally replacing a workbench tab in place. */
  open = (url?: string, replaceTab?: string): boolean => {
    if (!this.bridge || !this.attachment || !this.state.ready) return false;
    const id = this.newId();
    this.entries.set(id, {
      id,
      page: null,
      url: url ?? null,
      error: null,
      // A blank tab needs address input. A resolved destination can load directly.
      locationRevision: url === undefined ? 1 : 0,
    });
    this.publish();
    const key = WorkbenchTab.browser(id);
    if (replaceTab) this.group.replace(replaceTab, key);
    this.group.open(key);
    void this.ensurePage(id);
    return true;
  };

  /** Select an exact URL in this workbench, or open it in a fresh tab. */
  openOrFocus = (url: string): boolean => {
    const destination = DesktopBrowser.normalizeUrl(url);
    if (!destination || !this.bridge || !this.attachment || !this.state.ready)
      return false;

    const { active, tabs } = this.group.getSnapshot();
    let match: string | undefined;
    for (const key of tabs) {
      const tab = WorkbenchTab.parse(key);
      if (tab.kind !== "browser" || this.closing.has(tab.id)) continue;
      const entry = this.entries.get(tab.id);
      if (!entry) continue;
      // A new tab already has a destination before Main creates its page.
      const address = entry.page ? entry.page.url : entry.url;
      if (DesktopBrowser.normalizeUrl(address) !== destination) continue;
      if (key === active) return true;
      match ??= key;
    }

    if (!match) return this.open(destination);
    this.group.activate(match);
    return true;
  };

  controls(id: string): BrowserPageControls.Controller {
    let controls = this.pageControls.get(id);
    if (!controls) {
      controls = new BrowserPageControls.Controller(() => {
        const target = this.target(id);
        const api = this.bridge?.utilities;
        const page = this.entries.get(id)?.page;
        return target &&
          api?.version === DesktopBrowser.Utilities.VERSION &&
          page?.mounted &&
          !page.failure &&
          this.group.getSnapshot().active === WorkbenchTab.browser(id)
          ? { api, target, revision: this.imageRevisions.get(id) ?? 0 }
          : null;
      });
      this.pageControls.set(id, controls);
    }
    return controls;
  }

  findActive(): boolean {
    return this.commandActive("find");
  }

  commandActive(
    action: "find" | "zoom-in" | "zoom-out" | "zoom-reset" | "print"
  ): boolean {
    const key = this.group.getSnapshot().active;
    if (!key) return false;
    const tab = WorkbenchTab.parse(key);
    if (tab.kind !== "browser") return false;
    const controls = this.controls(tab.id);
    controls.sync();
    if (!controls.read().supported) return false;
    switch (action) {
      case "find":
        return controls.openFind();
      case "print":
        void controls.print();
        break;
      case "zoom-in":
        void controls.zoom("in");
        break;
      case "zoom-out":
        void controls.zoom("out");
        break;
      case "zoom-reset":
        void controls.zoom("reset");
        break;
    }
    return true;
  }

  close = (id: string): Promise<boolean> => {
    const pending = this.closeTasks.get(id);
    if (pending) return pending;
    this.closing.add(id);
    const task = this.closePage(id).finally(() => {
      if (this.closeTasks.get(id) === task) {
        this.closeTasks.delete(id);
        this.closing.delete(id);
      }
    });
    this.closeTasks.set(id, task);
    return task;
  };

  async closeMatching(predicate: (key: string) => boolean): Promise<void> {
    for (const key of this.group.getSnapshot().tabs) {
      const tab = WorkbenchTab.parse(key);
      if (tab.kind === "browser" && predicate(key)) await this.close(tab.id);
    }
  }

  private async closePage(id: string): Promise<boolean> {
    const epoch = this.epoch;
    await this.ensurePage(id);
    if (epoch !== this.epoch) return false;
    const target = this.target(id);
    const bridge = this.bridge;
    if (!target) {
      this.group.close(WorkbenchTab.browser(id));
      return true;
    }
    if (!bridge) return false;
    try {
      const accepted = await bridge.close(target);
      if (epoch !== this.epoch || accepted !== true) return false;
      this.finishClosed(target.pageId);
      return true;
    } catch {
      if (epoch === this.epoch)
        this.setError(id, "This page could not be closed. Try again.");
      return false;
    }
  }

  focusLocation = (): void => {
    const active = this.group.getSnapshot().active;
    if (!active) return;
    const tab = WorkbenchTab.parse(active);
    if (tab.kind !== "browser") return;
    const entry = this.entries.get(tab.id);
    if (!entry) return;
    this.entries.set(tab.id, {
      ...entry,
      locationRevision: entry.locationRevision + 1,
    });
    this.publish();
  };

  navigate = (id: string, value: string): void => {
    const entry = this.entries.get(id);
    if (!entry) return;
    const url = Browser.address(value);
    if (!url) {
      this.setError(id, "Enter an HTTP or HTTPS address.");
      return;
    }
    this.invalidatePageImages(id);
    if (!entry.page) {
      this.entries.set(id, { ...entry, url, error: null });
      this.pendingLocations.set(id, url);
      this.publish();
      void this.ensurePage(id);
      return;
    }
    this.perform(id, (bridge, target) => bridge.navigate({ ...target, url }));
  };

  action = (
    id: string,
    action: "back" | "forward" | "reload" | "stop" | "focus" | "openExternal"
  ): void => {
    const entry = this.entries.get(id);
    if (action === "back" || action === "forward" || action === "reload")
      this.invalidatePageImages(id);
    if (action === "reload" && entry && !entry.page) {
      void this.ensurePage(id);
      return;
    }
    this.perform(id, async (bridge, target) => {
      await bridge[action](target);
      if (action === "focus") this.mounts?.focus(id);
    });
  };

  /** Transient admission is never stored or derived from the website URL. */
  async reserveMount(id: string): Promise<DesktopBrowser.GuestMount | null> {
    const target = this.target(id);
    const bridge = this.bridge;
    if (!target || !bridge) return null;
    const epoch = this.epoch;
    try {
      const value = await bridge.reserveMount(target);
      const current = this.target(id);
      if (
        epoch !== this.epoch ||
        current?.attachmentId !== target.attachmentId ||
        current?.pageId !== target.pageId ||
        !this.group.getSnapshot().tabs.includes(WorkbenchTab.browser(id))
      )
        return null;
      const mount = DesktopBrowser.parseGuestMount(value);
      if (!mount)
        this.setError(
          id,
          "This page could not be mounted. Reload to try again."
        );
      return mount;
    } catch {
      if (epoch === this.epoch && this.target(id)?.pageId === target.pageId)
        this.setError(
          id,
          "This page could not be mounted. Reload to try again."
        );
      return null;
    }
  }

  setActive(id: string, active: boolean): void {
    const target = this.target(id);
    if (target && this.bridge)
      void this.bridge.setActive({ ...target, active }).catch(() => {});
  }

  /** A hover-owned display read. No image survives in the controller. */
  async thumbnail(id: string): Promise<DesktopBrowser.Thumbnail | null> {
    const bridge = this.bridge;
    const target = this.target(id);
    const page = this.entries.get(id)?.page;
    if (
      !bridge?.thumbnail ||
      !target ||
      !page?.url ||
      DesktopBrowser.normalizeUrl(page.url) === null ||
      !page.mounted ||
      page.loading ||
      page.failure ||
      this.clearing
    )
      return null;
    const epoch = this.epoch;
    const imageEpoch = this.imageEpoch;
    const navigation = this.imageRevisions.get(id) ?? 0;
    const url = page.url;
    try {
      const value = await bridge.thumbnail(target);
      const current = this.entries.get(id);
      if (
        epoch !== this.epoch ||
        imageEpoch !== this.imageEpoch ||
        this.clearing ||
        this.attachment !== target.attachmentId ||
        current?.page?.id !== target.pageId ||
        current.page.url !== url ||
        navigation !== (this.imageRevisions.get(id) ?? 0) ||
        !this.group.getSnapshot().tabs.includes(WorkbenchTab.browser(id))
      )
        return null;
      return DesktopBrowser.parseThumbnail(value);
    } catch {
      return null;
    }
  }

  private invalidatePageImages(id: string): void {
    const revision = (this.imageRevisions.get(id) ?? 0) + 1;
    this.imageRevisions.set(id, revision);
    const entry = this.entries.get(id);
    if (entry)
      this.entries.set(id, {
        ...entry,
        previewRevision: revision,
        favicon: null,
      });
  }

  clearBrowsingData = async (): Promise<void> => {
    if (this.clearing || !this.bridge) return;
    this.clearing = true;
    const epoch = this.epoch;
    try {
      const cleared = await this.bridge.clearBrowsingData();
      if (typeof cleared !== "boolean")
        throw new Error("Invalid browser clear result");
      if (cleared && epoch === this.epoch) this.imageEpoch++;
      // Native closed outcomes remove each window's exact owned pages. A page
      // opened after global clearing completes is not part of that operation.
    } catch {
      const active = this.group.getSnapshot().active;
      const tab = active ? WorkbenchTab.parse(active) : null;
      if (epoch === this.epoch && tab?.kind === "browser")
        this.setError(tab.id, "Browser data could not be cleared. Try again.");
    } finally {
      this.clearing = false;
    }
  };

  private target(id: string): DesktopBrowser.Target | null {
    const page = this.entries.get(id)?.page;
    return page && this.attachment
      ? { attachmentId: this.attachment, pageId: page.id }
      : null;
  }

  private perform(
    id: string,
    invoke: (
      bridge: DesktopBrowser.Bridge,
      target: DesktopBrowser.Target
    ) => Promise<void>
  ): void {
    const target = this.target(id);
    if (!target || !this.bridge) return;
    this.setError(id, null);
    void invoke(this.bridge, target).catch(() =>
      this.setError(id, "The browser action could not be completed. Try again.")
    );
  }

  private ensurePage(id: string): Promise<void> {
    const existing = this.creationTasks.get(id);
    if (existing) return existing;
    const task = this.createPage(id).finally(() => {
      if (this.creationTasks.get(id) === task) this.creationTasks.delete(id);
    });
    this.creationTasks.set(id, task);
    return task;
  }

  private async createPage(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (
      !entry ||
      entry.page ||
      this.pending.has(id) ||
      !this.bridge ||
      !this.attachment
    )
      return;
    this.pending.add(id);
    const epoch = this.epoch;
    try {
      const page = DesktopBrowser.parsePage(
        await this.bridge.create({
          attachmentId: this.attachment,
          ...(entry.url ? { url: entry.url } : {}),
        })
      );
      if (!page) throw new Error("Invalid browser page");
      if (epoch !== this.epoch) return;
      const current = this.entries.get(id);
      if (!current) {
        void this.bridge
          ?.close({ attachmentId: this.attachment!, pageId: page.id })
          .catch(() => {});
        return;
      }
      const latest = this.pages.get(page.id);
      if (!latest && page.revision <= this.revision) {
        this.setError(id, "This page was closed. Reload to reopen it.");
        return;
      }
      const accepted =
        latest && latest.revision > page.revision ? latest : page;
      this.pages.set(page.id, accepted);
      const desired = this.pendingLocations.get(id);
      this.pendingLocations.delete(id);
      this.entries.set(id, {
        ...current,
        page: accepted,
        url: accepted.url ?? current.url,
        error: null,
      });
      if (desired && desired !== entry.url) {
        this.perform(id, (bridge, target) =>
          bridge.navigate({ ...target, url: desired })
        );
      }
      if (!this.group.getSnapshot().tabs.includes(WorkbenchTab.browser(id))) {
        void this.bridge
          ?.close({ attachmentId: this.attachment!, pageId: page.id })
          .catch(() => {});
        this.entries.set(id, { ...current, page: null, favicon: null });
      }
    } catch {
      if (epoch === this.epoch)
        this.setError(
          id,
          "This page could not be opened. Try another address or reload."
        );
    } finally {
      if (epoch === this.epoch) {
        this.pending.delete(id);
        this.adoptPages();
        this.publish();
        this.remember();
      }
    }
  }

  private reconcile = (): void => {
    const open = new Set(this.group.getSnapshot().tabs);
    for (const [id, entry] of this.entries) {
      const key = WorkbenchTab.browser(id);
      if (open.has(key)) {
        this.closedOrder = this.closedOrder.filter((closed) => closed !== id);
        if (!entry.page) void this.ensurePage(id);
      } else if (this.previousTabs.has(key)) {
        this.closedOrder.push(id);
        if (!entry.page) continue;
        const target = this.target(id);
        this.entries.set(id, {
          ...entry,
          page: null,
          url: entry.page.url,
          favicon: null,
        });
        this.faviconReads.delete(id);
        if (
          target &&
          this.bridge &&
          this.pages.has(target.pageId) &&
          !this.closing.has(id)
        )
          void this.bridge.close(target).catch(() => {});
      }
    }
    while (this.closedOrder.length > 25) {
      const oldest = this.closedOrder.shift()!;
      this.entries.delete(oldest);
      this.pendingLocations.delete(oldest);
      this.imageRevisions.delete(oldest);
      this.faviconReads.delete(oldest);
      this.pageControls.get(oldest)?.dispose();
      this.pageControls.delete(oldest);
    }
    this.previousTabs = open;
    this.publish();
    this.remember();
  };

  private onEvent = (value: DesktopBrowser.Event): void => {
    const event = DesktopBrowser.parseEvent(value);
    if (!event) return;
    if (!this.attachment || this.resyncing) {
      this.buffer(event);
      return;
    }
    if (event.type === "created" && event.attachmentId === this.attachment)
      this.nativeCreations.set(event.page.id, event);
    if (
      event.attachmentId !== this.attachment ||
      event.revision <= this.revision
    )
      return;
    if (event.revision !== this.revision + 1) {
      this.buffer(event);
      void this.resync();
      return;
    }
    this.acceptEvent(event);
  };

  private buffer(event: DesktopBrowser.Event): void {
    this.buffered.push(event);
    if (this.buffered.length > 256) this.buffered.shift();
  }

  private acceptEvent(event: DesktopBrowser.Event): void {
    this.revision = event.revision;
    if (event.type === "changed" || event.type === "created") {
      if (event.type === "created")
        this.nativeCreations.set(event.page.id, event);
      this.invalidateChangedPage(event.page);
      this.pages.set(event.page.id, event.page);
    } else {
      this.finishClosed(event.pageId);
    }
    this.adoptPages();
    this.refreshEntries();
  }

  private invalidateChangedPage(page: DesktopBrowser.Page): void {
    const previous = this.pages.get(page.id);
    if (
      previous &&
      (previous.url !== page.url ||
        (!previous.loading && page.loading) ||
        previous.mounted !== page.mounted ||
        previous.failure !== page.failure)
    ) {
      for (const [id, entry] of this.entries)
        if (entry.page?.id === page.id) this.invalidatePageImages(id);
    }
  }

  private finishClosed(pageId: string): void {
    this.pages.delete(pageId);
    this.nativeCreations.delete(pageId);
    for (const [id, entry] of this.entries) {
      if (entry.page?.id !== pageId) continue;
      const live = entry.page.url;
      const transient =
        live !== null && DesktopBrowser.normalizeUrl(live) === null;
      this.entries.set(id, {
        ...entry,
        page: null,
        url: transient ? null : live,
        favicon: null,
      });
      this.faviconReads.delete(id);
      const key = WorkbenchTab.browser(id);
      if (this.closing.has(id) && !transient) this.group.close(key);
      else this.group.closeMatching((candidate) => candidate === key);
      if (transient) this.entries.delete(id);
    }
  }

  private adoptPages(): void {
    if (!this.state.ready || this.pending.size) return;
    const owned = new Set(
      [...this.entries.values()].flatMap((entry) =>
        entry.page ? [entry.page.id] : []
      )
    );
    for (const page of this.pages.values()) {
      if (owned.has(page.id)) {
        this.nativeCreations.delete(page.id);
        continue;
      }
      const creation = this.nativeCreations.get(page.id);
      const opener = creation?.openerPageId
        ? [...this.entries.values()].find(
            (entry) => entry.page?.id === creation.openerPageId
          )
        : null;
      const id = this.newId();
      const key = WorkbenchTab.browser(id);
      this.entries.set(id, {
        id,
        page,
        url: page.url,
        error: null,
        locationRevision: 0,
      });
      owned.add(page.id);
      this.publish();
      const sibling = creation?.openerPageId
        ? this.lastChildren.get(creation.openerPageId)
        : undefined;
      const after =
        sibling && this.group.getSnapshot().tabs.includes(sibling)
          ? sibling
          : opener
            ? WorkbenchTab.browser(opener.id)
            : undefined;
      this.group.open(key, {
        after,
        activate: creation?.disposition === "foreground" || page.focused,
      });
      if (creation?.openerPageId)
        this.lastChildren.set(creation.openerPageId, key);
      this.nativeCreations.delete(page.id);
    }
  }

  private drainEvents(): boolean {
    const events = this.buffered
      .filter(
        (event) =>
          event.attachmentId === this.attachment &&
          event.revision > this.revision
      )
      .sort((a, b) => a.revision - b.revision);
    this.buffered = [];
    for (const event of events) {
      if (event.revision <= this.revision) continue;
      if (event.revision !== this.revision + 1) {
        this.buffer(event);
        continue;
      }
      this.acceptEvent(event);
    }
    return this.buffered.length > 0;
  }

  private applySnapshot(snapshot: DesktopBrowser.Snapshot): void {
    if (
      snapshot.attachmentId !== this.attachment ||
      snapshot.revision < this.revision
    )
      return;
    for (const event of this.buffered)
      if (
        event.type === "created" &&
        event.attachmentId === snapshot.attachmentId
      )
        this.nativeCreations.set(event.page.id, event);
    this.revision = snapshot.revision;
    const missing = [...this.pages.keys()].filter(
      (id) => !snapshot.pages.some((page) => page.id === id)
    );
    for (const page of snapshot.pages) this.invalidateChangedPage(page);
    this.pages = new Map(snapshot.pages.map((page) => [page.id, page]));
    for (const id of missing) this.finishClosed(id);
    this.adoptPages();
    this.refreshEntries();
  }

  private async resync(): Promise<void> {
    if (this.resyncing || !this.bridge || !this.attachment) return;
    this.resyncing = true;
    const epoch = this.epoch;
    const previousRevision = this.revision;
    try {
      const snapshot = DesktopBrowser.parseSnapshot(
        await this.bridge.snapshot(this.attachment)
      );
      if (epoch === this.epoch && snapshot) this.applySnapshot(snapshot);
    } catch {
      /* A later event or attachment retries the read. */
    } finally {
      if (epoch === this.epoch) {
        this.resyncing = false;
        const gap = this.drainEvents();
        if (gap && this.revision > previousRevision) void this.resync();
      }
    }
  }

  private refreshEntries(): void {
    for (const [id, entry] of this.entries) {
      if (!entry.page) continue;
      const page = this.pages.get(entry.page.id) ?? null;
      this.entries.set(id, {
        ...entry,
        page,
        url: page?.url ?? entry.url,
        favicon:
          !page ||
          page.url !== entry.page.url ||
          page.loading ||
          !page.mounted ||
          page.failure
            ? null
            : entry.favicon,
      });
    }
    this.publish();
    this.remember();
  }

  private setError(id: string, error: string | null): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.set(id, { ...entry, error });
    this.publish();
  }

  private publish(): void {
    this.state = { ...this.state, entries: new Map(this.entries) };
    for (const controls of this.pageControls.values()) controls.sync();
    for (const listener of this.listeners) listener();
    for (const entry of this.entries.values()) void this.readFavicon(entry);
  }

  private async readFavicon(entry: WorkspaceBrowserTabs.Entry): Promise<void> {
    const bridge = this.bridge;
    const page = entry.page;
    const target = this.target(entry.id);
    if (
      !bridge?.favicon ||
      !target ||
      !page?.url ||
      DesktopBrowser.normalizeUrl(page.url) === null ||
      !page.mounted ||
      page.loading ||
      page.failure ||
      !this.group.getSnapshot().tabs.includes(WorkbenchTab.browser(entry.id))
    )
      return;
    const previous = this.faviconReads.get(entry.id);
    if (previous?.pageId === page.id && previous.revision === page.revision)
      return;
    const read = { pageId: page.id, revision: page.revision };
    this.faviconReads.set(entry.id, read);
    const epoch = this.epoch;
    const navigation = this.imageRevisions.get(entry.id) ?? 0;
    const clearing = this.imageEpoch;
    try {
      const favicon = DesktopBrowser.parseFavicon(await bridge.favicon(target));
      const current = this.entries.get(entry.id);
      if (
        epoch !== this.epoch ||
        clearing !== this.imageEpoch ||
        this.attachment !== target.attachmentId ||
        this.faviconReads.get(entry.id) !== read ||
        (this.imageRevisions.get(entry.id) ?? 0) !== navigation ||
        current?.page?.id !== page.id ||
        current.page.url !== page.url ||
        current.page.loading ||
        !current.page.mounted ||
        current.page.failure ||
        !this.group.getSnapshot().tabs.includes(WorkbenchTab.browser(entry.id))
      )
        return;
      if ((current.favicon?.dataUrl ?? null) === (favicon?.dataUrl ?? null))
        return;
      this.entries.set(entry.id, { ...current, favicon });
      this.publish();
    } catch {
      // Optional website metadata cannot fail the page or initiate a retry loop.
    }
  }

  private remember(): void {
    if (!this.storage || !this.state.ready) return;
    const { tabs, active } = this.group.getSnapshot();
    const open: WorkspaceViewState.ContentTab[] = [];
    let activeIndex: number | null = null;
    for (const key of tabs) {
      const tab = WorkbenchTab.parse(key);
      let descriptor: WorkspaceViewState.ContentTab;
      if (tab.kind === "file") descriptor = tab;
      else if (tab.kind === "browser") {
        const entry = this.entries.get(tab.id);
        if (!entry) continue;
        const live = entry.page?.url ?? entry.url;
        if (live !== null && DesktopBrowser.normalizeUrl(live) === null)
          continue;
        descriptor = {
          kind: "browser",
          id: entry.id,
          url: entry.page?.url ?? entry.url,
        };
      } else continue;
      if (key === active) activeIndex = open.length;
      open.push(descriptor);
    }
    const files = open.flatMap((entry) =>
      entry.kind === "file" ? [entry.relPath] : []
    );
    const activePath = active ? WorkbenchTab.relPath(active) : null;
    WorkspaceViewState.remember(this.storage, this.workspaceId, {
      tabs: { open: files, active: activePath ?? files.at(-1) ?? null },
      content: { open, active: activeIndex },
    });
  }
}
