// GRIDA-SEC-004 / GRIDA-SEC-014 — exact selection and interrupted save ownership.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { NativeDocumentFiles } from "./native-document-files";
import {
  WorkspaceWriteUnverified,
  type WorkspaceFileWorkers,
} from "./workspace-file-worker";

it("reuses only the selected file and requires another read after navigation", async () => {
  const fixture = await files();
  const { root, selected, owner, workers, docs } = fixture;
  try {
    const alias = path.join(root, "alias.svg");
    await fs.symlink(selected, alias);
    const id = await docs.register(selected);
    expect(await docs.register(alias)).toBe(id);
    await expect(
      docs.register(path.join(root, "private", "account.grida"))
    ).rejects.toThrow("The selected document is unavailable");
    await expect(docs.write(id, "<svg/>", owner)).rejects.toThrow(
      "Read the document"
    );
    expect(await docs.read(id, owner)).toEqual({
      content: "\uFEFF<svg>𝄞</svg>",
      mtime: 123,
      filename: "drawing.svg",
      display_path: "~/drawing.svg",
    });
    docs.invalidate(id);
    await expect(docs.write(id, "<svg/>", owner)).rejects.toThrow(
      "Read the document"
    );
    expect(workers.saveDocument).not.toHaveBeenCalled();
    docs.release(id);
    await expect(docs.read(id, owner)).rejects.toThrow(
      "The selected document is unavailable"
    );
    expect(await docs.register(alias)).not.toBe(id);
  } finally {
    await fixture.close();
  }
});

it("holds a closing window's file while the dispatched save remains unverified", async () => {
  const fixture = await files();
  const { selected, docs, owner, workers } = fixture;
  const admitted = Promise.withResolvers<void>();
  const reply = Promise.withResolvers<never>();
  const exited = Promise.withResolvers<{ code: number | null }>();
  workers.saveDocument.mockImplementationOnce(async () => {
    admitted.resolve();
    return await reply.promise;
  });
  try {
    const id = await docs.register(selected);
    await docs.read(id, owner);
    const pending = docs.write(id, "<svg/>", owner);
    await admitted.promise;
    docs.release(id);
    await expect(docs.register(selected)).rejects.toThrow(
      "A document operation is still in progress"
    );
    reply.reject(new WorkspaceWriteUnverified(exited.promise));
    await expect(pending).rejects.toThrow("The save could not be verified");
    await expect(docs.register(selected)).rejects.toThrow(
      "A document operation is still in progress"
    );
    exited.resolve({ code: null });
    expect(await docs.register(selected)).not.toBe(id);
  } finally {
    await fixture.close();
  }
});

async function files() {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "grida-document-owner-"))
  );
  const selected = path.join(root, "drawing.svg");
  const protectedRoot = path.join(root, "private");
  await fs.mkdir(protectedRoot);
  await fs.writeFile(path.join(protectedRoot, "account.grida"), "private");
  await fs.writeFile(selected, "<svg/>");
  const bytes = Buffer.from("\uFEFF<svg>𝄞</svg>");
  const workers = {
    openDocument: vi.fn<WorkspaceFileWorkers["openDocument"]>(async () => ({
      size: bytes.length,
      mtime: 123,
      close: vi.fn<() => Promise<void>>(async () => {}),
      stream: () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
            controller.close();
          },
        }),
    })),
    saveDocument: vi.fn<WorkspaceFileWorkers["saveDocument"]>(async () => ({
      mtime: 124,
      identity: { device: "1", inode: "2", birthTimeNs: "3" },
    })),
  };
  return {
    docs: new NativeDocumentFiles([protectedRoot], root, workers),
    root,
    selected,
    workers,
    owner: { signal: new AbortController().signal, check: () => {} },
    close: () => fs.rm(root, { recursive: true, force: true }),
  };
}
