import { beforeEach, expect, it, vi } from "vitest";
import type { DesktopUpdateFeed } from "./desktop-update-feed";
import type { DesktopUpdateWindow } from "./desktop-update-window";

const mock = vi.hoisted(() => {
  const windows: Window[] = [];

  class Window {
    constructor(
      readonly action: (action: DesktopUpdateWindow.Action) => void,
      readonly closeFromChrome: () => void
    ) {
      windows.push(this);
    }

    show = vi.fn<(view: DesktopUpdateWindow.View) => Promise<void>>(
      async () => {}
    );
    close = vi.fn<() => void>();
    focus = vi.fn<() => void>();

    get view() {
      return this.show.mock.lastCall?.[0];
    }
  }

  return { Window, windows };
});

vi.mock("./desktop-update-window", () => ({
  DesktopUpdateWindow: mock.Window,
}));

import { DesktopUpdates } from "./desktop-updates";

beforeEach(() => {
  mock.windows.length = 0;
});

function handshake(desktopVersion: string): Response {
  return Response.json({ desktopVersion });
}

function fixture(
  fetch: DesktopUpdates.Options["fetch"],
  feedResult?: DesktopUpdateFeed.Result
) {
  const request = vi.fn<DesktopUpdates.Options["fetch"]>(fetch);
  const openExternal = vi.fn<(url: string) => Promise<void>>(async () => {});
  const restart = vi.fn<(install: () => void) => void>();
  const installFailed = vi.fn<DesktopUpdates.Options["installFailed"]>();
  const feed = feedResult
    ? {
        check: vi.fn<DesktopUpdateFeed["check"]>(async () => feedResult),
        install: vi.fn<(onFailure: () => void) => void>(),
      }
    : undefined;
  const updates = new DesktopUpdates({
    origin: "https://grida.co",
    version: "0.7.0",
    fetch: request,
    openExternal,
    restart,
    installFailed,
    feed,
    showError: vi.fn<() => void>(),
  });
  return {
    updates,
    window: mock.windows[0],
    request,
    openExternal,
    restart,
    installFailed,
    feed,
  };
}

it.each([
  ["the same release line with a newer patch", () => handshake("0.7.1")],
  ["an earlier hosted release line", () => handshake("0.6.9")],
  ["a legacy 404", () => new Response(null, { status: 404 })],
  [
    "the previous hosted deployment's sign-in redirect",
    () =>
      new Response(null, {
        status: 307,
        headers: { Location: "https://grida.co/sign-in?next=/desktop" },
      }),
  ],
] as const)("starts normally with %s", async (_name, response) => {
  const { updates, window, request, feed } = fixture(async () => response(), {
    kind: "current",
  });

  await expect(updates.admitStartup()).resolves.toBe(true);
  expect(request).toHaveBeenCalledExactlyOnceWith(
    "https://grida.co/desktop/compatibility",
    expect.objectContaining({
      credentials: "omit",
      redirect: "manual",
      cache: "no-store",
    })
  );
  expect(window.show).not.toHaveBeenCalled();
  expect(feed?.check).not.toHaveBeenCalled();
});

it("leaves an unexpected handshake redirect in retryable recovery", async () => {
  const { updates, window } = fixture(
    async () =>
      new Response(null, {
        status: 307,
        headers: { Location: "https://example.com/sign-in?next=/desktop" },
      })
  );
  const startup = updates.admitStartup();
  await vi.waitFor(() => {
    expect(window.view?.title).toBe("Couldn't check for updates");
  });
  window.closeFromChrome();
  await expect(startup).resolves.toBe(false);
});

