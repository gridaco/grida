// GRIDA-SEC-016 — native browser credentials never leave the isolated form.
import { afterEach, expect, it, vi } from "vitest";
import type { BrowserWindow, WebContents } from "electron";
import { BrowserAuthDialog } from "./browser-auth-dialog";

const mock = await vi.hoisted(async () => {
  const { EventEmitter } = await import("node:events");
  class Contents extends EventEmitter {
    static next = 40;
    id = ++Contents.next;
    url = "";
    isDestroyed = () => false;
    getURL = () => this.url;
    setWindowOpenHandler = vi.fn<(handler: unknown) => void>();
  }
  const windows: Window[] = [];
  const sessions: {
    handler?: (
      details: Record<string, unknown>,
      done: (value: unknown) => void
    ) => void;
  }[] = [];
  class Window extends EventEmitter {
    webContents = new Contents();
    destroyed = false;
    constructor(readonly options: unknown) {
      super();
      windows.push(this);
    }
    isDestroyed = () => this.destroyed;
    removeMenu = vi.fn<() => void>();
    show = vi.fn<() => void>();
    loadURL = vi.fn<(url: string) => Promise<void>>(async (url: string) => {
      this.webContents.url = url;
    });
    destroy = () => {
      this.destroyed = true;
      this.emit("closed");
    };
  }
  const fromPartition = vi.fn<(partition: string) => unknown>((_partition) => {
    const state: (typeof sessions)[number] = {};
    sessions.push(state);
    return {
      state,
      partition: _partition,
      protocol: {
        handle:
          vi.fn<
            (scheme: string, handler: (request: Request) => Response) => void
          >(),
      },
      clearStorageData: vi.fn<() => Promise<void>>(async () => {}),
      setPermissionRequestHandler: vi.fn<(handler: unknown) => void>(),
      setPermissionCheckHandler: vi.fn<(handler: unknown) => void>(),
      webRequest: {
        onBeforeRequest: vi.fn<
          (filter: unknown, handler: typeof state.handler) => void
        >((_filter: unknown, handler: typeof state.handler) => {
          state.handler = handler;
        }),
      },
    };
  });
  return { Window, Contents, windows, sessions, fromPartition, EventEmitter };
});
vi.mock("electron", () => ({
  BrowserWindow: mock.Window,
  session: { fromPartition: mock.fromPartition },
}));

afterEach(() => {
  for (const window of mock.windows.splice(0))
    if (!window.destroyed) window.destroy();
  vi.clearAllMocks();
});
function fixture() {
  let live = true;
  const parent = Object.assign(new mock.EventEmitter(), {
    isDestroyed: () => false,
  });
  const contents = new mock.Contents();
  const result = BrowserAuthDialog.prompt({
    parent: parent as unknown as BrowserWindow,
    contents: contents as unknown as WebContents,
    origin: "https://example.test",
    realm: "Preview app",
    isLive: () => live,
  });
  const window = mock.windows.at(-1)!;
  const html = decodeURIComponent(
    window.webContents.url.split(",").slice(1).join(",")
  );
  const action = /<form action="([^"]+)"/.exec(html)![1];
  const request = (body: unknown, overrides: Record<string, unknown> = {}) => {
    const done = vi.fn<(value: unknown) => void>();
    (
      window.options as {
        webPreferences: { session: { state: (typeof mock.sessions)[number] } };
      }
    ).webPreferences.session.state.handler!(
      {
        url: action,
        method: "POST",
        resourceType: "mainFrame",
        webContentsId: window.webContents.id,
        uploadData: [{ bytes: Buffer.from(String(body)) }],
        ...overrides,
      },
      done
    );
    return done;
  };
  return {
    parent,
    contents,
    result,
    window,
    request,
    revoke: () => {
      live = false;
    },
  };
}

it("renders escaped origin/realm with no scripts, remote resources, credentials or app bridge", () => {
  const html = BrowserAuthDialog.document(
    "https://browser-auth.invalid/token",
    { origin: '<img src=x onerror="secret">', realm: "<script>bad()</script>" }
  );
  expect(html).toContain("default-src 'none'");
  expect(html).toContain("&lt;script&gt;bad()&lt;/script&gt;");
  expect(html).not.toContain("<script");
  expect(html).not.toContain("window.grida");
  expect(html).toContain('type="password"');
  expect(html).toContain('method="post"');
});

