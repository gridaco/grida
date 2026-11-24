import { beforeEach, expect, it, vi } from "vitest";

const mock = await vi.hoisted(async () => {
  const { EventEmitter } = await import("node:events");
  const windows: Window[] = [];

  class Window extends EventEmitter {
    url = "";
    closed = false;
    visible = false;
    webContents = Object.assign(new EventEmitter(), {
      setWindowOpenHandler:
        vi.fn<(handler: () => { action: string }) => void>(),
      getURL: () => this.url,
    });

    constructor(readonly options: unknown) {
      super();
      windows.push(this);
    }

    removeMenu = vi.fn<() => void>();
    show = vi.fn<() => void>(() => {
      this.visible = true;
    });
    loadURL = vi.fn<(url: string) => Promise<void>>(async (url) => {
      this.url = url;
    });
    isDestroyed = () => this.closed;
    isVisible = () => this.visible;
    destroy = () => {
      this.closed = true;
      this.emit("closed");
    };

    navigate(url: string, isMainFrame = true) {
      const preventDefault = vi.fn<() => void>();
      this.webContents.emit("will-frame-navigate", {
        url,
        isMainFrame,
        preventDefault,
      });
      return preventDefault;
    }
  }

  return { Window, windows };
});

vi.mock("electron", () => ({ BrowserWindow: mock.Window }));

import { DesktopUpdateWindow } from "./desktop-update-window";

const { windows } = mock;

beforeEach(() => {
  windows.length = 0;
});

it("runs only the fixed actions offered by the current local document", async () => {
  const action = vi.fn<(action: DesktopUpdateWindow.Action) => void>();
  const window = new DesktopUpdateWindow(action, vi.fn<() => void>());
  await window.show({
    title: "Update",
    message: "<script>remote()</script>",
    detail: "Installed version: 0.7.0",
    action: "retry",
  });
  const [native] = windows;
  expect(native.options).toMatchObject({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: false,
    },
  });
  expect(native.options).not.toHaveProperty("webPreferences.preload");
  const html = decodeURIComponent(native.url);
  expect(html).toContain("default-src 'none'");
  expect(html).toContain('<div class="symbol" aria-hidden="true"><svg');
  expect(html).toContain("&lt;script&gt;remote()&lt;/script&gt;");
  expect(html).toMatch(
    /<\/main>\s*<footer class="footer"><div class="primary"><a [^>]+>Retry<\/a><\/div><div class="detail">Installed version: 0\.7\.0<\/div><\/footer>/
  );
  expect(html).not.toContain("<script>");
  expect(native.webContents.setWindowOpenHandler.mock.calls[0][0]()).toEqual({
    action: "deny",
  });

  const blocked = [
    native.navigate("https://example.com/retry"),
    native.navigate("https://desktop-update.invalid/download"),
    native.navigate("https://desktop-update.invalid/retry?unexpected"),
    native.navigate("https://desktop-update.invalid/retry", false),
  ];
  for (const preventDefault of blocked)
    expect(preventDefault).toHaveBeenCalledOnce();
  expect(action).not.toHaveBeenCalled();
  native.navigate("https://desktop-update.invalid/retry");
  expect(action).toHaveBeenCalledExactlyOnceWith("retry");

  const previous = native.url;
  await window.show({
    title: "Ready",
    message: "Version 0.8.0 is ready to install.",
    detail: "Installed version: 0.7.0",
    action: "restart",
    installerLink: true,
  });
  expect(windows).toHaveLength(1);
  const current = native.url;
  const readyHtml = decodeURIComponent(current);
  expect(readyHtml).toMatch(
    /<h1 id="update-status">Ready<\/h1>\s*<p>Version 0\.8\.0 is ready to install\.<\/p>\s*<\/main>\s*<footer class="footer"><div class="primary">/
  );
  expect(readyHtml).not.toContain('role="progressbar"');
  expect(readyHtml).toContain(
    '<div class="detail">Installed version: 0.7.0</div><a href="https://desktop-update.invalid/download" data-action="download">Download installer</a>'
  );
  expect(native.show).toHaveBeenCalledOnce();
  native.url = previous;
  native.navigate("https://desktop-update.invalid/restart");
  expect(action).toHaveBeenCalledTimes(1);
  native.url = current;
  native.navigate("https://desktop-update.invalid/restart");
  expect(action).toHaveBeenLastCalledWith("restart");
  native.navigate("https://desktop-update.invalid/download");
  expect(action).toHaveBeenLastCalledWith("download");
});

it("shows indeterminate progress without reloading an unchanged view", async () => {
  const window = new DesktopUpdateWindow(
    vi.fn<(action: DesktopUpdateWindow.Action) => void>(),
    vi.fn<() => void>()
  );
  const view = {
    title: "Downloading update…",
    busy: true,
    installerLink: true,
  };
  await window.show(view);
  await window.show(view);

  const [native] = windows;
  const html = decodeURIComponent(native.url);
  expect(html).toContain(
    '<div class="activity" role="progressbar" aria-labelledby="update-status"></div>'
  );
  expect(html).toContain('data-action="download"');
  expect(html).not.toContain('class="primary"');
  expect(native.loadURL).toHaveBeenCalledOnce();
});

it("reports a user close separately from Main dismissing the window", async () => {
  const closed = vi.fn<() => void>();
  const window = new DesktopUpdateWindow(
    vi.fn<(action: DesktopUpdateWindow.Action) => void>(),
    closed
  );
  const view = { title: "Checking", message: "Looking for updates" };

  await window.show(view);
  window.close();
  expect(windows[0].closed).toBe(true);
  expect(closed).not.toHaveBeenCalled();

  await window.show(view);
  windows[1].destroy();
  expect(closed).toHaveBeenCalledOnce();
});
