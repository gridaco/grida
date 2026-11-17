// GRIDA-SEC-016 — guest isolation, ownership and browser recovery contracts.
import { beforeEach, expect, it, vi, type Mock } from "vitest";
import type { EventEmitter } from "node:events";
import type { IpcMainInvokeEvent } from "electron";
import { DesktopBrowser } from "@grida/desktop-bridge";

type FakeImage = {
  isEmpty(): boolean;
  getSize(): { width: number; height: number };
  resize: Mock<
    (options: { width: number; height: number; quality?: string }) => FakeImage
  >;
  toJPEG: Mock<(quality: number) => Buffer>;
};

type FakeContents = EventEmitter & {
  id: number;
  url: string;
  mainFrame: { url: string };
  destroyed: boolean;
  focused: boolean;
  getURL(): string;
  isDestroyed(): boolean;
  isFocused(): boolean;
  isLoading(): boolean;
  isLoadingMainFrame(): boolean;
  getZoomFactor(): number;
  capturePage: Mock<
    (
      rect?: unknown,
      options?: { stayHidden: boolean; stayAwake: boolean }
    ) => Promise<FakeImage>
  >;
  send: Mock<(channel: string, ...args: unknown[]) => void>;
  setWindowOpenHandler: Mock<(handler: () => { action: string }) => void>;
  navigationHistory: {
    canGoBack(): boolean;
    canGoForward(): boolean;
    goBack: Mock<() => void>;
    goForward: Mock<() => void>;
  };
  loadURL: Mock<(url: string) => Promise<void>>;
  reload: Mock<() => void>;
  stop: Mock<() => void>;
  focus: Mock<() => void>;
  close: Mock<(options?: { waitForBeforeUnload: boolean }) => void>;
};
type FakeView = {
  webContents: FakeContents;
  visible: boolean;
  options: { webPreferences: Record<string, unknown> };
  setBounds: Mock<(rect: DesktopBrowser.Rect) => void>;
  setBorderRadius: Mock<(radius: number) => void>;
  setVisible: Mock<(visible: boolean) => void>;
};
type FakeWindow = EventEmitter & {
  webContents: FakeContents;
  destroyed: boolean;
  focused: boolean;
  children: Set<unknown>;
  contentView: {
    addChildView(view: FakeView): void;
    removeChildView(view: unknown): boolean;
  };
  isDestroyed(): boolean;
  isFocused(): boolean;
  getContentSize(): number[];
};
type FakeSession = EventEmitter & {
  setPermissionRequestHandler: Mock<(...args: unknown[]) => void>;
  setPermissionCheckHandler: Mock<(...args: unknown[]) => void>;
  setDevicePermissionHandler: Mock<(...args: unknown[]) => void>;
  closeAllConnections: Mock<() => Promise<void>>;
  clearStorageData: Mock<() => Promise<void>>;
  clearCache: Mock<() => Promise<void>>;
  clearAuthCache: Mock<() => Promise<void>>;
};

const mock = vi.hoisted(() => ({
  owners: new Map<unknown, FakeWindow>(),
  views: [] as FakeView[],
  sessions: new Map<string, FakeSession>(),
  next: 1,
  savePath: undefined as string | undefined,
  confirm: vi.fn<
    (
      window: unknown,
      options: {
        detail: string;
        buttons: string[];
        defaultId: number;
        cancelId: number;
      }
    ) => Promise<{ response: number }>
  >(async () => ({ response: 0 })),
}));
beforeEach(() => {
  mock.owners.clear();
  mock.views.length = 0;
  mock.sessions.clear();
  mock.savePath = undefined;
  mock.confirm.mockReset().mockResolvedValue({ response: 0 });
});
vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  class Contents extends EventEmitter {
    id = mock.next++;
    url = "https://grida.co/desktop/workspace?id=eac20941e6a410aa";
    mainFrame = { url: this.url };
    destroyed = false;
    focused = false;
    getURL = () => this.url;
    isDestroyed = () => this.destroyed;
    isFocused = () => this.focused;
    isLoading = () => false;
    isLoadingMainFrame = () => false;
    getZoomFactor = () => 1.25;
    capturePage = vi.fn<
      (
        rect?: unknown,
        options?: { stayHidden: boolean; stayAwake: boolean }
      ) => Promise<FakeImage>
    >(async () => {
      throw new Error("No compositor fixture");
    });
    send = vi.fn<(channel: string, ...args: unknown[]) => void>();
    setWindowOpenHandler = vi.fn<(handler: () => { action: string }) => void>();
    navigationHistory = {
      canGoBack: () => false,
      canGoForward: () => false,
      goBack: vi.fn<() => void>(),
      goForward: vi.fn<() => void>(),
    };
    loadURL = vi.fn<(url: string) => Promise<void>>(async (url: string) => {
      this.url = url;
    });
    reload = vi.fn<() => void>();
    stop = vi.fn<() => void>();
    focus = vi.fn<() => void>(() => {
      this.focused = true;
      this.emit("focus");
    });
    close = vi.fn<(options?: { waitForBeforeUnload: boolean }) => void>(() => {
      this.destroyed = true;
      this.emit("destroyed");
    });
  }
  class Window extends EventEmitter {
    webContents = new Contents();
    destroyed = false;
    focused = true;
    children = new Set<unknown>();
    contentView = {
      addChildView: (view: FakeView) => {
        this.children.add(view);
        mock.owners.set(view.webContents, this);
      },
      removeChildView: (view: unknown) => this.children.delete(view),
    };
    isDestroyed = () => this.destroyed;
    isFocused = () => this.focused;
    getContentSize = () => [1000, 800];
    constructor() {
      super();
      mock.owners.set(this.webContents, this);
    }
    static fromWebContents(contents: unknown) {
      return mock.owners.get(contents) ?? null;
    }
  }
  class View {
    webContents = new Contents();
    visible = false;
    setBounds = vi.fn<(rect: DesktopBrowser.Rect) => void>();
    setBorderRadius = vi.fn<(radius: number) => void>();
    setVisible = vi.fn<(visible: boolean) => void>((visible: boolean) => {
      this.visible = visible;
    });
    constructor(readonly options: { webPreferences: Record<string, unknown> }) {
      mock.views.push(this);
    }
  }
  const fromPartition = vi.fn<(key: string) => FakeSession>((key: string) => {
    if (!mock.sessions.has(key)) {
      const value = Object.assign(new EventEmitter(), {
        setPermissionRequestHandler: vi.fn<(...args: unknown[]) => void>(),
        setPermissionCheckHandler: vi.fn<(...args: unknown[]) => void>(),
        setDevicePermissionHandler: vi.fn<(...args: unknown[]) => void>(),
        closeAllConnections: vi.fn<() => Promise<void>>(async () => {}),
        clearStorageData: vi.fn<() => Promise<void>>(async () => {}),
        clearCache: vi.fn<() => Promise<void>>(async () => {}),
        clearAuthCache: vi.fn<() => Promise<void>>(async () => {}),
      });
      mock.sessions.set(key, value);
    }
    return mock.sessions.get(key)!;
  });
  return {
    BrowserWindow: Window,
    WebContentsView: View,
    session: { fromPartition },
    shell: { openExternal: vi.fn<() => Promise<void>>(async () => {}) },
    dialog: {
      showMessageBox: mock.confirm,
      showSaveDialogSync: vi.fn<() => string | undefined>(() => mock.savePath),
    },
  };
});
import { BrowserWindow, session } from "electron";
import { DesktopBrowserHost } from "./browser-host";

