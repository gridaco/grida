import { describe, expect, it, vi } from "vitest";
import { ComposerDraftBinding } from "./composer-draft-binding";

function makeStore(initial: Record<string, unknown> = {}) {
  const drafts = new Map(Object.entries(initial));
  let revision = 0;
  return {
    read: (key: string) => drafts.get(key) ?? null,
    write: vi.fn<ComposerDraftBinding.Target["store"]["write"]>(
      (key, document) => {
        drafts.set(key, document);
        return `revision-${++revision}`;
      }
    ),
  };
}

function makeEditor() {
  let current: unknown | null = null;
  return {
    ready: true,
    readDocument: () => current,
    clearForHistory: vi.fn<ComposerDraftBinding.Editor["clearForHistory"]>(
      () => {
        current = null;
      }
    ),
    restoreDocument: vi.fn<ComposerDraftBinding.Editor["restoreDocument"]>(
      (document) => {
        current = document;
        return true;
      }
    ),
  };
}

describe("ComposerDraftBinding", () => {
  it("restores independent drafts when the key or its store changes", () => {
    const binding = new ComposerDraftBinding();
    const store = makeStore({ a: "First", b: "Second" });
    const alternate = makeStore({ b: "Other store" });
    const editor = makeEditor();
    expect(binding.restore({ key: "a", store }, editor)).toBe("restored");
    expect(editor.readDocument()).toBe("First");
    expect(binding.restore({ key: "b", store }, editor)).toBe("restored");
    expect(editor.readDocument()).toBe("Second");

    expect(binding.restore({ key: "b", store: alternate }, editor)).toBe(
      "restored"
    );
    expect(editor.readDocument()).toBe("Other store");
    binding.retain({ key: "b", store }, "Late update");
    expect(store.read("b")).toBe("Second");
    binding.retain({ key: "b", store: alternate }, "Active edit");
    expect(alternate.read("b")).toBe("Active edit");
  });

  it("keeps editor history on a valid promotion and restores a different destination", () => {
    const binding = new ComposerDraftBinding();
    const editor = makeEditor();
    const store = makeStore({
      draft: { text: "Move this draft" },
      chat: { text: "Move this draft" },
      other: { text: "Different document" },
    });
    binding.restore({ key: "draft", store }, editor);
    editor.clearForHistory.mockClear();
    const chat = { key: "chat", store, promotedFrom: "draft" };
    expect(binding.restore(chat, editor)).toBe("promoted");
    expect(editor.clearForHistory).not.toHaveBeenCalled();
    expect(binding.restore({ key: "chat", store }, editor)).toBe("unchanged");

    const other = { key: "other", store, promotedFrom: "chat" };
    expect(binding.restore(other, editor)).toBe("restored");
    expect(editor.readDocument()).toEqual({ text: "Different document" });
  });

  it("does not resurrect a retired document on an unchanged snapshot", () => {
    const binding = new ComposerDraftBinding();
    const editor = makeEditor();
    const store = makeStore();
    const onWrite =
      vi.fn<NonNullable<ComposerDraftBinding.Target["onWrite"]>>();
    const target = { key: "chat", store, onWrite };
    binding.restore(target, editor);
    binding.retain(target, { text: "Send with an image" });
    binding.retain(target, { text: "Send with an image" });
    expect(store.write).toHaveBeenCalledTimes(1);

    // The host accepted this exact draft before the editor caught up.
    store.write(target.key, null);
    binding.retain(target, { text: "Send with an image" });
    expect(store.read(target.key)).toBeNull();

    binding.retain(target, null);
    binding.retain(target, { text: "Next draft" });
    expect(store.read(target.key)).toEqual({ text: "Next draft" });
    expect(onWrite.mock.calls).toEqual([
      [{ text: "Send with an image" }, "revision-1"],
      [null, "revision-3"],
      [{ text: "Next draft" }, "revision-4"],
    ]);
  });

  it("does not autosave into a destination before its document can be restored", () => {
    const binding = new ComposerDraftBinding();
    const editor = makeEditor();
    const store = makeStore({ a: "Existing document" });
    const target = { key: "a", store };
    expect(binding.restore(target, { ...editor, ready: false })).toBe(
      "unavailable"
    );
    binding.retain(target, "Unsynchronized editor");
    expect(store.write).not.toHaveBeenCalled();
    expect(binding.restore(target, editor)).toBe("restored");
    expect(editor.readDocument()).toBe("Existing document");
  });

  it("keeps identical text typed again after send even when no empty snapshot was saved", () => {
    const binding = new ComposerDraftBinding();
    const editor = makeEditor();
    const store = makeStore();
    const target = { key: "chat", store };
    binding.restore(target, editor);
    binding.retain(target, { text: "Same words" });
    store.write(target.key, null);
    binding.sent(target);

    binding.retain(target, { text: "Same words" });
    expect(store.read(target.key)).toEqual({ text: "Same words" });
  });

  it("leaves storage cleanup to the sender when the editor clears", () => {
    const binding = new ComposerDraftBinding();
    const editor = makeEditor();
    const store = makeStore({ chat: { text: "Original" } });
    const target = { key: "chat", store };
    binding.restore(target, editor);
    store.write(target.key, { text: "Newer write" });
    binding.sent(target);
    binding.retain(target, null);
    expect(store.read(target.key)).toEqual({ text: "Newer write" });
  });
});