it("returns credentials only from the exact native form while cancelling transmission", async () => {
  const f = fixture();
  const done = f.request("username=developer&password=p%26ss&action=signin");
  expect(done).toHaveBeenCalledWith({ cancel: true });
  expect(await f.result).toEqual({ username: "developer", password: "p&ss" });
  expect(f.window.options).toMatchObject({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
    },
  });
  expect(
    (f.window.options as { webPreferences: object }).webPreferences
  ).not.toHaveProperty("preload");
  expect(
    (f.window.options as { webPreferences: { session: { partition: string } } })
      .webPreferences.session.partition
  ).not.toMatch(/^persist:/);
  const stillBlocked = vi.fn<(value: unknown) => void>();
  (
    f.window.options as {
      webPreferences: { session: { state: (typeof mock.sessions)[number] } };
    }
  ).webPreferences.session.state.handler!(
    { url: "https://example.test" },
    stillBlocked
  );
  expect(stillBlocked).toHaveBeenCalledWith({ cancel: true });
});

it("refuses foreign request identity, then permits an explicit cancel", async () => {
  const f = fixture();
  expect(
    f.request("username=x&password=y&action=signin", { webContentsId: 999 })
  ).toHaveBeenCalledWith({ cancel: true });
  expect(f.window.destroyed).toBe(false);
  f.request("action=cancel");
  expect(await f.result).toBeNull();
});

it("coalesces the same native challenge without creating a modal storm", async () => {
  const f = fixture();
  const options = {
    parent: f.parent as unknown as BrowserWindow,
    contents: f.contents as unknown as WebContents,
    origin: "https://example.test",
    realm: "Preview app",
    isLive: () => true,
  };
  const same = BrowserAuthDialog.prompt(options);
  const different = BrowserAuthDialog.prompt({
    ...options,
    realm: "Other realm",
  });
  expect(mock.windows).toHaveLength(1);
  expect(await different).toBeNull();
  f.request("username=developer&password=secret&action=signin");
  expect(await f.result).toEqual({ username: "developer", password: "secret" });
  expect(await same).toEqual({ username: "developer", password: "secret" });
});

it("does not spend a stale site's credentials after ownership withdrawal", async () => {
  const f = fixture();
  f.revoke();
  f.request("username=x&password=y&action=signin");
  expect(await f.result).toBeNull();
});

it("cancels on source navigation or destruction", async () => {
  const f = fixture();
  f.contents.emit("did-start-navigation", { isMainFrame: true });
  expect(await f.result).toBeNull();
  const g = fixture();
  g.contents.emit("destroyed");
  expect(await g.result).toBeNull();
});

it("rejects unbounded bodies and native-file upload parts without reading them", async () => {
  const f = fixture();
  f.request("x".repeat(BrowserAuthDialog.MAX_BODY_BYTES + 1));
  expect(await f.result).toBeNull();
  const g = fixture();
  g.request("ignored", { uploadData: [{ file: "/private/never-read" }] });
  expect(await g.result).toBeNull();
});

it("reuses a bounded session slot without accepting an earlier challenge token", async () => {
  const f = fixture();
  const oldSource = f.window.webContents.url;
  f.request("action=cancel");
  expect(await f.result).toBeNull();
  const firstPartition = (
    f.window.options as { webPreferences: { session: { partition: string } } }
  ).webPreferences.session.partition;
  const g = fixture();
  expect(
    (g.window.options as { webPreferences: { session: { partition: string } } })
      .webPreferences.session.partition
  ).toBe(firstPartition);
  const oldAction = /<form action="([^"]+)"/.exec(
    decodeURIComponent(oldSource.split(",").slice(1).join(","))
  )![1];
  g.request("username=old&password=old&action=signin", { url: oldAction });
  expect(g.window.destroyed).toBe(false);
  g.request("action=cancel");
  expect(await g.result).toBeNull();
});