async function fixture(
  workspace = "eac20941e6a410aa",
  sharedHost?: DesktopBrowserHost
) {
  const window = new BrowserWindow() as unknown as FakeWindow;
  window.webContents.url = `https://grida.co/desktop/workspace?id=${workspace}`;
  window.webContents.mainFrame.url = window.webContents.url;
  let admitted = true;
  const host =
    sharedHost ??
    new DesktopBrowserHost({
      editorOrigin: "https://grida.co",
      admitWindow: () => admitted,
      workspaceExists: async () => true,
      resolveWorkspace: async (id) => ({ name: `Project ${id}` }),
    });
  const event = {
    sender: window.webContents,
    senderFrame: window.webContents.mainFrame,
  } as unknown as IpcMainInvokeEvent;
  const attached = await host.attach(event, workspace);
  const create = (storageScope: DesktopBrowser.StorageScope = "workspace") =>
    host.create(event, {
      attachmentId: attached.attachmentId,
      storageScope,
      url: "https://example.com/",
    });
  return {
    window,
    host,
    event,
    attached,
    create,
    revoke: () => {
      admitted = false;
      host.closeAll();
    },
  };
}

it("creates hardened guest contents in a dedicated profile without the shell preload", async () => {
  const f = await fixture();
  const page = f.create();
  const view = mock.views.at(-1)!;
  const prefs = view.options.webPreferences;
  expect(prefs).toMatchObject({
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    webviewTag: false,
    webSecurity: true,
    disableDialogs: true,
  });
  expect(prefs).not.toHaveProperty("preload");
  expect(prefs).not.toHaveProperty("additionalArguments");
  expect(session.fromPartition).toHaveBeenCalledWith(
    "persist:grida-browser-workspace-eac20941e6a410aa"
  );
  expect(view.visible).toBe(false);
  expect(DesktopBrowser.parsePage(page)).not.toBeNull();
  expect(view.webContents.setWindowOpenHandler.mock.calls[0][0]()).toEqual({
    action: "deny",
  });
  f.host.closeAll();
});

it("denies a guest even when its owning window and URL look privileged", async () => {
  const f = await fixture();
  f.create();
  const guest = mock.views.at(-1)!.webContents;
  guest.url = f.window.webContents.url;
  guest.mainFrame.url = guest.url;
  await expect(
    f.host.attach(
      {
        sender: guest,
        senderFrame: guest.mainFrame,
      } as unknown as IpcMainInvokeEvent,
      "eac20941e6a410aa"
    )
  ).rejects.toThrow("browser_owner_invalid");
  await expect(
    f.host.attach(
      {
        ...f.event,
        senderFrame: { url: f.window.webContents.url },
      } as unknown as IpcMainInvokeEvent,
      "eac20941e6a410aa"
    )
  ).rejects.toThrow("browser_owner_invalid");
  f.host.closeAll();
});

it("rejects cross-window page IDs and old attachments after reattachment", async () => {
  const a = await fixture();
  const b = await fixture("eac20941e6a410aa", a.host);
  const page = a.create();
  expect(() =>
    b.host.navigate(b.event, {
      attachmentId: b.attached.attachmentId,
      pageId: page.id,
      url: "https://example.org/",
    })
  ).toThrow("browser_page_unavailable");
  const next = await a.host.attach(a.event, "eac20941e6a410aa");
  expect(next.attachmentId).not.toBe(a.attached.attachmentId);
  expect(next.pages.map((page) => page.id)).toEqual([page.id]);
  expect(() => a.host.detach(a.event, a.attached.attachmentId)).toThrow(
    "browser_attachment_expired"
  );
  expect(a.host.snapshot(a.event, next.attachmentId).pages).toHaveLength(1);
  a.host.closeAll();
  b.host.closeAll();
});

it("applies CSS geometry using native shell zoom, clips it and ignores stale updates", async () => {
  const f = await fixture();
  const page = f.create();
  const target = { attachmentId: f.attached.attachmentId, pageId: page.id };
  const view = mock.views.at(-1)!;
  f.host.layout(f.event, {
    ...target,
    sequence: 2,
    rect: { x: 100, y: 40, width: 1000, height: 1000 },
    visible: true,
  });
  expect(view.setBounds).toHaveBeenLastCalledWith({
    x: 125,
    y: 50,
    width: 875,
    height: 750,
  });
  expect(view.visible).toBe(true);
  f.host.layout(f.event, {
    ...target,
    sequence: 1,
    rect: { x: 0, y: 0, width: 1, height: 1 },
    visible: false,
  });
  expect(view.visible).toBe(true);
  expect(() =>
    f.host.layout(f.event, {
      ...target,
      sequence: 3,
      rect: { x: NaN, y: 0, width: 1, height: 1 },
      visible: true,
    })
  ).toThrow("browser_layout_invalid");
  f.host.detach(f.event, target.attachmentId);
  expect(view.visible).toBe(false);
  expect(view.webContents.close).not.toHaveBeenCalled();
  f.host.closeAll();
});

