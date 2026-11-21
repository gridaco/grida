// GRIDA-SEC-016 — actual guest admission, document lifetime and profile isolation.
import { afterEach, beforeEach, expect, it, vi, type Mock } from "vitest";
import type { EventEmitter } from "node:events";
import type {
  IpcMainInvokeEvent,
  Session,
  WebContents,
  WebPreferences,
} from "electron";
import { DesktopBrowser } from "@grida/desktop-bridge";

const historyDirectories: string[] = [];

type FakeImage = {
  isEmpty(): boolean;
  getSize(): { width: number; height: number };
  resize: Mock<
    (options: { width: number; height: number; quality?: string }) => FakeImage
  >;
  toJPEG: Mock<(quality: number) => Buffer>;
};
type FakeContents = EventEmitter & {
  ipc: EventEmitter;
  id: number;
  url: string;
  mainFrame: { url: string };
  destroyed: boolean;
  focused: boolean;
  type: string;
  hostWebContents: FakeContents | null;
  session: FakeSession | null;
  getLastWebPreferences(): WebPreferences;
  preferences: WebPreferences;
  title: string;
  getTitle(): string;
  getURL(): string;
  getType(): string;
  isDestroyed(): boolean;
  isFocused(): boolean;
  isLoading(): boolean;
  isLoadingMainFrame(): boolean;
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
type FakeWindow = EventEmitter & {
  webContents: FakeContents;
  destroyed: boolean;
  focused: boolean;
  isDestroyed(): boolean;
  isFocused(): boolean;
};
type BeforeRequest = (
  details: { url: string; resourceType: string; webContentsId: number },
  callback: (response: { cancel: boolean }) => void
) => void;
type FakeSession = EventEmitter & {
  fetch: Mock<Session["fetch"]>;
  storagePath: string | null;
  webRequest: {
    onBeforeRequest: Mock<
      (filter: { urls: string[] }, handler: BeforeRequest) => void
    >;
  };
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
  guests: [] as FakeContents[],
  sessions: new Map<string, FakeSession>(),
  next: 1,
  newContents: null as (() => FakeContents) | null,
  savePath: undefined as string | undefined,
  beforeLoad: null as ((contents: FakeContents) => void) | null,
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
  mock.guests.length = 0;
  mock.sessions.clear();
  mock.savePath = undefined;
  mock.beforeLoad = null;
  mock.confirm.mockReset().mockResolvedValue({ response: 0 });
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await Promise.all(
    historyDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true }))
  );
});
vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  class Contents extends EventEmitter {
    ipc = new EventEmitter();
    id = mock.next++;
    url = "https://grida.co/desktop/workspace?id=eac20941e6a410aa";
    mainFrame = { url: this.url };
    destroyed = false;
    focused = false;
    type = "window";
    hostWebContents: FakeContents | null = null;
    session: FakeSession | null = null;
    preferences: WebPreferences = {};
    getLastWebPreferences = () => this.preferences;
    title = "Fixture title";
    getTitle = () => this.title;
    getURL = () => this.url;
    getType = () => this.type;
    isDestroyed = () => this.destroyed;
    isFocused = () => this.focused;
    isLoading = () => false;
    isLoadingMainFrame = () => false;
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
    loadURL = vi.fn<(url: string, options?: unknown) => Promise<void>>(
      async (url) => {
        mock.beforeLoad?.(this);
        this.url = url;
      }
    );
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
  mock.newContents = () => new Contents();
  class Window extends EventEmitter {
    webContents = new Contents();
    destroyed = false;
    focused = true;
    isDestroyed = () => this.destroyed;
    isFocused = () => this.focused;
    isVisible = () => true;
    show = vi.fn<(...args: unknown[]) => void>();
    showInactive = vi.fn<(...args: unknown[]) => void>();
    focus = vi.fn<() => void>(() => {
      this.focused = true;
    });
    destroy = vi.fn<() => void>(() => {
      this.destroyed = true;
      this.webContents.close();
      this.emit("closed");
    });
    loadURL = vi.fn<(url: string, options?: unknown) => Promise<void>>(
      (url: string, options?: unknown) => this.webContents.loadURL(url, options)
    );
    constructor(options?: {
      webContents?: Contents;
      webPreferences?: WebPreferences;
    }) {
      super();
      if (options?.webContents) this.webContents = options.webContents;
      else if (options?.webPreferences) {
        this.webContents.session = options.webPreferences
          .session as unknown as FakeSession;
        this.webContents.preferences = options.webPreferences;
        this.webContents.url = "";
      }
      mock.owners.set(this.webContents, this);
    }
    static getAllWindows() {
      return [...new Set(mock.owners.values())];
    }
    static fromWebContents(contents: unknown) {
      return mock.owners.get(contents) ?? null;
    }
  }
  const fromPartition = vi.fn<(key: string) => FakeSession>((key) => {
    if (!mock.sessions.has(key))
      mock.sessions.set(
        key,
        Object.assign(new EventEmitter(), {
          storagePath: null,
          fetch: vi.fn<Session["fetch"]>(
            async () => new Response(null, { status: 404 })
          ),
          webRequest: {
            onBeforeRequest:
              vi.fn<
                (filter: { urls: string[] }, handler: BeforeRequest) => void
              >(),
          },
          setDisplayMediaRequestHandler: vi.fn<(...args: unknown[]) => void>(),
          setCertificateVerifyProc: vi.fn<(...args: unknown[]) => void>(),
          setPermissionRequestHandler: vi.fn<(...args: unknown[]) => void>(),
          setPermissionCheckHandler: vi.fn<(...args: unknown[]) => void>(),
          setDevicePermissionHandler: vi.fn<(...args: unknown[]) => void>(),
          closeAllConnections: vi.fn<() => Promise<void>>(async () => {}),
          clearStorageData: vi.fn<() => Promise<void>>(async () => {}),
          clearCache: vi.fn<() => Promise<void>>(async () => {}),
          clearAuthCache: vi.fn<() => Promise<void>>(async () => {}),
        })
      );
    return mock.sessions.get(key)!;
  });
  return {
    BrowserWindow: Window,
    webContents: { create: () => new Contents() },
    session: { fromPartition },
    Menu: {
      buildFromTemplate: vi.fn<() => { popup: (...args: unknown[]) => void }>(
        () => ({
          popup: vi.fn<(...args: unknown[]) => void>(),
        })
      ),
    },
    shell: { openExternal: vi.fn<() => Promise<void>>(async () => {}) },
    dialog: {
      showMessageBox: mock.confirm,
      showMessageBoxSync: vi.fn<() => number>(() => 0),
      showSaveDialogSync: vi.fn<() => string | undefined>(() => mock.savePath),
    },
  };
});
import { BrowserWindow, session } from "electron";
import { DesktopBrowserHost } from "./browser-host";
import { BrowserHistory } from "./browser-history";
import type { BrowserDownloads } from "./browser-downloads";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const native = (contents: FakeContents) => contents as unknown as WebContents;
function openWindow(
  guest: FakeContents,
  url: string,
  extra: Record<string, unknown> = {}
) {
  return (
    guest.setWindowOpenHandler.mock.calls[0]![0] as unknown as (
      details: Record<string, unknown>
    ) => {
      action: string;
      createWindow?: (
        options: import("electron").BrowserWindowConstructorOptions
      ) => WebContents;
      overrideBrowserWindowOptions?: { webPreferences: WebPreferences };
    }
  )({
    url,
    disposition: "new-window",
    referrer: {
      url: "https://example.com/",
      policy: "strict-origin-when-cross-origin",
    },
    ...extra,
  });
}
function shellFixture() {
  const window = new BrowserWindow() as unknown as FakeWindow;
  const event = {
    sender: window.webContents,
    senderFrame: window.webContents.mainFrame,
  } as unknown as IpcMainInvokeEvent;
  return { window, event };
}
async function fixture(
  workspace = "eac20941e6a410aa",
  sharedHost?: DesktopBrowserHost,
  history?: BrowserHistory,
  downloads?: BrowserDownloads
) {
  const { window, event } = shellFixture();
  window.webContents.url = `https://grida.co/desktop/workspace?id=${workspace}`;
  window.webContents.mainFrame.url = window.webContents.url;
  let admitted = true;
  const host =
    sharedHost ??
    new DesktopBrowserHost({
      editorOrigin: "https://grida.co",
      history,
      downloads,
      decodeFavicon: async (dataUrl) =>
        DesktopBrowser.parseFavicon({ dataUrl }),
      admitWindow: () => admitted,
      workspaceExists: async () => true,
    });
  const attached = await host.attach(event, workspace);
  const target = (page: DesktopBrowser.Page) => ({
    attachmentId: attached.attachmentId,
    pageId: page.id,
  });
  const descriptor = () =>
    host.create(event, {
      attachmentId: attached.attachmentId,
      url: "https://example.com/",
    });
  const beginMount = (page: DesktopBrowser.Page) => {
    const reservation = host.reserveMount(event, target(page));
    const preferences: WebPreferences = {
      partition: "persist:forged",
      preload: "/untrusted.cjs",
      nodeIntegration: true,
      sandbox: false,
      additionalArguments: ["--untrusted"],
    };
    const params = {
      src: reservation.src,
      httpreferrer: "https://forged.invalid",
      useragent: "forged",
    };
    const preventDefault = vi.fn<() => void>();
    host.willAttach(
      native(window.webContents),
      { preventDefault },
      preferences,
      params
    );
    expect(preventDefault).not.toHaveBeenCalled();
    const guest = mock.newContents!();
    guest.preferences = { ...preferences };
    guest.type = "webview";
    guest.url = "";
    guest.hostWebContents = window.webContents;
    guest.session = preferences.session as unknown as FakeSession;
    mock.owners.set(guest, window);
    mock.guests.push(guest);
    host.createdContents(native(guest));
    return { guest, preferences, params, reservation };
  };
  const mount = (page: DesktopBrowser.Page) => {
    const result = beginMount(page);
    host.didAttach(native(window.webContents), native(result.guest));
    return result;
  };
  const create = () => {
    const page = descriptor();
    mount(page);
    return page;
  };
  return {
    window,
    event,
    host,
    attached,
    target,
    descriptor,
    beginMount,
    mount,
    create,
    revoke: () => {
      admitted = false;
      host.closeAll();
    },
  };
}

it("creates a descriptor then registers only its actual guest with Main-owned session/preferences before website load", async () => {
  const f = await fixture();
  const page = f.descriptor();
  expect(page.mounted).toBe(false);
  expect(mock.guests).toHaveLength(0);
  const { guest, preferences, params, reservation } = f.beginMount(page);
  expect(preferences).toMatchObject({
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    webviewTag: false,
    disableDialogs: false,
    disablePopups: false,
    backgroundThrottling: true,
    navigateOnDragDrop: true,
  });
  expect(preferences.preload).toMatch(/browser-guest-preload\.js$/);
  expect(preferences.additionalArguments).toBeUndefined();
  expect(preferences.partition).toBeUndefined();
  expect(params).toEqual({ allowpopups: true });
  expect(guest.loadURL).not.toHaveBeenCalled();
  expect(guest.session).toBe(mock.sessions.get("persist:grida-browser"));
  f.host.didAttach(native(f.window.webContents), native(guest));
  expect(guest.loadURL).toHaveBeenCalledExactlyOnceWith("https://example.com/");
  expect(
    f.host.snapshot(f.event, f.attached.attachmentId).pages[0].mounted
  ).toBe(true);
  expect(() => f.host.reserveMount(f.event, f.target(page))).toThrow(
    "browser_mount_unavailable"
  );
  const denied = vi.fn<() => void>();
  f.host.willAttach(
    native(f.window.webContents),
    { preventDefault: denied },
    {},
    { src: reservation.src }
  );
  expect(denied).toHaveBeenCalled();
  f.host.closeAll();
});

