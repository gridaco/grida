// GRIDA-SEC-004 / GRIDA-SEC-014 — exact selection and interrupted save ownership.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import {
  NativeDocumentFiles,
  NativeDocumentIdentityBusy,
} from "./native-document-files";
import {
  WorkspaceWriteUnverified,
  WorkspaceFileWorkers,
} from "./workspace-file-worker";

const resources = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;

it.runIf(process.platform !== "win32")(
  "coalesces chat identity probes while the selected SVG is loading",
  async () => {
    const fixture = await documentFixture();
    const { selected, owner, workers, openOwner } = fixture;
    const files = openOwner();
    const started = Promise.withResolvers<void>();
    const continueRead = Promise.withResolvers<void>();
    const open = workers.openDocument.getMockImplementation()!;
    workers.openDocument.mockImplementationOnce(async (...args) => {
      started.resolve();
      await continueRead.promise;
      return await open(...args);
    });
    let read: ReturnType<typeof files.read> | undefined;
    try {
      const id = await files.register(selected);
      read = files.read(id, owner);
      await started.promise;
      const [first, second] = await Promise.all([
        files.chatIdentity(id, owner),
        files.chatIdentity(id, owner),
      ]);
      expect(second).toBe(first);
      continueRead.resolve();
      expect((await read).content).toContain("<svg>");
    } finally {
      continueRead.resolve();
      await read?.catch(() => {});
      await fixture.close();
    }
  }
);