it("rejects unsafe destinations on direct navigation and redirects", async () => {
  const f = await fixture();
  const page = f.create();
  for (const url of [
    "file:///etc/passwd",
    "javascript:alert(1)",
    "grida-workspace://private",
    "https://user:secret@example.com/",
    "https://example.com/\n",
  ]) {
    expect(() =>
      f.host.navigate(f.event, {
        attachmentId: f.attached.attachmentId,
        pageId: page.id,
        url,
      })
    ).toThrow("browser_url_invalid");
    const preventDefault = vi.fn<() => void>();
    mock.views
      .at(-1)!
      .webContents.emit("will-redirect", { preventDefault }, url);
    expect(preventDefault).toHaveBeenCalled();
  }
  f.host.closeAll();
});

it("clears shared workspace sessions only after closing every same-scope page", async () => {
  const f = await fixture();
  const first = f.create();
  const transient = f.create("ephemeral");
  const other = await fixture("eac20941e6a410aa", f.host);
  other.create();
  const different = await fixture("1234567890abcdef", f.host);
  const untouched = different.create();
  const views = mock.views.slice(-4, -1);
  await f.host.clearSession(f.event, { attachmentId: f.attached.attachmentId });
  expect(f.host.snapshot(f.event, f.attached.attachmentId).pages).toEqual([]);
  for (const view of views)
    expect(view.webContents.close).toHaveBeenCalledWith({
      waitForBeforeUnload: false,
    });
  expect(
    mock.sessions.get(`grida-browser-page-${transient.id}`)!.clearStorageData
  ).toHaveBeenCalled();
  expect(
    mock.sessions.get("persist:grida-browser-workspace-eac20941e6a410aa")!
      .clearStorageData
  ).toHaveBeenCalled();
  expect(first.id).not.toBe(transient.id);
  expect(
    f.host.snapshot(other.event, other.attached.attachmentId).pages
  ).toEqual([]);
  expect(
    f.host.snapshot(different.event, different.attached.attachmentId).pages[0]
      .id
  ).toBe(untouched.id);
  f.host.closeAll();
});

it("revokes pending attachments on navigation and native role loss", async () => {
  const window = new BrowserWindow() as unknown as FakeWindow;
  let resolve!: (value: boolean) => void;
  const host = new DesktopBrowserHost({
    editorOrigin: "https://grida.co",
    admitWindow: () => true,
    workspaceExists: () =>
      new Promise((r) => {
        resolve = r;
      }),
  });
  const event = {
    sender: window.webContents,
    senderFrame: window.webContents.mainFrame,
  } as unknown as IpcMainInvokeEvent;
  const pending = host.attach(event, "eac20941e6a410aa");
  host.closeAll();
  resolve(true);
  await expect(pending).rejects.toThrow("browser_attachment_expired");
});

it("retains hidden pages across shell reload but destroys them on account revocation", async () => {
  const f = await fixture();
  f.create();
  const view = mock.views.at(-1)!;
  f.window.webContents.emit("did-start-navigation", {
    isMainFrame: true,
    isSameDocument: false,
    url: f.window.webContents.url,
  });
  expect(view.webContents.close).not.toHaveBeenCalled();
  expect(() => f.host.snapshot(f.event, f.attached.attachmentId)).toThrow(
    "browser_attachment_expired"
  );
  const next = await f.host.attach(f.event, "eac20941e6a410aa");
  expect(next.pages).toHaveLength(1);
  f.revoke();
  expect(view.webContents.close).toHaveBeenCalled();
  expect(f.window.children.size).toBe(0);
  expect(f.window.webContents.listenerCount("did-start-navigation")).toBe(0);
});

it.each([
  "https://grida.co/desktop/settings",
  "https://grida.co/desktop/tools",
  "https://grida.co/desktop/workspace?id=aac20941e6a410aa",
])(
  "closes a late attachment when an already-started navigation commits to %s",
  async (url) => {
    const window = new BrowserWindow() as unknown as FakeWindow;
    const host = new DesktopBrowserHost({
      editorOrigin: "https://grida.co",
      admitWindow: () => true,
      workspaceExists: async () => true,
    });
    const event = {
      sender: window.webContents,
      senderFrame: window.webContents.mainFrame,
    } as unknown as IpcMainInvokeEvent;
    window.webContents.emit("did-start-navigation", {
      isMainFrame: true,
      isSameDocument: false,
      url,
    });
    vi.spyOn(window.webContents, "isLoadingMainFrame").mockReturnValue(true);
    // Hydration may attach while loading; the subsequent commit must revoke it.
    const attached = await host.attach(event, "eac20941e6a410aa");
    const page = host.create(event, {
      attachmentId: attached.attachmentId,
      storageScope: "workspace",
    });
    const view = mock.views.at(-1)!;
    host.layout(event, {
      attachmentId: attached.attachmentId,
      pageId: page.id,
      sequence: 1,
      rect: { x: 0, y: 0, width: 100, height: 100 },
      visible: true,
    });
    expect(view.visible).toBe(true);
    window.webContents.url = url;
    window.webContents.mainFrame.url = url;
    window.webContents.emit("did-navigate", {}, url);
    expect(view.visible).toBe(false);
    expect(view.webContents.close).toHaveBeenCalledWith({
      waitForBeforeUnload: false,
    });
    expect(window.children.size).toBe(0);
    expect(() => host.snapshot(event, attached.attachmentId)).toThrow(
      url.includes("/workspace?")
        ? "browser_attachment_expired"
        : "browser_owner_invalid"
    );
    expect(window.webContents.listenerCount("did-navigate")).toBe(0);
    expect(window.webContents.listenerCount("did-start-navigation")).toBe(0);
    host.closeAll();
  }
);

