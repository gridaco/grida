import fs from "node:fs";
import fsp from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NativeFileReference } from "./native-file-reference";

// GRIDA-SEC-004 — Main reads only metadata and refuses protected stores.
const POSTER = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";

let root: string;
let cwd: string;
let outside: string;
let store: string;

beforeEach(() => {
  root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "grida-file-reference-")
  );
  cwd = path.join(root, "workspace");
  outside = path.join(root, "downloads");
  store = path.join(root, "grida-data");
  for (const directory of [cwd, outside, store])
    fs.mkdirSync(path.join(directory, "nested"), { recursive: true });
  fs.writeFileSync(path.join(cwd, "nested", "clip.mov"), "inside");
  fs.writeFileSync(path.join(outside, "clip.mov"), "outside bytes");
  fs.writeFileSync(path.join(store, "credentials.json"), "secret");
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

const scope = () => ({ cwd, protectedPaths: [store] });

describe("NativeFileReference.resolve", () => {
  it("names a workspace file by its workspace path", async () => {
    expect(
      await NativeFileReference.resolve(
        path.join(cwd, "nested", "clip.mov"),
        scope()
      )
    ).toEqual({
      kind: "file",
      name: "clip.mov",
      path: path.join(cwd, "nested", "clip.mov"),
      workspacePath: "nested/clip.mov",
      size: 6,
    });
  });

  it("names a file outside the workspace by its canonical path only", async () => {
    const link = path.join(root, "alias.mov");
    fs.symlinkSync(path.join(outside, "clip.mov"), link);
    expect(await NativeFileReference.resolve(link, scope())).toEqual({
      kind: "file",
      name: "clip.mov",
      path: path.join(outside, "clip.mov"),
      size: 13,
    });
  });

  it("names a folder from metadata without reading its contents or inventing a size", async () => {
    const read = vi.spyOn(fsp, "readFile");
    const list = vi.spyOn(fsp, "readdir");
    const folder = path.join(cwd, "nested");
    expect(await NativeFileReference.resolve(folder, scope())).toEqual({
      kind: "directory",
      name: "nested",
      path: folder,
      workspacePath: "nested",
    });
    const alias = path.join(cwd, "outside-folder");
    fs.symlinkSync(outside, alias);
    expect(await NativeFileReference.resolve(alias, scope())).toEqual({
      kind: "directory",
      name: "downloads",
      path: outside,
    });
    expect(read).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it("refuses paths that are not a person's regular file or directory", async () => {
    for (const value of [
      "relative/clip.mov",
      path.join(outside, "missing.mov"),
      `${outside}/a\nb`,
      `/${"a".repeat(4097)}`,
      42,
      undefined,
    ])
      await expect(NativeFileReference.resolve(value, scope())).rejects.toThrow(
        "native_chat_file_reference_unavailable"
      );
  });

  it.runIf(process.platform !== "win32")(
    "refuses a special file without opening it",
    async () => {
      const fifo = path.join(outside, "pipe");
      execFileSync("mkfifo", [fifo]);
      await expect(NativeFileReference.resolve(fifo, scope())).rejects.toThrow(
        "native_chat_file_reference_unavailable"
      );
    }
  );

  it("refuses Grida's protected stores, also through a link", async () => {
    const secret = path.join(store, "credentials.json");
    const alias = path.join(outside, "innocent.mov");
    fs.symlinkSync(secret, alias);
    const folderAlias = path.join(outside, "innocent-folder");
    const ancestorAlias = path.join(outside, "innocent-parent");
    fs.symlinkSync(store, folderAlias);
    fs.symlinkSync(root, ancestorAlias);
    for (const value of [
      secret,
      alias,
      store,
      folderAlias,
      root,
      ancestorAlias,
    ])
      await expect(NativeFileReference.resolve(value, scope())).rejects.toThrow(
        "native_chat_file_reference_protected"
      );
  });
});

describe("NativeFileReference.preview", () => {
  it("keeps a bounded poster and media facts", () => {
    expect(
      NativeFileReference.preview({
        poster: POSTER,
        durationMs: 1500,
        width: 640,
        height: 360,
      })
    ).toEqual({ poster: POSTER, durationMs: 1500, width: 640, height: 360 });
    expect(NativeFileReference.preview(undefined)).toBeUndefined();
  });

  it("drops facts out of bounds instead of refusing the message", () => {
    // A corrupt clip can report a duration or frame no preview can carry.
    expect(
      NativeFileReference.preview({
        poster: POSTER,
        durationMs: 7 * 24 * 60 * 60 * 1000 + 1,
        width: 640,
        height: 360,
      })
    ).toEqual({ poster: POSTER, width: 640, height: 360 });
    expect(
      NativeFileReference.preview({
        poster: POSTER,
        durationMs: 1500,
        width: 16_385,
        height: 360,
      })
    ).toEqual({ poster: POSTER, durationMs: 1500 });
    for (const value of [
      { poster: "data:text/html;base64,AA" },
      { poster: `data:image/jpeg;base64,${"A".repeat(48 * 1024)}` },
      { durationMs: -1 },
      { durationMs: Number.POSITIVE_INFINITY },
      { width: 0, height: 360 },
      { width: 640, height: 1.5 },
      { width: 640 },
      { durationMs: 1500, extra: true },
      [],
      "poster",
      null,
    ])
      expect(NativeFileReference.preview(value)).toBeUndefined();
  });

  it("drops a malformed replayed preview instead of failing", () => {
    const details = NativeFileReference.detailsKey;
    expect(
      NativeFileReference.replayedPreview({
        [details]: { preview: { durationMs: 3000 } },
      })
    ).toEqual({ durationMs: 3000 });
    expect(
      NativeFileReference.replayedPreview({
        [details]: { preview: { poster: "javascript:alert(1)" } },
      })
    ).toBeUndefined();
    expect(NativeFileReference.replayedPreview(undefined)).toBeUndefined();
  });
});

describe("NativeFileReference.link", () => {
  it("is the ACP link the host records", () => {
    expect(
      NativeFileReference.link(
        {
          kind: "file",
          name: "my clip #1.mov",
          path: "/Users/someone/my clip #1.mov",
          size: 9,
        },
        {
          mimeType: NativeFileReference.mediaType("Video/QuickTime"),
          preview: { durationMs: 1000 },
        }
      )
    ).toEqual({
      type: "resource_link",
      name: "my clip #1.mov",
      uri: "file:///Users/someone/my%20clip%20%231.mov",
      size: 9,
      mimeType: "video/quicktime",
      _meta: {
        "co.grida/file-reference": { preview: { durationMs: 1000 } },
      },
    });
    expect(NativeFileReference.mediaType("not a type")).toBeUndefined();
  });

  it("derives folder type and strips byte size and media preview", () => {
    expect(
      NativeFileReference.link(
        {
          kind: "directory",
          name: "source #1",
          path: "/project/source #1",
          workspacePath: "source #1",
        },
        {
          mimeType: "video/quicktime",
          preview: { poster: POSTER, durationMs: 1000 },
        }
      )
    ).toEqual({
      type: "resource_link",
      name: "source #1",
      uri: "file:///project/source%20%231",
      mimeType: "inode/directory",
      _meta: { "co.grida/file-reference": { workspacePath: "source #1" } },
    });
    expect(
      NativeFileReference.link(
        {
          kind: "file",
          name: "clip.mov",
          path: "/project/clip.mov",
          size: 9,
        },
        { mimeType: "inode/directory" }
      )
    ).not.toHaveProperty("mimeType");
  });
});
