import { describe, expect, it, vi } from "vitest";
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
}

class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();
  failWrites = false;
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
  expect(blobs.items.get("w:draft/one")).toEqual(file);
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
