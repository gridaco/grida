import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { NativeAttachmentBatch } from "./native-attachment-batch";
import { NativeSelectedImages } from "./native-selected-images";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true }))
  );
});

async function fixture() {
  const cwd = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "grida-attachment-batch-"))
  );
  roots.push(cwd);
  const protectedPath = path.join(cwd, "state");
  const directory = path.join(protectedPath, "custody");
  await fs.mkdir(protectedPath);
  const selectedImages = new NativeSelectedImages(directory, [protectedPath]);
  const batch = new NativeAttachmentBatch();
  const source = {
    selectedImages,
    files: true,
    references: { cwd, protectedPaths: [protectedPath] },
  };
  const operation = {
    sessionId: "session",
    requestId: "operation",
    kind: "reinsert",
  } as const;
  const check = vi.fn<() => void>();
  const image = (bytes: string) => ({
    kind: "image",
    name: "same-name.png",
    bytes: new TextEncoder().encode(bytes).buffer,
  });
  return {
    cwd,
    protectedPath,
    directory,
    batch,
    operation,
    source,
    check,
    image,
  };
}

it("uses distinct image custody for identical names and preserves ordered resources", async () => {
  const f = await fixture();
  const resource = path.join(f.cwd, "visible-folder");
  await fs.mkdir(resource);
  const send = vi.fn<(attachments: unknown) => Promise<unknown>>(
    async (attachments) => attachments
  );
  let paths: string[] = [];
  const result = await f.batch.withPrepared(
    f.operation,
    [
      f.image("first"),
      { kind: "reference", path: resource, mimeType: "image/png" },
      { kind: "keep", index: 1 },
      {
        kind: "file",
        name: "notes.txt",
        bytes: new TextEncoder().encode("notes").buffer,
      },
      f.image("second"),
    ],
    f.source,
    f.check,
    async (attachments) => {
      paths = attachments.flatMap((item) =>
        item.kind === "image" || item.kind === "staged_file"
          ? [item.selection.path]
          : []
      );
      expect(new Set(paths).size).toBe(3);
      expect(
        await Promise.all(paths.map((path) => fs.readFile(path, "utf8")))
      ).toEqual(["first", "notes", "second"]);
      return send(attachments);
    }
  );
  expect(send).toHaveBeenCalledTimes(1);
  expect(result).toEqual([
    {
      kind: "image",
      selection: expect.objectContaining({
        name: "same-name.png",
        source: "snapshot",
      }),
    },
    {
      kind: "reference",
      reference: {
        name: "visible-folder",
        path: resource,
        workspacePath: "visible-folder",
        mimeType: "inode/directory",
      },
    },
    { kind: "keep", index: 1 },
    {
      kind: "staged_file",
      selection: expect.objectContaining({
        name: "notes.txt",
        source: "snapshot",
      }),
      size: 5,
    },
    {
      kind: "image",
      selection: expect.objectContaining({
        name: "same-name.png",
        source: "snapshot",
      }),
    },
  ]);
  for (const path of paths)
    await expect(fs.stat(path)).rejects.toThrow("ENOENT");
});

it("releases newly captured sources when a later protected reference refuses the mutation", async () => {
  const f = await fixture();
  const send = vi.fn<() => Promise<void>>(async () => {});
  await expect(
    f.batch.withPrepared(
      f.operation,
      [f.image("first"), { kind: "reference", path: f.protectedPath }],
      f.source,
      f.check,
      send
    )
  ).rejects.toThrow("native_chat_file_reference_protected");
  expect(send).not.toHaveBeenCalled();
  expect(await fs.readdir(f.directory)).toEqual(["snapshots"]);
  expect(await fs.readdir(path.join(f.directory, "snapshots"))).toEqual([]);
});

it.each(["native_worker_unavailable", "sqlite_commit_unconfirmed"])(
  "retains staged sources after %s and retires them on receipt",
  async (code) => {
    const f = await fixture();
    await expect(
      f.batch.withPrepared(
        f.operation,
        [f.image("first"), f.image("second")],
        f.source,
        f.check,
        async () => {
          throw new Error(code);
        }
      )
    ).rejects.toThrow(code);
    const snapshotDirectory = path.join(f.directory, "snapshots");
    expect(await fs.readdir(snapshotDirectory)).toHaveLength(2);
    await f.batch.settle(f.operation, f.source.selectedImages);
    expect(await fs.readdir(snapshotDirectory)).toEqual([]);
  }
);

it("retires uncertain temporary sources after the host confirms the checkout is closed", async () => {
  const f = await fixture();
  const attachments = [f.image("first"), f.image("second")];
  const send = vi.fn<() => Promise<never>>();
  send.mockRejectedValueOnce(new Error("native_agent_request_timeout"));
  send.mockRejectedValueOnce(new Error("queue_checkout_unavailable"));
  const save = () =>
    f.batch.withPrepared(f.operation, attachments, f.source, f.check, send);
  const snapshots = path.join(f.directory, "snapshots");
  await expect(save()).rejects.toThrow("native_agent_request_timeout");
  expect(await fs.readdir(snapshots)).toHaveLength(2);
  await expect(save()).rejects.toThrow("queue_checkout_unavailable");
  expect(await fs.readdir(snapshots)).toEqual([]);
});
