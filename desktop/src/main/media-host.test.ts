import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaStore } from "@grida/daemon/server";
import { DesktopMediaHost } from "./media-host";

describe("DesktopMediaHost", () => {
  let root: string;
  let mediaRoot: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "grida-media-host-"));
    mediaRoot = path.join(root, "media");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });

  it("returns a bounded newest-first path-free list and byte views", async () => {
    const store = new MediaStore(mediaRoot);
    const saved = [];
    for (let index = 0; index < 22; index++) {
      saved.push(
        await store.save({
          file_name: `clip-${index}.mp3`,
          media_type: "audio/mpeg",
          bytes: Uint8Array.from([index]),
        })
      );
    }
    const host = createHost();

    const items = await host.list();
    const read = await host.read(saved.at(-1)!.id);

    expect(items).toHaveLength(20);
    expect(items[0].created_at).toBeGreaterThanOrEqual(
      items.at(-1)!.created_at
    );
    expect(items[0]).not.toHaveProperty("path");
    expect(read).toEqual({
      item: saved.at(-1),
      bytes: Uint8Array.from([21]).buffer,
    });
    expect(read).not.toHaveProperty("path");
  });

  it("serializes one queued read and refuses any larger backlog", async () => {
    const item = await new MediaStore(mediaRoot).save({
      file_name: "model.glb",
      media_type: "model/gltf-binary",
      bytes: Uint8Array.from([1, 2, 3]),
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const read = vi
      .spyOn(MediaStore.prototype, "read")
      .mockImplementation(async () => {
        await gate;
        return { item, bytes: Uint8Array.from([1, 2, 3]) };
      });
    const host = createHost();

    const first = host.read(item.id);
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    const second = host.read(item.id);
    await expect(host.read(item.id)).rejects.toThrow("media-read-failed");
    release();
    await expect(first).resolves.toEqual({
      item,
      bytes: Uint8Array.from([1, 2, 3]).buffer,
    });
    await expect(second).resolves.toEqual({
      item,
      bytes: Uint8Array.from([1, 2, 3]).buffer,
    });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("resolves native paths only for the injected Finder action", async () => {
    const item = await new MediaStore(mediaRoot).save({
      file_name: "model.glb",
      media_type: "model/gltf-binary",
      bytes: Uint8Array.from([1, 2, 3]),
    });
    const reveal = vi.fn<(nativePath: string) => void>();
    const host = createHost({ reveal });

    await host.reveal(item.id);

    expect(reveal).toHaveBeenCalledTimes(1);
    expect(path.basename(reveal.mock.calls[0][0])).toBe("model.glb");
  });

  it("creates the managed layout before opening its folder", async () => {
    const openFolder = vi.fn<(nativePath: string) => void>();
    const host = createHost({ openFolder });

    await host.openFolder();

    expect(openFolder).toHaveBeenCalledWith(path.resolve(mediaRoot));
    expect((await fs.stat(path.join(mediaRoot, "items"))).isDirectory()).toBe(
      true
    );
  });

  it("does not leak native paths through failures", async () => {
    const secretPath = path.join(mediaRoot, "private-model.glb");
    const host = createHost({
      openFolder: async () => {
        throw new Error(`cannot open ${secretPath}`);
      },
    });

    await expect(host.openFolder()).rejects.toThrow("media-folder-open-failed");
    await expect(host.openFolder()).rejects.not.toThrow(secretPath);
    await expect(host.read("../../etc/passwd")).rejects.toThrow(
      "media-read-failed"
    );
  });

  function createHost(
    overrides: Partial<ConstructorParameters<typeof DesktopMediaHost>[0]> = {}
  ): DesktopMediaHost {
    return new DesktopMediaHost({
      root: mediaRoot,
      reveal: () => undefined,
      openFolder: () => undefined,
      ...overrides,
    });
  }
});
