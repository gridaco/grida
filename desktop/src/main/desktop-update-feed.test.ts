import { EventEmitter } from "node:events";
import type { AutoUpdater } from "electron";
import { describe, expect, it, vi } from "vitest";
import { DesktopUpdateFeed } from "./desktop-update-feed";

function updater() {
  return Object.assign(new EventEmitter(), {
    checkForUpdates: vi.fn<AutoUpdater["checkForUpdates"]>(),
    quitAndInstall: vi.fn<AutoUpdater["quitAndInstall"]>(),
    setFeedURL: vi.fn<AutoUpdater["setFeedURL"]>(),
  });
}

describe("DesktopUpdateFeed", () => {
  it("keeps the release feed and shares an in-flight download", async () => {
    const electron = updater();
    const feed = new DesktopUpdateFeed(
      electron as unknown as AutoUpdater,
      "0.7.0",
      "darwin",
      "arm64"
    );

    expect(electron.setFeedURL).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://update.electronjs.org/gridaco/grida/darwin-arm64/0.7.0",
      })
    );
    const result = feed.check();
    expect(feed.check()).toBe(result);
    expect(electron.checkForUpdates).toHaveBeenCalledTimes(1);
    const firstObserver = vi.fn<() => void>();
    const stopObserving = feed.onDownloading(firstObserver);
    expect(firstObserver).not.toHaveBeenCalled();
    electron.emit("update-available");
    expect(firstObserver).toHaveBeenCalledOnce();
    stopObserving();
    const joinedObserver = vi.fn<() => void>();
    const stopJoinedObserver = feed.onDownloading(joinedObserver);
    expect(joinedObserver).toHaveBeenCalledOnce();
    electron.emit("update-available");
    expect(firstObserver).toHaveBeenCalledOnce();
    expect(joinedObserver).toHaveBeenCalledOnce();
    stopJoinedObserver();
    const onFailure = vi.fn<() => void>();
    feed.install("0.7.1", onFailure);
    expect(electron.quitAndInstall).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledOnce();

    electron.emit("update-downloaded", {}, "", "v0.7.1");
    await expect(result).resolves.toEqual({
      kind: "downloaded",
      version: "0.7.1",
    });
    const finishedObserver = vi.fn<() => void>();
    feed.onDownloading(finishedObserver)();
    expect(finishedObserver).not.toHaveBeenCalled();
    onFailure.mockClear();
    feed.install("0.7.1", onFailure);
    expect(electron.quitAndInstall).toHaveBeenCalledOnce();
    expect(onFailure).not.toHaveBeenCalled();
    electron.emit("error", new Error("install failed"));
    expect(onFailure).toHaveBeenCalledOnce();
  });

  it("permits a retry after an error or a download without a stable version", async () => {
    const electron = updater();
    const feed = new DesktopUpdateFeed(
      electron as unknown as AutoUpdater,
      "0.7.0",
      "win32",
      "x64"
    );
    const failed = feed.check();
    electron.emit("error", new Error("feed unavailable"));
    await expect(failed).resolves.toEqual({ kind: "unavailable" });

    const invalid = feed.check();
    electron.emit("update-downloaded", {}, "", "0.8.0-beta.1");
    await expect(invalid).resolves.toEqual({ kind: "unavailable" });
    feed.install("0.8.0-beta.1", vi.fn<() => void>());
    expect(electron.quitAndInstall).not.toHaveBeenCalled();

    const next = feed.check();
    electron.emit("update-downloaded", {}, "", "0.7.1");
    await expect(next).resolves.toEqual({
      kind: "downloaded",
      version: "0.7.1",
    });
  });

  it("checks again when a cached update is older than the hosted release line", async () => {
    const electron = updater();
    const feed = new DesktopUpdateFeed(
      electron as unknown as AutoUpdater,
      "0.7.0",
      "darwin",
      "arm64"
    );
    const patch = feed.check();
    electron.emit("update-downloaded", {}, "", "v0.7.1");
    await expect(patch).resolves.toEqual({
      kind: "downloaded",
      version: "0.7.1",
    });
    await expect(feed.check("0.7.2")).resolves.toEqual({
      kind: "downloaded",
      version: "0.7.1",
    });
    expect(electron.checkForUpdates).toHaveBeenCalledOnce();

    const replacement = feed.check("0.8.0");
    expect(feed.check("0.8.0")).toBe(replacement);
    expect(electron.checkForUpdates).toHaveBeenCalledTimes(2);
    const onFailure = vi.fn<() => void>();
    feed.install("0.7.1", onFailure);
    expect(electron.quitAndInstall).not.toHaveBeenCalled();

    electron.emit("update-downloaded", {}, "", "v0.8.0");
    await expect(replacement).resolves.toEqual({
      kind: "downloaded",
      version: "0.8.0",
    });
    feed.install("0.7.1", onFailure);
    expect(onFailure).toHaveBeenCalledTimes(2);
    expect(electron.quitAndInstall).not.toHaveBeenCalled();

    feed.install("0.8.0", onFailure);
    expect(electron.quitAndInstall).toHaveBeenCalledOnce();
  });
});
