// GRIDA-SEC-016 — actual guest admission, document lifetime and profile isolation.
import { afterEach, beforeEach, expect, it, vi, type Mock } from "vitest";
import type { EventEmitter } from "node:events";
import type { IpcMainInvokeEvent, WebContents, WebPreferences } from "electron";
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
  type: string;
  hostWebContents: FakeContents | null;
  session: FakeSession | null;
  getLastWebPreferences(): WebPreferences;
  preferences: WebPreferences;
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
  mock.confirm.mockReset().mockResolvedValue({ response: 0 });
});
afterEach(() => {
  vi.useRealTimers();
});
vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  class Contents extends EventEmitter {
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
    loadURL = vi.fn<(url: string) => Promise<void>>(async (url) => {
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
  mock.newContents = () => new Contents();
  class Window extends EventEmitter {
    webContents = new Contents();
    destroyed = false;
    focused = true;
    isDestroyed = () => this.destroyed;
    isFocused = () => this.focused;
    constructor() {
      super();
      mock.owners.set(this.webContents, this);
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
          webRequest: {
            onBeforeRequest:
              vi.fn<
                (filter: { urls: string[] }, handler: BeforeRequest) => void
              >(),
          },
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
    shell: { openExternal: vi.fn<() => Promise<void>>(async () => {}) },
    dialog: {
      showMessageBox: mock.confirm,
      showSaveDialogSync: vi.fn<() => string | undefined>(() => mock.savePath),
    },
  };
});
import { BrowserWindow } from "electron";
import { DesktopBrowserHost } from "./browser-host";
const native = (contents: FakeContents) => contents as unknown as WebContents;
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
  sharedHost?: DesktopBrowserHost
) {
  const { window, event } = shellFixture();
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
  const attached = await host.attach(event, workspace);
  const target = (page: DesktopBrowser.Page) => ({
    attachmentId: attached.attachmentId,
    pageId: page.id,
  });
  const descriptor = (
    storageScope: DesktopBrowser.StorageScope = "workspace"
  ) =>
    host.create(event, {
      attachmentId: attached.attachmentId,
      storageScope,
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
  const create = (scope: DesktopBrowser.StorageScope = "workspace") => {
    const page = descriptor(scope);
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
    disableDialogs: true,
    disablePopups: true,
    backgroundThrottling: true,
  });
  expect(preferences.preload).toBeUndefined();
  expect(preferences.additionalArguments).toBeUndefined();
  expect(preferences.partition).toBeUndefined();
  expect(params).toEqual({});
  expect(guest.loadURL).not.toHaveBeenCalled();
  expect(guest.session).toBe(
    mock.sessions.get("persist:grida-browser-workspace-eac20941e6a410aa")
  );
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
      partition: "persist:grida-browser-workspace-eac20941e6a410aa",
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
  "data:text/html,private",
  "blob:https://example.com/local",
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

it("denies direct unsafe URLs and popups while retaining ordinary subframes and denied permission policy", async () => {
  const f = await fixture();
  const page = f.create();
  const guest = mock.guests.at(-1)!;
  expect(() =>
    f.host.navigate(f.event, { ...f.target(page), url: "file:///tmp/local" })
  ).toThrow("browser_url_invalid");
  const denied = vi.fn<() => void>();
  guest.emit("will-navigate", { preventDefault: denied }, "file:///tmp/local");
  expect(denied).toHaveBeenCalled();
  expect(guest.setWindowOpenHandler.mock.calls[0]![0]()).toEqual({
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
  f.host.setActive(f.event, { ...f.target(two), active: false });
  expect(f.window.webContents.focus).toHaveBeenCalled();
  expect(second.close).not.toHaveBeenCalled();
  f.host.closeAll();
});

it("keeps native history and guest identity through active changes, then recreates a destroyed guest only after explicit retry", async () => {
  const f = await fixture();
  const page = f.create("ephemeral");
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
  expect(browserSession.clearStorageData).toHaveBeenCalled();
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
      storageScope: "workspace",
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

it("closes same-workspace pages across windows and locks new work until persistent clearing finishes", async () => {
  const f = await fixture();
  f.create();
  const peer = await fixture("eac20941e6a410aa", f.host);
  peer.create("ephemeral");
  const other = await fixture("1234567890abcdef", f.host);
  const otherPage = other.create();
  const profile = mock.sessions.get(
    "persist:grida-browser-workspace-eac20941e6a410aa"
  )!;
  let release!: () => void;
  profile.closeAllConnections.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const pending = f.host.clearSession(f.event, {
    attachmentId: f.attached.attachmentId,
  });
  expect(() => f.descriptor()).toThrow("browser_session_busy");
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  release();
  await pending;
  expect(f.host.snapshot(f.event, f.attached.attachmentId).pages).toEqual([]);
  expect(f.host.snapshot(peer.event, peer.attached.attachmentId).pages).toEqual(
    []
  );
  expect(
    f.host.snapshot(other.event, other.attached.attachmentId).pages[0].id
  ).toBe(otherPage.id);
  expect(profile.clearStorageData).toHaveBeenCalled();
  f.host.closeAll();
});

it("clears a persistent profile before any page exists and enforces the page limit", async () => {
  const f = await fixture();
  await f.host.clearSession(f.event, { attachmentId: f.attached.attachmentId });
  expect(
    mock.sessions.get("persist:grida-browser-workspace-eac20941e6a410aa")!
      .clearStorageData
  ).toHaveBeenCalled();
  for (let index = 0; index < DesktopBrowser.MAX_PAGES; index++) f.descriptor();
  expect(() => f.descriptor()).toThrow("browser_page_limit");
  f.host.closeAll();
});

it("requires native save selection and cancels accepted downloads at document detach", async () => {
  const { EventEmitter } = await import("node:events");
  const f = await fixture();
  f.create();
  const guest = mock.guests.at(-1)!;
  const item = Object.assign(new EventEmitter(), {
    getFilename: () => "download.txt",
    setSavePath: vi.fn<(value: string) => void>(),
    cancel: vi.fn<() => void>(),
  });
  const preventDefault = vi.fn<() => void>();
  guest.session!.emit("will-download", { preventDefault }, item, guest);
  expect(preventDefault).toHaveBeenCalled();
  expect(item.setSavePath).not.toHaveBeenCalled();
  mock.savePath = "/fixture/download.txt";
  guest.session!.emit("will-download", { preventDefault }, item, guest);
  expect(item.setSavePath).toHaveBeenCalledWith(mock.savePath);
  await f.host.detach(f.event, f.attached.attachmentId);
  expect(item.cancel).toHaveBeenCalled();
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
  const guest = mock.guests.at(-1)!;
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
    url: "blob:https://example.com/page",
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
