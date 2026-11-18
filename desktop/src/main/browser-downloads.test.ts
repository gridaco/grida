// GRIDA-SEC-016 — only native destinations and accepted download job lifetimes.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import type { BrowserWindow, DownloadItem, WebContents } from "electron";
import { afterEach, expect, it, vi } from "vitest";
import { BrowserDownloads } from "./browser-downloads";

const dialogs = vi.hoisted(() => ({
  showSaveDialogSync:
    vi.fn<(parent: unknown, options: unknown) => string | undefined>(),
  showOpenDialog:
    vi.fn<
      (
        parent: unknown,
        options: unknown
      ) => Promise<{ canceled: boolean; filePaths: string[] }>
    >(),
  showMessageBox: vi.fn<
    (parent: unknown, options: unknown) => Promise<{ response: number }>
  >(async () => ({ response: 0 })),
}));
vi.mock("electron", () => ({ dialog: dialogs }));
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
  vi.resetAllMocks();
});
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "grida-download-test-"));
  directories.push(root);
  const downloads = path.join(root, "Downloads");
  fs.mkdirSync(downloads);
  const manager = new BrowserDownloads(root, downloads);
  let live = true;
  const contents = { isDestroyed: () => false } as WebContents;
  const parent = { isDestroyed: () => false } as BrowserWindow;
  const accept = (name = "report.txt", confirmDownload = false) => {
    const item = Object.assign(new EventEmitter(), {
      getFilename: () => name,
      setSavePath: vi.fn<(filePath: string) => void>(),
      cancel: vi.fn<() => void>(),
    });
    const event = { preventDefault: vi.fn<() => void>() };
    manager.accept(
      event,
      item as unknown as DownloadItem,
      contents,
      parent,
      () => live,
      confirmDownload
    );
    return {
      item,
      event,
      saved: () => item.setSavePath.mock.calls[0]?.[0] as string | undefined,
    };
  };
  return {
    root,
    downloads,
    manager,
    contents,
    parent,
    accept,
    revoke: () => {
      live = false;
    },
  };
}

it("uses system Downloads without another prompt and reserves unique names without overwriting", () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.downloads, "report.txt"), "keep");
  const a = f.accept("../../report.txt");
  const b = f.accept("..\\report.txt");
  expect(a.saved()).toBe(path.join(f.downloads, "report (1).txt"));
  expect(b.saved()).toBe(path.join(f.downloads, "report (2).txt"));
  expect(fs.readFileSync(path.join(f.downloads, "report.txt"), "utf8")).toBe(
    "keep"
  );
  expect(dialogs.showSaveDialogSync).not.toHaveBeenCalled();
});

it("retains accepted jobs beyond source withdrawal and cancels only on an explicit reset", () => {
  const f = fixture();
  const a = f.accept();
  f.revoke();
  expect(a.item.cancel).not.toHaveBeenCalled();
  expect(f.accept().event.preventDefault).toHaveBeenCalledOnce();
  f.manager.cancelAll();
  expect(a.item.cancel).toHaveBeenCalledOnce();
});

it("requires a native save choice for an automation-exposed page without changing download preferences", () => {
  const f = fixture();
  const first = f.accept("report.txt", true);
  expect(first.event.preventDefault).toHaveBeenCalledOnce();
  expect(first.saved()).toBeUndefined();
  expect(fs.readdirSync(f.downloads)).toEqual([]);

  dialogs.showSaveDialogSync.mockReturnValueOnce(
    path.join(f.downloads, "approved.txt")
  );
  expect(f.accept("report.txt", true).saved()).toBe(
    path.join(f.downloads, "approved.txt")
  );
  expect(dialogs.showSaveDialogSync).toHaveBeenCalledTimes(2);
  expect(f.manager.preferences().askBeforeDownload).toBe(false);
  expect(f.accept("ordinary.txt").saved()).toBe(
    path.join(f.downloads, "ordinary.txt")
  );
});

it("reports canceled concurrent downloads once after the open Save dialog closes", async () => {
  const f = fixture();
  await f.manager.setPrompt({ askBeforeDownload: true });
  dialogs.showSaveDialogSync.mockImplementationOnce(() => {
    for (const name of ["second.txt", "third.txt"]) {
      const blocked = f.accept(name);
      expect(blocked.event.preventDefault).toHaveBeenCalledOnce();
      expect(blocked.saved()).toBeUndefined();
    }
    expect(dialogs.showMessageBox).not.toHaveBeenCalled();
    return path.join(f.downloads, "approved.txt");
  });
  expect(f.accept().saved()).toBe(path.join(f.downloads, "approved.txt"));
  expect(dialogs.showSaveDialogSync).toHaveBeenCalledOnce();
  await Promise.resolve();
  expect(dialogs.showMessageBox).toHaveBeenCalledExactlyOnceWith(
    f.parent,
    expect.objectContaining({
      message: "A browser download was canceled",
      detail: "A save dialog was already open. Retry the download.",
    })
  );
});

