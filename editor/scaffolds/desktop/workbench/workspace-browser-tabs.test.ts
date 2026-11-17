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
  version = 1 as const;
  thumbnail?: NonNullable<DesktopBrowser.Bridge["thumbnail"]>;
  revision = 0;
  pages = new Map<string, DesktopBrowser.Page>();
  listeners = new Set<(event: DesktopBrowser.Event) => void>();
  closed: string[] = [];
  cleared = 0;
  layouts: DesktopBrowser.LayoutRequest[] = [];
  navigated: string[] = [];
  nextSnapshot: Promise<DesktopBrowser.Snapshot> | null = null;
  snapshotValue(): DesktopBrowser.Snapshot {
    return {
      version: 1,
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
      revision: ++this.revision,
      url,
      title,
      loading: false,
      canGoBack: false,
      canGoForward: false,
      focused: false,
      storageScope: "workspace",
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
  async layout(request: DesktopBrowser.LayoutRequest) {
    this.layouts.push(request);
  }
  async openExternal() {}
  async clearSession() {
    this.cleared++;
    for (const pageId of this.pages.keys())
      await this.close({ attachmentId: "owner", pageId });
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
  }
}

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
function setup(
  host: BrowserHost | null = new BrowserHost(),
  confirmClear: () => Promise<boolean> = async () => true
) {
  const group = new EditorGroup({ reopenable: WorkbenchTab.reopenable });
  let id = 0;
  const tabs = new WorkspaceBrowserTabs(
    "workspace",
    group,
    () => host,
    () => `tab${++id}`,
    confirmClear
  );
  const storage = new MemoryStorage();
  return { group, tabs, storage, host: host! };
}

describe("WorkspaceBrowserTabs", () => {
  it("restores mixed ordering after file validation, reconnecting a live page", async () => {
    const { group, tabs, storage, host } = setup();
    const page = host.page("live", "https://example.com/");
    host.pages.set(page.id, page);
    WorkspaceViewState.remember(storage, "workspace", {
      tabs: { open: ["a.svg", "gone.svg"], active: "a.svg" },
      content: {
        open: [
          { kind: "browser", id: "browser", pageId: "live", url: page.url },
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
    expect(tabs.getSnapshot().entries.get("browser")?.page?.id).toBe("live");
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
    group.close(key);
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

    tabs.open(undefined, "workspace", start);

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

  it("keeps layout sequence monotonic across viewport remounts and rejects stale page slots", async () => {
    const { group, tabs, storage, host } = setup();
    await tabs.start(storage, async () => []);
    tabs.open("https://example.com/");
    await settle();
    const entry = [...tabs.getSnapshot().entries.values()][0];
    const layout = {
      sequence: 50,
      rect: { x: 0, y: 0, width: 500, height: 400 },
      visible: true,
    };
    tabs.layout(entry.id, entry.page!.id, layout);
    tabs.layout(entry.id, entry.page!.id, { ...layout, sequence: 1 });
    expect(host.layouts.map((request) => request.sequence)).toEqual([1, 2]);
    group.close(WorkbenchTab.browser(entry.id));
    await settle();
    group.reopenClosed();
    await settle();
    const reopened = tabs.getSnapshot().entries.get(entry.id)!;
    tabs.layout(entry.id, entry.page!.id, { ...layout, visible: false });
    expect(host.layouts).toHaveLength(2);
    tabs.layout(entry.id, reopened.page!.id, layout);
    expect(host.layouts.at(-1)?.sequence).toBe(1);
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
  it("requires native confirmation before clearing site data and closes browser tabs only", async () => {
    let accepted = false;
    const { group, tabs, storage, host } = setup(
      new BrowserHost(),
      async () => accepted
    );
    await tabs.start(storage, async () => []);
    tabs.open("https://example.com/");
    await settle();
    group.open("file:a.svg");
    await tabs.clearSession();
    expect(host.cleared).toBe(0);
    expect(group.getSnapshot().tabs).toHaveLength(2);
    accepted = true;
    await tabs.clearSession();
    expect(host.cleared).toBe(1);
    expect(group.getSnapshot()).toEqual({
      tabs: ["file:a.svg"],
      active: "file:a.svg",
    });
    expect(
      WorkspaceViewState.read(storage, "workspace")?.content?.open
    ).toEqual([{ kind: "file", relPath: "a.svg" }]);
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
      if (change === "clear") await tabs.clearSession();
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
