import { DesktopBrowser } from "@grida/desktop-bridge";
import { Browser } from "@/lib/desktop/browser";
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
    storageScope: DesktopBrowser.StorageScope;
    error: string | null;
    locationRevision: number;
    /** Changes on navigation, including reloads to the same URL. */
    previewRevision?: number;
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
  private thumbnailEpoch = 0;
  private thumbnailNavigation = new Map<string, number>();
  private buffered: DesktopBrowser.Event[] = [];

  constructor(
    private readonly workspaceId: string,
    private readonly group: Pick<
      EditorGroup,
      | "getSnapshot"
      | "subscribe"
      | "restore"
      | "open"
      | "replace"
      | "closeMatching"
    >,
    private readonly getBridge: () => DesktopBrowser.Bridge | null = Browser.getBridge,
    private readonly newId: () => string = () => crypto.randomUUID(),
    private readonly confirmClear: () => Promise<boolean> = Browser.confirmClearSession
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = (): WorkspaceBrowserTabs.State => this.state;

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
    this.pendingLocations = new Map();
    this.thumbnailNavigation.clear();
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
          storageScope: "workspace",
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
    if (bridge && attachmentId)
      void bridge.detach(attachmentId).catch(() => {});
  }

  open = (
    url?: string,
    storageScope: DesktopBrowser.StorageScope = "workspace",
    replaceTab?: string
  ): void => {
    if (!this.bridge || !this.attachment || !this.state.ready) return;
    const id = this.newId();
    this.entries.set(id, {
      id,
      page: null,
      url: url ?? null,
      storageScope,
      error: null,
      locationRevision: 1,
    });
    this.publish();
    const key = WorkbenchTab.browser(id);
    if (replaceTab) this.group.replace(replaceTab, key);
    this.group.open(key);
    void this.ensurePage(id);
  };

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
    this.invalidateThumbnail(id);
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
      this.invalidateThumbnail(id);
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
      !page.mounted ||
      page.loading ||
      page.failure ||
      this.clearing
    )
      return null;
    const epoch = this.epoch;
    const thumbnailEpoch = this.thumbnailEpoch;
    const navigation = this.thumbnailNavigation.get(id) ?? 0;
    const url = page.url;
    try {
      const value = await bridge.thumbnail(target);
      const current = this.entries.get(id);
      if (
        epoch !== this.epoch ||
        thumbnailEpoch !== this.thumbnailEpoch ||
        this.clearing ||
        this.attachment !== target.attachmentId ||
        current?.page?.id !== target.pageId ||
        current.page.url !== url ||
        navigation !== (this.thumbnailNavigation.get(id) ?? 0) ||
        !this.group.getSnapshot().tabs.includes(WorkbenchTab.browser(id))
      )
        return null;
      return DesktopBrowser.parseThumbnail(value);
    } catch {
      return null;
    }
  }

  private invalidateThumbnail(id: string): void {
    const revision = (this.thumbnailNavigation.get(id) ?? 0) + 1;
    this.thumbnailNavigation.set(id, revision);
    const entry = this.entries.get(id);
    if (entry) this.entries.set(id, { ...entry, previewRevision: revision });
  }

  clearSession = async (): Promise<void> => {
    if (this.clearing || !this.bridge || !this.attachment) return;
    this.clearing = true;
    const epoch = this.epoch;
    try {
      if (!(await this.confirmClear()) || epoch !== this.epoch) return;
      this.thumbnailEpoch++;
      await this.bridge.clearSession({ attachmentId: this.attachment });
      if (epoch !== this.epoch) return;
      this.group.closeMatching(
        (key) => WorkbenchTab.parse(key).kind === "browser"
      );
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

  private async ensurePage(id: string): Promise<void> {
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
          storageScope: entry.storageScope,
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
        this.entries.set(id, { ...current, page: null });
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
        this.entries.set(id, { ...entry, page: null, url: entry.page.url });
        if (target && this.bridge)
          void this.bridge.close(target).catch(() => {});
      }
    }
    while (this.closedOrder.length > 25) {
      const oldest = this.closedOrder.shift()!;
      this.entries.delete(oldest);
      this.pendingLocations.delete(oldest);
      this.thumbnailNavigation.delete(oldest);
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
    if (event.type === "changed") {
      const previous = this.pages.get(event.page.id);
      if (
        previous &&
        (previous.url !== event.page.url ||
          (!previous.loading && event.page.loading) ||
          previous.mounted !== event.page.mounted ||
          previous.failure !== event.page.failure)
      ) {
        for (const [id, entry] of this.entries)
          if (entry.page?.id === event.page.id) this.invalidateThumbnail(id);
      }
      this.pages.set(event.page.id, event.page);
    } else {
      this.pages.delete(event.pageId);
      const closed = new Set<string>();
      for (const [id, entry] of this.entries) {
        if (entry.page?.id !== event.pageId) continue;
        this.entries.set(id, { ...entry, page: null });
        closed.add(WorkbenchTab.browser(id));
      }
      if (closed.size) this.group.closeMatching((key) => closed.has(key));
    }
    this.refreshEntries();
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
    this.revision = snapshot.revision;
    this.pages = new Map(snapshot.pages.map((page) => [page.id, page]));
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
      this.entries.set(id, { ...entry, page, url: page?.url ?? entry.url });
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
    for (const listener of this.listeners) listener();
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
        if (!entry || entry.storageScope !== "workspace") continue;
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
