/** GRIDA-SEC-016 — native find accepts only its bounded text/form action. */
import { afterEach, expect, it, vi } from "vitest";
import type { BrowserWindow, WebContents } from "electron";
const mock = await vi.hoisted(async () => {
  const { EventEmitter } = await import("node:events");
  class Contents extends EventEmitter {
    static next = 10;
    id = ++Contents.next;
    url = "";
    isDestroyed = () => false;
    getURL = () => this.url;
    setWindowOpenHandler = vi.fn<(handler: unknown) => void>();
  }
  const windows: Window[] = [];
  const states: {
    protocolHandler?: (request: Request) => Response;
    handler?: (
      details: Record<string, unknown>,
      callback: (result: unknown) => void
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
    focus = vi.fn<() => void>();
    setTitle = vi.fn<(title: string) => void>();
    destroy = () => {
      this.destroyed = true;
      this.emit("closed");
    };
    loadURL = vi.fn<(url: string) => Promise<void>>(async (url) => {
      this.webContents.url = url;
    });
  }
  const fromPartition = (partition: string) => {
    const state: (typeof states)[number] = {};
    states.push(state);
    return {
      partition,
      state,
      setPermissionRequestHandler: vi.fn<(handler: unknown) => void>(),
      setPermissionCheckHandler: vi.fn<(handler: unknown) => void>(),
      clearStorageData: async () => {},
      protocol: {
        handle: (_scheme: string, handler: typeof state.protocolHandler) => {
          state.protocolHandler = handler;
        },
        unhandle: (_scheme: string) => {
          state.protocolHandler = undefined;
        },
      },
      webRequest: {
        onBeforeRequest: (_filter: unknown, handler: typeof state.handler) => {
          state.handler = handler;
        },
      },
    };
  };
  return {
    Contents,
    Window,
    windows,
    states,
    fromPartition,
    EventEmitter,
    find: vi.fn<
      (
        request: unknown
      ) => Promise<{ matches: number; activeMatchOrdinal: number }>
    >(async () => ({ matches: 2, activeMatchOrdinal: 1 })),
    stop: vi.fn<() => void>(),
  };
});
vi.mock("electron", () => ({
  BrowserWindow: mock.Window,
  session: { fromPartition: mock.fromPartition },
}));
vi.mock("./browser-page-tools", () => ({
  BrowserPageTools: class {
    find = mock.find;
    stopFind = mock.stop;
  },
}));
afterEach(() => {
  for (const window of mock.windows.splice(0))
    if (!window.destroyed) window.destroy();
  vi.clearAllMocks();
});
import { BrowserFindDialog } from "./browser-find-dialog";
const form = (text: string) => [{ bytes: Buffer.from(text) }];
it("parses ordinary find forms without accepting upload paths or repeated fields", () => {
  expect(BrowserFindDialog.parse(form("text=hello&action=next"))).toEqual({
    text: "hello",
    action: "next",
  });
  expect(BrowserFindDialog.parse(form("text=a&text=b&action=next"))).toBeNull();
  expect(BrowserFindDialog.parse([{}])).toBeNull();
  expect(BrowserFindDialog.parse(form("text=x&action=arbitrary"))).toBeNull();
  expect(
    BrowserFindDialog.parse(form("text=x&action=next&extra=1"))
  ).toBeNull();
});
it("bounds decoded text and rejects controls before native find", () => {
  expect(
    BrowserFindDialog.parse(form(`text=${"a".repeat(1025)}&action=next`))
  ).toBeNull();
  expect(
    BrowserFindDialog.parse(form("text=bad%00text&action=next"))
  ).toBeNull();
});
it("uses a script-free form with no application preload or network content", () => {
  const html = BrowserFindDialog.document("https://browser-find.invalid/fixed");
  expect(html).toContain("default-src 'none'");
  expect(html).toContain('method="post"');
  expect(html).not.toMatch(/<script|<iframe|<img/);
});

function fixture() {
  let live = true;
  const parent = Object.assign(new mock.EventEmitter(), {
    isDestroyed: () => false,
  });
  const contents = new mock.Contents();
  BrowserFindDialog.open(
    parent as unknown as BrowserWindow,
    contents as unknown as WebContents,
    () => live
  );
  const window = mock.windows.at(-1)!;
  const action = /<form action="([^"]+)"/.exec(
    decodeURIComponent(window.webContents.url.split(",").slice(1).join(","))
  )![1];
  return {
    window,
    state: (
      window.options as {
        webPreferences: { session: { state: (typeof mock.states)[number] } };
      }
    ).webPreferences.session.state,
    contents,
    revoke: () => {
      live = false;
    },
    request(body: string, overrides: Record<string, unknown> = {}) {
      const callback = vi.fn<(result: unknown) => void>();
      (
        window.options as {
          webPreferences: { session: { state: (typeof mock.states)[number] } };
        }
      ).webPreferences.session.state.handler!(
        {
          url: action,
          method: "POST",
          resourceType: "mainFrame",
          webContentsId: window.webContents.id,
          uploadData: [{ bytes: Buffer.from(body) }],
          ...overrides,
        },
        callback
      );
      return callback;
    },
  };
}
it("finds only from the exact native form and handles valid submissions locally", async () => {
  const f = fixture();
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
    f.request("text=hello&action=next", { webContentsId: 999 })
  ).toHaveBeenCalledWith({ cancel: true });
  expect(mock.find).not.toHaveBeenCalled();
  expect(f.request("text=hello&action=next")).toHaveBeenCalledWith({
    cancel: false,
  });
  expect(mock.find).toHaveBeenCalledWith(
    expect.objectContaining({ text: "hello", forward: true })
  );
  await Promise.resolve();
  expect(f.window.setTitle).toHaveBeenCalledWith("Find in page — 1 of 2");
});

