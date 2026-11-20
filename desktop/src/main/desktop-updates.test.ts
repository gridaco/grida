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
  const feed = feedResult
    ? {
        check: vi.fn<DesktopUpdateFeed["check"]>(async () => feedResult),
        install: vi.fn<DesktopUpdateFeed["install"]>(),
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
      detail: "Installed 0.7.0 · Update 0.7.1",
      actions: ["download"],
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
      actions: ["download"],
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

it.each([
  ["0.7.0", "Grida Desktop is up to date"],
  [null, "Couldn't check for updates"],
] as const)(
  "shows the Linux check result for published version %s",
  async (version, title) => {
    const { updates, window } = fixture(
      async () => handshake("0.7.0"),
      undefined,
      async () => version
    );
    updates.checkFromMenu();
    await vi.waitFor(() => expect(window.view?.title).toBe(title));
  }
);

it.each([false, true])(
  "observes a slow download after showing a fallback (window closed: %s)",
  async (closed) => {
    vi.useFakeTimers();
    const download = Promise.withResolvers<DesktopUpdateFeed.Result>();
    const { updates, window, feed } = fixture(async () => handshake("0.8.0"), {
      kind: "current",
    });
    feed?.check.mockReturnValueOnce(download.promise);
    const startup = updates.admitStartup();
    await vi.advanceTimersByTimeAsync(90_000);
    expect(window.view).toMatchObject({
      title: "Update to continue",
      actions: ["download", "retry"],
    });
    expect(feed?.check).toHaveBeenCalledExactlyOnceWith("0.8.0");
    const presentations = window.show.mock.calls.length;
    if (closed) window.closeFromChrome();
    download.resolve({ kind: "downloaded", version: "0.8.0" });
    await vi.advanceTimersByTimeAsync(0);
    expect(window.show).toHaveBeenCalledTimes(presentations + Number(!closed));
    expect(window.view?.actions).toEqual(
      closed ? ["download", "retry"] : ["restart", "download"]
    );
    if (!closed) window.closeFromChrome();
    await expect(startup).resolves.toBe(false);
  }
);