it("denies forged, foreign and overlapping candidates without trusting partitions or guest IDs", async () => {
  const f = await fixture();
  const page = f.descriptor();
  const src = f.host.reserveMount(f.event, f.target(page)).src;
  const other = await fixture("eac20941e6a410aa", f.host);
  const foreign = vi.fn<() => void>();
  f.host.willAttach(
    native(other.window.webContents),
    { preventDefault: foreign },
    {},
    { src }
  );
  expect(foreign).toHaveBeenCalled();
  const forged = vi.fn<() => void>();
  f.host.willAttach(
    native(f.window.webContents),
    { preventDefault: forged },
    {},
    {
      src: DesktopBrowser.MOUNT_URL_PREFIX + "forged",
      partition: "persist:grida-browser",
    }
  );
  expect(forged).toHaveBeenCalled();
  const first = f.beginMount(page);
  const secondPage = f.descriptor();
  const second = f.host.reserveMount(f.event, f.target(secondPage));
  const overlap = vi.fn<() => void>();
  f.host.willAttach(
    native(f.window.webContents),
    { preventDefault: overlap },
    {},
    { src: second.src }
  );
  expect(overlap).toHaveBeenCalled();
  const impostor = mock.newContents!();
  f.host.didAttach(native(f.window.webContents), native(impostor));
  expect(impostor.close).toHaveBeenCalled();
  expect(first.guest.loadURL).not.toHaveBeenCalled();
  f.host.didAttach(native(f.window.webContents), native(first.guest));
  expect(
    f.host.snapshot(f.event, f.attached.attachmentId).pages[0].mounted
  ).toBe(true);
  const nested = vi.fn<() => void>();
  f.host.willAttach(
    native(first.guest),
    { preventDefault: nested },
    {},
    { src: second.src }
  );
  expect(nested).toHaveBeenCalled();
  f.host.closeAll();
});

it("expires one-use mount claims with a bounded mount failure and permits an explicit retry", async () => {
  vi.useFakeTimers();
  const f = await fixture();
  const page = f.descriptor();
  const old = f.host.reserveMount(f.event, f.target(page));
  expect(f.host.reserveMount(f.event, f.target(page))).toEqual(old);
  await vi.advanceTimersByTimeAsync(15_000);
  expect(
    f.host.snapshot(f.event, f.attached.attachmentId).pages[0].failure
  ).toMatchObject({ kind: "mount", code: "timeout" });
  expect(() => f.host.reserveMount(f.event, f.target(page))).toThrow(
    "browser_mount_unavailable"
  );
  f.host.reload(f.event, f.target(page));
  expect(f.host.reserveMount(f.event, f.target(page)).src).not.toBe(old.src);
  const denied = vi.fn<() => void>();
  f.host.willAttach(
    native(f.window.webContents),
    { preventDefault: denied },
    {},
    { src: old.src }
  );
  expect(denied).toHaveBeenCalled();
  f.host.closeAll();
});

it("retires the workspace browser when the shell navigates in page to Welcome", async () => {
  const f = await fixture();
  const page = f.descriptor();
  const { guest } = f.mount(page);
  const { webContents: shell } = f.window;
  const workspace = shell.url;
  const welcome = "https://grida.co/desktop/welcome";
  shell.emit("did-start-navigation", {
    isMainFrame: true,
    isSameDocument: true,
    url: welcome,
  });
  shell.url = welcome;
  shell.mainFrame.url = welcome;
  shell.emit("did-navigate-in-page", {}, welcome, true);

  expect(guest.close).toHaveBeenCalledWith({ waitForBeforeUnload: false });
  // Returning to the same URL cannot revive the previous page attachment.
  shell.url = workspace;
  shell.mainFrame.url = workspace;
  shell.emit("did-navigate-in-page", {}, workspace, true);
  expect(() => f.host.snapshot(f.event, f.attached.attachmentId)).toThrow(
    "browser_attachment_expired"
  );
  f.host.closeAll();
});

it("ends claimed guests before registration when their document attachment is revoked", async () => {
  const f = await fixture();
  const page = f.descriptor();
  const { guest, reservation } = f.beginMount(page);
  await f.host.detach(f.event, f.attached.attachmentId);
  expect(guest.close).toHaveBeenCalledWith({ waitForBeforeUnload: false });
  f.host.didAttach(native(f.window.webContents), native(guest));
  expect(guest.loadURL).not.toHaveBeenCalled();
  const next = await f.host.attach(f.event, "eac20941e6a410aa");
  expect(next.pages).toEqual([]);
  const denied = vi.fn<() => void>();
  f.host.willAttach(
    native(f.window.webContents),
    { preventDefault: denied },
    {},
    { src: reservation.src }
  );
  expect(denied).toHaveBeenCalled();
  f.host.closeAll();
});

it("denies guest/subframe IPC and stale leases or pages from another owner", async () => {
  const f = await fixture();
  const page = f.create();
  const guest = mock.guests.at(-1)!;
  await expect(
    f.host.attach(
      {
        sender: guest,
        senderFrame: guest.mainFrame,
      } as unknown as IpcMainInvokeEvent,
      "eac20941e6a410aa"
    )
  ).rejects.toThrow("browser_owner_invalid");
  expect(() =>
    f.host.snapshot(
      {
        ...f.event,
        senderFrame: { url: f.window.webContents.url },
      } as unknown as IpcMainInvokeEvent,
      f.attached.attachmentId
    )
  ).toThrow("browser_owner_invalid");
  const peer = await fixture("eac20941e6a410aa", f.host);
  expect(() =>
    f.host.close(peer.event, {
      attachmentId: peer.attached.attachmentId,
      pageId: page.id,
    })
  ).toThrow("browser_page_unavailable");
  const next = await f.host.attach(f.event, "eac20941e6a410aa");
  expect(next.pages).toEqual([]);
  expect(guest.close).toHaveBeenCalled();
  expect(() => f.host.snapshot(f.event, f.attached.attachmentId)).toThrow(
    "browser_attachment_expired"
  );
  f.host.closeAll();
});

it.each([
  "file:///tmp/local.html",
  "grida-workspace://local/file",
  "http://user:pass@example.com/",
])(
  "rejects forbidden Main requests through the browser session: %s",
  async (url) => {
    const f = await fixture();
    f.create();
    const guest = mock.guests.at(-1)!;
    const filter = guest.session!.webRequest.onBeforeRequest.mock.calls[0]![1];
    const callback = vi.fn<(result: { cancel: boolean }) => void>();
    filter(
      { url, resourceType: "mainFrame", webContentsId: guest.id },
      callback
    );
    expect(callback).toHaveBeenCalledExactlyOnceWith({ cancel: true });
    filter(
      {
        url: "https://example.com/",
        resourceType: "mainFrame",
        webContentsId: guest.id,
      },
      callback
    );
    expect(callback).toHaveBeenLastCalledWith({ cancel: false });
    const page = f.host.snapshot(f.event, f.attached.attachmentId).pages[0];
    expect(page.failure).toMatchObject({ kind: "navigation", code: "blocked" });
    f.host.closeAll();
  }
);

it("denies native/private URLs while retaining ordinary subframes and origin-scoped permission policy", async () => {
  const f = await fixture();
  const page = f.create();
  const guest = mock.guests.at(-1)!;
  expect(() =>
    f.host.navigate(f.event, { ...f.target(page), url: "file:///tmp/local" })
  ).toThrow("browser_url_invalid");
  const denied = vi.fn<() => void>();
  guest.emit("will-navigate", { preventDefault: denied }, "file:///tmp/local");
  expect(denied).toHaveBeenCalled();
  expect(openWindow(guest, "file:///tmp/local")).toEqual({
    action: "deny",
  });
  f.host.reload(f.event, f.target(page));
  const blank = vi.fn<() => void>();
  guest.emit("will-frame-navigate", {
    preventDefault: blank,
    url: "about:blank",
    isMainFrame: false,
  });
  expect(blank).not.toHaveBeenCalled();
  expect(
    f.host.snapshot(f.event, f.attached.attachmentId).pages[0].failure
  ).toBeNull();
  const permissions = guest.session!.setPermissionCheckHandler.mock
    .calls[0]![0] as () => boolean;
  expect(permissions()).toBe(false);
  f.host.closeAll();
});

it("gates inactive native input and focus while preserving multiple eligible live guests and text composition", async () => {
  const f = await fixture();
  const one = f.create();
  const first = mock.guests.at(-1)!;
  const two = f.create();
  const second = mock.guests.at(-1)!;
  expect(() => f.host.focus(f.event, f.target(one))).toThrow(
    "browser_page_inactive"
  );
  const inactive = vi.fn<() => void>();
  first.emit(
    "before-input-event",
    { preventDefault: inactive },
    { type: "keyDown", key: "a", isComposing: true }
  );
  expect(inactive).toHaveBeenCalled();
  f.host.setActive(f.event, { ...f.target(one), active: true });
  f.host.setActive(f.event, { ...f.target(two), active: true });
  f.host.focus(f.event, f.target(one));
  f.host.focus(f.event, f.target(two));
  expect(first.focus).toHaveBeenCalled();
  expect(second.focus).toHaveBeenCalled();
  expect(
    f.host
      .snapshot(f.event, f.attached.attachmentId)
      .pages.filter((page) => page.focused)
  ).toHaveLength(1);
  const composing = vi.fn<() => void>();
  second.emit(
    "before-input-event",
    { preventDefault: composing },
    { type: "keyDown", key: "l", meta: true, control: true, isComposing: true }
  );
  expect(composing).not.toHaveBeenCalled();
  const shortcut = vi.fn<() => void>();
  second.emit(
    "before-input-event",
    { preventDefault: shortcut },
    { type: "keyDown", key: "l", meta: true, control: true }
  );
  expect(shortcut).toHaveBeenCalled();
  expect(f.window.webContents.send).toHaveBeenCalledWith(
    "grida:workspace:command",
    "workspace.browser.focus-location"
  );
  const newTab = vi.fn<() => void>();
  second.emit(
    "before-input-event",
    { preventDefault: newTab },
    { type: "keyDown", key: "t", meta: true, control: true }
  );
  expect(newTab).toHaveBeenCalled();
  expect(f.window.webContents.send).toHaveBeenLastCalledWith(
    "grida:workspace:command",
    "workspace.tabs.new"
  );
  f.host.setActive(f.event, { ...f.target(two), active: false });
  expect(f.window.webContents.focus).toHaveBeenCalled();
  expect(second.close).not.toHaveBeenCalled();
  f.host.closeAll();
});