it("reuses only the selected file and requires another read after navigation", async () => {
  const fixture = await documentFixture();
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
  const fixture = await documentFixture();
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

it.runIf(process.platform !== "win32")(
  "keeps the durable chat identity through an atomic save and owner restart",
  async () => {
    const fixture = await documentFixture();
    const { selected, owner, workers, identityDirectory, openOwner } = fixture;
    const files = openOwner();
    try {
      const id = await files.register(selected);
      const key = await files.chatIdentity(id, owner);
      expect(await files.chatIdentity(id, owner)).toBe(key);
      const [receipt] = await fs.readdir(identityDirectory);
      const receiptPath = path.join(identityDirectory, receipt);
      const retained = await fs.readFile(receiptPath, "utf8");
      expect(retained).not.toContain(selected);
      expect(retained).not.toContain("<svg");
      expect((await fs.stat(receiptPath)).mode & 0o777).toBe(0o600);
      await expect(files.register(receiptPath)).rejects.toThrow(
        "The selected document is unavailable"
      );

      await files.read(id, owner);
      const saving = Promise.withResolvers<void>();
      const proceed = Promise.withResolvers<void>();
      workers.saveDocument.mockImplementationOnce(async (grant, content) => {
        saving.resolve();
        await proceed.promise;
        return { mtime: 124, identity: await replaceFile(grant.path, content) };
      });
      const write = files.write(id, "<svg>updated</svg>", owner);
      await saving.promise;
      try {
        await expect(files.chatIdentity(id, owner)).rejects.toBeInstanceOf(
          NativeDocumentIdentityBusy
        );
      } finally {
        proceed.resolve();
      }
      expect(await write).toEqual({
        mtime: 124,
      });
      expect(await files.chatIdentity(id, owner)).toBe(key);
      const nextReceipt = await fs.readFile(receiptPath, "utf8");
      expect(nextReceipt).not.toBe(retained);
      files.release(id);

      const restarted = openOwner();
      const nextId = await restarted.register(selected);
      expect(nextId).not.toBe(id);
      await expect(restarted.chatIdentity(id, owner)).rejects.toThrow(
        "The selected document is unavailable"
      );
      expect(await restarted.chatIdentity(nextId, owner)).toBe(key);
    } finally {
      await fixture.close();
    }
  }
);

it.runIf(process.platform !== "win32")(
  "refuses a changed live selection and gives its reselected replacement a new chat key",
  async () => {
    const fixture = await documentFixture();
    const { selected, owner, openOwner } = fixture;
    const files = openOwner();
    try {
      const id = await files.register(selected);
      const key = await files.chatIdentity(id, owner);
      await replaceFile(selected, Buffer.from("<svg/>"));
      await expect(files.chatIdentity(id, owner)).rejects.toThrow(
        "The document changed on disk"
      );
      files.release(id);
      const restarted = openOwner();
      const next = await restarted.register(selected);
      expect(await restarted.chatIdentity(next, owner)).not.toBe(key);
    } finally {
      await fixture.close();
    }
  }
);

it.runIf(process.platform !== "win32")(
  "does not advance a chat key after an unverified save",
  async () => {
    const fixture = await documentFixture();
    const { selected, owner, workers, openOwner } = fixture;
    const files = openOwner();
    try {
      const id = await files.register(selected);
      const key = await files.chatIdentity(id, owner);
      await files.read(id, owner);
      workers.saveDocument.mockImplementationOnce(async (grant, content) => {
        await replaceFile(grant.path, content);
        throw new WorkspaceWriteUnverified();
      });
      await expect(
        files.write(id, "<svg>unknown</svg>", owner)
      ).rejects.toThrow("The save could not be verified");
      await expect(files.chatIdentity(id, owner)).rejects.toThrow(
        "The document changed on disk"
      );
      files.release(id);
      const restarted = openOwner();
      expect(
        await restarted.chatIdentity(await restarted.register(selected), owner)
      ).not.toBe(key);
    } finally {
      await fixture.close();
    }
  }
);

it.runIf(process.platform !== "win32")(
  "keeps a successful document save when a private identity receipt becomes unsafe",
  async () => {
    const fixture = await documentFixture();
    const { selected, owner, workers, identityDirectory, openOwner } = fixture;
    const files = openOwner();
    try {
      const id = await files.register(selected);
      await files.chatIdentity(id, owner);
      const [receipt] = await fs.readdir(identityDirectory);
      const receiptPath = path.join(identityDirectory, receipt);
      const retained = await fs.readFile(receiptPath, "utf8");
      await fs.chmod(receiptPath, 0o644);
      await files.read(id, owner);
      workers.saveDocument.mockImplementationOnce(async (grant, content) => ({
        mtime: 124,
        identity: await replaceFile(grant.path, content),
      }));
      expect(await files.write(id, "<svg>saved</svg>", owner)).toEqual({
        mtime: 124,
      });
      expect(await fs.readFile(selected, "utf8")).toBe("<svg>saved</svg>");
      await expect(files.chatIdentity(id, owner)).rejects.toThrow(
        "The selected document is unavailable"
      );
      expect(await fs.readFile(receiptPath, "utf8")).toBe(retained);
    } finally {
      await fixture.close();
    }
  }
);

it.runIf(
  Boolean(resources) &&
    process.platform === "darwin" &&
    process.arch === "arm64"
)("reopens the same identity after a confirmed native file save", async () => {
  const fixture = await documentFixture();
  const { root, selected, owner, identityDirectory } = fixture;
  const workers = new WorkspaceFileWorkers(resources!);
  const open = () =>
    new NativeDocumentFiles([], root, workers, identityDirectory);
  try {
    const original = open();
    const originalId = await original.register(selected);
    const key = await original.chatIdentity(originalId, owner);
    original.release(originalId);

    const filesOnly = open();
    const id = await filesOnly.register(selected);
    await filesOnly.read(id, owner);
    await filesOnly.write(
      id,
      "<svg>saved by the native file worker</svg>",
      owner
    );
    filesOnly.release(id);

    const reopened = open();
    const reopenedId = await reopened.register(selected);
    expect(await reopened.chatIdentity(reopenedId, owner)).toBe(key);
    expect((await reopened.read(reopenedId, owner)).content).toBe(
      "<svg>saved by the native file worker</svg>"
    );
  } finally {
    workers.close();
    await fixture.close();
  }
});

async function replaceFile(selected: string, content: Buffer) {
  const temporary = selected + ".fixture";
  await fs.writeFile(temporary, content);
  await fs.rename(temporary, selected);
  const metadata = await fs.lstat(selected, { bigint: true });
  return {
    device: String(metadata.dev),
    inode: String(metadata.ino),
    birthTimeNs: String(metadata.birthtimeNs),
  };
}

async function documentFixture() {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "grida-document-owner-"))
  );
  const selected = path.join(root, "drawing.svg");
  const protectedRoot = path.join(root, "private");
  const identityDirectory = path.join(root, "document-identities");
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
    openOwner: () =>
      new NativeDocumentFiles(
        [protectedRoot],
        root,
        workers,
        identityDirectory
      ),
    identityDirectory,
    root,
    selected,
    workers,
    owner: { signal: new AbortController().signal, check: () => {} },
    close: () => fs.rm(root, { recursive: true, force: true }),
  };
}