it("responds without replacing the form through Next, Previous and a new search", async () => {
  const f = fixture();
  const source = f.window.webContents.url;
  for (const [text, action] of [
    ["hello", "next"],
    ["hello", "previous"],
    ["new", "next"],
  ]) {
    expect(f.request(`text=${text}&action=${action}`)).toHaveBeenCalledWith({
      cancel: false,
    });
    const target = /<form action="([^"]+)"/.exec(
      decodeURIComponent(source.split(",").slice(1).join(","))
    )![1];
    const response = f.state.protocolHandler!(
      new Request(target, { method: "POST" })
    );
    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
    expect(f.window.webContents.url).toBe(source);
    await Promise.resolve();
  }
  expect(mock.find.mock.calls.map(([request]) => request)).toEqual([
    { text: "hello", forward: true, findNext: false, matchCase: false },
    { text: "hello", forward: false, findNext: true, matchCase: false },
    { text: "new", forward: true, findNext: false, matchCase: false },
  ]);
  expect(
    f.state.protocolHandler!(new Request("https://foreign.test"))
  ).toMatchObject({ status: 403 });
});
it("refuses a replaced form or withdrawn guest and closes on website document replacement", () => {
  const f = fixture();
  const source = f.window.webContents.url;
  f.window.webContents.url = "https://foreign.example/";
  f.request("text=hello&action=next");
  f.window.webContents.url = source;
  f.revoke();
  f.request("text=hello&action=next");
  expect(mock.find).not.toHaveBeenCalled();
  f.contents.emit("did-start-navigation", {
    isMainFrame: true,
    isSameDocument: false,
  });
  expect(f.window.destroyed).toBe(true);
});
it("closes native find with Escape and clears find selection", () => {
  const f = fixture();
  const preventDefault = vi.fn<() => void>();
  f.window.webContents.emit(
    "before-input-event",
    { preventDefault },
    { type: "keyDown", key: "Escape" }
  );
  expect(f.window.destroyed).toBe(true);
  expect(mock.stop).toHaveBeenCalledOnce();
});