it("keeps native history and guest identity through active changes, then recreates a destroyed guest only after explicit retry", async () => {
  const f = await fixture();
  const page = f.create();
  const guest = mock.guests.at(-1)!;
  const browserSession = guest.session!;
  vi.spyOn(guest.navigationHistory, "canGoBack").mockReturnValue(true);
  f.host.back(f.event, f.target(page));
  expect(guest.navigationHistory.goBack).toHaveBeenCalled();
  f.host.setActive(f.event, { ...f.target(page), active: true });
  f.host.setActive(f.event, { ...f.target(page), active: false });
  expect(guest.close).not.toHaveBeenCalled();
  guest.close();
  expect(
    f.host.snapshot(f.event, f.attached.attachmentId).pages[0]
  ).toMatchObject({ mounted: false, failure: { kind: "renderer-gone" } });
  expect(browserSession.clearStorageData).not.toHaveBeenCalled();
  expect(() => f.host.reserveMount(f.event, f.target(page))).toThrow(
    "browser_mount_unavailable"
  );
  f.host.reload(f.event, f.target(page));
  const replacement = f.mount(page).guest;
  expect(replacement).not.toBe(guest);
  expect(replacement.session).toBe(browserSession);
  await f.host.close(f.event, f.target(page));
  expect(browserSession.clearStorageData).not.toHaveBeenCalled();
  f.host.closeAll();
});

it.each([
  { action: "back", url: "https://example.com/previous", status: 200 },
  { action: "forward", url: "https://example.com/next", status: 200 },
  { action: "website", url: "https://example.com/recovered", status: 200 },
  { action: "website", url: "https://example.com/not-found", status: 404 },
  { action: "website", url: "data:text/html,Recovered", status: -1 },
])(
  "recovers a navigation failure after $action commits $url",
  async ({ action, url, status }) => {
    const f = await fixture();
    const page = f.create();
    const guest = mock.guests.at(-1)!;
    guest.emit(
      "did-fail-load",
      {},
      -105,
      "ERR_NAME_NOT_RESOLVED",
      guest.url,
      true
    );
    const failure = f.host.snapshot(f.event, f.attached.attachmentId).pages[0]
      .failure;
    expect(failure).toMatchObject({ kind: "navigation", code: "-105" });
    if (action === "back") {
      vi.spyOn(guest.navigationHistory, "canGoBack").mockReturnValue(true);
      f.host.back(f.event, f.target(page));
    } else if (action === "forward") {
      vi.spyOn(guest.navigationHistory, "canGoForward").mockReturnValue(true);
      f.host.forward(f.event, f.target(page));
    }
    expect(guest.navigationHistory.goBack).toHaveBeenCalledTimes(
      action === "back" ? 1 : 0
    );
    expect(guest.navigationHistory.goForward).toHaveBeenCalledTimes(
      action === "forward" ? 1 : 0
    );
    guest.emit("did-start-navigation", {
      url,
      isMainFrame: true,
      isSameDocument: false,
      initiator: action === "website" ? guest.mainFrame : null,
    });
    // A pending navigation can still be canceled by beforeunload or fail.
    expect(
      f.host.snapshot(f.event, f.attached.attachmentId).pages[0].failure
    ).toEqual(failure);
    guest.url = url;
    guest.emit("did-navigate", {}, url, status);
    guest.emit("did-finish-load");
    guest.emit("did-stop-loading");
    expect(
      f.host.snapshot(f.event, f.attached.attachmentId).pages[0]
    ).toMatchObject({
      url,
      mounted: true,
      loading: false,
      failure: null,
    });
    expect(guest.close).not.toHaveBeenCalled();
    f.host.closeAll();
  }
);

it("retains a navigation failure through Stay, aborts, subframes and another failed load", async () => {
  const f = await fixture();
  f.create();
  const guest = mock.guests.at(-1)!;
  guest.emit(
    "did-fail-load",
    {},
    -105,
    "ERR_NAME_NOT_RESOLVED",
    guest.url,
    true
  );
  const failure = f.host.snapshot(f.event, f.attached.attachmentId).pages[0]
    .failure;
  const url = "https://example.com/retry";
  guest.emit("did-start-navigation", {
    url,
    isMainFrame: true,
    isSameDocument: false,
  });
  const stay = vi.fn<() => void>();
  guest.emit("will-prevent-unload", { preventDefault: stay });
  expect(stay).not.toHaveBeenCalled();
  guest.emit("did-fail-load", {}, -3, "ERR_ABORTED", url, true);
  guest.emit("did-start-navigation", {
    url,
    isMainFrame: false,
    isSameDocument: false,
  });
  guest.emit("did-frame-navigate", {}, url, 200, "OK", false);
  guest.emit("did-navigate-in-page", {}, guest.url, false);
  guest.emit("did-fail-load", {}, -102, "ERR_CONNECTION_REFUSED", url, false);
  guest.emit("did-finish-load");
  guest.emit("did-stop-loading");
  expect(
    f.host.snapshot(f.event, f.attached.attachmentId).pages[0].failure
  ).toEqual(failure);
  guest.emit("did-start-navigation", {
    url,
    isMainFrame: true,
    isSameDocument: false,
  });
  guest.emit("did-fail-load", {}, -102, "ERR_CONNECTION_REFUSED", url, true);
  guest.emit("did-stop-loading");
  expect(
    f.host.snapshot(f.event, f.attached.attachmentId).pages[0].failure
  ).toMatchObject({
    kind: "navigation",
    code: "-102",
  });
  expect(guest.close).not.toHaveBeenCalled();
  f.host.closeAll();
});

it("does not recover from a stale commit or revive a private document's retired guest", async () => {
  const f = await fixture();
  f.create();
  const guest = mock.guests.at(-1)!;
  guest.emit(
    "did-fail-load",
    {},
    -105,
    "ERR_NAME_NOT_RESOLVED",
    guest.url,
    true
  );
  const failure = f.host.snapshot(f.event, f.attached.attachmentId).pages[0]
    .failure;
  guest.emit("did-navigate", {}, "https://stale.example/", 200);
  expect(
    f.host.snapshot(f.event, f.attached.attachmentId).pages[0].failure
  ).toEqual(failure);
  const blocked = vi.fn<() => void>();
  const privateUrl = "file:///tmp/private.html";
  guest.emit("will-navigate", { preventDefault: blocked }, privateUrl);
  expect(blocked).toHaveBeenCalledOnce();
  expect(
    f.host.snapshot(f.event, f.attached.attachmentId).pages[0].failure
  ).toMatchObject({
    kind: "navigation",
    code: "blocked",
  });
  guest.url = privateUrl;
  guest.emit("did-navigate", {}, privateUrl, -1);
  const retired = f.host.snapshot(f.event, f.attached.attachmentId).pages[0];
  expect(retired).toMatchObject({
    mounted: false,
    failure: { code: "blocked" },
  });
  guest.url = "https://example.com/";
  guest.emit("did-navigate", {}, guest.url, 200);
  expect(f.host.snapshot(f.event, f.attached.attachmentId).pages[0]).toEqual(
    retired
  );
  f.host.closeAll();
});

it.each(["did-navigate", "did-fail-provisional-load", "did-fail-load"])(
  "ends late-attached pages when an already-started document navigation finishes via %s",
  async (eventName) => {
    const { window, event } = shellFixture();
    window.webContents.emit("did-start-navigation", {
      isMainFrame: true,
      isSameDocument: false,
    });
    const host = new DesktopBrowserHost({
      editorOrigin: "https://grida.co",
      admitWindow: () => true,
      workspaceExists: async () => true,
    });
    const attached = await host.attach(event, "eac20941e6a410aa");
    host.create(event, {
      attachmentId: attached.attachmentId,
    });
    window.webContents.emit(
      eventName,
      {},
      ...(eventName === "did-navigate"
        ? [window.webContents.url]
        : [-105, "failure", window.webContents.url, true])
    );
    expect(() => host.snapshot(event, attached.attachmentId)).toThrow(
      "browser_attachment_expired"
    );
    expect((await host.attach(event, "eac20941e6a410aa")).pages).toEqual([]);
    host.closeAll();
  }
);

it.each(["did-navigate", "did-fail-provisional-load", "did-fail-load", "role"])(
  "rejects pending registry admission after %s",
  async (eventName) => {
    const { window, event } = shellFixture();
    let release!: (registered: boolean) => void;
    const host = new DesktopBrowserHost({
      editorOrigin: "https://grida.co",
      admitWindow: () => true,
      workspaceExists: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    });
    window.webContents.emit("did-start-navigation", {
      isMainFrame: true,
      isSameDocument: false,
    });
    const pending = host.attach(event, "eac20941e6a410aa");
    if (eventName === "role") host.closeAll();
    else
      window.webContents.emit(
        eventName,
        {},
        ...(eventName === "did-navigate"
          ? [window.webContents.url]
          : [-105, "failure", window.webContents.url, true])
      );
    release(true);
    await expect(pending).rejects.toThrow("browser_attachment_expired");
    expect(window.webContents.listenerCount("did-navigate")).toBe(0);
    host.closeAll();
  }
);

it("closes guests on shell destruction without consulting a destroyed BrowserWindow accessor", async () => {
  const f = await fixture();
  f.create();
  const guest = mock.guests.at(-1)!;
  const sender = f.window.webContents;
  sender.destroyed = true;
  Object.defineProperty(f.window, "webContents", {
    get: () => {
      throw new Error("Object has been destroyed");
    },
  });
  expect(() => sender.emit("destroyed")).not.toThrow(
    "Object has been destroyed"
  );
  expect(guest.close).toHaveBeenCalled();
  expect(() => f.window.emit("closed")).not.toThrow(
    "Object has been destroyed"
  );
});

it("delegates accepted downloads independently of tab lifetime and cancels jobs only on full reset", async () => {
  const downloads = {
    accept: vi.fn<(...args: unknown[]) => void>(),
    cancelAll: vi.fn<(...args: unknown[]) => void>(),
  } as unknown as BrowserDownloads;
  const f = await fixture(undefined, undefined, undefined, downloads);
  f.create();
  const guest = mock.guests.at(-1)!;
  const event = { preventDefault: vi.fn<(...args: unknown[]) => void>() };
  const item = { cancel: vi.fn<(...args: unknown[]) => void>() };
  guest.session!.emit("will-download", event, item, guest);
  expect(downloads.accept).toHaveBeenCalledWith(
    event,
    item,
    guest,
    f.window,
    expect.any(Function),
    false
  );
  await f.host.detach(f.event, f.attached.attachmentId);
  expect(item.cancel).not.toHaveBeenCalled();
  expect(downloads.cancelAll).not.toHaveBeenCalled();
  mock.confirm.mockResolvedValueOnce({ response: 1 });
  await f.host.clearBrowsingData(settingsFixture().event);
  expect(downloads.cancelAll).toHaveBeenCalledOnce();
});

