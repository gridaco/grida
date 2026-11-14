import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const scope = () => ({ cwd, protectedPaths: [store] });

describe("NativeFileReference.resolve", () => {
  it("names a workspace file by its workspace path", async () => {
    expect(
      await NativeFileReference.resolve(
        path.join(cwd, "nested", "clip.mov"),
        scope()
      )
    ).toEqual({
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
      name: "clip.mov",
      path: path.join(outside, "clip.mov"),
      size: 13,
    });
  });

  it("refuses paths that are not a person's regular file", async () => {
    for (const value of [
      "relative/clip.mov",
      path.join(outside, "missing.mov"),
      outside,
      `${outside}/a\nb`,
      `/${"a".repeat(4097)}`,
      42,
      undefined,
    ])
      await expect(NativeFileReference.resolve(value, scope())).rejects.toThrow(
        "native_chat_file_reference_unavailable"
      );
  });

  it("refuses Grida's protected stores, also through a link", async () => {
    const secret = path.join(store, "credentials.json");
    const alias = path.join(outside, "innocent.mov");
    fs.symlinkSync(secret, alias);
    for (const value of [secret, alias])
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
});