it("hides a late attachment on same-workspace full commit and recovers its pages with a new lease", async () => {
  const window = new BrowserWindow() as unknown as FakeWindow;
  const host = new DesktopBrowserHost({
    editorOrigin: "https://grida.co",
    admitWindow: () => true,
    workspaceExists: async () => true,
  });
  const event = {
    sender: window.webContents,
    senderFrame: window.webContents.mainFrame,
  } as unknown as IpcMainInvokeEvent;
  window.webContents.emit("did-start-navigation", {
    isMainFrame: true,
    isSameDocument: false,
    url: window.webContents.url,
  });
  const attached = await host.attach(event, "eac20941e6a410aa");
  const page = host.create(event, {
    attachmentId: attached.attachmentId,
    storageScope: "workspace",
  });
  const view = mock.views.at(-1)!;
  const layout = {
    pageId: page.id,
    sequence: 1,
    rect: { x: 0, y: 0, width: 100, height: 100 },
    visible: true,
  };
  host.layout(event, { ...layout, attachmentId: attached.attachmentId });
  expect(view.visible).toBe(true);
  window.webContents.emit("did-navigate", {}, window.webContents.url);
  expect(view.visible).toBe(false);
  expect(view.webContents.close).not.toHaveBeenCalled();
  expect(() => host.snapshot(event, attached.attachmentId)).toThrow(
    "browser_attachment_expired"
  );
  const recovered = await host.attach(event, "eac20941e6a410aa");
  expect(recovered.attachmentId).not.toBe(attached.attachmentId);
  expect(recovered.pages.map((entry) => entry.id)).toEqual([page.id]);
  host.layout(event, { ...layout, attachmentId: recovered.attachmentId });
  expect(view.visible).toBe(true);
  host.closeAll();
});

it("refuses pending admission when an already-started same-URL navigation commits during catalog lookup", async () => {
  const window = new BrowserWindow() as unknown as FakeWindow;
  let release!: (registered: boolean) => void;
  const host = new DesktopBrowserHost({
    editorOrigin: "https://grida.co",
    admitWindow: () => true,
    workspaceExists: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  const event = {
    sender: window.webContents,
    senderFrame: window.webContents.mainFrame,
  } as unknown as IpcMainInvokeEvent;
  window.webContents.emit("did-start-navigation", {
    isMainFrame: true,
    isSameDocument: false,
    url: window.webContents.url,
  });
  const pending = host.attach(event, "eac20941e6a410aa");
  // A same-URL document replacement can retain the same mocked frame wrapper.
  window.webContents.emit("did-navigate", {}, window.webContents.url);
  release(true);
  await expect(pending).rejects.toThrow("browser_attachment_expired");
  expect(mock.views).toHaveLength(0);
  expect(window.webContents.listenerCount("did-navigate")).toBe(0);
  expect(window.webContents.listenerCount("did-start-navigation")).toBe(0);
  host.closeAll();
});

it.each([
  [
    "did-fail-provisional-load",
    "https://grida.co/desktop/workspace?id=eac20941e6a410aa",
  ],
  ["did-fail-load", "https://grida.co/desktop/workspace?id=eac20941e6a410aa"],
  ["did-fail-provisional-load", "https://grida.co/desktop/settings"],
  ["did-fail-load", "https://grida.co/desktop/settings"],
])(
  "revokes a late attachment on main-frame %s for %s",
  async (failureEvent, url) => {
    const window = new BrowserWindow() as unknown as FakeWindow;
    const host = new DesktopBrowserHost({
      editorOrigin: "https://grida.co",
      admitWindow: () => true,
      workspaceExists: async () => true,
    });
    const event = {
      sender: window.webContents,
      senderFrame: window.webContents.mainFrame,
    } as unknown as IpcMainInvokeEvent;
    window.webContents.emit("did-start-navigation", {
      isMainFrame: true,
      isSameDocument: false,
      url,
    });
    const attached = await host.attach(event, "eac20941e6a410aa");
    const page = host.create(event, {
      attachmentId: attached.attachmentId,
      storageScope: "workspace",
    });
    const view = mock.views.at(-1)!;
    host.layout(event, {
      attachmentId: attached.attachmentId,
      pageId: page.id,
      sequence: 1,
      rect: { x: 0, y: 0, width: 100, height: 100 },
      visible: true,
    });
    window.webContents.emit(
      failureEvent,
      {},
      -105,
      "ERR_NAME_NOT_RESOLVED",
      url,
      true
    );
    expect(view.visible).toBe(false);
    expect(() => host.snapshot(event, attached.attachmentId)).toThrow(
      "browser_attachment_expired"
    );
    const sameWorkspace = url.includes("/workspace?");
    expect(view.webContents.close.mock.calls).toEqual(
      sameWorkspace ? [] : [[{ waitForBeforeUnload: false }]]
    );
    expect(window.children.size).toBe(sameWorkspace ? 1 : 0);
    const recovered = await host.attach(event, "eac20941e6a410aa");
    expect(recovered.pages.map((entry) => entry.id)).toEqual(
      sameWorkspace ? [page.id] : []
    );
    host.closeAll();
    expect(window.webContents.listenerCount(failureEvent)).toBe(0);
  }
);

it.each(["did-fail-provisional-load", "did-fail-load"])(
  "keeps an attachment visible on subframe %s",
  async (failureEvent) => {
    const f = await fixture();
    const page = f.create();
    const view = mock.views.at(-1)!;
    f.host.layout(f.event, {
      attachmentId: f.attached.attachmentId,
      pageId: page.id,
      sequence: 1,
      rect: { x: 0, y: 0, width: 100, height: 100 },
      visible: true,
    });
    f.window.webContents.emit(
      failureEvent,
      {},
      -105,
      "ERR_NAME_NOT_RESOLVED",
      "https://example.com/iframe",
      false
    );
    expect(view.visible).toBe(true);
    expect(view.webContents.close).not.toHaveBeenCalled();
    expect(f.host.snapshot(f.event, f.attached.attachmentId).pages[0].id).toBe(
      page.id
    );
    f.host.closeAll();
  }
);

it.each([
  ["did-fail-provisional-load", true],
  ["did-fail-load", true],
  ["did-fail-provisional-load", false],
  ["did-fail-load", false],
])(
  "scopes pending-admission revocation on %s to main frames (%s)",
  async (failureEvent, isMainFrame) => {
    const window = new BrowserWindow() as unknown as FakeWindow;
    let release!: (registered: boolean) => void;
    const host = new DesktopBrowserHost({
      editorOrigin: "https://grida.co",
      admitWindow: () => true,
      workspaceExists: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    });
    const event = {
      sender: window.webContents,
      senderFrame: window.webContents.mainFrame,
    } as unknown as IpcMainInvokeEvent;
    window.webContents.emit("did-start-navigation", {
      isMainFrame: true,
      isSameDocument: false,
      url: window.webContents.url,
    });
    const pending = host.attach(event, "eac20941e6a410aa");
    window.webContents.emit(
      failureEvent,
      {},
      -105,
      "ERR_NAME_NOT_RESOLVED",
      window.webContents.url,
      isMainFrame
    );
    release(true);
    const outcome = await pending.then(
      () => "attached",
      (error: Error) => error.message
    );
    expect(outcome).toBe(
      isMainFrame ? "browser_attachment_expired" : "attached"
    );
    host.closeAll();
    expect(window.webContents.listenerCount(failureEvent)).toBe(0);
    expect(window.webContents.listenerCount("did-start-navigation")).toBe(0);
  }
);

it("emits bounded revision-consistent outcomes and no changes after close", async () => {
  const f = await fixture();
  const page = f.create();
  f.create();
  const view = mock.views.at(-2)!;
  view.webContents.emit("page-title-updated", {}, "控制".repeat(1000) + "\n");
  const changes = f.window.webContents.send.mock.calls.filter(
    ([channel]) => channel === "grida:browser:changed"
  );
  expect(changes.length).toBeGreaterThan(0);
  for (const [, event] of changes)
    expect(DesktopBrowser.parseEvent(event)).not.toBeNull();
  f.host.close(f.event, {
    attachmentId: f.attached.attachmentId,
    pageId: page.id,
  });
  const count = f.window.webContents.send.mock.calls.length;
  view.webContents.emit("render-process-gone", {}, { reason: "crashed" });
  view.webContents.emit(
    "did-fail-load",
    {},
    -2,
    "fail",
    "https://example.com",
    true
  );
  expect(f.window.webContents.send.mock.calls.length).toBe(count);
  f.host.closeAll();
});

it("refuses a new page while the shared workspace profile is being cleared", async () => {
  const f = await fixture();
  f.create();
  const browserSession = mock.sessions.get(
    "persist:grida-browser-workspace-eac20941e6a410aa"
  )!;
  let release!: () => void;
  browserSession.closeAllConnections.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      })
  );
  const clearing = f.host.clearSession(f.event, {
    attachmentId: f.attached.attachmentId,
  });
  expect(() => f.create()).toThrow("browser_session_busy");
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  release();
  await clearing;
  expect(() => f.create()).not.toThrow();
  f.host.closeAll();
});