it("requires confirmation for delayed automation downloads and their child pages", async () => {
  const downloads = {
    accept: vi.fn<(...args: unknown[]) => void>(),
    cancelAll: vi.fn<(...args: unknown[]) => void>(),
  } as unknown as BrowserDownloads;
  const f = await fixture(undefined, undefined, undefined, downloads);
  const opener = f.create();
  const guest = mock.guests.at(-1)!;
  let live = true;
  const scope = {
    id: "download-test",
    sender: f.event.sender,
    frame: f.event.senderFrame!,
    live: () => live,
  };
  const observed = f.host.resolveAutomationPage(scope, {
    kind: "workbench",
    tabId: opener.id,
  });
  const downloadFrom = (source: WebContents) => {
    const event = { preventDefault: vi.fn<() => void>() };
    const item = {};
    const calls = vi.mocked(downloads.accept).mock.calls;
    const before = calls.length;
    guest.session!.emit("will-download", event, item, source);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(calls).toHaveLength(before + 1);
    const [acceptedEvent, acceptedItem, acceptedSource, , , confirmation] =
      calls[before];
    expect(acceptedEvent).toBe(event);
    expect(acceptedItem).toBe(item);
    expect(acceptedSource).toBe(source);
    return confirmation;
  };

  // Observing the page and stopping a load keep ordinary download preferences.
  observed.snapshot();
  observed.navigate("stop");
  expect(downloadFrom(native(guest))).toBe(false);

  const release = observed.beginInput();
  release();
  live = false;
  f.host.revokeAutomation(scope.id);
  expect(observed.current()).toBe(false);
  expect(downloadFrom(native(guest))).toBe(true);

  const leaf = "https://example.com/child";
  const popup = openWindow(guest, leaf);
  const popupContents = popup.createWindow!(
    popup.overrideBrowserWindowOptions!
  );
  expect(downloadFrom(popupContents)).toBe(true);

  f.host.setActive(f.event, { ...f.target(opener), active: true });
  guest.mainFrame.url = guest.url;
  f.host.guestLink(
    {
      sender: native(guest),
      senderFrame: guest.mainFrame,
    } as unknown as import("electron").IpcMainEvent,
    {
      url: leaf,
      documentUrl: guest.url,
      disposition: "foreground",
    }
  );
  expect(openWindow(guest, leaf).action).toBe("deny");
  const child = f.host.snapshot(f.event, f.attached.attachmentId).pages.at(-1)!;
  expect(child.id).not.toBe(opener.id);
  expect(downloadFrom(native(f.mount(child).guest))).toBe(true);

  const nextScope = { ...scope, id: "next-download-test", live: () => true };
  const newPage = f.host.openWorkbenchAutomationPage(nextScope, leaf);
  expect(downloadFrom(native(f.mount(newPage.snapshot()).guest))).toBe(true);

  const unrelated = f.create();
  const otherGuest = mock.guests.at(-1)!;
  const otherPage = f.host.resolveAutomationPage(nextScope, {
    kind: "workbench",
    tabId: unrelated.id,
  });
  expect(downloadFrom(native(otherGuest))).toBe(false);
  otherPage.navigate("goto", leaf);
  expect(downloadFrom(native(otherGuest))).toBe(true);
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
  const guest = mock.guests.at(-1)!;
  guest.emit("did-stop-loading");
  return { ...f, page, guest, request: f.target(page) };
}
it("captures a bounded thumbnail without activating or focusing an inactive guest", async () => {
  const f = await renderedFixture();
  const { image, resized } = compositorImage();
  f.guest.capturePage.mockResolvedValue(image);
  const result = await f.host.thumbnail(f.event, f.request);
  expect(DesktopBrowser.parseThumbnail(result)).not.toBeNull();
  expect(f.guest.capturePage).toHaveBeenCalledExactlyOnceWith(undefined, {
    stayHidden: true,
    stayAwake: false,
  });
  expect(f.guest.focus).not.toHaveBeenCalled();
  expect(resized.toJPEG).toHaveBeenCalledWith(60);
  f.host.closeAll();
});
it("limits concurrent thumbnails and preserves capture across focus-only changes", async () => {
  const f = await renderedFixture();
  const { image } = compositorImage();
  let release!: (image: FakeImage) => void;
  f.guest.capturePage.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const pending = f.host.thumbnail(f.event, f.request);
  await expect(f.host.thumbnail(f.event, f.request)).resolves.toBeNull();
  f.window.focused = false;
  f.window.emit("blur");
  release(image);
  await expect(pending).resolves.toMatchObject({ width: 240, height: 180 });
  f.host.closeAll();
});
it.each(["close", "detach", "navigate", "destroy"] as const)(
  "revokes or discards in-flight thumbnail pixels after %s",
  async (action) => {
    const f = await renderedFixture();
    const { image } = compositorImage();
    let release!: (image: FakeImage) => void;
    f.guest.capturePage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const pending = f.host.thumbnail(f.event, f.request);
    if (action === "close") await f.host.close(f.event, f.request);
    if (action === "detach")
      await f.host.detach(f.event, f.attached.attachmentId);
    if (action === "navigate")
      f.host.navigate(f.event, {
        ...f.request,
        url: "https://example.com/new",
      });
    if (action === "destroy") f.guest.close();
    release(image);
    const outcome = await pending.then(
      (value) => ({ value, error: null }),
      (error: Error) => ({ value: null, error: error.message })
    );
    expect(outcome).toEqual({
      value: null,
      error:
        action === "close"
          ? "browser_page_unavailable"
          : action === "detach"
            ? "browser_attachment_expired"
            : null,
    });
    f.host.closeAll();
  }
);
it("withholds unavailable or oversized thumbnails and refuses a foreign recipient", async () => {
  const f = await renderedFixture();
  const peer = await fixture("eac20941e6a410aa", f.host);
  await expect(
    f.host.thumbnail(peer.event, {
      attachmentId: peer.attached.attachmentId,
      pageId: f.page.id,
    })
  ).rejects.toThrow("browser_page_unavailable");
  await expect(f.host.thumbnail(f.event, f.request)).resolves.toBeNull();
  const { image, resized } = compositorImage();
  f.guest.capturePage.mockResolvedValue(image);
  resized.toJPEG.mockReturnValue(
    Buffer.alloc(DesktopBrowser.MAX_THUMBNAIL_BYTES + 1)
  );
  await expect(f.host.thumbnail(f.event, f.request)).resolves.toBeNull();
  f.host.closeAll();
});
it("bounds untrusted metadata and never emits zombie outcomes after page closure", async () => {
  const f = await fixture();
  const page = f.create();
  const guest = mock.guests.at(-1)!;
  guest.emit("page-title-updated", {}, "控制".repeat(1000) + "\n");
  const changes = f.window.webContents.send.mock.calls.filter(
    ([channel]) => channel === "grida:browser:changed"
  );
  for (const [, event] of changes)
    expect(DesktopBrowser.parseEvent(event)).not.toBeNull();
  await f.host.close(f.event, f.target(page));
  const calls = f.window.webContents.send.mock.calls.length;
  guest.emit("render-process-gone", {}, { reason: "crashed" });
  guest.emit("page-title-updated", {}, "stale");
  expect(f.window.webContents.send).toHaveBeenCalledTimes(calls);
  f.host.closeAll();
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

it("keeps a timed-out consumed claim as a tombstone so its late guest cannot claim a replacement mount", async () => {
  vi.useFakeTimers();
  const f = await fixture();
  const page = f.descriptor();
  const first = f.host.reserveMount(f.event, f.target(page));
  const preferences: WebPreferences = {};
  const accepted = vi.fn<() => void>();
  f.host.willAttach(
    native(f.window.webContents),
    { preventDefault: accepted },
    preferences,
    { src: first.src }
  );
  expect(accepted).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(15_000);
  f.host.reload(f.event, f.target(page));
  const next = f.host.reserveMount(f.event, f.target(page));
  const blocked = vi.fn<() => void>();
  f.host.willAttach(
    native(f.window.webContents),
    { preventDefault: blocked },
    {},
    { src: next.src }
  );
  expect(blocked).toHaveBeenCalled();
  const late = mock.newContents!();
  late.type = "webview";
  late.hostWebContents = f.window.webContents;
  late.session = preferences.session as unknown as FakeSession;
  f.host.createdContents(native(late));
  expect(late.close).toHaveBeenCalled();
  expect(late.loadURL).not.toHaveBeenCalled();
  const replacement = f.mount(page).guest;
  expect(replacement).not.toBe(late);
  expect(replacement.loadURL).toHaveBeenCalledExactlyOnceWith(
    "https://example.com/"
  );
  f.host.didAttach(native(f.window.webContents), native(late));
  expect(
    f.host.snapshot(f.event, f.attached.attachmentId).pages[0].mounted
  ).toBe(true);
  f.host.closeAll();
});

it("revokes unsupported full document loaders and closes them after the native navigation callback", async () => {
  const f = await fixture();
  const page = f.create();
  const guest = mock.guests.at(-1)!;
  guest.emit("did-start-navigation", {
    url: "blob:https://example.com/frame",
    isMainFrame: false,
    isSameDocument: false,
  });
  expect(guest.close).not.toHaveBeenCalled();
  guest.emit("did-start-navigation", {
    url: "file:///tmp/unsupported",
    isMainFrame: true,
    isSameDocument: false,
  });
  expect(guest.stop).not.toHaveBeenCalled();
  expect(guest.close).not.toHaveBeenCalled();
  expect(
    f.host.snapshot(f.event, f.attached.attachmentId).pages[0]
  ).toMatchObject({
    mounted: false,
    url: "https://example.com/",
    failure: { kind: "navigation", code: "blocked" },
  });
  await vi.waitFor(() => expect(guest.close).toHaveBeenCalled());
  f.host.reload(f.event, f.target(page));
  expect(f.mount(page).guest).not.toBe(guest);
  f.host.closeAll();
});

it.each(["session", "host", "type"] as const)(
  "rejects actual registration when the claimed guest's %s differs",
  async (field) => {
    const f = await fixture();
    const page = f.descriptor();
    const { guest } = f.beginMount(page);
    if (field === "session") guest.session = null;
    if (field === "host") guest.hostWebContents = null;
    if (field === "type") guest.type = "window";
    f.host.didAttach(native(f.window.webContents), native(guest));
    expect(guest.close).toHaveBeenCalled();
    expect(guest.loadURL).not.toHaveBeenCalled();
    expect(
      f.host.snapshot(f.event, f.attached.attachmentId).pages[0]
    ).toMatchObject({
      mounted: false,
      failure: { kind: "mount", code: "rejected" },
    });
    f.host.closeAll();
  }
);

it("bounds unavailable capture latency while retaining single-flight protection until the native capture settles", async () => {
  vi.useFakeTimers();
  const f = await renderedFixture();
  const { image } = compositorImage();
  let release!: (image: FakeImage) => void;
  f.guest.capturePage.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const pending = f.host.thumbnail(f.event, f.request);
  await vi.advanceTimersByTimeAsync(1500);
  await expect(pending).resolves.toBeNull();
  await expect(f.host.thumbnail(f.event, f.request)).resolves.toBeNull();
  expect(f.guest.capturePage).toHaveBeenCalledOnce();
  release(image);
  await Promise.resolve();
  f.guest.capturePage.mockResolvedValue(image);
  await expect(f.host.thumbnail(f.event, f.request)).resolves.toMatchObject({
    width: 240,
    height: 180,
  });
  f.host.closeAll();
});

it("does not let an old capture completion clear a replacement page's in-flight capture", async () => {
  const f = await renderedFixture();
  const { image } = compositorImage();
  let firstRelease!: (image: FakeImage) => void;
  f.guest.capturePage.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        firstRelease = resolve;
      })
  );
  const old = f.host
    .thumbnail(f.event, f.request)
    .catch((error: Error) => error.message);
  await f.host.close(f.event, f.request);
  const nextPage = f.create();
  const nextGuest = mock.guests.at(-1)!;
  nextGuest.emit("did-stop-loading");
  let secondRelease!: (image: FakeImage) => void;
  nextGuest.capturePage.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        secondRelease = resolve;
      })
  );
  const current = f.host.thumbnail(f.event, f.target(nextPage));
  firstRelease(image);
  await expect(old).resolves.toBe("browser_page_unavailable");
  await expect(
    f.host.thumbnail(f.event, f.target(nextPage))
  ).resolves.toBeNull();
  expect(nextGuest.capturePage).toHaveBeenCalledOnce();
  secondRelease(image);
  await expect(current).resolves.toMatchObject({ width: 240, height: 180 });
  f.host.closeAll();
});

const faviconDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVR4nGNwaDjwHwAFBAKAPJ4DgAAAAABJRU5ErkJggg==";
it("publishes icon cache changes through ordinary page revisions without changing strict page DTOs", async () => {
  const f = await fixture();
  const page = f.create();
  const guest = mock.guests.at(-1)!;
  const first = f.host.snapshot(f.event, f.attached.attachmentId);
  expect(f.host.favicon(f.event, f.target(page))).toBeNull();
  guest.emit("page-favicon-updated", {}, [faviconDataUrl]);
  await vi.waitFor(() =>
    expect(f.host.favicon(f.event, f.target(page))).toEqual({
      dataUrl: faviconDataUrl,
    })
  );
  const changed = f.host.snapshot(f.event, f.attached.attachmentId);
  expect(changed.revision).toBeGreaterThan(first.revision);
  expect(DesktopBrowser.parseSnapshot(changed)).not.toBeNull();
  expect(Object.hasOwn(changed.pages[0], "favicon")).toBe(false);
  expect(f.host.favicon(f.event, f.target(page))).toEqual({
    dataUrl: faviconDataUrl,
  });
  expect(f.host.favicon(f.event, f.target(page))).toEqual({
    dataUrl: faviconDataUrl,
  });
  expect(f.host.snapshot(f.event, f.attached.attachmentId).revision).toBe(
    changed.revision
  );
  expect(guest.session!.fetch).not.toHaveBeenCalled();
  guest.emit("did-start-navigation", {
    url: "https://example.com/#tab",
    isMainFrame: true,
    isSameDocument: true,
  });
  expect(f.host.favicon(f.event, f.target(page))).toEqual({
    dataUrl: faviconDataUrl,
  });
  guest.emit("did-start-navigation", {
    url: "https://example.com/next",
    isMainFrame: true,
    isSameDocument: false,
  });
  expect(f.host.favicon(f.event, f.target(page))).toBeNull();
  const peer = await fixture("eac20941e6a410aa", f.host);
  expect(() =>
    f.host.favicon(peer.event, {
      attachmentId: peer.attached.attachmentId,
      pageId: page.id,
    })
  ).toThrow("browser_page_unavailable");
  f.host.closeAll();
});

it.each([
  "navigate",
  "close",
  "clearBrowsingData",
  "crash",
  "destroy",
] as const)(
  "aborts icon networking and discards late results on %s",
  async (action) => {
    const f = await fixture();
    const page = f.create();
    const guest = mock.guests.at(-1)!;
    let release!: (response: Response) => void;
    guest.session!.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    guest.emit("page-favicon-updated", {}, ["https://example.com/icon.png"]);
    const signal = guest.session!.fetch.mock.calls[0]![1]!.signal!;
    if (action === "navigate")
      f.host.navigate(f.event, {
        ...f.target(page),
        url: "https://example.com/next",
      });
    if (action === "close") await f.host.close(f.event, f.target(page));
    if (action === "clearBrowsingData") {
      mock.confirm.mockResolvedValueOnce({ response: 1 });
      await f.host.clearBrowsingData(f.event);
    }
    if (action === "crash")
      guest.emit("render-process-gone", {}, { reason: "crashed" });
    if (action === "destroy") guest.close();
    expect(signal.aborted).toBe(true);
    const calls = f.window.webContents.send.mock.calls.length;
    release(
      new Response(
        Uint8Array.from(Buffer.from(faviconDataUrl.split(",")[1], "base64"))
      )
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(f.window.webContents.send).toHaveBeenCalledTimes(calls);
    const value = (() => {
      try {
        return f.host.favicon(f.event, f.target(page));
      } catch (error) {
        return (error as Error).message;
      }
    })();
    expect(value).toBe(
      action === "close" || action === "clearBrowsingData"
        ? "browser_page_unavailable"
        : null
    );
    f.host.closeAll();
  }
);

it("ignores late native icon events while a replacement document is committing", async () => {
  const f = await fixture();
  const page = f.create();
  const guest = mock.guests.at(-1)!;
  guest.emit("did-start-navigation", {
    url: "https://next.example/page",
    isMainFrame: true,
    isSameDocument: false,
  });
  guest.emit("page-favicon-updated", {}, [faviconDataUrl]);
  expect(f.host.favicon(f.event, f.target(page))).toBeNull();
  guest.url = "https://next.example/page";
  guest.emit("did-navigate", {}, guest.url);
  expect(f.host.favicon(f.event, f.target(page))).toBeNull();
  expect(f.host.snapshot(f.event, f.attached.attachmentId).pages[0].url).toBe(
    guest.url
  );
  guest.emit("did-stop-loading");
  await vi.waitFor(() =>
    expect(guest.session!.fetch).toHaveBeenCalledExactlyOnceWith(
      "https://next.example/favicon.ico",
      expect.any(Object)
    )
  );
  expect(f.host.favicon(f.event, f.target(page))).toBeNull();
  f.host.closeAll();
});

it("accepts favicon metadata only from the current guest frame and document nonce", async () => {
  const f = await fixture();
  const page = f.create();
  const guest = mock.guests.at(-1)!;
  guest.mainFrame.url = guest.url;
  const channel = "grida:browser-guest:favicons";
  const top = { sender: guest, senderFrame: guest.mainFrame };
  const candidates = [{ url: faviconDataUrl, type: "image/png", sizes: "" }];
  guest.emit("dom-ready");
  const token = guest.send.mock.lastCall![1];
  guest.ipc.emit(
    channel,
    { ...top, senderFrame: { ...top.senderFrame } },
    token,
    candidates
  );
  guest.ipc.emit(channel, top, "wrong-token", candidates);
  expect(guest.session!.fetch).not.toHaveBeenCalled();
  expect(f.host.favicon(f.event, f.target(page))).toBeNull();
  guest.ipc.emit(channel, top, token, candidates);
  await vi.waitFor(() =>
    expect(f.host.favicon(f.event, f.target(page))).not.toBeNull()
  );
  guest.emit("did-navigate", {}, guest.url, 200);
  guest.emit("dom-ready");
  const next = guest.send.mock.lastCall![1];
  expect(next).not.toBe(token);
  guest.ipc.emit(channel, top, token, candidates);
  await Promise.resolve();
  expect(f.host.favicon(f.event, f.target(page))).toBeNull();
  expect(guest.session!.fetch).not.toHaveBeenCalled();
  guest.ipc.emit(channel, top, next, candidates);
  await vi.waitFor(() =>
    expect(f.host.favicon(f.event, f.target(page))).not.toBeNull()
  );
  f.host.closeAll();
});

it("uses one persistent browser Session across workspaces and never clears it on page or owner teardown", async () => {
  const f = await fixture();
  const first = f.create();
  const firstGuest = mock.guests.at(-1)!;
  const peer = await fixture("1234567890abcdef", f.host);
  peer.create();
  const peerGuest = mock.guests.at(-1)!;
  expect(firstGuest.session).toBe(peerGuest.session);
  expect(mock.sessions.size).toBe(1);
  expect(
    Object.hasOwn(
      f.host.snapshot(f.event, f.attached.attachmentId).pages[0],
      "storageScope"
    )
  ).toBe(false);
  await f.host.close(f.event, f.target(first));
  await f.host.detach(peer.event, peer.attached.attachmentId);
  expect(firstGuest.session!.clearStorageData).not.toHaveBeenCalled();
  expect(firstGuest.session!.clearAuthCache).not.toHaveBeenCalled();
  expect(firstGuest.session!.closeAllConnections).not.toHaveBeenCalled();
  f.create();
  expect(mock.guests.at(-1)!.session).toBe(firstGuest.session);
  f.host.closeAll();
});

it("rejects legacy or caller-selected profile fields rather than silently using shared data", async () => {
  const f = await fixture();
  for (const selector of [
    { storageScope: "workspace" },
    { storageScope: "ephemeral" },
    { partition: "persist:account" },
    { profileId: "other" },
  ]) {
    expect(() =>
      f.host.create(f.event, {
        attachmentId: f.attached.attachmentId,
        ...selector,
      })
    ).toThrow("browser_request_invalid");
  }
  expect(mock.sessions.size).toBe(0);
  f.host.closeAll();
});

it("requires explicit global confirmation with Cancel as default and leaves all data on cancellation", async () => {
  const f = await fixture();
  f.create();
  const settings = settingsFixture();
  await expect(f.host.clearBrowsingData(settings.event)).resolves.toBe(false);
  expect(mock.confirm).toHaveBeenCalledWith(
    settings.window,
    expect.objectContaining({
      detail: expect.stringContaining("all windows"),
      buttons: ["Cancel", "Clear browsing data"],
      defaultId: 0,
      cancelId: 0,
    })
  );
  expect(f.host.snapshot(f.event, f.attached.attachmentId).pages).toHaveLength(
    1
  );
  expect(
    mock.sessions.get("persist:grida-browser")!.clearStorageData
  ).not.toHaveBeenCalled();
  f.host.closeAll();
});

it("clears all workspace windows under one global lock and blocks racing page work and admission", async () => {
  const f = await fixture();
  f.create();
  const peer = await fixture("1234567890abcdef", f.host);
  peer.create();
  const profile = mock.sessions.get("persist:grida-browser")!;
  let release!: () => void;
  profile.closeAllConnections.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  mock.confirm.mockResolvedValueOnce({ response: 1 });
  const clearing = f.host.clearBrowsingData(f.event);
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  expect(() => f.descriptor()).toThrow("browser_session_busy");
  expect(() => peer.descriptor()).toThrow("browser_session_busy");
  await expect(f.host.attach(peer.event, "1234567890abcdef")).rejects.toThrow(
    "browser_session_busy"
  );
  await expect(
    f.host.clearBrowsingData(settingsFixture().event)
  ).rejects.toThrow("browser_session_busy");
  release();
  await expect(clearing).resolves.toBe(true);
  expect(f.host.snapshot(f.event, f.attached.attachmentId).pages).toEqual([]);
  expect(f.host.snapshot(peer.event, peer.attached.attachmentId).pages).toEqual(
    []
  );
  expect(profile.clearStorageData).toHaveBeenCalledOnce();
  expect(profile.clearCache).toHaveBeenCalledOnce();
  expect(profile.clearAuthCache).toHaveBeenCalledOnce();
  f.create();
  expect(mock.guests.at(-1)!.session).toBe(profile);
  f.host.closeAll();
});

it("confirms and clears from Settings without an open workspace or workspace-catalog lookup", async () => {
  const host = new DesktopBrowserHost({
    editorOrigin: "https://grida.co",
    admitWindow: () => true,
    workspaceExists: vi.fn<() => Promise<boolean>>(async () => {
      throw new Error("not needed");
    }),
  });
  mock.confirm.mockResolvedValueOnce({ response: 1 });
  await expect(host.clearBrowsingData(settingsFixture().event)).resolves.toBe(
    true
  );
  expect(host.options.workspaceExists).not.toHaveBeenCalled();
  expect(
    mock.sessions.get("persist:grida-browser")!.clearStorageData
  ).toHaveBeenCalledOnce();
  host.closeAll();
});

it("denies global management to guests, subframes, other routes, loading documents and caller selectors", async () => {
  const f = await fixture();
  f.create();
  const settings = settingsFixture();
  const guest = mock.guests.at(-1)!;
  await expect(
    f.host.clearBrowsingData(settings.event, {
      workspaceId: "eac20941e6a410aa",
    })
  ).rejects.toThrow("browser_request_invalid");
  await expect(
    f.host.clearBrowsingData({
      ...settings.event,
      senderFrame: { url: settings.window.webContents.url },
    } as unknown as IpcMainInvokeEvent)
  ).rejects.toThrow("browser_clear_expired");
  guest.url = settings.window.webContents.url;
  guest.mainFrame.url = guest.url;
  await expect(
    f.host.clearBrowsingData({
      sender: guest,
      senderFrame: guest.mainFrame,
    } as unknown as IpcMainInvokeEvent)
  ).rejects.toThrow("browser_clear_expired");
  settings.window.webContents.url = "https://grida.co/desktop/tools";
  settings.window.webContents.mainFrame.url = settings.window.webContents.url;
  await expect(f.host.clearBrowsingData(settings.event)).rejects.toThrow(
    "browser_clear_expired"
  );
  vi.spyOn(f.window.webContents, "isLoadingMainFrame").mockReturnValue(true);
  await expect(f.host.clearBrowsingData(f.event)).rejects.toThrow(
    "browser_clear_expired"
  );
  expect(mock.confirm).not.toHaveBeenCalled();
  f.host.closeAll();
});

it.each(["navigation", "same-url-commit", "frame", "role"] as const)(
  "revokes pending global confirmation after %s",
  async (change) => {
    const f = await fixture();
    f.create();
    const settings = settingsFixture();
    mock.confirm.mockImplementationOnce(async () => {
      if (change === "navigation")
        settings.window.webContents.emit("did-start-navigation", {
          isMainFrame: true,
        });
      if (change === "same-url-commit")
        settings.window.webContents.emit(
          "did-navigate",
          {},
          settings.window.webContents.url
        );
      if (change === "frame")
        settings.window.webContents.mainFrame = {
          url: settings.window.webContents.url,
        };
      if (change === "role") f.revoke();
      return { response: 1 };
    });
    await expect(f.host.clearBrowsingData(settings.event)).rejects.toThrow(
      "browser_clear_expired"
    );
    expect(
      mock.sessions.get("persist:grida-browser")!.clearStorageData
    ).not.toHaveBeenCalled();
    expect(
      settings.window.webContents.listenerCount("did-start-navigation")
    ).toBe(0);
    f.host.closeAll();
  }
);

it.each(["page", "owner"] as const)(
  "drains an already-running %s closure before clearing shared storage",
  async (closing) => {
    const f = await fixture();
    const page = f.create();
    const guest = mock.guests.at(-1)!;
    const profile = guest.session!;
    guest.close.mockImplementationOnce(() => {});
    let pending: Promise<void | boolean> | undefined;
    if (closing === "page") pending = f.host.close(f.event, f.target(page));
    if (closing === "owner") f.host.closeAll();
    mock.confirm.mockResolvedValueOnce({ response: 1 });
    const cleared = f.host.clearBrowsingData(settingsFixture().event);
    await Promise.resolve();
    await Promise.resolve();
    expect(profile.clearStorageData).not.toHaveBeenCalled();
    expect(profile.closeAllConnections).not.toHaveBeenCalled();
    guest.destroyed = true;
    guest.emit("destroyed");
    await pending;
    await expect(cleared).resolves.toBe(true);
    expect(profile.clearStorageData).toHaveBeenCalledOnce();
    f.host.closeAll();
  }
);

it("revokes pending admission even if global clearing finishes before catalog lookup resolves", async () => {
  const { window, event } = shellFixture();
  let release!: (registered: boolean) => void;
  const host = new DesktopBrowserHost({
    editorOrigin: "https://grida.co",
    admitWindow: () => true,
    workspaceExists: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  const attaching = host.attach(event, "eac20941e6a410aa");
  mock.confirm.mockResolvedValueOnce({ response: 1 });
  await host.clearBrowsingData(settingsFixture().event);
  release(true);
  await expect(attaching).rejects.toThrow("browser_attachment_expired");
  expect(window.webContents.listenerCount("did-navigate")).toBe(0);
  host.closeAll();
});

it("enforces the page limit independently of the shared profile", async () => {
  const f = await fixture();
  for (let count = 0; count < DesktopBrowser.MAX_PAGES; count++) f.descriptor();
  expect(() => f.descriptor()).toThrow("browser_page_limit");
  expect(mock.sessions.size).toBe(1);
  f.host.closeAll();
});

it("clears only the shared browser Session and leaves account/provider Sessions untouched", async () => {
  const f = await fixture();
  f.create();
  const account = session.fromPartition("") as unknown as FakeSession;
  const provider = session.fromPartition(
    "persist:provider-network"
  ) as unknown as FakeSession;
  mock.confirm.mockResolvedValueOnce({ response: 1 });
  await f.host.clearBrowsingData(f.event);
  expect(
    mock.sessions.get("persist:grida-browser")!.clearStorageData
  ).toHaveBeenCalledOnce();
  for (const other of [account, provider]) {
    expect(other.clearStorageData).not.toHaveBeenCalled();
    expect(other.clearAuthCache).not.toHaveBeenCalled();
    expect(other.closeAllConnections).not.toHaveBeenCalled();
  }
  f.host.closeAll();
});

async function historyFixture() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "grida-browser-host-history-")
  );
  historyDirectories.push(directory);
  const history = await BrowserHistory.open(directory);
  return {
    ...(await fixture("eac20941e6a410aa", undefined, history)),
    history,
    directory,
  };
}
const historyRecent = { query: "", limit: 100 };
it("records only successful admitted top-level commits after load completion, with title refinement", async () => {
  const f = await historyFixture();
  f.create();
  const guest = mock.guests.at(-1)!;
  expect((await f.host.historyQuery(f.event, historyRecent)).entries).toEqual(
    []
  );
  guest.emit(
    "did-frame-navigate",
    {},
    "https://iframe.example/",
    200,
    "OK",
    false
  );
  guest.emit("did-finish-load");
  expect((await f.history.query(historyRecent)).entries).toEqual([]);
  guest.url = "https://example.com/good";
  guest.title = "Committed title";
  guest.emit("did-navigate", {}, guest.url, 200, "OK");
  expect((await f.history.query(historyRecent)).entries).toEqual([]);
  guest.emit("did-finish-load");
  expect((await f.history.query(historyRecent)).entries).toMatchObject([
    { url: guest.url, title: "Committed title" },
  ]);
  guest.emit("page-title-updated", {}, "Refined title");
  expect((await f.history.query(historyRecent)).entries[0].title).toBe(
    "Refined title"
  );
  await f.host.historyRemove(f.event, { url: guest.url });
  guest.emit("page-title-updated", {}, "Late removed title");
  await f.history.flush();
  expect((await f.history.query(historyRecent)).entries).toEqual([]);
  guest.url = "https://example.com/spa";
  guest.emit("did-navigate-in-page", {}, guest.url, true);
  expect((await f.history.query(historyRecent)).entries[0].url).toBe(guest.url);
  f.host.closeAll();
});

