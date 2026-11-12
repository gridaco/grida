import { describe, expect, it } from "vitest";
import {
  ComposerDrafts,
  type ComposerDraftAttachment,
  type ComposerDraftBlobs,
} from "./composer-drafts";

class MemoryBlobs implements ComposerDraftBlobs {
  readonly items = new Map<string, ComposerDraftAttachment>();
  async get(key: string) {
    return this.items.get(key) ?? null;
  }
  async put(key: string, value: ComposerDraftAttachment) {
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