it("clears retained workspace storage even before any page is created in this launch", async () => {
  const f = await fixture("abcdef0123456789");
  await f.host.clearSession(f.event, { attachmentId: f.attached.attachmentId });
  expect(
    mock.sessions.get("persist:grida-browser-workspace-abcdef0123456789")!
      .clearStorageData
  ).toHaveBeenCalled();
  f.host.closeAll();
});

it("bounds the page count and keeps blocked subframe navigation out of page failure", async () => {
  const f = await fixture();
  for (let i = 0; i < DesktopBrowser.MAX_PAGES; i++) f.create();
  expect(() => f.create()).toThrow("browser_page_limit");
  const view = mock.views.at(-1)!;
  const blocked = vi.fn<() => void>();
  view.webContents.emit("will-frame-navigate", {
    preventDefault: blocked,
    url: "file:///private/data",
    isMainFrame: false,
  });
  expect(blocked).toHaveBeenCalled();
  const blank = vi.fn<() => void>();
  view.webContents.emit("will-frame-navigate", {
    preventDefault: blank,
    url: "about:blank",
    isMainFrame: false,
  });
  expect(blank).not.toHaveBeenCalled();
  expect(
    f.host
      .snapshot(f.event, f.attached.attachmentId)
      .pages.every((page) => page.failure === null)
  ).toBe(true);
  f.host.closeAll();
});