it.each([404, 500, -1])(
  "does not record a committed non-success status %s",
  async (status) => {
    const f = await historyFixture();
    f.create();
    const guest = mock.guests.at(-1)!;
    guest.emit("did-navigate", {}, guest.url, status, "failure");
    guest.emit("did-finish-load");
    expect((await f.history.query(historyRecent)).entries).toEqual([]);
    f.host.closeAll();
  }
);
it("does not record a staged successful response that fails before finishing or a closed guest", async () => {
  const f = await historyFixture();
  const page = f.create();
  const guest = mock.guests.at(-1)!;
  guest.emit("did-navigate", {}, guest.url, 200, "OK");
  guest.emit("did-fail-load", {}, -2, "failed", guest.url, true);
  guest.emit("did-finish-load");
  expect((await f.history.query(historyRecent)).entries).toEqual([]);
  f.host.reload(f.event, f.target(page));
  guest.emit("did-navigate", {}, guest.url, 200, "OK");
  await f.host.close(f.event, f.target(page));
  guest.emit("did-finish-load");
  expect((await f.history.query(historyRecent)).entries).toEqual([]);
  f.host.closeAll();
});

it("admits history reads/removal from exact workspace or Settings documents and emits only revision invalidations", async () => {
  const f = await historyFixture();
  f.create();
  const guest = mock.guests.at(-1)!;
  const settings = settingsFixture();
  const tools = shellFixture();
  tools.window.webContents.url = "https://grida.co/desktop/tools";
  tools.window.webContents.mainFrame.url = tools.window.webContents.url;
  f.history.visit("https://example.com/", "Example", 1);
  await f.history.flush();
  expect(settings.window.webContents.send).toHaveBeenCalledWith(
    "grida:browser:history-changed",
    { revision: 1 }
  );
  expect(f.window.webContents.send).toHaveBeenCalledWith(
    "grida:browser:history-changed",
    { revision: 1 }
  );
  expect(tools.window.webContents.send).not.toHaveBeenCalled();
  expect(guest.send).not.toHaveBeenCalled();
  expect(
    (await f.host.historyQuery(settings.event, historyRecent)).entries
  ).toHaveLength(1);
  await expect(
    f.host.historyQuery(
      {
        sender: guest,
        senderFrame: guest.mainFrame,
      } as unknown as IpcMainInvokeEvent,
      historyRecent
    )
  ).rejects.toThrow("browser_history_expired");
  await expect(
    f.host.historyQuery(
      {
        ...settings.event,
        senderFrame: { url: settings.window.webContents.url },
      } as unknown as IpcMainInvokeEvent,
      historyRecent
    )
  ).rejects.toThrow("browser_history_expired");
  await f.host.historyRemove(settings.event, { url: "https://example.com/" });
  expect((await f.history.query(historyRecent)).entries).toEqual([]);
  f.host.closeAll();
});

it("rechecks document authority after a delayed history query", async () => {
  const f = await historyFixture();
  const settings = settingsFixture();
  let release!: (snapshot: DesktopBrowser.History.Snapshot) => void;
  vi.spyOn(f.history, "query").mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const pending = f.host.historyQuery(settings.event, historyRecent);
  settings.window.webContents.emit(
    "did-navigate",
    {},
    settings.window.webContents.url
  );
  release({ version: 1, revision: 0, entries: [] });
  await expect(pending).rejects.toThrow("browser_history_expired");
  expect(settings.window.webContents.listenerCount("did-navigate")).toBe(0);
  f.host.closeAll();
});

it("notifies history clear only after the shared data lock releases so Settings can reread immediately", async () => {
  const f = await historyFixture();
  f.create();
  const settings = settingsFixture();
  f.history.visit("https://example.com/", "Example", 1);
  await f.history.flush();
  settings.window.webContents.send.mockClear();
  let release!: () => void;
  mock.sessions
    .get("persist:grida-browser")!
    .clearStorageData.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
  const reads: Promise<DesktopBrowser.History.Snapshot>[] = [];
  settings.window.webContents.send.mockImplementation((channel) => {
    if (channel === "grida:browser:history-changed")
      reads.push(f.host.historyQuery(settings.event, historyRecent));
  });
  mock.confirm.mockResolvedValueOnce({ response: 1 });
  const clearing = f.host.clearBrowsingData(settings.event);
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  expect(settings.window.webContents.send).not.toHaveBeenCalled();
  release();
  await clearing;
  expect(reads).toHaveLength(1);
  await expect(reads[0]).resolves.toMatchObject({ entries: [] });
  expect(
    (await (await BrowserHistory.open(f.directory)).query(historyRecent))
      .entries
  ).toEqual([]);
  f.host.closeAll();
});

