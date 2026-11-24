import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
afterEach(() => vi.useRealTimers());

function handshake(desktopVersion: string): Response {
  return Response.json({ desktopVersion });
}

function fixture(
  requestCompatibility: DesktopUpdates.Options["requestCompatibility"],
  feedResult?: DesktopUpdateFeed.Result,
  linuxRelease?: DesktopUpdates.Options["linuxRelease"]
) {
  const request =
    vi.fn<DesktopUpdates.Options["requestCompatibility"]>(requestCompatibility);
  const openExternal = vi.fn<(url: string) => Promise<void>>(async () => {});
  const restart = vi.fn<(install: () => void) => void>();
  const installFailed = vi.fn<DesktopUpdates.Options["installFailed"]>();
  const showError = vi.fn<DesktopUpdates.Options["showError"]>();
  const downloadListeners = new Set<() => void>();
  const feed = feedResult
    ? {
        check: vi.fn<DesktopUpdateFeed["check"]>(async () => feedResult),
        checkElapsedMs: 0,
        install: vi.fn<DesktopUpdateFeed["install"]>(),
        onDownloading: vi.fn<DesktopUpdateFeed["onDownloading"]>((listener) => {
          downloadListeners.add(listener);
          return () => {
            downloadListeners.delete(listener);
          };
        }),
      }
    : undefined;
  const updates = new DesktopUpdates({
    origin: "https://grida.co",
    version: "0.7.0",
    requestCompatibility: request,
    linuxRelease,
    openExternal,
    restart,
    installFailed,
    feed,
    showError,
  });
  return {
    updates,
    window: mock.windows[0],
    request,
    openExternal,
    restart,
    installFailed,
    feed,
    showError,
    notifyDownloading: () => {
      for (const listener of downloadListeners) listener();
    },
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
    expect.any(AbortSignal)
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
    .fn<DesktopUpdates.Options["requestCompatibility"]>(async () =>
      handshake("0.7.0")
    )
    .mockRejectedValueOnce(new Error("offline"));
  const { updates, window } = fixture(fetch);
  const startup = updates.admitStartup();
  const admitted = vi.fn<(admit: boolean) => void>();
  void startup.then(admitted);

  await vi.waitFor(() => {
    expect(window.view).toMatchObject({
      title: "Couldn't check for updates",
      action: "retry",
      installerLink: false,
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
      message: "Automatic updates did not find a compatible version.",
      action: "retry",
      installerLink: true,
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
        title: "Update ready",
        message: `Grida Desktop ${downloadedVersion} is ready to install.`,
        action: "restart",
        installerLink: true,
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
    expect(window.view?.action).toBe("restart");
  });
  expect(feed?.check).toHaveBeenCalledExactlyOnceWith("0.7.1");
  window.action("download");
  expect(openExternal).toHaveBeenCalledExactlyOnceWith(
    "https://github.com/gridaco/grida/releases/tag/v0.7.2"
  );
  window.action("restart");
  expect(restart).toHaveBeenCalledOnce();
  expect(feed?.install).not.toHaveBeenCalled();
  restart.mock.lastCall?.[0]();
  expect(feed?.install).toHaveBeenCalledExactlyOnceWith(
    "0.7.2",
    expect.any(Function)
  );
  feed?.install.mock.lastCall?.[1]();
  expect(installFailed).toHaveBeenCalledExactlyOnceWith(
    "https://github.com/gridaco/grida/releases/tag/v0.7.2"
  );
});

it("offers a published Linux installer before the editor promotes that version", async () => {
  const linuxRelease = vi.fn<() => Promise<string | null>>(async () => "0.7.1");
  const { updates, window, openExternal, restart } = fixture(
    async () => handshake("0.7.0"),
    undefined,
    linuxRelease
  );
  await expect(updates.admitStartup()).resolves.toBe(true);
  expect(linuxRelease).not.toHaveBeenCalled();
  updates.checkFromMenu();

  await vi.waitFor(() => {
    expect(window.view).toMatchObject({
      title: "Update available",
      message: "Install Grida Desktop 0.7.1 to update.",
      action: "download",
    });
  });
  window.action("download");
  expect(openExternal).toHaveBeenCalledExactlyOnceWith(
    "https://github.com/gridaco/grida/releases/tag/v0.7.1"
  );
  expect(restart).not.toHaveBeenCalled();
});

it("offers the hosted release directly for required Linux recovery", async () => {
  const linuxRelease = vi.fn<() => Promise<string | null>>(async () => null);
  const { updates, window, openExternal } = fixture(
    async () => handshake("0.8.0"),
    undefined,
    linuxRelease
  );
  const startup = updates.admitStartup();
  await vi.waitFor(() => {
    expect(window.view).toMatchObject({
      title: "Update to continue",
      action: "download",
    });
  });
  expect(linuxRelease).not.toHaveBeenCalled();
  window.action("download");
  expect(openExternal).toHaveBeenCalledExactlyOnceWith(
    "https://github.com/gridaco/grida/releases/tag/v0.8.0"
  );
  window.closeFromChrome();
  await expect(startup).resolves.toBe(false);
});

it("shows the installed Linux version is current", async () => {
  const { updates, window } = fixture(
    async () => handshake("0.7.0"),
    undefined,
    async () => "0.7.0"
  );
  updates.checkFromMenu();
  await vi.waitFor(() =>
    expect(window.view?.title).toBe("Grida Desktop is up to date")
  );
});

it("offers retry and a manual installer when the Linux check fails", async () => {
  const { updates, window, openExternal } = fixture(
    async () => handshake("0.7.0"),
    undefined,
    async () => null
  );
  updates.checkFromMenu();
  await vi.waitFor(() =>
    expect(window.view).toMatchObject({
      title: "Couldn't check for updates",
      action: "retry",
      installerLink: true,
    })
  );
  window.action("download");
  expect(openExternal).toHaveBeenCalledExactlyOnceWith(
    "https://github.com/gridaco/grida/releases/latest"
  );
});

it.each([false, true])(
  "keeps observing a download after revealing the installer (window closed: %s)",
  async (closed) => {
    vi.useFakeTimers();
    const download = Promise.withResolvers<DesktopUpdateFeed.Result>();
    const { updates, window, feed, notifyDownloading } = fixture(
      async () => handshake("0.8.0"),
      { kind: "current" }
    );
    feed?.check.mockReturnValueOnce(download.promise);
    const startup = updates.admitStartup();
    await vi.advanceTimersByTimeAsync(0);
    expect(window.view).toMatchObject({
      title: "Checking for updates…",
      busy: true,
      installerLink: false,
    });
    expect(window.view?.action).toBeUndefined();
    notifyDownloading();
    await vi.advanceTimersByTimeAsync(44_999);
    expect(window.view).toMatchObject({
      title: "Downloading update…",
      busy: true,
      installerLink: false,
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(window.view).toMatchObject({
      title: "Downloading update…",
      busy: true,
      installerLink: true,
    });
    expect(feed?.check).toHaveBeenCalledExactlyOnceWith("0.8.0");
    const presentations = window.show.mock.calls.length;
    if (closed) {
      window.closeFromChrome();
      notifyDownloading();
    }
    download.resolve({ kind: "downloaded", version: "0.8.0" });
    await vi.advanceTimersByTimeAsync(0);
    expect(window.show).toHaveBeenCalledTimes(presentations + Number(!closed));
    expect(window.view?.action).toBe(closed ? undefined : "restart");
    if (!closed) window.closeFromChrome();
    await expect(startup).resolves.toBe(false);
  }
);

it("offers manual installation at the timeout and accepts a late download", async () => {
  vi.useFakeTimers();
  const download = Promise.withResolvers<DesktopUpdateFeed.Result>();
  const { updates, window, feed, notifyDownloading, openExternal } = fixture(
    async () => handshake("0.8.0"),
    { kind: "current" }
  );
  feed?.check.mockReturnValueOnce(download.promise);
  const startup = updates.admitStartup();
  await vi.advanceTimersByTimeAsync(599_999);
  expect(window.view).toMatchObject({
    title: "Checking for updates…",
    busy: true,
    installerLink: true,
  });

  await vi.advanceTimersByTimeAsync(1);
  notifyDownloading();
  expect(window.view).toMatchObject({
    title: "Update is taking too long",
    action: "download",
  });
  expect(window.view?.busy).toBeUndefined();
  updates.checkFromMenu();
  expect(window.focus).toHaveBeenCalledOnce();
  expect(feed?.check).toHaveBeenCalledOnce();
  window.action("download");
  expect(openExternal).toHaveBeenCalledExactlyOnceWith(
    "https://github.com/gridaco/grida/releases/tag/v0.8.0"
  );

  download.resolve({ kind: "downloaded", version: "0.8.0" });
  await vi.advanceTimersByTimeAsync(0);
  expect(window.view).toMatchObject({
    title: "Update ready",
    action: "restart",
    installerLink: true,
  });
  window.closeFromChrome();
  await expect(startup).resolves.toBe(false);
});

it("keeps the deadline of a check already running in the background", async () => {
  vi.useFakeTimers();
  const download = Promise.withResolvers<DesktopUpdateFeed.Result>();
  const { updates, window, feed } = fixture(async () => handshake("0.7.0"), {
    kind: "current",
  });
  if (!feed) throw new Error("Missing test feed");
  feed.checkElapsedMs = 599_000;
  feed.check.mockReturnValueOnce(download.promise);
  updates.checkFromMenu();
  await vi.advanceTimersByTimeAsync(0);
  expect(window.view).toMatchObject({ busy: true, installerLink: true });
  await vi.advanceTimersByTimeAsync(1_000);
  expect(window.view?.action).toBe("download");
  window.closeFromChrome();
  download.resolve({ kind: "current" });
});

it("focuses an active download and starts a fresh check after an error", async () => {
  const pending = Promise.withResolvers<DesktopUpdateFeed.Result>();
  const { updates, window, request, feed, notifyDownloading } = fixture(
    async () => handshake("0.8.0"),
    { kind: "downloaded", version: "0.8.0" }
  );
  feed?.check.mockReturnValueOnce(pending.promise);
  const startup = updates.admitStartup();
  await vi.waitFor(() => expect(feed?.check).toHaveBeenCalledOnce());
  notifyDownloading();
  expect(window.view).toMatchObject({
    title: "Downloading update…",
    busy: true,
  });

  updates.checkFromMenu();
  expect(window.focus).toHaveBeenCalledOnce();
  expect(request).toHaveBeenCalledOnce();
  expect(feed?.check).toHaveBeenCalledOnce();

  pending.resolve({ kind: "unavailable" });
  await vi.waitFor(() =>
    expect(window.view).toMatchObject({
      title: "Update to continue",
      action: "retry",
      installerLink: true,
    })
  );
  expect(window.view?.busy).toBeUndefined();
  updates.checkFromMenu();
  expect(window.view?.title).toBe("Checking for updates…");
  await vi.waitFor(() => expect(window.view?.action).toBe("restart"));
  expect(request).toHaveBeenCalledTimes(2);
  expect(feed?.check).toHaveBeenCalledTimes(2);
  window.closeFromChrome();
  await expect(startup).resolves.toBe(false);
});

it("keeps the restart action if opening the installer page fails", async () => {
  const { updates, window, openExternal, showError } = fixture(
    async () => handshake("0.8.0"),
    { kind: "downloaded", version: "0.8.0" }
  );
  const startup = updates.admitStartup();
  await vi.waitFor(() => expect(window.view?.action).toBe("restart"));
  openExternal.mockRejectedValueOnce(new Error("no default browser"));
  window.action("download");
  await vi.waitFor(() => expect(showError).toHaveBeenCalledOnce());
  expect(window.view?.action).toBe("restart");
  window.closeFromChrome();
  await expect(startup).resolves.toBe(false);
});