it("requires a registered workspace and refuses lookup results after shell navigation", async () => {
  const window = new BrowserWindow() as unknown as FakeWindow;
  const event = {
    sender: window.webContents,
    senderFrame: window.webContents.mainFrame,
  } as unknown as IpcMainInvokeEvent;
  const missing = new DesktopBrowserHost({
    editorOrigin: "https://grida.co",
    admitWindow: () => true,
    workspaceExists: async () => false,
  });
  await expect(missing.attach(event, "eac20941e6a410aa")).rejects.toThrow(
    "browser_workspace_unavailable"
  );
  let release!: (value: boolean) => void;
  const host = new DesktopBrowserHost({
    editorOrigin: "https://grida.co",
    admitWindow: () => true,
    workspaceExists: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  const pending = host.attach(event, "eac20941e6a410aa");
  window.webContents.emit("did-start-navigation", {
    isMainFrame: true,
    isSameDocument: false,
    url: window.webContents.url,
  });
  release(true);
  await expect(pending).rejects.toThrow("browser_attachment_expired");
});

it("requires a save destination and cancels accepted downloads when their attachment ends", async () => {
  const { EventEmitter } = await import("node:events");
  const f = await fixture();
  f.create();
  const view = mock.views.at(-1)!;
  const browserSession = mock.sessions.get(
    "persist:grida-browser-workspace-eac20941e6a410aa"
  )!;
  const item = Object.assign(new EventEmitter(), {
    getFilename: () => "download.txt",
    setSavePath: vi.fn<(destination: string) => void>(),
    cancel: vi.fn<() => void>(),
  });
  const preventDefault = vi.fn<() => void>();
  mock.savePath = undefined;
  browserSession.emit(
    "will-download",
    { preventDefault },
    item,
    view.webContents
  );
  expect(preventDefault).toHaveBeenCalled();
  expect(item.setSavePath).not.toHaveBeenCalled();
  mock.savePath = "/fixture/download.txt";
  browserSession.emit(
    "will-download",
    { preventDefault },
    item,
    view.webContents
  );
  expect(item.setSavePath).toHaveBeenCalledWith(mock.savePath);
  f.host.detach(f.event, f.attached.attachmentId);
  expect(item.cancel).toHaveBeenCalledOnce();
  mock.savePath = undefined;
  f.host.closeAll();
});

it("revokes publication before closing guests when the shell dies before its BrowserWindow", async () => {
  const f = await fixture();
  const page = f.create();
  f.host.layout(f.event, {
    attachmentId: f.attached.attachmentId,
    pageId: page.id,
    sequence: 1,
    rect: { x: 0, y: 0, width: 100, height: 100 },
    visible: true,
  });
  const view = mock.views.at(-1)!;
  const contents = f.window.webContents;
  const admission = vi.spyOn(f.host.options, "admitWindow");
  admission.mockClear();
  contents.send.mockClear();
  contents.destroyed = true;
  // Electron's window wrapper can outlive its webContents and native view.
  Object.defineProperty(f.window, "webContents", {
    get: () => {
      throw new Error("Object has been destroyed");
    },
  });
  Object.defineProperty(f.window, "contentView", {
    get: () => {
      throw new Error("Object has been destroyed");
    },
  });
  expect(() => contents.emit("destroyed")).not.toThrow();
  expect(view.webContents.close).toHaveBeenCalledWith({
    waitForBeforeUnload: false,
  });
  const preventDefault = vi.fn<() => void>();
  expect(() =>
    view.webContents.emit(
      "before-input-event",
      { preventDefault },
      { type: "keyDown", key: "l", meta: true, control: true }
    )
  ).not.toThrow();
  expect(preventDefault).not.toHaveBeenCalled();
  expect(admission).not.toHaveBeenCalled();
  expect(contents.send).not.toHaveBeenCalled();
  expect(() => f.window.emit("closed")).not.toThrow();
  expect(() => f.host.closeAll()).not.toThrow();
});

it("scales the presentation radius with native zoom, clamps it to the viewport and resets omitted radii", async () => {
  const f = await fixture();
  const page = f.create();
  const view = mock.views.at(-1)!;
  const target = { attachmentId: f.attached.attachmentId, pageId: page.id };
  const rect = { x: 100, y: 40, width: 200, height: 100 };
  f.host.layout(f.event, {
    ...target,
    sequence: 1,
    rect,
    visible: true,
    borderRadius: 7.2,
  });
  expect(view.setBounds).toHaveBeenLastCalledWith({
    x: 125,
    y: 50,
    width: 250,
    height: 125,
  });
  expect(view.setBorderRadius).toHaveBeenLastCalledWith(9);
  f.host.layout(f.event, {
    ...target,
    sequence: 2,
    rect,
    visible: true,
    borderRadius: 24,
  });
  expect(view.setBorderRadius).toHaveBeenLastCalledWith(30);
  f.host.layout(f.event, {
    ...target,
    sequence: 1,
    rect,
    visible: true,
    borderRadius: 0,
  });
  expect(view.setBorderRadius).toHaveBeenLastCalledWith(30);
  f.host.layout(f.event, {
    ...target,
    sequence: 3,
    rect: { ...rect, width: 9.6, height: 4.8 },
    visible: true,
    borderRadius: 100,
  });
  expect(view.setBorderRadius).toHaveBeenLastCalledWith(3);
  f.host.layout(f.event, { ...target, sequence: 4, rect, visible: true });
  expect(view.setBorderRadius).toHaveBeenLastCalledWith(0);
  expect(() =>
    f.host.layout(f.event, {
      ...target,
      sequence: 5,
      rect,
      visible: true,
      borderRadius: Infinity,
    })
  ).toThrow("browser_layout_invalid");
  f.host.closeAll();
});

function compositorImage() {
  // Synthetic frame/scan headers lock metadata handling; the opt-in Electron
  // fixture exercises Chromium's actual JPEG encoder.
  const jpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 180, 0, 240, 1, 1, 0x11, 0, 0xff, 0xda,
    0, 8, 1, 1, 0, 0, 0x3f, 0, 0, 0xff, 0xd9,
  ]);
  const resized: FakeImage = {
    isEmpty: () => false,
    getSize: () => ({ width: 240, height: 180 }),
    resize: vi.fn<() => FakeImage>(),
    toJPEG: vi.fn<(quality: number) => Buffer>(() => jpeg),
  };
  const image: FakeImage = {
    isEmpty: () => false,
    getSize: () => ({ width: 800, height: 600 }),
    resize: vi.fn<
      (options: {
        width: number;
        height: number;
        quality?: string;
      }) => FakeImage
    >(() => resized),
    toJPEG: vi.fn<(quality: number) => Buffer>(() => jpeg),
  };
  return { image, resized };
}

async function renderedFixture() {
  const f = await fixture();
  const page = f.create();
  const view = mock.views.at(-1)!;
  view.webContents.emit("did-stop-loading");
  const target = { attachmentId: f.attached.attachmentId, pageId: page.id };
  f.host.layout(f.event, {
    ...target,
    sequence: 1,
    rect: { x: 100, y: 50, width: 400, height: 300 },
    visible: true,
  });
  const boundsCalls = view.setBounds.mock.calls.length;
  f.host.layout(f.event, {
    ...target,
    sequence: 2,
    rect: { x: 0, y: 0, width: 0, height: 0 },
    visible: false,
  });
  expect(view.setBounds).toHaveBeenCalledTimes(boundsCalls);
  expect(view.visible).toBe(false);
  return { ...f, page, view, target };
}

it("captures a bounded transient JPEG while retaining the hidden page's last viewport and focus", async () => {
  const f = await renderedFixture();
  const { image, resized } = compositorImage();
  f.view.webContents.capturePage.mockResolvedValue(image);
  const visibilityCalls = f.view.setVisible.mock.calls.length;
  const boundsCalls = f.view.setBounds.mock.calls.length;
  const result = await f.host.thumbnail(f.event, f.target);
  expect(result).toMatchObject({ width: 240, height: 180 });
  expect(DesktopBrowser.parseThumbnail(result)).not.toBeNull();
  expect(f.view.webContents.capturePage).toHaveBeenCalledExactlyOnceWith(
    undefined,
    { stayHidden: true, stayAwake: false }
  );
  expect(image.resize).toHaveBeenCalledWith({
    width: 240,
    height: 180,
    quality: "good",
  });
  expect(resized.toJPEG).toHaveBeenCalledWith(60);
  expect(f.view.setVisible).toHaveBeenCalledTimes(visibilityCalls);
  expect(f.view.setBounds).toHaveBeenCalledTimes(boundsCalls);
  expect(f.view.webContents.focus).not.toHaveBeenCalled();
  f.host.closeAll();
});