it.each([
  "about:blank",
  "about:srcdoc",
  "blob:https://example.com/generated",
  "blob:null/generated",
  "data:text/html,generated",
])(
  "keeps normal generated live contents and bounded metadata: %s",
  async (url) => {
    const f = await fixture();
    f.create();
    const guest = mock.guests.at(-1)!;
    const preventDefault = vi.fn<(...args: unknown[]) => void>();
    guest.emit("will-navigate", { preventDefault }, url);
    expect(preventDefault).not.toHaveBeenCalled();
    guest.emit("did-start-navigation", {
      url,
      isMainFrame: true,
      isSameDocument: false,
    });
    guest.url = url;
    guest.emit("did-navigate", {}, url, 200);
    expect(
      f.host.snapshot(f.event, f.attached.attachmentId).pages[0]
    ).toMatchObject({ url, mounted: true, failure: null });
    expect(guest.close).not.toHaveBeenCalled();
    f.host.closeAll();
  }
);

it("uses bounded data display metadata without authorizing generated URLs in typed navigation", async () => {
  const f = await fixture();
  const page = f.create();
  const guest = mock.guests.at(-1)!;
  guest.url = "data:text/html," + "a".repeat(DesktopBrowser.MAX_URL_BYTES + 1);
  guest.emit("did-navigate", {}, guest.url, 200);
  expect(
    f.host.snapshot(f.event, f.attached.attachmentId).pages[0]
  ).toMatchObject({ url: "data:", mounted: true, failure: null });
  expect(() =>
    f.host.navigate(f.event, { ...f.target(page), url: "data:text/html,new" })
  ).toThrow("browser_url_invalid");
  f.host.closeAll();
});

it("creates a content tab only after a live top-frame click intent meets Chromium's actual popup/referrer", async () => {
  const f = await fixture();
  const opener = f.create();
  const guest = mock.guests.at(-1)!;
  guest.mainFrame.url = guest.url;
  f.host.setActive(f.event, { ...f.target(opener), active: true });
  const intent = {
    url: "https://other.example/page",
    documentUrl: guest.url,
    disposition: "background",
  };
  const sender = {
    sender: native(guest),
    senderFrame: guest.mainFrame,
  } as unknown as import("electron").IpcMainEvent;
  f.host.guestLink(
    {
      ...sender,
      senderFrame: { url: guest.url },
    } as unknown as import("electron").IpcMainEvent,
    intent
  );
  expect(openWindow(guest, intent.url).action).toBe("allow");
  f.host.guestLink(sender, intent);
  const referrer = { url: "https://example.com/", policy: "no-referrer" };
  expect(openWindow(guest, intent.url, { referrer }).action).toBe("deny");
  const created = f.host
    .snapshot(f.event, f.attached.attachmentId)
    .pages.at(-1)!;
  expect(created.id).not.toBe(opener.id);
  expect(f.window.webContents.send).toHaveBeenCalledWith(
    "grida:browser:changed",
    expect.objectContaining({
      type: "created",
      openerPageId: opener.id,
      disposition: "background",
      page: expect.objectContaining({ id: created.id }),
    })
  );
  const mounted = f.mount(created).guest;
  expect(mounted.loadURL).toHaveBeenCalledWith(intent.url, {
    httpReferrer: referrer,
  });
  // Intent is one-use: a later script/form window retains native semantics.
  expect(openWindow(guest, intent.url, { postBody: { data: [] } }).action).toBe(
    "allow"
  );
  f.host.closeAll();
});

it("ignores inactive, stale and foreign private click intents", async () => {
  const f = await fixture();
  const page = f.create();
  const guest = mock.guests.at(-1)!;
  guest.mainFrame.url = guest.url;
  const sender = {
    sender: native(guest),
    senderFrame: guest.mainFrame,
  } as unknown as import("electron").IpcMainEvent;
  const intent = {
    url: "https://other.example/",
    documentUrl: guest.url,
    disposition: "foreground",
  };
  f.host.guestLink(sender, intent);
  expect(openWindow(guest, intent.url).action).toBe("allow");
  f.host.setActive(f.event, { ...f.target(page), active: true });
  f.host.guestLink(sender, {
    ...intent,
    documentUrl: "https://stale.example/",
  });
  expect(openWindow(guest, intent.url).action).toBe("allow");
  f.host.closeAll();
});

it("allows actual managed native popups with fixed browser preferences, native POST and opener semantics", async () => {
  const f = await fixture();
  f.create();
  const guest = mock.guests.at(-1)!;
  const response = openWindow(guest, "https://login.example/", {
    frameName: "oauth",
    postBody: { data: [{ bytes: Buffer.from("form=body") }] },
  });
  expect(response.action).toBe("allow");
  expect(response.overrideBrowserWindowOptions?.webPreferences).toMatchObject({
    session: guest.session,
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    webviewTag: false,
    disableDialogs: false,
    safeDialogs: true,
  });
  expect(response.overrideBrowserWindowOptions?.webPreferences.preload).toMatch(
    /browser-guest-preload\.js$/
  );
  mock.beforeLoad = (contents) => {
    expect(contents.listenerCount("login")).toBeGreaterThan(0);
    expect(contents.setWindowOpenHandler).toHaveBeenCalled();
  };
  const actual = response.createWindow!(response.overrideBrowserWindowOptions!);
  const popup = BrowserWindow.fromWebContents(actual)!;
  expect(actual.loadURL).toHaveBeenCalledWith(
    "https://login.example/",
    expect.objectContaining({ postData: [{ bytes: Buffer.from("form=body") }] })
  );
  expect(f.host.snapshot(f.event, f.attached.attachmentId).pages).toHaveLength(
    1
  );
  f.host.closeAll();
  expect(popup.isDestroyed()).toBe(true);
});

it("keeps the guest mounted and tab present on Stay, then closes on Leave", async () => {
  const { dialog } = await import("electron");
  const f = await fixture();
  const page = f.create();
  const guest = mock.guests.at(-1)!;
  guest.close.mockImplementation((options) => {
    if (options?.waitForBeforeUnload) {
      const event = {
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
      };
      guest.emit("will-prevent-unload", event);
      if (!event.defaultPrevented) return;
    }
    guest.destroyed = true;
    guest.emit("destroyed");
  });
  vi.mocked(dialog.showMessageBoxSync).mockReturnValueOnce(0);
  await expect(f.host.close(f.event, f.target(page))).resolves.toBe(false);
  expect(
    f.host.snapshot(f.event, f.attached.attachmentId).pages[0].mounted
  ).toBe(true);
  vi.mocked(dialog.showMessageBoxSync).mockReturnValueOnce(1);
  await expect(f.host.close(f.event, f.target(page))).resolves.toBe(true);
  expect(f.host.snapshot(f.event, f.attached.attachmentId).pages).toEqual([]);
  f.host.closeAll();
});

it("clears cache and history without closing current browser tabs", async () => {
  const f = await historyFixture();
  const history = f.history;
  f.create();
  const guest = mock.guests.at(-1)!;
  history.visit("https://old.example/", "Old");
  await f.host.clearHistory(settingsFixture().event);
  await f.host.clearCache(settingsFixture().event);
  expect((await history.query({ query: "", limit: 100 })).entries).toEqual([]);
  expect(guest.session!.clearCache).toHaveBeenCalledOnce();
  expect(guest.close).not.toHaveBeenCalled();
  expect(f.host.snapshot(f.event, f.attached.attachmentId).pages).toHaveLength(
    1
  );
  f.host.closeAll();
});

it("Settings opens HTTP history pages through an admitted workspace without acquiring its page lease", async () => {
  const f = await fixture();
  await expect(
    f.host.openPage(settingsFixture().event, {
      url: "https://history.example/",
    })
  ).resolves.toBe(true);
  expect(f.host.snapshot(f.event, f.attached.attachmentId).pages[0].url).toBe(
    "https://history.example/"
  );
  f.host.closeAll();
  await expect(
    f.host.openPage(settingsFixture().event, {
      url: "https://history.example/",
    })
  ).resolves.toBe(false);
});

it("passes an existing native popup guest through the public factory without reloading its POST/opener state", async () => {
  const f = await fixture();
  f.create();
  const opener = mock.guests.at(-1)!;
  const response = openWindow(opener, "https://oauth.example/");
  const supplied = mock.newContents!();
  supplied.session = opener.session;
  const actual = response.createWindow!({
    ...response.overrideBrowserWindowOptions,
    webContents: native(supplied),
  } as import("electron").BrowserWindowConstructorOptions);
  expect(actual).toBe(supplied);
  expect(supplied.loadURL).not.toHaveBeenCalled();
  expect(supplied.listenerCount("login")).toBeGreaterThan(0);
  opener.emit("render-process-gone", {}, { reason: "crashed" });
  expect(actual.isDestroyed()).toBe(true);
  f.host.closeAll();
});

it("invalidates a click intent on same-URL document replacement and gives visible resource feedback", async () => {
  const f = await fixture();
  const page = f.create();
  const guest = mock.guests.at(-1)!;
  guest.mainFrame.url = guest.url;
  f.host.setActive(f.event, { ...f.target(page), active: true });
  const event = {
    sender: native(guest),
    senderFrame: guest.mainFrame,
  } as unknown as import("electron").IpcMainEvent;
  const intent = {
    url: "https://other.example/",
    documentUrl: guest.url,
    disposition: "foreground",
  };
  f.host.guestLink(event, intent);
  guest.emit("did-start-navigation", {
    isMainFrame: true,
    isSameDocument: false,
    url: guest.url,
  });
  expect(openWindow(guest, intent.url).action).toBe("allow");
  for (let index = 1; index < DesktopBrowser.MAX_PAGES; index++) f.descriptor();
  f.host.guestLink(event, intent);
  expect(openWindow(guest, intent.url).action).toBe("deny");
  expect(mock.confirm).toHaveBeenCalledWith(
    f.window,
    expect.objectContaining({
      message: "Close a browser tab or window to open another",
    })
  );
  expect(
    f.host.snapshot(f.event, f.attached.attachmentId).pages[0].failure
  ).toBeNull();
  f.host.closeAll();
});

it("permission reset reloads retained tabs and bypasses their beforeunload only for that explicit reset", async () => {
  const { dialog } = await import("electron");
  vi.mocked(dialog.showMessageBoxSync).mockClear();
  const f = await fixture();
  f.create();
  const guest = mock.guests.at(-1)!;
  const resetting = f.host.resetPermissions(settingsFixture().event);
  expect(guest.reload).toHaveBeenCalledOnce();
  const force = { preventDefault: vi.fn<(...args: unknown[]) => void>() };
  guest.emit("will-prevent-unload", force);
  expect(force.preventDefault).toHaveBeenCalledOnce();
  expect(dialog.showMessageBoxSync).not.toHaveBeenCalled();
  guest.emit("did-navigate", {}, guest.url, 200);
  await expect(resetting).resolves.toBe(true);
  guest.emit("will-prevent-unload", {
    preventDefault: vi.fn<(...args: unknown[]) => void>(),
  });
  expect(dialog.showMessageBoxSync).toHaveBeenCalledOnce();
  f.host.closeAll();
});

