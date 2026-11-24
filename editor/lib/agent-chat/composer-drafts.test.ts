import { describe, expect, it, vi } from "vitest";
import { AttachmentBatch } from "./attachment-batch";
import {
  ComposerDrafts,
  type ComposerDraftBlob,
  type ComposerDraftBlobs,
} from "./composer-drafts";

class MemoryBlobs implements ComposerDraftBlobs {
  readonly items = new Map<string, ComposerDraftBlob>();
  async get(key: string) {
    return this.items.get(key) ?? null;
  }
  async put(key: string, value: ComposerDraftBlob) {
    this.items.set(key, value);
  }
  async delete(key: string) {
    this.items.delete(key);
  }
  async transfer(key: string, value: ComposerDraftBlob, retiredKey: string) {
    this.items.set(key, value);
    this.items.delete(retiredKey);
  }
}

class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();
  failWrites = false;
  failRemovals = false;
  get length() {
    return this.items.size;
  }
  clear() {
    this.items.clear();
  }
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  key(index: number) {
    return [...this.items.keys()][index] ?? null;
  }
  removeItem(key: string) {
    if (this.failRemovals) throw new Error("storage removal refused");
    this.items.delete(key);
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error("quota exceeded");
    this.items.set(key, value);
  }
}

const doc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

