import { describe, expect, it, vi } from "vitest";
import { DesktopBrowser } from "@grida/desktop-bridge";
import { WorkspaceViewState } from "@/lib/desktop/workspace-view-state";
import { EditorGroup } from "./editor-group";
import { WorkbenchTab } from "./workbench-tab";
import { WorkbenchPanels } from "./workbench-panels";
import { WorkspaceBrowserTabs } from "./workspace-browser-tabs";
import { BrowserThumbnailFixtures } from "./browser-thumbnail.fixtures";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

class BrowserHost implements DesktopBrowser.Bridge {
  version = 4 as const;
  presentation = "webview" as const;
  utilities?: DesktopBrowser.Utilities.Bridge;
  thumbnail?: NonNullable<DesktopBrowser.Bridge["thumbnail"]>;
  favicon?: NonNullable<DesktopBrowser.Bridge["favicon"]>;
  revision = 0;
  pages = new Map<string, DesktopBrowser.Page>();
  listeners = new Set<(event: DesktopBrowser.Event) => void>();
  closed: string[] = [];
  cleared = 0;
  clearAccepted = true;
  active: (DesktopBrowser.Target & { active: boolean })[] = [];
  navigated: string[] = [];
  nextSnapshot: Promise<DesktopBrowser.Snapshot> | null = null;
  snapshotValue(): DesktopBrowser.Snapshot {
    return {
      version: 4,
      attachmentId: "owner",
      revision: this.revision,
      pages: [...this.pages.values()],
    };
  }
  async attach() {
    return this.snapshotValue();
  }
  async snapshot() {
    const next = this.nextSnapshot;
    this.nextSnapshot = null;
    return next ?? this.snapshotValue();
  }
  async detach() {}
  subscribe = (listener: (event: DesktopBrowser.Event) => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  async create(request: DesktopBrowser.Create) {
    const page = this.page(`page${this.revision + 1}`, request.url ?? null);
    this.pages.set(page.id, page);
    this.emit({
      type: "changed",
      attachmentId: "owner",
      revision: page.revision,
      page,
    });
    return page;
  }
  page(id: string, url: string | null, title = "Page"): DesktopBrowser.Page {
    return {
      id,
      mounted: true,
      revision: ++this.revision,
      url,
      title,
      loading: false,
      canGoBack: false,
      canGoForward: false,
      focused: false,

      failure: null,
    };
  }
  emit(event: DesktopBrowser.Event) {
    for (const listener of this.listeners) listener(event);
  }
  async navigate(request: DesktopBrowser.Navigate) {
    this.navigated.push(request.url);
  }
  async back() {}
  async forward() {}
  async reload() {}
  async stop() {}
  async focus(_request: DesktopBrowser.Target) {}
  async reserveMount(_request: DesktopBrowser.Target) {
    return { src: `${DesktopBrowser.MOUNT_URL_PREFIX}ticket` };
  }
  async setActive(request: DesktopBrowser.Target & { active: boolean }) {
    this.active.push(request);
  }
  async openExternal() {}
  async clearBrowsingData() {
    if (!this.clearAccepted) return false;
    this.cleared++;
    for (const pageId of this.pages.keys())
      await this.close({ attachmentId: "owner", pageId });
    return true;
  }
  async close({ pageId }: DesktopBrowser.Target) {
    this.closed.push(pageId);
    this.pages.delete(pageId);
    this.emit({
      type: "closed",
      attachmentId: "owner",
      revision: ++this.revision,
      pageId,
    });
    return true;
  }
}

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
function setup(host: BrowserHost | null = new BrowserHost()) {
  const group = new EditorGroup({ reopenable: WorkbenchTab.reopenable });
  let id = 0;
  const tabs = new WorkspaceBrowserTabs(
    "workspace",
    group,
    () => host,
    () => `tab${++id}`
  );
  const storage = new MemoryStorage();
  return { group, tabs, storage, host: host! };
}

describe("WorkspaceBrowserTabs", () => {
  it("restores mixed ordering after validation with fresh URL-only page identity", async () => {
    const { group, tabs, storage, host } = setup();
    const page = host.page("live", "https://example.com/");
    WorkspaceViewState.remember(storage, "workspace", {
      tabs: { open: ["a.svg", "gone.svg"], active: "a.svg" },
      content: {
        open: [
          { kind: "browser", id: "browser", url: page.url },
          { kind: "file", relPath: "a.svg" },
          { kind: "file", relPath: "gone.svg" },
        ],
        active: 0,
      },
    });
    await tabs.start(storage, async () => ["a.svg"]);
    expect(group.getSnapshot()).toEqual({
      tabs: ["browser:browser", "file:a.svg"],
      active: "browser:browser",
    });
    await settle();
    expect(tabs.getSnapshot().entries.get("browser")?.page?.id).not.toBe(
      "live"
    );
    expect(tabs.getSnapshot().entries.get("browser")?.page?.url).toBe(page.url);
    expect(host.pages.size).toBe(1);
    tabs.stop();
  });

  it("preserves pages on selection, destroys on close, and reopens at the URL", async () => {
    const { group, tabs, storage, host } = setup();
    await tabs.start(storage, async () => []);
    tabs.open("https://example.com/");
    await settle();
    const key = group.getSnapshot().active!;
    const first = [...tabs.getSnapshot().entries.values()][0].page!.id;
    group.open("file:a.svg");
    expect(host.closed).toEqual([]);
    await tabs.close(
      WorkbenchTab.parse(key).kind === "browser"
        ? key.slice("browser:".length)
        : ""
    );
    await settle();
    expect(host.closed).toEqual([first]);
    group.reopenClosed();
    await settle();
    expect(group.getSnapshot().active).toBe(key);
    const reopened = [...tabs.getSnapshot().entries.values()][0].page!;
    expect(reopened.id).not.toBe(first);
    expect(reopened.url).toBe("https://example.com/");
    tabs.stop();
  });

  it("waits for native consent, deduplicates close intent and keeps a Stay page alive", async () => {
    const { group, tabs, storage, host } = setup();
    await tabs.start(storage, async () => []);
    tabs.open("https://example.com/");
    await settle();
    const before = group.getSnapshot();
    const entry = tabs.getSnapshot().entries.get("tab1")!;
    let finish!: (accepted: boolean) => void;
    host.close = vi.fn<DesktopBrowser.Bridge["close"]>(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const first = tabs.close(entry.id);
    const repeated = tabs.close(entry.id);
    await settle();
    expect(repeated).toBe(first);
    expect(group.getSnapshot()).toBe(before);
    expect(tabs.getSnapshot().entries.get(entry.id)?.page).toBe(entry.page);
    expect(host.close).toHaveBeenCalledTimes(1);
    finish(false);
    expect(await first).toBe(false);
    expect(group.getSnapshot()).toBe(before);
    const accepted = tabs.close(entry.id);
    await settle();
    finish(true);
    expect(await accepted).toBe(true);
    expect(group.getSnapshot().tabs).toEqual([]);
    tabs.stop();
  });

  it("honors each close-other outcome without closing the retained tab", async () => {
    const { group, tabs, storage, host } = setup();
    await tabs.start(storage, async () => []);
    for (const path of ["keep", "stay", "close"]) {
      tabs.open(`https://example.com/${path}`);
      await settle();
    }
    const stayPage = tabs.getSnapshot().entries.get("tab2")!.page!;
    const nativeClose = host.close.bind(host);
    host.close = async (target) =>
      target.pageId === stayPage.id ? false : nativeClose(target);
    await tabs.closeMatching((key) => key !== "browser:tab1");
    expect(group.getSnapshot().tabs).toEqual(["browser:tab1", "browser:tab2"]);
    expect(tabs.getSnapshot().entries.get("tab2")?.page).toBe(stayPage);
    tabs.stop();
  });

  it("adopts native-created tabs beside their opener exactly once and preserves background selection", async () => {
    const { group, tabs, storage, host } = setup();
    const create = vi.spyOn(host, "create");
    await tabs.start(storage, async () => []);
    tabs.open("https://example.com/");
    await settle();
    const opener = tabs.getSnapshot().entries.get("tab1")!.page!;
    group.open("file:after.svg");
    for (const [id, disposition] of [
      ["child1", "background"],
      ["child2", "foreground"],
    ] as const) {
      const page = host.page(id, `https://example.com/${id}`);
      host.pages.set(id, page);
      const outcome = {
        type: "created",
        attachmentId: "owner",
        revision: page.revision,
        page,
        openerPageId: opener.id,
        disposition,
      } as const;
      host.emit(outcome);
      host.emit(outcome);
      if (disposition === "background")
        expect(group.getSnapshot().active).toBe("file:after.svg");
    }
    expect(group.getSnapshot()).toEqual({
      tabs: ["browser:tab1", "browser:tab2", "browser:tab3", "file:after.svg"],
      active: "browser:tab3",
    });
    expect(tabs.getSnapshot().entries.get("tab2")?.page).toEqual(
      host.pages.get("child1")
    );
    expect(create).toHaveBeenCalledTimes(1);
    tabs.stop();
  });

  it("recovers native pages from a revision-gap snapshot without issuing duplicate create", async () => {
    const { group, tabs, storage, host } = setup();
    const create = vi.spyOn(host, "create");
    await tabs.start(storage, async () => []);
    group.open("file:active.svg");
    for (let i = 0; i < 64; i++) {
      const page = host.page(`native${i}`, `https://example.com/${i}`);
      host.pages.set(page.id, page);
    }
    const page = [...host.pages.values()].at(-1)!;
    host.emit({
      type: "changed",
      attachmentId: "owner",
      revision: page.revision,
      page,
    });
    await settle();
    expect(tabs.getSnapshot().entries.size).toBe(64);
    expect(group.getSnapshot().tabs).toHaveLength(65);
    expect(group.getSnapshot().active).toBe("file:active.svg");
    expect(create).not.toHaveBeenCalled();
    tabs.stop();
  });

  it("retains opener metadata for created outcomes buffered behind a snapshot", async () => {
    const { group, tabs, storage, host } = setup();
    await tabs.start(storage, async () => []);
    tabs.open("https://example.com/");
    await settle();
    const opener = tabs.getSnapshot().entries.get("tab1")!.page!;
    group.open("file:active.svg");
    let finish!: (snapshot: DesktopBrowser.Snapshot) => void;
    host.nextSnapshot = new Promise((resolve) => {
      finish = resolve;
    });
    host.page(opener.id, opener.url, "missed");
    const newest = host.page(opener.id, opener.url, "latest");
    host.pages.set(opener.id, newest);
    host.emit({
      type: "changed",
      attachmentId: "owner",
      revision: newest.revision,
      page: newest,
    });
    const child = host.page("buffered", "https://example.com/child");
    host.pages.set(child.id, child);
    host.emit({
      type: "created",
      attachmentId: "owner",
      revision: child.revision,
      page: child,
      openerPageId: opener.id,
      disposition: "background",
    });
    finish(host.snapshotValue());
    await settle();
    expect(group.getSnapshot()).toEqual({
      tabs: ["browser:tab1", "browser:tab2", "file:active.svg"],
      active: "file:active.svg",
    });
    tabs.stop();
  });

  it("does not duplicate a native creation outcome racing its renderer create response", async () => {
    const { group, tabs, storage, host } = setup();
    host.create = async (request) => {
      const page = host.page("fromcreate", request.url ?? null);
      host.pages.set(page.id, page);
      host.emit({
        type: "created",
        attachmentId: "owner",
        revision: page.revision,
        page,
        openerPageId: null,
        disposition: "foreground",
      });
      return page;
    };
    await tabs.start(storage, async () => []);
    tabs.open("https://example.com/");
    await settle();
    expect(group.getSnapshot().tabs).toEqual(["browser:tab1"]);
    expect(tabs.getSnapshot().entries.get("tab1")?.page?.id).toBe("fromcreate");
    tabs.stop();
  });

  it("keeps generated locations live but omits their images, restart and reopen records", async () => {
    const { group, tabs, storage, host } = setup();
    host.favicon = vi.fn<NonNullable<DesktopBrowser.Bridge["favicon"]>>(
      async () => null
    );
    host.thumbnail = vi.fn<NonNullable<DesktopBrowser.Bridge["thumbnail"]>>(
      async () => null
    );
    await tabs.start(storage, async () => []);
    group.open("file:a.svg");
    const page = host.page("generated", "data:text/html,private");
    host.pages.set(page.id, page);
    host.emit({
      type: "created",
      attachmentId: "owner",
      revision: page.revision,
      page,
      openerPageId: null,
      disposition: "foreground",
    });
    expect(tabs.getSnapshot().entries.get("tab1")?.page).toEqual(page);
    expect(await tabs.thumbnail("tab1")).toBeNull();
    expect(host.favicon).not.toHaveBeenCalled();
    expect(host.thumbnail).not.toHaveBeenCalled();
    expect(
      WorkspaceViewState.read(storage, "workspace")?.content?.open
    ).toEqual([{ kind: "file", relPath: "a.svg" }]);
    await tabs.close("tab1");
    group.reopenClosed();
    expect(group.getSnapshot().tabs).toEqual(["file:a.svg"]);
    tabs.stop();
  });

  it("routes page commands to the selected owned guest and hides optional old-host controls", async () => {
    const { group, tabs, storage, host } = setup();
    const print = vi.fn<DesktopBrowser.Utilities.Bridge["print"]>(
      async () => {}
    );
    const setZoom = vi.fn<DesktopBrowser.Utilities.Bridge["setZoom"]>(
      async ({ factor }) => factor
    );
    const stopFind = vi.fn<DesktopBrowser.Utilities.Bridge["stopFind"]>(
      async () => {}
    );
    host.utilities = {
      version: 1,
      print,
      setZoom,
      stopFind,
      getZoom: async () => 1,
      find: async () => ({ matches: 0, activeMatchOrdinal: 0 }),
      inspect: async () => {},
    };
    await tabs.start(storage, async () => []);
    tabs.open("https://example.com/");
    await settle();
    const page = tabs.getSnapshot().entries.get("tab1")!.page!;
    const target = { attachmentId: "owner", pageId: page.id };
    expect(tabs.findActive()).toBe(true);
    expect(tabs.controls("tab1").read().findOpen).toBe(true);
    expect(tabs.commandActive("print")).toBe(true);
    expect(tabs.commandActive("zoom-in")).toBe(true);
    await settle();
    expect(print).toHaveBeenCalledWith(target);
    expect(setZoom).toHaveBeenCalledWith({ ...target, factor: 1.2 });
    group.open("file:a.svg");
    expect(tabs.findActive()).toBe(false);
    expect(tabs.controls("tab1").read().findOpen).toBe(false);
    expect(stopFind).toHaveBeenCalledWith(target);
    group.activate("browser:tab1");
    host.utilities = undefined;
    expect(tabs.commandActive("print")).toBe(false);
    tabs.stop();
  });

  it("replaces a Quick Start panel in place without disturbing live pages or close history", async () => {
    const { group, tabs, storage, host } = setup();
    await tabs.start(storage, async () => []);
    group.open("file:closed.md");
    group.close("file:closed.md");
    tabs.open("https://example.com/");
    await settle();
    const existing = [...tabs.getSnapshot().entries.values()][0].page!;
    const panels = new WorkbenchPanels(group);
    panels.show(
      "quick-start",
      { title: "Quick Start", content: null },
      () => {}
    );
    const start = WorkbenchTab.panel("quick-start");
    group.open("file:after.svg");
    group.activate(start);
    const snapshots: (readonly string[])[] = [];
    const unwatch = group.subscribe(() =>
      snapshots.push(group.getSnapshot().tabs)
    );

    tabs.open(undefined, start);

    expect(group.getSnapshot()).toEqual({
      tabs: ["browser:tab1", "browser:tab2", "file:after.svg"],
      active: "browser:tab2",
    });
    expect(snapshots).toHaveLength(1);
    expect(panels.getSnapshot().has("quick-start")).toBe(false);
    await settle();
    expect(host.closed).toEqual([]);
    expect(host.pages.has(existing.id)).toBe(true);
    expect(host.pages.size).toBe(2);
    group.reopenClosed();
    expect(group.getSnapshot().active).toBe("file:closed.md");
    expect(group.getSnapshot().tabs).not.toContain(start);
    unwatch();
    tabs.stop();
  });

  it("keeps file restoration available on older native hosts", async () => {
    const { group, tabs, storage } = setup(null);
    WorkspaceViewState.remember(storage, "workspace", {
      tabs: { open: ["a.svg"], active: "a.svg" },
    });
    await tabs.start(storage, async (paths) => paths);
    expect(group.getSnapshot().active).toBe("file:a.svg");
    expect(tabs.getSnapshot().supported).toBe(false);
    tabs.open("https://example.com/");
    expect(group.getSnapshot().tabs).toEqual(["file:a.svg"]);
    tabs.stop();
  });

  it("preserves saved browser URLs on an unsupported host while files remain usable", async () => {
    const { group, tabs, storage } = setup(null);
    WorkspaceViewState.remember(storage, "workspace", {
      tabs: { open: ["a.svg"], active: "a.svg" },
      content: {
        open: [
          { kind: "browser", id: "saved", url: "https://example.com/" },
          { kind: "file", relPath: "a.svg" },
        ],
        active: 0,
      },
    });
    await tabs.start(storage, async (paths) => paths);
    expect(group.getSnapshot().tabs).toEqual(["browser:saved", "file:a.svg"]);
    expect(tabs.getSnapshot().entries.get("saved")?.error).toContain(
      "Update Grida Desktop"
    );
    group.open("file:b.svg");
    expect(
      WorkspaceViewState.read(storage, "workspace")?.content?.open[0]
    ).toEqual({ kind: "browser", id: "saved", url: "https://example.com/" });
    expect(await tabs.reserveMount("saved")).toBeNull();
    tabs.stop();
  });

  it("keeps URL restore and an honest error when native attachment fails", async () => {
    const { tabs, storage, host } = setup();
    host.attach = async () => {
      throw new Error("No native admission");
    };
    WorkspaceViewState.remember(storage, "workspace", {
      tabs: { open: [], active: null },
      content: {
        open: [{ kind: "browser", id: "saved", url: "https://example.com/" }],
        active: 0,
      },
    });
    await tabs.start(storage, async () => []);
    const state = tabs.getSnapshot();
    expect(state.error).toContain("browser is unavailable");
    expect(state.entries.get("saved")?.error).toBe(state.error);
    expect(state.entries.get("saved")?.url).toBe("https://example.com/");
    tabs.stop();
  });

  it("buffers newer events during a revision-gap snapshot", async () => {
    const { tabs, storage, host } = setup();
    await tabs.start(storage, async () => []);
    tabs.open("https://example.com/");
    await settle();
    const entry = [...tabs.getSnapshot().entries.values()][0];
    let resolve!: (snapshot: DesktopBrowser.Snapshot) => void;
    host.nextSnapshot = new Promise((done) => {
      resolve = done;
    });
    const lost = host.page(entry.page!.id, entry.url, "Lost");
    const gap = host.page(entry.page!.id, entry.url, "Snapshot");
    host.pages.set(gap.id, gap);
    host.emit({
      type: "changed",
      attachmentId: "owner",
      revision: gap.revision,
      page: gap,
    });
    const captured = host.snapshotValue();
    const newest = host.page(entry.page!.id, entry.url, "Newest");
    host.pages.set(newest.id, newest);
    host.emit({
      type: "changed",
      attachmentId: "owner",
      revision: newest.revision,
      page: newest,
    });
    resolve(captured);
    await settle();
    expect(tabs.getSnapshot().entries.get(entry.id)?.page?.title).toBe(
      "Newest"
    );
    expect(lost.revision).toBe(2);
    tabs.stop();
  });

  it("does not let an older create response replace a newer page outcome", async () => {
    const { tabs, storage, host } = setup();
    host.create = async (request) => {
      const old = host.page("created", request.url ?? null, "Old");
      host.emit({
        type: "changed",
        attachmentId: "owner",
        revision: old.revision,
        page: old,
      });
      const next = host.page("created", request.url ?? null, "New");
      host.pages.set(next.id, next);
      host.emit({
        type: "changed",
        attachmentId: "owner",
        revision: next.revision,
        page: next,
      });
      return old;
    };
    await tabs.start(storage, async () => []);
    tabs.open("https://example.com/");
    await settle();
    expect([...tabs.getSnapshot().entries.values()][0].page?.title).toBe("New");
    tabs.stop();
  });
  it("routes location input accepted while page creation is pending", async () => {
    const { tabs, storage, host } = setup();
    let resolve!: (page: DesktopBrowser.Page) => void;
    host.create = () =>
      new Promise((done) => {
        resolve = done;
      });
    await tabs.start(storage, async () => []);
    tabs.open();
    const entry = [...tabs.getSnapshot().entries.values()][0];
    tabs.navigate(entry.id, "https://example.com/new");
    resolve(host.page("new", null));
    await settle();
    expect(host.navigated).toEqual(["https://example.com/new"]);
    tabs.stop();
  });

  it("exposes only Main-issued transient mounts and input eligibility", async () => {
    const { group, tabs, storage, host } = setup();
    await tabs.start(storage, async () => []);
    tabs.open("https://example.com/");
    await settle();
    const entry = [...tabs.getSnapshot().entries.values()][0];
    expect(await tabs.reserveMount(entry.id)).toEqual({
      src: `${DesktopBrowser.MOUNT_URL_PREFIX}ticket`,
    });
    tabs.setActive(entry.id, true);
    expect(host.active).toEqual([
      { attachmentId: "owner", pageId: entry.page!.id, active: true },
    ]);
    group.close(WorkbenchTab.browser(entry.id));
    await settle();
    expect(await tabs.reserveMount(entry.id)).toBeNull();
    tabs.stop();
  });
  it("does not resurrect a page closed before its create response arrives", async () => {
    const { tabs, storage, host } = setup();
    host.create = async (request) => {
      const page = host.page("closed", request.url ?? null);
      host.emit({
        type: "changed",
        attachmentId: "owner",
        revision: page.revision,
        page,
      });
      host.emit({
        type: "closed",
        attachmentId: "owner",
        revision: ++host.revision,
        pageId: page.id,
      });
      return page;
    };
    await tabs.start(storage, async () => []);
    tabs.open("https://example.com/");
    await settle();
    const entry = [...tabs.getSnapshot().entries.values()][0];
    expect(entry.page).toBeNull();
    expect(entry.error).toContain("closed");
    tabs.stop();
  });
  it("preserves a user-opened tab and focus while asynchronous restore settles", async () => {
    const { group, tabs, storage } = setup();
    WorkspaceViewState.remember(storage, "workspace", {
      tabs: { open: ["old.svg"], active: "old.svg" },
    });
    let resolve!: (paths: readonly string[]) => void;
    const started = tabs.start(
      storage,
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    group.open("file:new.svg");
    resolve(["old.svg"]);
    await started;
    expect(group.getSnapshot()).toEqual({
      tabs: ["file:new.svg"],
      active: "file:new.svg",
    });
    tabs.stop();
  });
  it("uses the native global confirmation result and closes browser tabs only", async () => {
    const { group, tabs, storage, host } = setup();
    host.clearAccepted = false;
    const clear = vi.spyOn(host, "clearBrowsingData");
    await tabs.start(storage, async () => []);
    tabs.open("https://example.com/");
    await settle();
    group.open("file:a.svg");
    await tabs.clearBrowsingData();
    expect(host.cleared).toBe(0);
    expect(group.getSnapshot().tabs).toHaveLength(2);
    host.clearAccepted = true;
    await tabs.clearBrowsingData();
    expect(host.cleared).toBe(1);
    expect(clear.mock.calls).toEqual([[], []]);
    expect(group.getSnapshot()).toEqual({
      tabs: ["file:a.svg"],
      active: "file:a.svg",
    });
    expect(
      WorkspaceViewState.read(storage, "workspace")?.content?.open
    ).toEqual([{ kind: "file", relPath: "a.svg" }]);
    tabs.stop();
  });
  it("deduplicates the common native confirmation while keeping cancellation non-destructive", async () => {
    const { group, tabs, storage, host } = setup();
    let finish!: (accepted: boolean) => void;
    const clear = vi.fn<DesktopBrowser.Bridge["clearBrowsingData"]>(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    host.clearBrowsingData = clear;
    await tabs.start(storage, async () => []);
    tabs.open("https://example.com/");
    await settle();
    const before = group.getSnapshot();
    const pending = tabs.clearBrowsingData();
    await tabs.clearBrowsingData();
    expect(clear.mock.calls).toEqual([[]]);
    finish(false);
    await pending;
    expect(group.getSnapshot()).toBe(before);
    tabs.stop();
  });

  it("keeps pages opened after native global teardown while the clear result is returning", async () => {
    const { group, tabs, storage, host } = setup();
    let finish!: (accepted: boolean) => void;
    host.clearBrowsingData = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    await tabs.start(storage, async () => []);
    tabs.open("https://example.com/before");
    await settle();
    const previous = [...tabs.getSnapshot().entries.values()][0];
    const pending = tabs.clearBrowsingData();
    await host.close({ attachmentId: "owner", pageId: previous.page!.id });
    tabs.open("https://example.com/after");
    await settle();
    const current = group.getSnapshot().active!;
    finish(true);
    await pending;
    expect(group.getSnapshot().tabs).toEqual([current]);
    expect(
      [...tabs.getSnapshot().entries.values()].some(
        (entry) => entry.page?.url === "https://example.com/after"
      )
    ).toBe(true);
    tabs.stop();
  });
});

const hoverThumbnail = BrowserThumbnailFixtures.solid;

describe("WorkspaceBrowserTabs hover thumbnails", () => {
  it("reads only on explicit hover request without selecting or focusing the page", async () => {
    const { group, tabs, storage, host } = setup();
    host.thumbnail = vi.fn<NonNullable<DesktopBrowser.Bridge["thumbnail"]>>(
      async () => hoverThumbnail
    );
    host.focus = vi.fn<DesktopBrowser.Bridge["focus"]>(async () => {});
    await tabs.start(storage, async () => []);
    tabs.open("https://example.com/");
    await settle();
    const entry = [...tabs.getSnapshot().entries.values()][0];
    group.open("file:a.svg");
    expect(host.thumbnail).not.toHaveBeenCalled();
    expect(await tabs.thumbnail(entry.id)).toEqual(hoverThumbnail);
    expect(host.thumbnail).toHaveBeenCalledExactlyOnceWith({
      attachmentId: "owner",
      pageId: entry.page!.id,
    });
    expect(host.focus).not.toHaveBeenCalled();
    expect(group.getSnapshot().active).toBe("file:a.svg");
    tabs.stop();
  });

  it("returns metadata fallback for older hosts and invalid image projections", async () => {
    const { tabs, storage, host } = setup();
    await tabs.start(storage, async () => []);
    tabs.open("https://example.com/");
    await settle();
    const entry = [...tabs.getSnapshot().entries.values()][0];
    expect(await tabs.thumbnail(entry.id)).toBeNull();
    host.thumbnail = async () => ({
      ...hoverThumbnail,
      dataUrl: "https://example.com/untrusted.jpg",
    });
    expect(await tabs.thumbnail(entry.id)).toBeNull();
    host.thumbnail = async () => {
      throw new Error("capture unavailable");
    };
    expect(await tabs.thumbnail(entry.id)).toBeNull();
    tabs.stop();
  });

  it.each(["navigate", "reload", "close", "clear", "detach"] as const)(
    "discards a pending capture after %s",
    async (change) => {
      const { group, tabs, storage, host } = setup();
      let resolve!: (value: DesktopBrowser.Thumbnail) => void;
      host.thumbnail = () =>
        new Promise((done) => {
          resolve = done;
        });
      await tabs.start(storage, async () => []);
      tabs.open("https://example.com/");
      await settle();
      const entry = [...tabs.getSnapshot().entries.values()][0];
      const read = tabs.thumbnail(entry.id);
      if (change === "navigate")
        tabs.navigate(entry.id, "https://example.com/next");
      if (change === "reload") tabs.action(entry.id, "reload");
      if (change === "close") group.close(WorkbenchTab.browser(entry.id));
      if (change === "clear") await tabs.clearBrowsingData();
      if (change === "detach") tabs.stop();
      resolve(hoverThumbnail);
      expect(await read).toBeNull();
      tabs.stop();
    }
  );

  it("keeps a valid capture through focus-only page outcomes", async () => {
    const { tabs, storage, host } = setup();
    let resolve!: (value: DesktopBrowser.Thumbnail) => void;
    host.thumbnail = () =>
      new Promise((done) => {
        resolve = done;
      });
    await tabs.start(storage, async () => []);
    tabs.open("https://example.com/");
    await settle();
    const entry = [...tabs.getSnapshot().entries.values()][0];
    const read = tabs.thumbnail(entry.id);
    const page = { ...entry.page!, revision: ++host.revision, focused: true };
    host.emit({
      type: "changed",
      attachmentId: "owner",
      revision: page.revision,
      page,
    });
    tabs.focusLocation();
    resolve(hoverThumbnail);
    expect(await read).toEqual(hoverThumbnail);
    tabs.stop();
  });
});

const favicon = { dataUrl: BrowserThumbnailFixtures.solid.dataUrl };
function faviconOutcome(
  host: BrowserHost,
  entry: WorkspaceBrowserTabs.Entry,
  overrides: Partial<DesktopBrowser.Page> = {}
) {
  const page = { ...entry.page!, revision: ++host.revision, ...overrides };
  host.pages.set(page.id, page);
  host.emit({
    type: "changed",
    attachmentId: "owner",
    revision: page.revision,
    page,
  });
}

describe("WorkspaceBrowserTabs favicons", () => {
  it("keeps transient native icons across selection and refreshes on cache revision without a loop", async () => {
    const { group, tabs, storage, host } = setup();
    const read = vi.fn<NonNullable<DesktopBrowser.Bridge["favicon"]>>(
      async () => favicon
    );
    host.favicon = read;
    await tabs.start(storage, async () => []);
    tabs.open("https://example.com/");
    await settle();
    const entry = [...tabs.getSnapshot().entries.values()][0];
    expect(entry.favicon).toEqual(favicon);
    expect(host.favicon).toHaveBeenCalledExactlyOnceWith({
      attachmentId: "owner",
      pageId: entry.page!.id,
    });
    group.open("file:brief.md");
    group.activate(WorkbenchTab.browser(entry.id));
    await settle();
    expect(tabs.getSnapshot().entries.get(entry.id)?.favicon).toEqual(favicon);
    expect(host.favicon).toHaveBeenCalledTimes(1);
    expect([...storage.values.values()].join()).not.toContain("data:image");
    read.mockResolvedValue(null);
    faviconOutcome(host, entry);
    await settle();
    expect(tabs.getSnapshot().entries.get(entry.id)?.favicon).toBeNull();
    expect(host.favicon).toHaveBeenCalledTimes(2);
    tabs.stop();
  });

  it("keeps a settled icon while a focus-only refresh is pending", async () => {
    const { tabs, storage, host } = setup();
    host.favicon = async () => favicon;
    await tabs.start(storage, async () => []);
    tabs.open("https://example.com/");
    await settle();
    const entry = [...tabs.getSnapshot().entries.values()][0];
    let resolve!: (icon: DesktopBrowser.Favicon | null) => void;
    host.favicon = () =>
      new Promise((done) => {
        resolve = done;
      });
    faviconOutcome(host, entry, { focused: true });
    await settle();
    expect(tabs.getSnapshot().entries.get(entry.id)?.favicon).toEqual(favicon);
    resolve(favicon);
    await settle();
    expect(tabs.getSnapshot().entries.get(entry.id)?.favicon).toEqual(favicon);
    tabs.stop();
  });

  it("uses the globe fallback on old hosts, unsafe metadata and getter failures", async () => {
    const { tabs, storage, host } = setup();
    await tabs.start(storage, async () => []);
    tabs.open("https://example.com/");
    await settle();
    const entry = [...tabs.getSnapshot().entries.values()][0];
    expect(entry.favicon ?? null).toBeNull();
    host.favicon = async () => ({
      dataUrl: "https://example.com/remote-icon.png",
    });
    faviconOutcome(host, entry);
    await settle();
    expect(
      tabs.getSnapshot().entries.get(entry.id)?.favicon ?? null
    ).toBeNull();
    host.favicon = async () => {
      throw new Error("optional icon unavailable");
    };
    faviconOutcome(host, entry);
    await settle();
    expect(
      tabs.getSnapshot().entries.get(entry.id)?.favicon ?? null
    ).toBeNull();
    expect(tabs.getSnapshot().entries.get(entry.id)?.error).toBeNull();
    expect(tabs.getSnapshot().ready).toBe(true);
    tabs.stop();
  });

  it.each([
    "navigate",
    "reload",
    "loading",
    "unmounted",
    "close",
    "clear",
    "detach",
  ] as const)("discards a pending favicon after %s", async (change) => {
    const { group, tabs, storage, host } = setup();
    let resolve!: (icon: DesktopBrowser.Favicon) => void;
    host.favicon = () =>
      new Promise((done) => {
        resolve = done;
      });
    await tabs.start(storage, async () => []);
    tabs.open("https://example.com/");
    await settle();
    const entry = [...tabs.getSnapshot().entries.values()][0];
    if (change === "navigate")
      tabs.navigate(entry.id, "https://example.com/next");
    if (change === "reload") tabs.action(entry.id, "reload");
    if (change === "loading") faviconOutcome(host, entry, { loading: true });
    if (change === "unmounted") faviconOutcome(host, entry, { mounted: false });
    if (change === "close") group.close(WorkbenchTab.browser(entry.id));
    if (change === "clear") await tabs.clearBrowsingData();
    if (change === "detach") tabs.stop();
    resolve(favicon);
    await settle();
    expect(
      tabs.getSnapshot().entries.get(entry.id)?.favicon ?? null
    ).toBeNull();
    tabs.stop();
  });

  it("lets the latest native metadata read win over an older response", async () => {
    const { tabs, storage, host } = setup();
    const pending: ((icon: DesktopBrowser.Favicon | null) => void)[] = [];
    host.favicon = () =>
      new Promise((done) => {
        pending.push(done);
      });
    await tabs.start(storage, async () => []);
    tabs.open("https://example.com/");
    await settle();
    const entry = [...tabs.getSnapshot().entries.values()][0];
    faviconOutcome(host, entry, { focused: true });
    await settle();
    expect(pending).toHaveLength(2);
    pending[1](favicon);
    await settle();
    pending[0](null);
    await settle();
    expect(tabs.getSnapshot().entries.get(entry.id)?.favicon).toEqual(favicon);
    tabs.stop();
  });
});