it.each(["destroyed", "unconfirmed"] as const)(
  "waits for a stalled managed window to be %s before settling permission reset",
  async (outcome) => {
    const f = await fixture();
    const page = f.create();
    const guest = mock.guests.at(-1)!;
    const popup = mock.newContents!();
    popup.session = guest.session;
    const response = openWindow(guest, "https://oauth.example/");
    response.createWindow!({
      ...response.overrideBrowserWindowOptions,
      webContents: native(popup),
    } as import("electron").BrowserWindowConstructorOptions);
    popup.close.mockImplementationOnce(() => {});

    vi.useFakeTimers();
    const settled = vi.fn<(value: boolean | string) => void>();
    const resetting = f.host.resetPermissions(settingsFixture().event).then(
      (value) => settled(value),
      (error: Error) => settled(error.message)
    );
    expect(guest.reload).toHaveBeenCalledOnce();
    expect(popup.reload).toHaveBeenCalledOnce();
    guest.emit("did-navigate", {}, guest.url, 200);
    // Neither an in-page navigation nor a failed provisional load proves
    // that the capture-owning document was replaced.
    popup.emit("did-navigate-in-page", {}, popup.url, true);
    popup.emit("did-fail-load", {}, -3, "ERR_ABORTED", popup.url, true);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(popup.close).not.toHaveBeenCalled();
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(popup.close).toHaveBeenCalledExactlyOnceWith({
      waitForBeforeUnload: false,
    });
    expect(guest.close).not.toHaveBeenCalled();
    expect(f.host.snapshot(f.event, f.attached.attachmentId).pages[0].id).toBe(
      page.id
    );
    popup.emit("did-navigate", {}, popup.url, 200);
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).not.toHaveBeenCalled();
    if (outcome === "destroyed") {
      popup.destroyed = true;
      popup.emit("destroyed");
    }
    await vi.advanceTimersByTimeAsync(2_000);
    await resetting;
    expect(settled).toHaveBeenCalledExactlyOnceWith(
      outcome === "destroyed" ? true : "browser_permission_close_timeout"
    );
    f.host.closeAll();
  }
);

it.each([
  "settings-navigation",
  "connection-failure",
  "connection-and-close-failure",
] as const)(
  "finishes permission-reset stream termination after %s",
  async (change) => {
    const f = await fixture();
    f.create();
    const peer = await fixture("1234567890abcdef", f.host);
    peer.create();
    const guests = [...mock.guests];
    if (change === "connection-and-close-failure") {
      guests[0].reload.mockImplementationOnce(() => {
        throw new Error("reload failed");
      });
      guests[0].close.mockImplementationOnce(() => {
        throw new Error("close failed");
      });
    }
    const settings = settingsFixture();
    const profile = mock.sessions.get("persist:grida-browser")!;
    let finish!: () => void;
    profile.closeAllConnections.mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          finish = () =>
            change === "settings-navigation"
              ? resolve()
              : reject(new Error("connection cleanup failed"));
        })
    );
    const resetting = f.host.resetPermissions(settings.event);
    if (change === "settings-navigation")
      settings.window.webContents.emit("did-start-navigation", {
        isMainFrame: true,
      });
    for (const guest of guests) guest.emit("did-navigate", {}, guest.url, 200);
    finish();
    await expect(resetting).rejects.toThrow(
      change === "settings-navigation"
        ? "browser_management_expired"
        : "connection cleanup failed"
    );
    for (const guest of guests) expect(guest.reload).toHaveBeenCalledOnce();
    f.host.closeAll();
  }
);

it.each([false, true])(
  "continues permission-reset cleanup after an individual reload fails (close failure: %s)",
  async (closeFailure) => {
    const f = await fixture();
    f.create();
    const first = mock.guests.at(-1)!;
    const peer = await fixture("1234567890abcdef", f.host);
    peer.create();
    const second = mock.guests.at(-1)!;
    first.reload.mockImplementationOnce(() => {
      throw new Error("reload failed");
    });
    if (closeFailure)
      first.close.mockImplementationOnce(() => {
        throw new Error("close failed");
      });
    const resetting = f.host.resetPermissions(settingsFixture().event);
    second.emit("did-navigate", {}, second.url, 200);
    const result = await resetting.then(
      (value) => ({ value, error: null }),
      (error: Error) => ({ value: null, error: error.message })
    );
    expect(result).toEqual(
      closeFailure
        ? { value: null, error: "close failed" }
        : { value: true, error: null }
    );
    expect(first.close).toHaveBeenCalledWith({ waitForBeforeUnload: false });
    expect(second.reload).toHaveBeenCalledOnce();
    f.host.closeAll();
  }
);

it.each([false, true])(
  "discloses native device restart requirements after permission reset (Settings gone: %s)",
  async (settingsGone) => {
    const { BrowserSitePolicy } = await import("./browser-site-policy");
    const f = await fixture();
    f.create();
    const settings = settingsFixture();
    const guest = mock.guests.at(-1)!;
    vi.spyOn(
      BrowserSitePolicy.prototype,
      "resetPermissions"
    ).mockImplementationOnce(async () => {
      if (settingsGone) settings.window.webContents.destroyed = true;
      return {
        reloadRequired: true,
        certificateRestartRequired: false,
        deviceRestartRequired: true,
      };
    });
    const resetting = f.host.resetPermissions(settings.event);
    expect(mock.confirm).not.toHaveBeenCalled();
    guest.emit("did-navigate", {}, guest.url, 200);
    const result = await resetting.then(
      (value) => ({ value, error: null }),
      (error: Error) => ({ value: null, error: error.message })
    );
    expect(result).toEqual(
      settingsGone
        ? { value: null, error: "browser_clear_expired" }
        : { value: true, error: null }
    );
    const options = expect.objectContaining({
      message: "Restart Grida to finish resetting website permissions",
      detail: expect.stringContaining("USB, HID or serial"),
    });
    expect(mock.confirm.mock.calls.at(-1)).toEqual(
      settingsGone ? [options] : [settings.window, options]
    );
    f.host.closeAll();
  }
);

it("binds HTTP credentials to the actual frame/navigation and displays a proxy's actual recipient", async () => {
  const { BrowserAuthDialog } = await import("./browser-auth-dialog");
  let finish!: (credentials: { username: string; password: string }) => void;
  const prompt = vi.spyOn(BrowserAuthDialog, "prompt").mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  const f = await fixture();
  f.create();
  const guest = mock.guests.at(-1)!;
  const callback = vi.fn<(...args: unknown[]) => void>();
  guest.emit(
    "login",
    { preventDefault: vi.fn<(...args: unknown[]) => void>() },
    { url: "https://destination.example/" },
    { isProxy: true, host: "proxy.example", port: 3128, realm: "Proxy" },
    callback
  );
  expect(prompt).toHaveBeenCalledWith(
    expect.objectContaining({
      origin: "proxy.example:3128",
      isProxy: true,
      contents: guest,
    })
  );
  guest.emit("did-start-navigation", {
    isMainFrame: true,
    isSameDocument: false,
    url: "https://another.example/",
  });
  finish({ username: "user", password: "password" });
  await vi.waitFor(() => expect(callback).toHaveBeenCalledExactlyOnceWith());
  f.host.closeAll();
});

it("does not explicitly destroy a managed popup when its opener website commits another document", async () => {
  const f = await fixture();
  f.create();
  const opener = mock.guests.at(-1)!;
  const response = openWindow(opener, "https://login.example/");
  const actual = response.createWindow!(response.overrideBrowserWindowOptions!);
  const popup = BrowserWindow.fromWebContents(actual)!;
  opener.url = "https://another.example/";
  opener.emit("did-navigate", {}, opener.url, 200);
  expect(popup.isDestroyed()).toBe(false);
  // Native guest destruction and hosting workbench retirement still own cleanup.
  f.host.closeAll();
  expect(popup.isDestroyed()).toBe(true);
});
it("hands actual selected-guest OS links to native policy while leaving the source page healthy", async () => {
  const { shell } = await import("electron");
  const f = await fixture();
  const page = f.create();
  const guest = mock.guests.at(-1)!;
  guest.mainFrame.url = guest.url;
  f.host.setActive(f.event, { ...f.target(page), active: true });
  f.host.guestLink(
    {
      sender: native(guest),
      senderFrame: guest.mainFrame,
    } as unknown as import("electron").IpcMainEvent,
    {
      url: "mailto:person@example.test",
      documentUrl: guest.url,
      disposition: "foreground",
    }
  );
  expect(shell.openExternal).toHaveBeenCalledWith("mailto:person@example.test");
  await Promise.resolve();
  const preventDefault = vi.fn<() => void>();
  mock.confirm.mockResolvedValueOnce({ response: 0 });
  guest.emit("will-navigate", { preventDefault }, "customapp://open/item");
  expect(preventDefault).not.toHaveBeenCalled();
  const frame = guest.mainFrame as unknown as {
    url: string;
    origin: string;
    detached: boolean;
    framesInSubtree: unknown[];
  };
  Object.assign(frame, {
    origin: "https://example.com",
    detached: false,
    framesInSubtree: [frame],
  });
  const request = guest.session!.setPermissionRequestHandler.mock
    .calls[0][0] as NonNullable<
    Parameters<Session["setPermissionRequestHandler"]>[0]
  >;
  const denied = vi.fn<(allowed: boolean) => void>();
  request(native(guest), "openExternal", denied, {
    isMainFrame: true,
    requestingUrl: guest.url,
    externalURL: "customapp://open/item",
  } as Electron.OpenExternalPermissionRequest);
  expect(denied).toHaveBeenCalledExactlyOnceWith(false);
  expect(mock.confirm).toHaveBeenCalledWith(
    f.window,
    expect.objectContaining({ message: "Open another app?" })
  );
  expect(
    f.host.snapshot(f.event, f.attached.attachmentId).pages[0].failure
  ).toBeNull();
  expect(guest.close).not.toHaveBeenCalled();
  f.host.closeAll();
});

it("retains Chromium external-protocol attribution through the real managed popup factory", async () => {
  const f = await fixture();
  f.create();
  const opener = mock.guests.at(-1)!;
  const response = openWindow(opener, "customapp://open/item");
  expect(response.action).toBe("allow");
  expect(response.createWindow).toBeTypeOf("function");
  expect(mock.confirm).not.toHaveBeenCalled();
  const actual = response.createWindow!(response.overrideBrowserWindowOptions!);
  expect(actual.loadURL).toHaveBeenCalledWith(
    "customapp://open/item",
    expect.any(Object)
  );
  const before = { preventDefault: vi.fn<() => void>() };
  opener.emit("will-frame-navigate", {
    ...before,
    isMainFrame: false,
    url: "customapp://open/item",
  });
  opener.emit("did-start-navigation", {
    isMainFrame: true,
    isSameDocument: false,
    url: "customapp://open/item",
  });
  expect(before.preventDefault).not.toHaveBeenCalled();
  expect(mock.confirm).not.toHaveBeenCalled();
  expect(
    f.host.snapshot(f.event, f.attached.attachmentId).pages[0].failure
  ).toBeNull();
  f.host.closeAll();
});
