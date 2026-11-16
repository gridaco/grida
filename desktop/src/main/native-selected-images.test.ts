// GRIDA-SEC-004 — immutable source capture and protected, retryable Main snapshots.
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { NativeSelectedImages } from "./native-selected-images";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))
  );
});
async function fixture() {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "grida-image-custody-"))
  );
  roots.push(root);
  const state = path.join(root, "state");
  const directory = path.join(state, "desktop-image-custody");
  const source = path.join(root, "original.jpg");
  const bytes = Buffer.from("original-source-pixels-different-from-preview");
  await fs.writeFile(source, bytes);
  return {
    root,
    state,
    directory,
    source,
    bytes,
    facts: {
      sha256: [...createHash("sha256").update(bytes).digest()],
      size: bytes.length,
      lastModified: Math.trunc((await fs.stat(source)).mtimeMs),
    },
    images: new NativeSelectedImages(directory, [state]),
  };
}

describe("NativeSelectedImages", () => {
  it.skipIf(process.platform === "win32")(
    "refuses a FIFO without waiting for a writer",
    async () => {
      const f = await fixture();
      const fifo = path.join(f.root, "pipe.jpg");
      await new Promise<void>((resolve, reject) =>
        execFile("/usr/bin/mkfifo", [fifo], (error) =>
          error ? reject(error) : resolve()
        )
      );
      const mtime = Math.trunc((await fs.stat(fifo)).mtimeMs);
      const opening = f.images
        .capture("chat", "pipe", {
          name: "pipe.jpg",
          path: fifo,
          sha256: f.facts.sha256,
          size: 1,
          lastModified: mtime,
        })
        .then(
          () => "accepted",
          (error: Error) => error.message
        );
      let unblock: Awaited<ReturnType<typeof fs.open>> | undefined;
      const stalled = Promise.withResolvers<string>();
      const timer = setTimeout(() => {
        stalled.resolve("opening_fifo_blocked");
        void fs
          .open(fifo, constants.O_RDWR | constants.O_NONBLOCK)
          .then((handle) => {
            unblock = handle;
          });
      }, 2000);
      try {
        expect(await Promise.race([opening, stalled.promise])).toContain(
          "selected_image_unavailable"
        );
      } finally {
        clearTimeout(timer);
        await opening;
        await unblock?.close();
      }
    }
  );
  it("refuses same-name, same-size disk replacement against the selected frozen digest", async () => {
    const f = await fixture();
    await fs.writeFile(f.source, Buffer.alloc(f.bytes.length, 3));
    await fs.utimes(
      f.source,
      new Date(f.facts.lastModified),
      new Date(f.facts.lastModified)
    );
    await expect(
      f.images.capture("chat", "first-send", {
        ...f.facts,
        name: "original.jpg",
        path: f.source,
      })
    ).rejects.toThrow("selected_image_changed");
    expect(await fs.readdir(f.directory)).toEqual([]);
  });
  it("pins actual disk bytes and recovers the same descriptor after source loss and restart", async () => {
    const f = await fixture();
    const original = await f.images.capture("chat", "input", {
      ...f.facts,
      name: "original.jpg",
      path: f.source,
    });
    expect(original).toEqual({
      path: f.source,
      name: "original.jpg",
      source: "disk",
      sha256: [...createHash("sha256").update(f.bytes).digest()],
    });
    await fs.unlink(f.source);
    const reopened = new NativeSelectedImages(f.directory, [f.state]);
    expect(
      await reopened.capture("chat", "input", {
        ...f.facts,
        name: "original.jpg",
        path: f.source,
      })
    ).toEqual(original);
    await reopened.complete("chat", "input");
    expect(await fs.readdir(f.directory)).toEqual([]);
  });

  it("recovers a verified disk descriptor from restored frozen bytes without fabricating a new source", async () => {
    const f = await fixture();
    const original = await f.images.capture("chat", "input", {
      ...f.facts,
      name: "original.jpg",
      path: f.source,
    });
    await fs.unlink(f.source);
    const reopened = new NativeSelectedImages(f.directory, [f.state]);
    const restored = await reopened.capture("chat", "input", {
      name: "original.jpg",
      bytes: Uint8Array.from(f.bytes).buffer,
    });
    expect(restored).toEqual(original);
    expect(restored.source).toBe("disk");
    expect(restored.path).toBe(f.source);
    await expect(
      reopened.capture("chat", "input", {
        name: "original.jpg",
        bytes: Uint8Array.from([1]).buffer,
      })
    ).rejects.toThrow("identity_reused");
    expect(await fs.readdir(f.directory)).toEqual(
      expect.arrayContaining([expect.stringMatching(/\.json$/)])
    );
  });

  it("keeps exact snapshot bytes inside protected state until a known outcome and preserves unknown retries", async () => {
    const f = await fixture();
    const bytes = Uint8Array.from(f.bytes).buffer;
    const original = await f.images.capture("chat", "input", {
      name: "clipboard.jpg",
      bytes,
    });
    expect(original.source).toBe("snapshot");
    expect(path.dirname(original.path)).toBe(
      path.join(f.directory, "snapshots")
    );
    expect(await fs.readFile(original.path)).toEqual(f.bytes);

    // A disconnected process has no authority to discard an unknown attempt.
    const reopened = new NativeSelectedImages(f.directory, [f.state]);
    const [a, b] = await Promise.all([
      reopened.capture("chat", "input", { name: "clipboard.jpg", bytes }),
      reopened.capture("chat", "input", { name: "clipboard.jpg", bytes }),
    ]);
    expect(a).toEqual(original);
    expect(b).toEqual(original);
    await expect(
      reopened.capture("chat", "input", {
        name: "clipboard.jpg",
        bytes: Uint8Array.from([1]).buffer,
      })
    ).rejects.toThrow("identity_reused");
    expect(await fs.readFile(original.path)).toEqual(f.bytes);
    await reopened.complete("chat", "input");
    await expect(fs.stat(original.path)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await fs.readdir(f.directory)).toEqual(["snapshots"]);
  });

  it.skipIf(process.platform === "win32")(
    "creates snapshot directories and files with private POSIX permissions",
    async () => {
      const f = await fixture();
      const original = await f.images.capture("chat", "private", {
        name: "clipboard.jpg",
        bytes: Uint8Array.from(f.bytes).buffer,
      });
      expect((await fs.stat(path.dirname(original.path))).mode & 0o777).toBe(
        0o700
      );
      expect((await fs.stat(original.path)).mode & 0o777).toBe(0o600);
    }
  );

  it("refuses protected files, symlinks, hard links, oversized sources and caller ambiguity before capture", async () => {
    const f = await fixture();
    await fs.mkdir(f.state, { mode: 0o700 });
    const secret = path.join(f.state, "secret.jpg");
    await fs.writeFile(secret, f.bytes);
    await expect(
      f.images.capture("chat", "protected", {
        ...f.facts,
        name: "secret.jpg",
        path: secret,
      })
    ).rejects.toThrow("protected");
    const alias = path.join(f.root, "alias.jpg");
    await fs.symlink(f.source, alias);
    await expect(
      f.images.capture("chat", "alias", {
        ...f.facts,
        name: "alias.jpg",
        path: alias,
      })
    ).rejects.toThrow("symlink");
    const linked = path.join(f.root, "linked.jpg");
    await fs.link(f.source, linked);
    await expect(
      f.images.capture("chat", "linked", {
        ...f.facts,
        name: "linked.jpg",
        path: linked,
      })
    ).rejects.toThrow("unavailable");
    await fs.unlink(linked);
    await fs.truncate(f.source, NativeSelectedImages.maxBytes + 1);
    await expect(
      f.images.capture("chat", "large", {
        ...f.facts,
        name: "original.jpg",
        path: f.source,
      })
    ).rejects.toThrow("size_limit");
    for (const source of [
      { name: "both.jpg", path: f.source, bytes: new ArrayBuffer(1) },
      { name: "../alias.jpg", bytes: new ArrayBuffer(1) },
      { name: "nothing.jpg" },
    ])
      await expect(f.images.capture("chat", "invalid", source)).rejects.toThrow(
        "unavailable"
      );
    expect(await fs.readdir(f.directory)).toEqual([]);
  });

  it("scopes same-named snapshots by both session and input identity", async () => {
    const f = await fixture();
    const source = { name: "same.jpg", bytes: Uint8Array.from(f.bytes).buffer };
    const a = await f.images.capture("a", "input", source);
    const b = await f.images.capture("b", "input", source);
    expect(a.path).not.toBe(b.path);
    await f.images.complete("a", "input");
    expect(await fs.readFile(b.path)).toEqual(f.bytes);
  });
});