it("limits capture to one in-flight request per owner without invalidating it on focus changes", async () => {
  const f = await renderedFixture();
  const { image } = compositorImage();
  let release!: (value: FakeImage) => void;
  f.view.webContents.capturePage.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const pending = f.host.thumbnail(f.event, f.target);
  await expect(f.host.thumbnail(f.event, f.target)).resolves.toBeNull();
  expect(f.view.webContents.capturePage).toHaveBeenCalledTimes(1);
  f.window.focused = false;
  f.window.emit("blur");
  release(image);
  await expect(pending).resolves.toMatchObject({ width: 240, height: 180 });
  f.host.closeAll();
});

it("rejects closed or detached capture recipients and discards pixels after navigation", async () => {
  for (const action of ["close", "detach", "navigate"] as const) {
    const f = await renderedFixture();
    const { image } = compositorImage();
    let release!: (value: FakeImage) => void;
    f.view.webContents.capturePage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const pending = f.host.thumbnail(f.event, f.target);
    if (action === "close") await f.host.close(f.event, f.target);
    if (action === "detach") f.host.detach(f.event, f.target.attachmentId);
    if (action === "navigate")
      f.host.navigate(f.event, { ...f.target, url: "https://example.org/new" });
    release(image);
    const outcome = await pending.then(
      (value) => ({ value, error: null }),
      (error: unknown) => ({
        value: null,
        error: error instanceof Error ? error.message : String(error),
      })
    );
    const errors = {
      close: "browser_page_unavailable",
      detach: "browser_attachment_expired",
      navigate: null,
    };
    expect(outcome).toEqual({ value: null, error: errors[action] });
    f.host.closeAll();
  }
});

it("withholds unrendered, empty, failed and oversized captures and rejects foreign owners", async () => {
  const f = await fixture();
  const unrendered = f.create();
  const first = mock.views.at(-1)!;
  first.webContents.emit("did-stop-loading");
  await expect(
    f.host.thumbnail(f.event, {
      attachmentId: f.attached.attachmentId,
      pageId: unrendered.id,
    })
  ).resolves.toBeNull();
  expect(first.webContents.capturePage).not.toHaveBeenCalled();
  f.host.closeAll();
  const rendered = await renderedFixture();
  const other = await fixture("eac20941e6a410aa", rendered.host);
  await expect(
    rendered.host.thumbnail(other.event, {
      attachmentId: other.attached.attachmentId,
      pageId: rendered.page.id,
    })
  ).rejects.toThrow("browser_page_unavailable");
  const { image, resized } = compositorImage();
  rendered.view.webContents.capturePage.mockRejectedValueOnce(
    new Error("Compositor unavailable")
  );
  await expect(
    rendered.host.thumbnail(rendered.event, rendered.target)
  ).resolves.toBeNull();
  rendered.view.webContents.capturePage.mockResolvedValue(image);
  vi.spyOn(image, "isEmpty").mockReturnValueOnce(true);
  await expect(
    rendered.host.thumbnail(rendered.event, rendered.target)
  ).resolves.toBeNull();
  resized.toJPEG.mockReturnValue(
    Buffer.alloc(DesktopBrowser.MAX_THUMBNAIL_BYTES + 1)
  );
  await expect(
    rendered.host.thumbnail(rendered.event, rendered.target)
  ).resolves.toBeNull();
  rendered.host.closeAll();
});

function settingsFixture() {
  const window = new BrowserWindow() as unknown as FakeWindow;
  window.webContents.url = "https://grida.co/desktop/settings#browser";
  window.webContents.mainFrame.url = window.webContents.url;
  const event = {
    sender: window.webContents,
    senderFrame: window.webContents.mainFrame,
  } as unknown as IpcMainInvokeEvent;
  return { window, event };
}

it("requires Main's trusted workspace confirmation and preserves browser data on cancellation", async () => {
  const f = await fixture();
  f.create();
  const settings = settingsFixture();
  const workspaceId = "eac20941e6a410aa";
  const lookup = vi
    .spyOn(f.host.options, "resolveWorkspace")
    .mockResolvedValue({ name: "Trusted portfolio", root: "/work/portfolio" });
  await expect(
    f.host.clearWorkspaceData(settings.event, { workspaceId })
  ).resolves.toBe(false);
  expect(mock.confirm).toHaveBeenCalledWith(
    settings.window,
    expect.objectContaining({
      detail: expect.stringMatching(
        /Trusted portfolio[\s\S]*Workspace: \/work\/portfolio/
      ),
      buttons: ["Cancel", "Clear website data"],
      defaultId: 0,
      cancelId: 0,
    })
  );
  expect(lookup).toHaveBeenCalledExactlyOnceWith(workspaceId);
  expect(f.host.snapshot(f.event, f.attached.attachmentId).pages).toHaveLength(
    1
  );
  expect(
    mock.sessions.get(`persist:grida-browser-workspace-${workspaceId}`)!
      .clearStorageData
  ).not.toHaveBeenCalled();
  f.host.closeAll();
});

it("clears the confirmed workspace across windows without granting Settings page authority", async () => {
  const f = await fixture();
  f.create();
  const peer = await fixture("eac20941e6a410aa", f.host);
  peer.create();
  const other = await fixture("1234567890abcdef", f.host);
  const otherPage = other.create();
  const settings = settingsFixture();
  const workspaceId = "eac20941e6a410aa";
  const lookup = vi
    .spyOn(f.host.options, "resolveWorkspace")
    .mockResolvedValue({ name: "Portfolio" });
  mock.confirm.mockResolvedValueOnce({ response: 1 });
  await expect(
    f.host.clearWorkspaceData(settings.event, { workspaceId })
  ).resolves.toBe(true);
  expect(lookup).toHaveBeenCalledTimes(2);
  expect(f.host.snapshot(f.event, f.attached.attachmentId).pages).toEqual([]);
  expect(f.host.snapshot(peer.event, peer.attached.attachmentId).pages).toEqual(
    []
  );
  expect(
    f.host.snapshot(other.event, other.attached.attachmentId).pages[0].id
  ).toBe(otherPage.id);
  expect(
    mock.sessions.get(`persist:grida-browser-workspace-${workspaceId}`)!
      .clearStorageData
  ).toHaveBeenCalledOnce();
  await expect(f.host.attach(settings.event, workspaceId)).rejects.toThrow(
    "browser_owner_invalid"
  );
  await expect(
    f.host.clearSession(settings.event, {
      attachmentId: f.attached.attachmentId,
    })
  ).rejects.toThrow("browser_owner_invalid");
  f.host.closeAll();
});