it("surfaces a retryable handshake outage and admits startup after recovery", async () => {
  const fetch = vi
    .fn<DesktopUpdates.Options["fetch"]>(async () => handshake("0.7.0"))
    .mockRejectedValueOnce(new Error("offline"));
  const { updates, window } = fixture(fetch);
  const startup = updates.admitStartup();
  const admitted = vi.fn<(admit: boolean) => void>();
  void startup.then(admitted);

  await vi.waitFor(() => {
    expect(window.view).toMatchObject({
      title: "Couldn't check for updates",
      actions: ["retry"],
    });
  });
  expect(admitted).not.toHaveBeenCalled();
  window.action("retry");

  await expect(startup).resolves.toBe(true);
  expect(window.close).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("keeps startup gated when the downloaded version is on an older release line", async () => {
  const { updates, window, openExternal, restart, feed } = fixture(
    async () => handshake("0.8.1"),
    { kind: "downloaded", version: "0.7.5" }
  );
  const startup = updates.admitStartup();
  const admitted = vi.fn<(admit: boolean) => void>();
  void startup.then(admitted);

  await vi.waitFor(() => {
    expect(window.view).toMatchObject({
      title: "Update to continue",
      message: "Install Grida 0.8.1.",
      actions: ["download", "retry"],
    });
  });
  expect(admitted).not.toHaveBeenCalled();
  window.action("restart");
  expect(restart).not.toHaveBeenCalled();
  expect(feed?.install).not.toHaveBeenCalled();

  window.action("download");
  expect(openExternal).toHaveBeenCalledExactlyOnceWith(
    "https://github.com/gridaco/grida/releases/tag/v0.8.1"
  );
  window.closeFromChrome();
  await expect(startup).resolves.toBe(false);
});

it.each([
  ["0.8.1", "0.8.0"],
  ["1.0.0", "1.0.0"],
])(
  "offers restart when hosted %s can use downloaded version %s",
  async (hostedVersion, downloadedVersion) => {
    const { updates, window } = fixture(async () => handshake(hostedVersion), {
      kind: "downloaded",
      version: downloadedVersion,
    });
    const startup = updates.admitStartup();
    await vi.waitFor(() => {
      expect(window.view).toMatchObject({
        title: "Update to continue",
        message: `Version ${downloadedVersion} is ready to install.`,
        detail: `Installed 0.7.0 · Update ${downloadedVersion}`,
        actions: ["restart", "download"],
      });
    });
    window.closeFromChrome();
    await expect(startup).resolves.toBe(false);
  }
);

it("offers the downloaded patch and hands installation failures back to Main", async () => {
  const { updates, window, restart, feed, openExternal, installFailed } =
    fixture(async () => handshake("0.7.1"), {
      kind: "downloaded",
      version: "0.7.2",
    });
  await expect(updates.admitStartup()).resolves.toBe(true);

  updates.checkFromMenu();
  await vi.waitFor(() => {
    expect(window.view?.title).toBe("Update ready");
    expect(window.view?.message).toBe(
      "Grida Desktop 0.7.2 is ready to install."
    );
    expect(window.view?.actions).toContain("restart");
  });
  expect(feed?.check).toHaveBeenCalledOnce();
  window.action("download");
  expect(openExternal).toHaveBeenCalledExactlyOnceWith(
    "https://github.com/gridaco/grida/releases/tag/v0.7.2"
  );
  window.action("restart");
  expect(restart).toHaveBeenCalledOnce();
  expect(feed?.install).not.toHaveBeenCalled();
  restart.mock.lastCall?.[0]();
  expect(feed?.install).toHaveBeenCalledOnce();
  feed?.install.mock.lastCall?.[0]();
  expect(installFailed).toHaveBeenCalledExactlyOnceWith(
    "https://github.com/gridaco/grida/releases/tag/v0.7.2"
  );
});

it("offers the exact release installer page from Linux's manual menu check", async () => {
  const { updates, window, openExternal, restart } = fixture(async () =>
    handshake("0.7.1")
  );
  updates.checkFromMenu();

  await vi.waitFor(() => {
    expect(window.view).toMatchObject({
      title: "Update available",
      actions: ["download"],
    });
  });
  window.action("download");
  expect(openExternal).toHaveBeenCalledExactlyOnceWith(
    "https://github.com/gridaco/grida/releases/tag/v0.7.1"
  );
  expect(restart).not.toHaveBeenCalled();
});