describe("ComposerDrafts", () => {
  it("recovers only the captured draft revision when staging crosses a restart", async () => {
    const storage = new MemoryStorage();
    const blobs = new MemoryBlobs();
    const drafts = new ComposerDrafts(storage, blobs);
    const key = "w:chat";
    const document = doc("Same words");
    drafts.write(key, document);
    const documentKey = ComposerDrafts.prefix + key;
    const capturedRow = storage.getItem(documentKey)!;
    const attachment = {
      kind: "file" as const,
      name: "brief.txt",
      bytes: new ArrayBuffer(4),
    };
    await drafts.writeAttachment(key, attachment);
    await drafts.stageOutgoing(
      key,
      {
        inputId: "local-id",
        text: "Same words",
        mode: "submit",
        allowLibrarySelection: false,
        attachment,
        outgoing: { id: "local-id", staged: true, document },
      },
      true,
      attachment
    );

    // The pending transaction committed, but the old text survived a crash
    // before the distinct local-storage document could be rotated.
    storage.setItem(documentKey, capturedRow);
    const interrupted = new ComposerDrafts(storage, blobs);
    expect(await interrupted.readPending(key)).toMatchObject({
      text: "Same words",
      attachment,
    });
    expect(interrupted.read(key)).toBeNull();
    expect(await interrupted.readAttachment(key)).toBeNull();

    // Identical words entered in the next draft have their own revision.
    const next = new ComposerDrafts(storage, blobs);
    next.write(key, document);
    await next.writeAttachment(key, attachment);
    const reopened = new ComposerDrafts(storage, blobs);
    await reopened.readPending(key);
    expect(reopened.read(key)).toEqual(document);
    expect(await reopened.readAttachment(key)).toEqual(attachment);
  });

  it.each(["before", "after"] as const)(
    "keeps both drafts and their exact attachments when reloaded %s the capture transaction commits",
    async (when) => {
      const storage = new MemoryStorage(),
        blobs = new MemoryBlobs();
      const drafts = new ComposerDrafts(storage, blobs);
      const key = "w:chat";
      const document = doc("Same words");
      const original = {
        kind: "file" as const,
        name: "same.txt",
        bytes: new Uint8Array([1]).buffer,
      };
      drafts.write(key, document);
      await drafts.writeAttachment(key, original);
      const started = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const transfer = blobs.transfer.bind(blobs);
      vi.spyOn(blobs, "transfer").mockImplementation(async (...args) => {
        if (when === "after") await transfer(...args);
        started.resolve();
        await release.promise;
        if (when === "before") await transfer(...args);
      });
      const staged = drafts.stageOutgoing(
        key,
        {
          inputId: "local-id",
          text: "Same words",
          mode: "submit",
          allowLibrarySelection: false,
          attachment: original,
          outgoing: { id: "local-id", staged: true, document },
        },
        true,
        original
      );
      try {
        await started.promise;
        drafts.write(key, null);
        drafts.write(key, document);
        // The restarted renderer sees only transactions completed at reload.
        const disk = new MemoryBlobs(),
          kept = new MemoryStorage();
        for (const [name, value] of blobs.items) disk.items.set(name, value);
        for (let i = 0; i < storage.length; i++) {
          const name = storage.key(i)!;
          kept.setItem(name, storage.getItem(name)!);
        }
        const reopened = new ComposerDrafts(kept, disk);
        expect(reopened.isRecoveringRotation(key)).toBe(true);
        expect(await reopened.readPending(key)).toMatchObject({
          inputId: "local-id",
          text: "Same words",
          attachment: original,
        });
        expect(reopened.read(key)).toEqual(document);
        expect(await reopened.readAttachment(key)).toBeNull();
        const again = new ComposerDrafts(kept, disk);
        expect(await again.readPending(key)).toMatchObject({
          inputId: "local-id",
          attachment: original,
        });
        expect(again.read(key)).toEqual(document);
      } finally {
        release.resolve();
        await staged;
      }
    }
  );

  it("never borrows a replacement file with the captured name during interrupted staging", async () => {
    const storage = new MemoryStorage(),
      blobs = new MemoryBlobs();
    const key = "w:chat",
      drafts = new ComposerDrafts(storage, blobs);
    const original = {
      kind: "file" as const,
      name: "same.txt",
      bytes: new Uint8Array([1]).buffer,
    };
    const later = { ...original, bytes: new Uint8Array([2]).buffer };
    await drafts.writeAttachment(key, original);
    const rejected = vi
      .spyOn(blobs, "transfer")
      .mockRejectedValueOnce(new Error("capture aborted"));
    await expect(
      drafts.stageOutgoing(
        key,
        {
          inputId: "local-id",
          text: "Original",
          mode: "submit",
          allowLibrarySelection: false,
          attachment: original,
          outgoing: { id: "local-id", staged: true },
        },
        true,
        original
      )
    ).rejects.toThrow("capture aborted");
    rejected.mockRestore();
    drafts.write(key, doc("Follow-up"));
    await drafts.writeAttachment(key, later);
    const reopened = new ComposerDrafts(storage, blobs);
    const recovered = await reopened.readPending(key);
    expect(recovered?.outgoing).toMatchObject({
      id: "local-id",
      missingAttachmentName: "same.txt",
      retryBlocked: true,
    });
    expect(recovered?.attachment).toBeUndefined();
    expect(await reopened.readAttachment(key)).toEqual(later);
    expect(reopened.read(key)).toEqual(doc("Follow-up"));
  });

  it("keeps the missing reference with its draft through reload and promotion until removed or replaced", async () => {
    const storage = new MemoryStorage(),
      blobs = new MemoryBlobs();
    const drafts = new ComposerDrafts(storage, blobs),
      source = "w:draft",
      dest = "w:chat";
    await drafts.writeAttachment(source, {
      kind: "reference",
      name: "local.mov",
      file: new File([""], "local.mov"),
    });
    expect(await drafts.readMissingAttachment(source)).toBeNull();
    const reopened = new ComposerDrafts(storage, blobs);
    expect(await reopened.readAttachment(source)).toBeNull();
    expect(await reopened.readMissingAttachment(source)).toBe("local.mov");
    await reopened.move(source, dest);
    const promoted = new ComposerDrafts(storage, blobs);
    expect(await promoted.readMissingAttachment(source)).toBeNull();
    expect(await promoted.readMissingAttachment(dest)).toBe("local.mov");
    await promoted.writeAttachment(dest, null);
    expect(
      await new ComposerDrafts(storage, blobs).readMissingAttachment(dest)
    ).toBeNull();
    const withoutBlobs = new ComposerDrafts(storage, null);
    await withoutBlobs.writeMissingAttachment(dest, "unavailable.txt");
    expect(
      await new ComposerDrafts(storage, null).readMissingAttachment(dest)
    ).toBe("unavailable.txt");
    await withoutBlobs.writeAttachment(dest, null);
    expect(
      await new ComposerDrafts(storage, null).readMissingAttachment(dest)
    ).toBeNull();
  });

  it("keeps a selection made while the prior attachment is loading", async () => {
    const blobs = new MemoryBlobs();
    const drafts = new ComposerDrafts(null, blobs);
    const delayed = Promise.withResolvers<ComposerDraftBlob | null>();
    vi.spyOn(blobs, "get").mockReturnValueOnce(delayed.promise);
    const stale = drafts.readAttachment("w:c");
    await Promise.resolve();
    const selected = {
      kind: "file" as const,
      name: "new.txt",
      bytes: new ArrayBuffer(2),
    };
    await drafts.writeAttachment("w:c", selected);
    delayed.resolve({ ...selected, name: "old.txt" });
    expect(await stale).toEqual(selected);
    expect(await drafts.readAttachment("w:c")).toEqual(selected);
  });

  it("keeps a selected original File with the draft across storage reopen", async () => {
    const blobs = new MemoryBlobs();
    const drafts = new ComposerDrafts(null, blobs);
    const file = new File(["original-not-preview"], "photo.jpg", {
      type: "image/jpeg",
    });
    await drafts.writeAttachment("w:chat", {
      kind: "image",
      name: file.name,
      file,
      originalFile: new File(["original-path-handle"], file.name),
      mimeType: file.type,
    });
    const restored = await new ComposerDrafts(null, blobs).readAttachment(
      "w:chat"
    );
    expect(restored).toMatchObject({
      kind: "image",
      file,
      mimeType: "image/jpeg",
    });
    expect(restored).not.toHaveProperty("originalFile");
    if (restored?.kind !== "image") throw new Error("missing_original");
    expect(await restored.file.text()).toBe("original-not-preview");
  });
  it("keeps a draft per chat until the person or an accepted send clears it", () => {
    const storage = new MemoryStorage();
    const drafts = new ComposerDrafts(storage);
    drafts.write("workspace:chat-a", doc("A long prompt"));
    drafts.write("workspace:chat-b", doc("Another chat"));
    expect(drafts.read("workspace:chat-a")).toEqual(doc("A long prompt"));
    expect(drafts.read("workspace:chat-b")).toEqual(doc("Another chat"));
    drafts.write("workspace:chat-a", null);
    expect(drafts.read("workspace:chat-a")).toBeNull();
    expect(drafts.read("workspace:chat-b")).toEqual(doc("Another chat"));
  });

  it("settles only the send that owns each chat's draft", () => {
    const drafts = new ComposerDrafts(null);
    const document = doc("The same text in both chats");
    drafts.write("w:a", document);
    drafts.write("w:b", document);
    const earlierA = drafts.beginDocumentSend("w:a", document);
    const sendB = drafts.beginDocumentSend("w:b", document);
    const laterA = drafts.beginDocumentSend("w:a", document);

    expect(drafts.settleDocumentSend(earlierA, true)).toBe(false);
    expect(drafts.read("w:a")).toEqual(document);
    expect(drafts.settleDocumentSend(laterA, true)).toBe(true);
    expect(drafts.read("w:a")).toBeNull();
    expect(drafts.read("w:b")).toEqual(document);

    expect(drafts.settleDocumentSend(sendB, false)).toBe(true);
    expect(drafts.read("w:b")).toEqual(document);
    expect(drafts.settleDocumentSend(sendB, true)).toBe(false);
  });

  it.each(["memory", "persisted"] as const)(
    "keeps a newer identical write when an earlier document send settles (%s)",
    (mode) => {
      const storage = mode === "persisted" ? new MemoryStorage() : null;
      const drafts = new ComposerDrafts(storage);
      const key = "w:a";
      const document = doc("Same words");
      drafts.write(key, document);
      const send = drafts.beginDocumentSend(key, document);
      drafts.write(key, document);
      expect(drafts.settleDocumentSend(send, true)).toBe(true);
      expect(drafts.read(key)).toEqual(document);
    }
  );

  it("checks durable document removal before committing a strict checkpoint", () => {
    const storage = new MemoryStorage();
    const drafts = new ComposerDrafts(storage);
    const key = "w:a";
    const document = doc("Send from Home");
    const revision = drafts.write(key, document)!;
    storage.failRemovals = true;
    expect(() => drafts.checkpoint(key, null)).toThrow(
      "storage removal refused"
    );
    expect(drafts.read(key)).toEqual(document);
    expect(drafts.retireDocument(key, revision)).toBe(false);
    expect(drafts.read(key)).toBeNull();
    storage.failRemovals = false;
    expect(drafts.retireDocument(key, revision)).toBe(true);
    expect(new ComposerDrafts(storage).read(key)).toBeNull();
  });

  it("preserves a newer memory-only edit when a durable caption retires", () => {
    const storage = new MemoryStorage();
    const drafts = new ComposerDrafts(storage);
    const key = "w:a";
    const revision = drafts.write(key, doc("Sent caption"))!;
    const next = doc("Unsent follow-up");
    storage.failWrites = true;
    drafts.write(key, next);
    expect(drafts.retireDocument(key, revision)).toBe(true);
    expect(drafts.read(key)).toEqual(next);
    expect(new ComposerDrafts(storage).read(key)).toBeNull();
  });

  it("settles a promoted send without clearing edits under the old key", async () => {
    const drafts = new ComposerDrafts(null);
    const document = doc("Send from a new draft");
    drafts.write("w:new", document);
    const send = drafts.beginDocumentSend("w:new", document);

    await drafts.move("w:new", "w:created");
    drafts.write("w:new", document);
    expect(drafts.settleDocumentSend(send, true)).toBe(true);
    expect(drafts.read("w:created")).toBeNull();
    expect(drafts.read("w:new")).toEqual(document);
  });

  it("keeps an existing destination draft and later edits to the sent draft", async () => {
    const drafts = new ComposerDrafts(null);
    const document = doc("The original send");
    const edited = doc("New edits during the send");
    drafts.write("w:new", document);
    drafts.write("w:created", document);
    const send = drafts.beginDocumentSend("w:new", document);

    await drafts.move("w:new", "w:created");
    drafts.write("w:new", edited);
    expect(drafts.settleDocumentSend(send, true)).toBe(true);
    expect(drafts.read("w:new")).toEqual(edited);
    expect(drafts.read("w:created")).toEqual(document);
  });

  it("survives a new store, as after remounting the composer or restarting", () => {
    const storage = new MemoryStorage();
    new ComposerDrafts(storage).write("w:new", doc("Unsent"));
    expect(new ComposerDrafts(storage).read("w:new")).toEqual(doc("Unsent"));
  });

  it("keeps the draft in memory when storage refuses it", () => {
    const storage = new MemoryStorage();
    storage.failWrites = true;
    const drafts = new ComposerDrafts(storage);
    drafts.write("w:c", doc("Still here"));
    expect(drafts.read("w:c")).toEqual(doc("Still here"));
    expect(new ComposerDrafts(null).read("w:c")).toBeNull();
  });

  it("keeps an oversized draft in memory only and bounds stored drafts", () => {
    const storage = new MemoryStorage();
    const drafts = new ComposerDrafts(storage);
    const huge = doc("x".repeat(ComposerDrafts.maxStoredBytes));
    drafts.write("w:huge", huge);
    expect(drafts.read("w:huge")).toEqual(huge);
    expect(storage.length).toBe(0);
    for (let index = 0; index < ComposerDrafts.maxStoredDrafts + 5; index++)
      drafts.write(`w:${index}`, doc(String(index)));
    expect(storage.length).toBe(ComposerDrafts.maxStoredDrafts);
  });

  it("rewrites a kept draft without reading the others, and drops the oldest on insert", () => {
    vi.useFakeTimers();
    try {
      const storage = new MemoryStorage();
      const drafts = new ComposerDrafts(storage);
      for (let index = 0; index < ComposerDrafts.maxStoredDrafts; index++) {
        vi.setSystemTime(index + 1);
        drafts.write(`w:${index}`, doc(String(index)));
      }
      const read = vi.spyOn(storage, "getItem");
      vi.setSystemTime(1000);
      drafts.write("w:7", doc("Edited"));
      expect(
        read.mock.calls.filter(([key]) => key !== `${ComposerDrafts.prefix}w:7`)
      ).toEqual([]);
      drafts.write("w:new", doc("One more"));
      expect(storage.length).toBe(ComposerDrafts.maxStoredDrafts);
      expect(storage.getItem(`${ComposerDrafts.prefix}w:0`)).toBeNull();
      expect(storage.getItem(`${ComposerDrafts.prefix}w:7`)).not.toBeNull();
      expect(storage.getItem(`${ComposerDrafts.prefix}w:new`)).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("moves a new chat's draft to the id it was assigned", async () => {
    const storage = new MemoryStorage();
    const blobs = new MemoryBlobs();
    const drafts = new ComposerDrafts(storage, blobs);
    const png = {
      kind: "png" as const,
      name: "a.png",
      bytes: new ArrayBuffer(4),
    };
    drafts.write("w:new", doc("A long prompt"));
    drafts.writeModes("w:new", { plan: true });
    await drafts.writeAttachment("w:new", png);
    drafts.write("w:kept", doc("Already here"));
    const moved = drafts.move("w:new", "w:chat");
    // The original key remains authoritative until the asynchronous copy commits.
    expect(drafts.read("w:chat")).toBeNull();
    expect(drafts.read("w:new")).toEqual(doc("A long prompt"));
    expect(await drafts.readAttachment("w:chat")).toEqual(png);
    await moved;
    const reopened = new ComposerDrafts(storage, blobs);
    expect(reopened.read("w:chat")).toEqual(doc("A long prompt"));
    expect(reopened.readModes("w:chat")).toEqual({ plan: true });
    expect(await reopened.readAttachment("w:chat")).toEqual(png);
    expect(reopened.read("w:new")).toBeNull();
    expect(reopened.readModes("w:new")).toEqual({});
    expect(await reopened.readAttachment("w:new")).toBeNull();

    drafts.write("w:new", doc("Another"));
    await drafts.move("w:new", "w:kept");
    expect(drafts.read("w:kept")).toEqual(doc("Already here"));
    expect(drafts.read("w:new")).toEqual(doc("Another"));
  });

  it("ignores unreadable stored entries", () => {
    const storage = new MemoryStorage();
    storage.setItem(`${ComposerDrafts.prefix}w:bad`, "{not json");
    expect(new ComposerDrafts(storage).read("w:bad")).toBeNull();
  });

  it("keeps Plan, Goal and the attachment bytes with the draft", async () => {
    const storage = new MemoryStorage();
    const blobs = new MemoryBlobs();
    const drafts = new ComposerDrafts(storage, blobs);
    drafts.writeModes("w:c", { plan: true, goal: true });
    const png = {
      kind: "png" as const,
      name: "a.png",
      bytes: new ArrayBuffer(4),
    };
    await drafts.writeAttachment("w:c", png);
    const reopened = new ComposerDrafts(storage, blobs);
    expect(reopened.readModes("w:c")).toEqual({ plan: true, goal: true });
    expect(await reopened.readAttachment("w:c")).toEqual(png);
    reopened.writeModes("w:c", {});
    await reopened.writeAttachment("w:c", null);
    const cleared = new ComposerDrafts(storage, blobs);
    expect(cleared.readModes("w:c")).toEqual({});
    expect(await cleared.readAttachment("w:c")).toBeNull();
  });
});

describe("durable pending composer sends", () => {
  it.each([
    "queued after batch",
    "queued after single file",
    "stored after single file",
  ] as const)(
    "keeps a newer batch when earlier attachments retire (%s)",
    async (scenario) => {
      const storage = new MemoryStorage();
      const blobs = new MemoryBlobs();
      const drafts = new ComposerDrafts(storage, blobs);
      const key = "workspace:chat";
      const file = (bytes: number) =>
        ({
          kind: "file",
          name: "same.txt",
          bytes: new Uint8Array([bytes]).buffer,
        }) as const;
      const original = [AttachmentBatch.entry(file(1))];
      const legacy = scenario !== "queued after batch";
      if (legacy) await drafts.writeAttachment(key, file(1));
      else await drafts.writeAttachmentBatch(key, original, true);
      await drafts.writePending(key, {
        inputId: "old",
        text: "Original.",
        mode: "submit",
        allowLibrarySelection: false,
        ...(legacy ? { attachment: file(1) } : { attachments: original }),
      });
      const next = [AttachmentBatch.entry(file(2))];
      if (scenario === "stored after single file")
        await drafts.writeAttachmentBatch(key, next, true);
      const completing = drafts.completePending(key, "old");
      if (scenario !== "stored after single file")
        await drafts.writeAttachmentBatch(key, next, true);
      await completing;
      expect(await drafts.readAttachmentBatch(key)).toEqual(next);
      await expect(
        new ComposerDrafts(storage, blobs).readAttachmentBatch(key)
      ).resolves.toEqual(next);
    }
  );

  it.each(["later writer", "removal refused"] as const)(
    "retires only a durable captured caption when attachment staging resumes (%s)",
    async (change) => {
      const storage = new MemoryStorage();
      const blobs = new MemoryBlobs();
      const drafts = new ComposerDrafts(storage, blobs);
      const key = "workspace:chat";
      const document = doc("Compare these.");
      drafts.write(key, document);
      const batch = [
        AttachmentBatch.entry({
          kind: "image",
          file: new File(["image fixture"], "photo.jpg", {
            type: "image/jpeg",
          }),
        }),
      ];
      await drafts.writeAttachmentBatch(key, batch, true);
      const request = {
        inputId: "captured-send",
        text: "Compare these.",
        mode: "submit" as const,
        allowLibrarySelection: false,
        attachments: AttachmentBatch.persisted(batch),
        outgoing: { id: "captured-send", staged: true as const, document },
      };
      const started = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const transfer = blobs.transfer.bind(blobs);
      vi.spyOn(blobs, "transfer").mockImplementationOnce(async (...args) => {
        await transfer(...args);
        started.resolve();
        await release.promise;
      });
      const staging = drafts.stageOutgoing(key, request, true, batch);
      await started.promise;
      const other = new ComposerDrafts(storage, blobs);
      if (change === "later writer")
        other.write(key, structuredClone(document));
      else storage.failRemovals = true;
      release.resolve();
      const reason = await staging.then(
        () => undefined,
        (error: Error) => error.message
      );
      const refused = change === "removal refused";
      expect(reason).toBe(refused ? "storage removal refused" : undefined);
      expect(drafts.read(key)).toBeNull();
      if (refused) {
        storage.failRemovals = false;
        await drafts.stageOutgoing(key, request, true, batch);
      }
      expect(new ComposerDrafts(storage, blobs).read(key)).toEqual(
        refused ? null : document
      );
    }
  );

  it("uses the current checkout preview capability for kept attachments after reload", async () => {
    const storage = new MemoryStorage();
    const blobs = new MemoryBlobs();
    const drafts = new ComposerDrafts(storage, blobs);
    const key = "workspace:chat/queue-draft/checkout";
    const draft = [
      AttachmentBatch.entry({
        kind: "file",
        name: "added.txt",
        bytes: new ArrayBuffer(1),
      }),
      AttachmentBatch.keep(
        { name: "original.png", previewId: "old-preview" },
        1
      ),
    ];
    await drafts.writeAttachmentBatch(key, draft, true);
    const restored = await new ComposerDrafts(
      storage,
      blobs
    ).readAttachmentBatch(key);
    expect(restored?.[1].card.previewId).toBeUndefined();
    const entries = AttachmentBatch.checkout(
      [
        { name: "removed.png", previewId: "removed" },
        { name: "original.png", previewId: "new-preview" },
      ],
      [0, 1],
      restored
    );
    expect(entries.map(({ card }) => card.name)).toEqual([
      "added.txt",
      "original.png",
    ]);
    expect(entries[1].card.previewId).toBe("new-preview");
  });

  it("reopens an ordered send after a reload without borrowing the next draft's attachments", async () => {
    const storage = new MemoryStorage();
    const blobs = new MemoryBlobs();
    const drafts = new ComposerDrafts(storage, blobs);
    const key = "workspace:chat";
    const file = new File(["original notes"], "notes.txt");
    const photo = new File(["image fixture"], "photo.jpg", {
      type: "image/jpeg",
    });
    const batch = [
      AttachmentBatch.entry({ kind: "reference", file }),
      AttachmentBatch.entry({
        kind: "image",
        file: photo,
        originalFile: photo,
      }),
    ];
    await drafts.writeAttachmentBatch(key, batch, true);
    await drafts.stageOutgoing(
      key,
      {
        inputId: "send-batch",
        text: "Compare these.",
        mode: "enqueue",
        allowLibrarySelection: false,
        attachments: AttachmentBatch.persisted(batch),
        outgoing: { id: "send-batch", staged: true },
      },
      true,
      batch
    );
    const next = [
      AttachmentBatch.entry({
        kind: "file",
        name: "next.txt",
        bytes: new ArrayBuffer(1),
      }),
    ];
    await drafts.writeAttachmentBatch(key, next, true);
    const restored = new ComposerDrafts(storage, blobs);
    const pending = await restored.readPending(key);
    expect(pending?.attachments).toEqual([
      { id: batch[0].id, card: batch[0].card },
      {
        id: batch[1].id,
        card: batch[1].card,
        input: { kind: "image", file: photo },
      },
    ]);
    await restored.completePending(key, "send-batch");
    expect(await restored.readAttachmentBatch(key)).toEqual(next);
  });

  const pending = {
    inputId: "immutable-input",
    text: "Inspect this original",
    mode: "submit" as const,
    operatingRegime: "plan" as const,
    effort: "high" as const,
    selectionRevision: 7,
    allowLibrarySelection: false,
    attachment: {
      kind: "image" as const,
      name: "photo.jpg",
      file: new File(["frozen-original"], "photo.jpg", { type: "image/jpeg" }),
      mimeType: "image/jpeg",
    },
  };

  it("restores one immutable request with the frozen original after a store restart", async () => {
    const blobs = new MemoryBlobs();
    const first = new ComposerDrafts(null, blobs);
    await first.writePending("w:chat", pending);
    const restored = await new ComposerDrafts(null, blobs).readPending(
      "w:chat"
    );
    expect(restored).toEqual(pending);
    expect(restored?.attachment).not.toHaveProperty("originalFile");
    if (restored?.attachment?.kind !== "image")
      throw new Error("missing original");
    expect(await restored.attachment.file.text()).toBe("frozen-original");
    // The retry row owns its attachment even if the ordinary draft row changes.
    await first.writeAttachment("w:chat", {
      kind: "file",
      name: "later.txt",
      bytes: new ArrayBuffer(2),
    });
    expect(await new ComposerDrafts(null, blobs).readPending("w:chat")).toEqual(
      pending
    );
  });

  it("refuses a send capture without durable storage or after an aborted write", async () => {
    await expect(
      new ComposerDrafts(null, null).writePending("w:c", pending)
    ).rejects.toThrow("native_chat_retry_storage_unavailable");
    const blobs = new MemoryBlobs();
    vi.spyOn(blobs, "put").mockRejectedValue(new Error("transaction aborted"));
    await expect(
      new ComposerDrafts(null, blobs).writePending("w:c", pending)
    ).rejects.toThrow("transaction aborted");
    expect(await new ComposerDrafts(null, blobs).readPending("w:c")).toBeNull();
  });

  it("retries a refused pending promotion before retiring the source capture", async () => {
    const blobs = new MemoryBlobs(),
      drafts = new ComposerDrafts(null, blobs);
    await drafts.writePending("w:draft", pending);
    const copy = vi
      .spyOn(blobs, "put")
      .mockRejectedValueOnce(new Error("copy failed"));
    await expect(drafts.move("w:draft", "w:chat")).rejects.toThrow(
      "copy failed"
    );
    expect(
      (await new ComposerDrafts(null, blobs).readPending("w:draft"))?.inputId
    ).toBe(pending.inputId);
    await drafts.move("w:draft", "w:chat");
    expect(copy).toHaveBeenCalledTimes(2);
    const reopened = new ComposerDrafts(null, blobs);
    expect(await reopened.readPending("w:draft")).toBeNull();
    expect(await reopened.readPending("w:chat")).toEqual(pending);
  });

  it("reports durable Edit failures for the text and original bytes", async () => {
    const storage = new MemoryStorage(),
      blobs = new MemoryBlobs(),
      drafts = new ComposerDrafts(storage, blobs);
    storage.failWrites = true;
    expect(() =>
      drafts.write("w:c", doc("Original"), { requirePersistence: true })
    ).toThrow("quota exceeded");
    vi.spyOn(blobs, "put").mockRejectedValueOnce(new Error("quota exceeded"));
    await expect(
      drafts.writeAttachment("w:c", pending.attachment, {
        requirePersistence: true,
      })
    ).rejects.toThrow("quota exceeded");
    await expect(
      new ComposerDrafts(storage, null).writeAttachment(
        "w:c",
        pending.attachment,
        { requirePersistence: true }
      )
    ).rejects.toThrow("native_chat_retry_storage_unavailable");
  });

  it("restores a board selection with its original pin and token", async () => {
    const blobs = new MemoryBlobs();
    const draft = {
      inputId: "board-message",
      text: "Which pin is this?",
      mode: "enqueue",
      operatingRegime: "act",
      allowLibrarySelection: false,
      editorToolContextId: {
        targetId: crypto.randomUUID(),
        subject: {
          kind: "document",
          path: "/references.canvas/hero.svg",
          placement: { boardPath: "/references.canvas", pinId: "hero" },
        },
      },
    } as const;
    await new ComposerDrafts(null, blobs).writePending("workspace:chat", draft);
    expect(
      await new ComposerDrafts(null, blobs).readPending("workspace:chat")
    ).toEqual(draft);
  });

  it("rejects an invalid retry row instead of treating it as a new send", async () => {
    const blobs = new MemoryBlobs();
    blobs.items.set("\0pending:w:c", {
      kind: "pending",
      version: 1,
      key: "different-chat",
      submission: pending,
    });
    await expect(
      new ComposerDrafts(null, blobs).readPending("w:c")
    ).rejects.toThrow("native_chat_retry_storage_invalid");
    await expect(
      new ComposerDrafts(null, blobs).writePending("w:c", {
        ...pending,
        attachment: {
          ...pending.attachment,
          originalFile: pending.attachment.file,
        },
      } as typeof pending)
    ).rejects.toThrow("native_chat_retry_storage_invalid");
  });

  it("moves the pending capture even when the attachment is already cached", async () => {
    const blobs = new MemoryBlobs();
    const drafts = new ComposerDrafts(null, blobs);
    await drafts.writeAttachment("w:new", pending.attachment);
    await drafts.writePending("w:new", pending);
    await drafts.move("w:new", "w:created");
    const reopened = new ComposerDrafts(null, blobs);
    expect(await reopened.readPending("w:new")).toBeNull();
    expect(await reopened.readPending("w:created")).toEqual(pending);
    expect(await reopened.readAttachment("w:created")).toEqual(
      pending.attachment
    );
  });

  it.each([JSON.stringify(["profile", "model"]), false] as const)(
    "ignores the former draft search choice %j while retaining the frozen submission",
    async (webSearch) => {
      const storage = new MemoryStorage(),
        blobs = new MemoryBlobs();
      const drafts = new ComposerDrafts(storage, blobs);
      storage.setItem(
        ComposerDrafts.modesPrefix + "w:new",
        JSON.stringify({ plan: true, webSearch })
      );
      expect(drafts.readModes("w:new")).toEqual({ plan: true });
      const submission = {
        ...pending,
        ...(webSearch && { webSearch: true as const }),
      };
      await drafts.writePending("w:new", submission);
      await drafts.move("w:new", "w:created");
      const reopened = new ComposerDrafts(storage, blobs);
      expect(reopened.readModes("w:another")).toEqual({});
      expect(reopened.readModes("w:created")).toEqual({ plan: true });
      expect(await reopened.readPending("w:created")).toEqual(submission);
      await reopened.completePending("w:created", "unrelated");
      expect(reopened.readModes("w:created")).toEqual({ plan: true });
      await reopened.completePending("w:created", submission.inputId);
      expect(new ComposerDrafts(storage, blobs).readModes("w:created")).toEqual(
        {
          plan: true,
        }
      );
    }
  );

  it("keeps a newer pending input when an older accepted send finishes", async () => {
    const drafts = new ComposerDrafts(null, new MemoryBlobs());
    await drafts.writePending("w:c", pending);
    await drafts.writePending("w:c", { ...pending, inputId: "newer" });
    await drafts.completePending("w:c", pending.inputId);
    expect((await drafts.readPending("w:c"))?.inputId).toBe("newer");
  });

  it("claims a legacy singleton for only one modern logical draft, including after restart", async () => {
    const storage = new MemoryStorage(),
      blobs = new MemoryBlobs();
    const drafts = new ComposerDrafts(storage, blobs);
    drafts.write("w:new", doc("Legacy draft"));
    await drafts.writeAttachment("w:new", pending.attachment);
    await drafts.writePending("w:new", pending);
    await drafts.initializeDraft("w:new", "w:draft/one");
    expect(drafts.read("w:draft/one")).toEqual(doc("Legacy draft"));
    expect(await drafts.readPending("w:draft/one")).toEqual(pending);
    const reopened = new ComposerDrafts(storage, blobs);
    reopened.write("w:new", doc("A later legacy row"));
    await reopened.initializeDraft("w:new", "w:draft/two");
    expect(reopened.read("w:draft/two")).toBeNull();
    expect(await reopened.readPending("w:draft/two")).toBeNull();
    expect(await reopened.readAttachment("w:draft/two")).toBeNull();
    expect(reopened.read("w:new")).toEqual(doc("A later legacy row"));
  });

  it("does not borrow a singleton into any already initialized modern draft", async () => {
    const storage = new MemoryStorage(),
      blobs = new MemoryBlobs();
    const drafts = new ComposerDrafts(storage, blobs);
    drafts.write("w:new", doc("Old singleton"));
    drafts.write("w:draft/one", doc("Owned by one"));
    await drafts.initializeDraft("w:new", "w:draft/one");
    await new ComposerDrafts(storage, blobs).initializeDraft(
      "w:new",
      "w:draft/two"
    );
    expect(drafts.read("w:draft/one")).toEqual(doc("Owned by one"));
    expect(drafts.read("w:draft/two")).toBeNull();
    expect(drafts.read("w:new")).toEqual(doc("Old singleton"));
  });
});

describe("IndexedDB retry commit", () => {
  it("waits for transaction completion, and treats a later abort as a refused capture", async () => {
    const started: { transaction: IDBTransaction; request: IDBRequest }[] = [];
    const database = {
      transaction: () => {
        const transaction = {
          objectStore: () => ({
            put: () => {
              const request = {} as IDBRequest;
              started.push({
                transaction: transaction as unknown as IDBTransaction,
                request,
              });
              return request;
            },
          }),
        };
        return transaction;
      },
    };
    vi.stubGlobal("indexedDB", {
      open: () => {
        const request = { result: database } as unknown as IDBOpenDBRequest;
        queueMicrotask(() =>
          request.onsuccess?.call(request, new Event("success"))
        );
        return request;
      },
    });
    try {
      const drafts = new ComposerDrafts(null);
      const submission = {
        inputId: "id",
        text: "Task",
        mode: "submit" as const,
        allowLibrarySelection: false,
      };
      let complete = false;
      const written = drafts.writePending("w:c", submission).then(() => {
        complete = true;
      });
      await vi.waitFor(() => expect(started).toHaveLength(1));
      const first = started[0];
      first.request.onsuccess?.call(first.request, new Event("success"));
      await Promise.resolve();
      expect(complete).toBe(false);
      first.transaction.oncomplete?.call(
        first.transaction,
        new Event("complete")
      );
      await written;
      expect(complete).toBe(true);

      const aborted = drafts.writePending("w:c", {
        ...submission,
        inputId: "next",
      });
      const refused = aborted.catch((error: unknown) => error);
      await vi.waitFor(() => expect(started).toHaveLength(2));
      const second = started[1];
      second.request.onsuccess?.call(second.request, new Event("success"));
      second.transaction.onabort?.call(second.transaction, new Event("abort"));
      expect(await refused).toMatchObject({
        message: "draft_transaction_aborted",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

it("keeps the original attachment row when promotion storage refuses its copy, then retries the same move", async () => {
  const blobs = new MemoryBlobs(),
    storage = new MemoryStorage(),
    drafts = new ComposerDrafts(storage, blobs);
  const file = {
    kind: "image" as const,
    name: "photo.jpg",
    file: new File(["original"], "photo.jpg"),
  };
  drafts.write("w:draft/one", doc("Original draft"));
  drafts.writeModes("w:draft/one", { plan: true });
  await drafts.writeAttachment("w:draft/one", file);
  const put = vi
    .spyOn(blobs, "put")
    .mockRejectedValueOnce(new Error("copy quota"));
  await expect(drafts.move("w:draft/one", "w:chat")).rejects.toThrow(
    "copy quota"
  );
  expect(blobs.items.get("w:draft/one")).toMatchObject(file);
  expect(blobs.items.has("w:chat")).toBe(false);
  expect(drafts.read("w:draft/one")).toEqual(doc("Original draft"));
  expect(drafts.read("w:chat")).toBeNull();
  expect(drafts.readModes("w:draft/one")).toEqual({ plan: true });
  drafts.write("w:draft/one", doc("Revised after the failed copy"));
  drafts.writeModes("w:draft/one", { goal: true });
  await drafts.move("w:draft/one", "w:chat");
  expect(put).toHaveBeenCalledTimes(2);
  const reopened = new ComposerDrafts(storage, blobs);
  expect(await reopened.readAttachment("w:chat")).toEqual(file);
  expect(await reopened.readAttachment("w:draft/one")).toBeNull();
  expect(reopened.read("w:chat")).toEqual(doc("Revised after the failed copy"));
  expect(reopened.readModes("w:chat")).toEqual({ goal: true });
  expect(reopened.read("w:draft/one")).toBeNull();
});

it("moves the latest document and modes typed while an attachment copy is still pending", async () => {
  const blobs = new MemoryBlobs(),
    storage = new MemoryStorage(),
    drafts = new ComposerDrafts(storage, blobs);
  const file = {
    kind: "file" as const,
    name: "notes.txt",
    bytes: new TextEncoder().encode("notes").buffer,
  };
  await drafts.writeAttachment("w:draft", file);
  drafts.write("w:draft", doc("Original text"));
  drafts.writeModes("w:draft", { plan: true });
  const writing = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>();
  const put = blobs.put.bind(blobs);
  vi.spyOn(blobs, "put").mockImplementation(async (key, value) => {
    if (key === "w:chat") {
      writing.resolve();
      await release.promise;
    }
    await put(key, value);
  });
  const moving = drafts.move("w:draft", "w:chat");
  try {
    await writing.promise;
    drafts.write("w:draft", doc("Original text and a later edit"));
    drafts.writeModes("w:draft", { goal: true });
    expect(drafts.read("w:draft")).toEqual(
      doc("Original text and a later edit")
    );
    expect(drafts.read("w:chat")).toBeNull();
    release.resolve();
    await moving;
    const reopened = new ComposerDrafts(storage, blobs);
    expect(reopened.read("w:chat")).toEqual(
      doc("Original text and a later edit")
    );
    expect(reopened.readModes("w:chat")).toEqual({ goal: true });
    expect(reopened.read("w:draft")).toBeNull();
  } finally {
    release.resolve();
    await moving;
  }
});

it.each(["replace", "remove"] as const)(
  "carries a source attachment %s during asynchronous chat promotion",
  async (edit) => {
    const blobs = new MemoryBlobs(),
      drafts = new ComposerDrafts(null, blobs);
    const source = "w:draft",
      dest = "w:chat";
    const file = {
      kind: "file" as const,
      name: "notes.txt",
      bytes: new Uint8Array([1]).buffer,
    };
    const later =
      edit === "replace"
        ? { ...file, bytes: new Uint8Array([2]).buffer }
        : null;
    await drafts.writeAttachment(source, file);
    const writing = Promise.withResolvers<void>(),
      release = Promise.withResolvers<void>();
    const put = blobs.put.bind(blobs);
    vi.spyOn(blobs, "put").mockImplementation(async (key, value) => {
      if (key === dest) {
        writing.resolve();
        await release.promise;
      }
      await put(key, value);
    });
    const moving = drafts.move(source, dest);
    try {
      await writing.promise;
      await drafts.writeAttachment(source, later);
      release.resolve();
      await moving;
      const reopened = new ComposerDrafts(null, blobs);
      expect(await reopened.readAttachment(dest)).toEqual(later);
      expect(await reopened.readAttachment(source)).toBeNull();
    } finally {
      release.resolve();
      await moving;
    }
  }
);

it("preserves a destination attachment already on disk while moving a cached source", async () => {
  const blobs = new MemoryBlobs(),
    drafts = new ComposerDrafts(null, blobs);
  const file = {
    kind: "file" as const,
    name: "notes.txt",
    bytes: new Uint8Array([1]).buffer,
  };
  const existing = { ...file, bytes: new Uint8Array([2]).buffer };
  await drafts.writeAttachment("w:draft", file);
  await new ComposerDrafts(null, blobs).writeAttachment("w:chat", existing);
  await drafts.move("w:draft", "w:chat");
  const reopened = new ComposerDrafts(null, blobs);
  expect(await reopened.readAttachment("w:chat")).toEqual(existing);
  expect(await reopened.readAttachment("w:draft")).toEqual(file);
});

it("resumes an interrupted promotion with the latest source attachment after reopening", async () => {
  const blobs = new MemoryBlobs(),
    drafts = new ComposerDrafts(null, blobs);
  const source = "w:draft",
    dest = "w:chat";
  const file = {
    kind: "file" as const,
    name: "notes.txt",
    bytes: new Uint8Array([1]).buffer,
  };
  const later = { ...file, bytes: new Uint8Array([2]).buffer };
  await drafts.writeAttachment(source, file);
  const writing = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>();
  let attempted = 0;
  const put = blobs.put.bind(blobs);
  vi.spyOn(blobs, "put").mockImplementation(async (key, value) => {
    if (key === dest && ++attempted === 1) {
      writing.resolve();
      await release.promise;
    } else if (key === dest && attempted === 2) {
      throw new Error("copy aborted");
    }
    await put(key, value);
  });
  const moving = drafts.move(source, dest);
  await writing.promise;
  await drafts.writeAttachment(source, later);
  release.resolve();
  await expect(moving).rejects.toThrow("copy aborted");
  const reopened = new ComposerDrafts(null, blobs);
  await reopened.move(source, dest);
  expect(await new ComposerDrafts(null, blobs).readAttachment(dest)).toEqual(
    later
  );
  expect(await reopened.readAttachment(source)).toBeNull();
});

it("retains the source document when its destination cannot be saved", async () => {
  const storage = new MemoryStorage(),
    drafts = new ComposerDrafts(storage, new MemoryBlobs());
  drafts.write("w:draft", doc("Follow-up draft"));
  storage.failWrites = true;
  await expect(drafts.move("w:draft", "w:chat")).rejects.toThrow(
    "quota exceeded"
  );
  expect(drafts.read("w:chat")).toBeNull();
  expect(new ComposerDrafts(storage, null).read("w:draft")).toEqual(
    doc("Follow-up draft")
  );
  storage.failWrites = false;
  await drafts.move("w:draft", "w:chat");
  expect(new ComposerDrafts(storage, null).read("w:chat")).toEqual(
    doc("Follow-up draft")
  );
});