it("denies management to workspace callers, subframes, guests and caller-supplied options", async () => {
  const f = await fixture();
  f.create();
  const settings = settingsFixture();
  const workspaceId = "eac20941e6a410aa";
  const request = { workspaceId };
  await expect(f.host.clearWorkspaceData(f.event, request)).rejects.toThrow(
    "browser_settings_expired"
  );
  const subframe = {
    ...settings.event,
    senderFrame: { url: settings.window.webContents.url },
  } as unknown as IpcMainInvokeEvent;
  await expect(f.host.clearWorkspaceData(subframe, request)).rejects.toThrow(
    "browser_settings_expired"
  );
  const guest = mock.views.at(-1)!.webContents;
  guest.url = settings.window.webContents.url;
  guest.mainFrame.url = guest.url;
  await expect(
    f.host.clearWorkspaceData(
      {
        sender: guest,
        senderFrame: guest.mainFrame,
      } as unknown as IpcMainInvokeEvent,
      request
    )
  ).rejects.toThrow("browser_settings_expired");
  await expect(
    f.host.clearWorkspaceData(settings.event, {
      workspaceId,
      name: "Injected",
      confirmed: true,
    })
  ).rejects.toThrow("browser_workspace_invalid");
  vi.spyOn(settings.window.webContents, "isLoadingMainFrame").mockReturnValue(
    true
  );
  await expect(
    f.host.clearWorkspaceData(settings.event, request)
  ).rejects.toThrow("browser_settings_expired");
  expect(mock.confirm).not.toHaveBeenCalled();
  f.host.closeAll();
});

it("refuses unregistered workspaces and catalog identity changes after confirmation", async () => {
  const f = await fixture();
  const settings = settingsFixture();
  const request = { workspaceId: "eac20941e6a410aa" };
  const lookup = vi
    .spyOn(f.host.options, "resolveWorkspace")
    .mockResolvedValueOnce(null);
  await expect(
    f.host.clearWorkspaceData(settings.event, request)
  ).rejects.toThrow("browser_workspace_unavailable");
  expect(mock.confirm).not.toHaveBeenCalled();
  lookup
    .mockResolvedValueOnce({ name: "Portfolio" })
    .mockResolvedValueOnce({ name: "Renamed" });
  mock.confirm.mockResolvedValueOnce({ response: 1 });
  await expect(
    f.host.clearWorkspaceData(settings.event, request)
  ).rejects.toThrow("browser_workspace_changed");
  expect(mock.sessions.size).toBe(0);
  lookup
    .mockResolvedValueOnce({ name: "Portfolio", root: "/work/one" })
    .mockResolvedValueOnce({ name: "Portfolio", root: "/work/two" });
  mock.confirm.mockResolvedValueOnce({ response: 1 });
  await expect(
    f.host.clearWorkspaceData(settings.event, request)
  ).rejects.toThrow("browser_workspace_changed");
  expect(mock.sessions.size).toBe(0);
  f.host.closeAll();
});

it("revokes Settings clearance on navigation during catalog reads or native confirmation", async () => {
  for (const phase of ["catalog", "confirmation", "recheck"] as const) {
    const f = await fixture();
    const settings = settingsFixture();
    const lookup = vi.spyOn(f.host.options, "resolveWorkspace");
    const navigate = () =>
      settings.window.webContents.emit("did-start-navigation", {
        isMainFrame: true,
      });
    lookup.mockImplementation(async () => {
      if (phase === "catalog") navigate();
      return { name: "Portfolio" };
    });
    if (phase === "recheck")
      lookup
        .mockResolvedValueOnce({ name: "Portfolio" })
        .mockImplementationOnce(async () => {
          navigate();
          return { name: "Portfolio" };
        });
    mock.confirm.mockImplementationOnce(async () => {
      if (phase === "confirmation") navigate();
      return { response: 1 };
    });
    await expect(
      f.host.clearWorkspaceData(settings.event, {
        workspaceId: "eac20941e6a410aa",
      })
    ).rejects.toThrow("browser_settings_expired");
    expect(mock.sessions.size).toBe(0);
    expect(
      settings.window.webContents.listenerCount("did-start-navigation")
    ).toBe(0);
    f.host.closeAll();
    mock.confirm.mockReset();
  }
});

it("rechecks the Settings role after confirmation and shares the existing workspace clearing lock", async () => {
  const f = await fixture();
  const settings = settingsFixture();
  const request = { workspaceId: "eac20941e6a410aa" };
  mock.confirm.mockImplementationOnce(async () => {
    f.revoke();
    return { response: 1 };
  });
  await expect(
    f.host.clearWorkspaceData(settings.event, request)
  ).rejects.toThrow("browser_settings_expired");
  expect(mock.sessions.size).toBe(0);

  const active = await fixture();
  active.create();
  const profile = mock.sessions.get(
    `persist:grida-browser-workspace-${request.workspaceId}`
  )!;
  let release!: () => void;
  profile.closeAllConnections.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      })
  );
  const clearing = active.host.clearSession(active.event, {
    attachmentId: active.attached.attachmentId,
  });
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  mock.confirm.mockResolvedValueOnce({ response: 1 });
  await expect(
    active.host.clearWorkspaceData(settings.event, request)
  ).rejects.toThrow("browser_session_busy");
  release();
  await clearing;
  expect(profile.clearStorageData).toHaveBeenCalledOnce();
  active.host.closeAll();
});