it("persists the optional save prompt privately and never accepts a caller path", async () => {
  const f = fixture();
  expect(f.manager.preferences()).toEqual({
    askBeforeDownload: false,
    directoryName: null,
  });
  await f.manager.setPrompt({ askBeforeDownload: true });
  expect(
    new BrowserDownloads(f.root, f.downloads).preferences().askBeforeDownload
  ).toBe(true);
  await expect(
    f.manager.setPrompt({
      askBeforeDownload: false,
      directory: "/not-accepted",
    })
  ).rejects.toThrow("browser_download_preferences_invalid");
});

it.runIf(process.platform !== "win32")(
  "persists settings with owner-only filesystem permissions",
  async () => {
    const f = fixture();
    await f.manager.setPrompt({ askBeforeDownload: true });
    expect(
      fs.statSync(path.join(f.root, "browser-downloads.json")).mode & 0o777
    ).toBe(0o600);
  }
);

it("uses a native directory chooser, returns only a display name, and respects cancellation", async () => {
  const f = fixture();
  dialogs.showOpenDialog.mockResolvedValueOnce({
    canceled: true,
    filePaths: [],
  });
  expect(await f.manager.chooseDirectory(f.parent)).toBeNull();
  const folder = path.join(f.root, "Exports");
  fs.mkdirSync(folder);
  dialogs.showOpenDialog.mockResolvedValueOnce({
    canceled: false,
    filePaths: [folder],
  });
  expect(await f.manager.chooseDirectory(f.parent)).toEqual({
    askBeforeDownload: false,
    directoryName: "Exports",
  });
  expect(f.accept().saved()).toBe(path.join(folder, "report.txt"));
});

it("rechecks the initiating document after a chooser and before a settings mutation", async () => {
  const f = fixture();
  const folder = path.join(f.root, "Exports");
  fs.mkdirSync(folder);
  let valid = true;
  const check = () => {
    if (!valid) throw new Error("expired");
  };
  dialogs.showOpenDialog.mockImplementationOnce(async () => {
    valid = false;
    return { canceled: false, filePaths: [folder] };
  });
  await expect(f.manager.chooseDirectory(f.parent, check)).rejects.toThrow(
    "expired"
  );
  expect(f.manager.preferences().directoryName).toBeNull();
});

it("rechecks ownership after a save dialog and cancels without writing", async () => {
  const f = fixture();
  await f.manager.setPrompt({ askBeforeDownload: true });
  dialogs.showSaveDialogSync.mockImplementationOnce(() => {
    f.revoke();
    return path.join(f.downloads, "report.txt");
  });
  const a = f.accept();
  expect(a.event.preventDefault).toHaveBeenCalledOnce();
  expect(a.item.setSavePath).not.toHaveBeenCalled();
});

it("does not traverse a symlink preferences file or overwrite its target", async () => {
  const f = fixture();
  const target = path.join(f.root, "target.json");
  fs.writeFileSync(target, '{"secret":"keep"}');
  fs.symlinkSync(target, path.join(f.root, "browser-downloads.json"));
  const manager = new BrowserDownloads(f.root, f.downloads);
  expect(manager.preferences()).toEqual({
    askBeforeDownload: false,
    directoryName: null,
  });
  await expect(manager.setPrompt({ askBeforeDownload: true })).rejects.toThrow(
    "browser_download_preferences_invalid"
  );
  expect(fs.readFileSync(target, "utf8")).toBe('{"secret":"keep"}');
});

it("handles corrupt and oversized preferences safely and bounds native filenames", () => {
  const f = fixture();
  fs.writeFileSync(
    path.join(f.root, "browser-downloads.json"),
    "x".repeat(20 * 1024)
  );
  expect(
    new BrowserDownloads(f.root, f.downloads).preferences().askBeforeDownload
  ).toBe(false);
  expect(BrowserDownloads.filename("CON.txt")).toBe("_CON.txt");
  expect(BrowserDownloads.filename("../../..")).toBe("download");
  expect(
    Buffer.byteLength(BrowserDownloads.filename("😀".repeat(300) + ".txt"))
  ).toBeLessThanOrEqual(180);
});
