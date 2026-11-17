import { describe, expect, it, vi } from "vitest";
import type { DesktopBrowser } from "@grida/desktop-bridge";
import { SettingsBrowser } from "./settings-browser";

type Clear = DesktopBrowser.Bridge["clearBrowsingData"];

function managementFixture() {
  const preferences = { askBeforeDownload: false, directoryName: null };
  const management: DesktopBrowser.Management.Bridge = {
    version: 1,
    clearHistory: vi.fn<DesktopBrowser.Management.Bridge["clearHistory"]>(
      async () => true
    ),
    clearCache: vi.fn<DesktopBrowser.Management.Bridge["clearCache"]>(
      async () => true
    ),
    resetPermissions: vi.fn<
      DesktopBrowser.Management.Bridge["resetPermissions"]
    >(async () => true),
    downloadPreferences: vi.fn<
      DesktopBrowser.Management.Bridge["downloadPreferences"]
    >(async () => preferences),
    setDownloadPrompt: vi.fn<
      DesktopBrowser.Management.Bridge["setDownloadPrompt"]
    >(async ({ askBeforeDownload }) => ({
      ...preferences,
      askBeforeDownload,
    })),
    chooseDownloadDirectory: vi.fn<
      DesktopBrowser.Management.Bridge["chooseDownloadDirectory"]
    >(async () => ({
      ...preferences,
      directoryName: "Exports",
    })),
    openPage: vi.fn<NonNullable<DesktopBrowser.Management.Bridge["openPage"]>>(
      async () => true
    ),
  };
  const api = {
    clearBrowsingData: vi.fn<Clear>().mockResolvedValue(true),
    management,
  };
  return {
    api,
    management,
    controller: new SettingsBrowser.Controller(() => api),
  };
}
function fixture() {
  const api = { clearBrowsingData: vi.fn<Clear>().mockResolvedValue(true) };
  const controller = new SettingsBrowser.Controller(() => api);
  return { api, controller };
}

