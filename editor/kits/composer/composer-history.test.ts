import { describe, expect, it, vi } from "vitest";
import { ComposerHistory } from "./composer-history";

function fixture(file: object | null = { name: "notes.txt" }) {
  const draft = { document: "my draft", selection: 2, attachment: file };
  let current: ComposerHistory.Draft = draft;
  const editor: ComposerHistory.Editor = {
    read: () => current,
    materialize: ({ text }) => ({ document: text, attachment: null }),
    guard: () => {
      const original = current;
      return () => current === original;
    },
    replace(next, applied) {
      current = next;
      applied(true);
      return true;
    },
  };
  const history = new ComposerHistory();
  const beforeRecall = vi
    .fn<NonNullable<ComposerHistory.Source["beforeRecall"]>>()
    .mockResolvedValue("recall");
  const onRecallBlocked = vi.fn<() => void>();
  const source = {
    beforeRecall,
    onRecallBlocked,
    previous: () => [{ id: "sent", text: "sent prompt" }],
  };
  return {
    draft,
    history,
    source,
    editor,
    edit: (text: string) => {
      current = { ...current, document: text };
    },
  };
}

describe("ComposerHistory", () => {
  it("runs one custom recall action without replacing the ordinary draft", async () => {
    const { draft, history, editor, source } = fixture();
    const pending = Promise.withResolvers<ComposerHistory.RecallResult>();
    source.beforeRecall.mockReturnValueOnce(pending.promise);
    expect(history.move("up", editor, source)).toBe(true);
    expect(history.move("up", editor, source)).toBe(true);
    expect(source.beforeRecall).toHaveBeenCalledTimes(1);
    pending.resolve("handled");
    await pending.promise;
    expect(editor.read()).toBe(draft);
  });

  it("recalls sent prompts when the custom action requests recall", async () => {
    const { draft, history, editor, source } = fixture();
    source.beforeRecall.mockResolvedValueOnce("blocked");
    history.move("up", editor, source);
    await vi.waitFor(() =>
      expect(source.onRecallBlocked).toHaveBeenCalledTimes(1)
    );
    expect(editor.read()).toBe(draft);
    history.move("up", editor, source);
    await vi.waitFor(() => expect(editor.read().document).toBe("sent prompt"));
    history.move("down", editor, source);
    expect(editor.read()).toEqual(draft);
  });

  it("does not replace a newer draft while the custom action is pending", async () => {
    const { history, editor, edit, source } = fixture();
    const pending = Promise.withResolvers<ComposerHistory.RecallResult>();
    source.beforeRecall.mockReturnValueOnce(pending.promise);
    history.move("up", editor, source);
    edit("new draft");
    expect(source.beforeRecall.mock.calls[0][0]()).toBe(false);
    pending.resolve("recall");
    await pending.promise;
    expect(editor.read().document).toBe("new draft");
  });

  it("does not move past a sent attachment-only prompt when a file is staged", () => {
    const { history, editor, draft } = fixture();
    history.remember({ id: "file", text: "", draft });
    expect(
      history.move("up", editor, {
        previous: () => [{ id: "sent", text: "older prompt" }],
      })
    ).toBe(false);
    expect(editor.read()).toBe(draft);
  });

  it("skips a sent attachment-only prompt when no file is staged", () => {
    const { history, editor, draft } = fixture(null);
    history.remember({ id: "file", text: "", draft });
    history.move("up", editor, {
      previous: () => [{ id: "sent", text: "sent prompt" }],
    });
    expect(editor.read().document).toBe("sent prompt");
    expect(editor.read().attachment).toBeNull();
  });

  it("isolates drafts and carries history across draft promotion", () => {
    const store = {};
    const original = ComposerHistory.forDraft(store, "new");
    expect(ComposerHistory.forDraft(store, "another")).not.toBe(original);
    expect(ComposerHistory.forDraft(store, "chat-id", "new")).toBe(original);
    expect(ComposerHistory.forDraft(store, "new")).not.toBe(original);
  });
});
