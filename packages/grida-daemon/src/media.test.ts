/** Contract pins — host-rooted media storage (GRIDA-SEC-004). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MediaStore } from "./media";

describe("MediaStore", () => {
  let baseDir: string;
  let mediaRoot: string;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-media-store-"));
    mediaRoot = path.join(baseDir, "media");
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it("publishes fixed, non-configurable storage bounds", () => {
    expect(MediaStore.MAX_BYTES).toBe(64 * 1024 * 1024);
    expect(MediaStore.MAX_ITEMS).toBe(512);
    expect(MediaStore.MAX_TOTAL_BYTES).toBe(4 * 1024 * 1024 * 1024);
  });

  it("persists exact bytes and path-free metadata across store instances", async () => {
    const bytes = new Uint8Array([0, 1, 2, 127, 128, 255]);
    const first = new MediaStore(mediaRoot);
    const saved = await first.save({
      file_name: "scene.glb",
      media_type: "MODEL/GLTF-BINARY",
      bytes,
    });

    expect(saved).toMatchObject({
      file_name: "scene.glb",
      media_type: "model/gltf-binary",
      byte_size: bytes.byteLength,
    });
    expect(Object.keys(saved).sort()).toEqual([
      "byte_size",
      "created_at",
      "file_name",
      "id",
      "media_type",
    ]);

    const reopened = new MediaStore(mediaRoot);
    await expect(reopened.list()).resolves.toEqual([saved]);
    const read = await reopened.read(saved.id);
    expect(read.item).toEqual(saved);
    expect(read.bytes).toEqual(bytes);
    expect("path" in read.item).toBe(false);

    const nativePath = await reopened.resolvePath(saved.id);
    const realMediaRoot = await fs.realpath(mediaRoot);
    expect(nativePath.startsWith(realMediaRoot + path.sep)).toBe(true);
    expect(path.basename(nativePath)).toBe("scene.glb");
    if (process.platform === "win32") return;
    const entryDirectory = path.dirname(path.dirname(nativePath));
    const metadataPath = path.join(entryDirectory, "item.json");
    expect((await fs.stat(entryDirectory)).mode & 0o777).toBe(0o700);
    expect((await fs.stat(nativePath)).mode & 0o777).toBe(0o600);
    expect((await fs.stat(metadataPath)).mode & 0o777).toBe(0o600);
  });

  it("lists newest first and a limit never deletes older entries", async () => {
    vi.useFakeTimers();
    const store = new MediaStore(mediaRoot);
    vi.setSystemTime(1000);
    const oldest = await store.save({
      file_name: "old.mp3",
      media_type: "audio/mpeg",
      bytes: new Uint8Array([1]),
    });
    vi.setSystemTime(2000);
    const middle = await store.save({
      file_name: "middle.png",
      media_type: "image/png",
      bytes: new Uint8Array([2]),
    });
    vi.setSystemTime(3000);
    const newest = await store.save({
      file_name: "new.glb",
      media_type: "model/gltf-binary",
      bytes: new Uint8Array([3]),
    });

    await expect(store.list({ limit: 2 })).resolves.toEqual([newest, middle]);

    const reopened = new MediaStore(mediaRoot);
    await expect(reopened.list()).resolves.toEqual([newest, middle, oldest]);
    await expect(reopened.read(oldest.id)).resolves.toMatchObject({
      item: oldest,
    });
  });

  it("establishes layout but does not scan entries for a zero-item view", async () => {
    const readdir = vi.spyOn(fs, "readdir");
    const store = new MediaStore(mediaRoot);

    await expect(store.list({ limit: 0 })).resolves.toEqual([]);
    expect(readdir).not.toHaveBeenCalled();
    expect((await fs.stat(path.join(mediaRoot, "items"))).isDirectory()).toBe(
      true
    );
  });

  it("rejects a new save when 512 committed valid items already exist", async () => {
    await seedValidItems(
      mediaRoot,
      Array.from({ length: MediaStore.MAX_ITEMS }, () => 1)
    );
    const store = new MediaStore(mediaRoot);

    await expect(
      store.save({
        file_name: "overflow.bin",
        media_type: "application/octet-stream",
        bytes: new Uint8Array([1]),
      })
    ).rejects.toThrow("media-item-limit-reached");
    await expect(store.list()).resolves.toHaveLength(MediaStore.MAX_ITEMS);
  }, 20_000);

  it("rejects a new save when committed logical bytes have reached 4 GiB", async () => {
    const itemCount = MediaStore.MAX_TOTAL_BYTES / MediaStore.MAX_BYTES;
    await seedValidItems(
      mediaRoot,
      Array.from({ length: itemCount }, () => MediaStore.MAX_BYTES)
    );
    const store = new MediaStore(mediaRoot);

    await expect(
      store.save({
        file_name: "overflow.bin",
        media_type: "application/octet-stream",
        bytes: new Uint8Array([1]),
      })
    ).rejects.toThrow("media-total-bytes-limit-reached");
    await expect(store.list()).resolves.toHaveLength(itemCount);
  }, 20_000);

  it("serializes concurrent admission so only one save can take the final item slot", async () => {
    await seedValidItems(
      mediaRoot,
      Array.from({ length: MediaStore.MAX_ITEMS - 1 }, () => 1)
    );
    const store = new MediaStore(mediaRoot);

    const results = await Promise.allSettled([
      store.save({
        file_name: "first.bin",
        media_type: "application/octet-stream",
        bytes: new Uint8Array([1]),
      }),
      store.save({
        file_name: "second.bin",
        media_type: "application/octet-stream",
        bytes: new Uint8Array([2]),
      }),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({ message: "media-item-limit-reached" }),
    });
    await expect(store.list()).resolves.toHaveLength(MediaStore.MAX_ITEMS);
  }, 20_000);

  it("rejects traversal-shaped filenames, invalid ids, and unbounded bytes", async () => {
    const store = new MediaStore(mediaRoot);
    for (const fileName of [
      "../escape.glb",
      "nested/file.glb",
      "nested\\file.glb",
      "..",
      "CON",
    ]) {
      await expect(
        store.save({
          file_name: fileName,
          media_type: "model/gltf-binary",
          bytes: new Uint8Array([1]),
        })
      ).rejects.toThrow("media-file-name-invalid");
    }
    await expect(store.read("../../escape")).rejects.toThrow(
      "media-id-invalid"
    );
    await expect(
      store.save({
        file_name: "empty.mp3",
        media_type: "audio/mpeg",
        bytes: new Uint8Array(),
      })
    ).rejects.toThrow("media-empty");
    const oversized = new Uint8Array([1]);
    Object.defineProperty(oversized, "byteLength", {
      value: MediaStore.MAX_BYTES + 1,
    });
    await expect(
      store.save({
        file_name: "large.glb",
        media_type: "model/gltf-binary",
        bytes: oversized,
      })
    ).rejects.toThrow("media-too-large");
    await expect(store.list({ limit: -1 })).rejects.toThrow(
      "media-limit-invalid"
    );
  });

  it("ignores incomplete and corrupt entries without hiding valid items", async () => {
    const store = new MediaStore(mediaRoot);
    const valid = await store.save({
      file_name: "valid.png",
      media_type: "image/png",
      bytes: new Uint8Array([1, 2, 3]),
    });

    const itemsRoot = path.join(mediaRoot, "items");
    const incompleteId = "11111111-1111-4111-8111-111111111111";
    await fs.mkdir(path.join(itemsRoot, incompleteId));

    const corruptId = "22222222-2222-4222-8222-222222222222";
    await fs.mkdir(path.join(itemsRoot, corruptId, "content"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(itemsRoot, corruptId, "item.json"),
      "{not json"
    );

    await expect(store.list()).resolves.toEqual([valid]);
    await expect(store.read(incompleteId)).rejects.toThrow(
      "media-item-corrupt"
    );
    await expect(store.read(corruptId)).rejects.toThrow("media-item-corrupt");
  });

  it.runIf(process.platform !== "win32")(
    "refuses an exact media-root symlink without mutating its target",
    async () => {
      const target = path.join(baseDir, "symlink-target");
      await fs.mkdir(target);
      await fs.symlink(target, mediaRoot);
      const store = new MediaStore(mediaRoot);

      await expect(store.list({ limit: 0 })).rejects.toThrow(
        "media-root-invalid"
      );
      await expect(fs.stat(path.join(target, "items"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    }
  );

  it.runIf(process.platform !== "win32")(
    "refuses symlinked entries and content",
    async () => {
      const store = new MediaStore(mediaRoot);
      const saved = await store.save({
        file_name: "sound.mp3",
        media_type: "audio/mpeg",
        bytes: new Uint8Array([1, 2, 3]),
      });
      const outside = path.join(baseDir, "outside.mp3");
      await fs.writeFile(outside, new Uint8Array([9, 9, 9]));
      const nativePath = await store.resolvePath(saved.id);
      await fs.unlink(nativePath);
      await fs.symlink(outside, nativePath);

      await expect(store.read(saved.id)).rejects.toThrow("media-item-corrupt");
      await expect(store.resolvePath(saved.id)).rejects.toThrow(
        "media-item-corrupt"
      );
      await expect(store.list()).resolves.toEqual([]);
    }
  );
});

async function seedValidItems(
  mediaRoot: string,
  byteSizes: readonly number[]
): Promise<void> {
  const batchSize = 32;
  for (let offset = 0; offset < byteSizes.length; offset += batchSize) {
    await Promise.all(
      byteSizes
        .slice(offset, offset + batchSize)
        .map((byteSize, index) =>
          seedValidItem(mediaRoot, offset + index, byteSize)
        )
    );
  }
}

async function seedValidItem(
  mediaRoot: string,
  index: number,
  byteSize: number
): Promise<void> {
  const id = `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
  const fileName = `seed-${index}.bin`;
  const entryDirectory = path.join(mediaRoot, "items", id);
  const contentDirectory = path.join(entryDirectory, "content");
  const contentPath = path.join(contentDirectory, fileName);
  await fs.mkdir(contentDirectory, { recursive: true, mode: 0o700 });
  const content = await fs.open(contentPath, "w", 0o600);
  try {
    await content.truncate(byteSize);
  } finally {
    await content.close();
  }
  await fs.writeFile(
    path.join(entryDirectory, "item.json"),
    JSON.stringify({
      version: 1,
      id,
      file_name: fileName,
      media_type: "application/octet-stream",
      byte_size: byteSize,
      created_at: index,
    }),
    { mode: 0o600 }
  );
}