describe("SettingsBrowser.Controller", () => {
  it("loads native download settings and uses only the native directory chooser", async () => {
    const f = managementFixture();
    f.controller.refresh();
    await Promise.resolve();
    expect(f.controller.read()).toMatchObject({
      managementSupported: true,
      canOpenHistory: true,
      downloads: { askBeforeDownload: false, directoryName: null },
    });
    await f.controller.chooseDownloadDirectory();
    expect(f.management.chooseDownloadDirectory).toHaveBeenCalledWith();
    expect(f.controller.read().downloads?.directoryName).toBe("Exports");
    await f.controller.setDownloadPrompt(true);
    expect(f.management.setDownloadPrompt).toHaveBeenCalledWith({
      askBeforeDownload: true,
    });
    expect(f.controller.read().downloads?.askBeforeDownload).toBe(true);
  });

  it("keeps history/cache/permission reset distinct from full browser clearing", async () => {
    const f = managementFixture();
    await f.controller.clearHistory();
    expect(f.controller.read().notice).toBe("Browsing history cleared.");
    await f.controller.clearCache();
    expect(f.controller.read().notice).toBe("Browser cache cleared.");
    await f.controller.resetPermissions();
    expect(f.controller.read().notice).toContain("Site permissions reset");
    expect(f.api.clearBrowsingData).not.toHaveBeenCalled();
    expect(f.management.clearHistory).toHaveBeenCalledOnce();
    expect(f.management.clearCache).toHaveBeenCalledOnce();
  });

  it("opens history only through a strict native UI intent and explains no-workspace results", async () => {
    const f = managementFixture();
    await f.controller.openHistory("https://example.test/");
    expect(f.management.openPage).toHaveBeenCalledWith({
      url: "https://example.test/",
    });
    await f.controller.openHistory("file:///private/never-open");
    expect(f.management.openPage).toHaveBeenCalledOnce();
    vi.mocked(f.management.openPage!).mockResolvedValue(false);
    await f.controller.openHistory("https://example.test/");
    expect(f.controller.read().notice).toContain("Open a workspace");
  });

  it("discards late preference reads and cancels pending management observations", async () => {
    const f = managementFixture();
    let complete!: (
      value: DesktopBrowser.Management.DownloadPreferences
    ) => void;
    vi.mocked(f.management.downloadPreferences).mockReturnValueOnce(
      new Promise((done) => {
        complete = done;
      })
    );
    f.controller.refresh();
    await f.controller.setDownloadPrompt(true);
    complete({ askBeforeDownload: false, directoryName: null });
    await Promise.resolve();
    expect(f.controller.read().downloads?.askBeforeDownload).toBe(true);
    let done!: (value: boolean) => void;
    vi.mocked(f.management.clearCache).mockReturnValueOnce(
      new Promise((resolve) => {
        done = resolve;
      })
    );
    const clearing = f.controller.clearCache();
    f.controller.cancel();
    done(true);
    await clearing;
    expect(f.controller.read().action).toBeNull();
    expect(f.controller.read().notice).not.toBe("Browser cache cleared.");
  });

  it("rejects malformed native results without exposing diagnostics", async () => {
    const f = managementFixture();
    vi.mocked(f.management.clearHistory).mockResolvedValue(
      "yes" as unknown as boolean
    );
    await f.controller.clearHistory();
    expect(f.controller.read().error).toBe(
      "The browser action could not be completed. Try again."
    );
    expect(f.controller.read().notice).toBeNull();
    vi.mocked(f.management.chooseDownloadDirectory).mockRejectedValue(
      new Error("/private/secret")
    );
    await f.controller.chooseDownloadDirectory();
    expect(f.controller.read().error).not.toContain("/private");
  });

  it("clears globally without a workspace catalog, selector or renderer consent argument", async () => {
    const { api, controller } = fixture();
    controller.refresh();
    expect(controller.read().supported).toBe(true);
    await controller.clear();
    expect(api.clearBrowsingData.mock.calls).toEqual([[]]);
    expect(controller.read()).toMatchObject({
      clearing: false,
      result: "cleared",
      error: null,
    });
  });

  it("treats the native false result as cancellation without claiming success", async () => {
    const { api, controller } = fixture();
    api.clearBrowsingData.mockResolvedValue(false);
    await controller.clear();
    expect(controller.read()).toMatchObject({
      result: "cancelled",
      clearing: false,
      error: null,
    });
  });

  it("reports clear failures without exposing private native diagnostics", async () => {
    const { api, controller } = fixture();
    api.clearBrowsingData.mockRejectedValue(
      new Error("/private/browser-profile/secret")
    );
    await controller.clear();
    expect(controller.read()).toMatchObject({
      result: null,
      clearing: false,
      error: "Couldn’t clear browsing data. Try again.",
    });
  });

  it("deduplicates clear and focus refresh while native confirmation or clearing is pending", async () => {
    const { api, controller } = fixture();
    let resolve!: (value: boolean) => void;
    api.clearBrowsingData.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    const clearing = controller.clear();
    expect(controller.read().clearing).toBe(true);
    await controller.clear();
    controller.refresh();
    expect(api.clearBrowsingData).toHaveBeenCalledTimes(1);
    expect(controller.read().clearing).toBe(true);
    resolve(true);
    await clearing;
    expect(controller.read().result).toBe("cleared");
  });

  it("ignores an old clear result without unlocking a newer pending operation", async () => {
    const { api, controller } = fixture();
    let finishOld!: (value: boolean) => void;
    let finishNew!: (value: boolean) => void;
    api.clearBrowsingData
      .mockReturnValueOnce(
        new Promise((done) => {
          finishOld = done;
        })
      )
      .mockReturnValueOnce(
        new Promise((done) => {
          finishNew = done;
        })
      );
    const old = controller.clear();
    controller.cancel();
    controller.refresh();
    const current = controller.clear();
    finishOld(true);
    await old;
    expect(controller.read()).toMatchObject({ clearing: true, result: null });
    finishNew(false);
    await current;
    expect(controller.read()).toMatchObject({
      clearing: false,
      result: "cancelled",
    });
  });

  it("stays unsupported on older hosts without issuing page or scoped clear operations", async () => {
    const controller = new SettingsBrowser.Controller(() => null);
    controller.refresh();
    await controller.clear();
    expect(controller.read()).toEqual({
      supported: false,
      clearing: false,
      result: null,
      error: null,
      managementSupported: false,
      canOpenHistory: false,
      downloads: null,
      action: null,
      notice: null,
    });
  });

  it("does not interpret malformed native results as cancellation", async () => {
    const { api, controller } = fixture();
    api.clearBrowsingData.mockResolvedValue("unexpected" as unknown as boolean);
    await controller.clear();
    expect(controller.read().result).toBeNull();
    expect(controller.read().error).not.toBeNull();
  });
});
