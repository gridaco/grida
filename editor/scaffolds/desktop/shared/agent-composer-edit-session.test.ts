import { describe, expect, it } from "vitest";
import { AgentComposerEditSession } from "./agent-composer-edit-session";

function fixture() {
  const original = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Unsent", marks: [{ type: "bold" }] }],
      },
    ],
  };
  const state = { document: original as unknown | null, ready: true };
  const editor: AgentComposerEditSession.Editor = {
    get ready() {
      return state.ready;
    },
    readDocument: () => state.document,
    restoreDocument: (document) => {
      state.document = document;
      return true;
    },
    clear: () => {
      state.document = null;
    },
    focus: () => true,
  };
  return { original, state, editor, session: new AgentComposerEditSession() };
}

describe("AgentComposerEditSession", () => {
  it("borrows the same editor and keeps rich ordinary content out of edit autosave", () => {
    const { session, original, state, editor } = fixture();
    expect(
      session.sync({ id: "queued", text: "First\n\nLast" }, "chat", editor)
    ).toBe("changed");
    expect(state.document).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "First" }] },
        { type: "paragraph", content: [] },
        { type: "paragraph", content: [{ type: "text", text: "Last" }] },
      ],
    });
    expect(session.document("chat", state.document)).toBe(original);
    state.document = { edited: "new user typing" };
    expect(
      session.sync({ id: "queued", text: "Updated host draft" }, "chat", editor)
    ).toBe("unchanged");
    expect(state.document).toEqual({ edited: "new user typing" });
    expect(session.sync(undefined, "chat", editor)).toBe("changed");
    expect(state.document).toBe(original);
    expect(session.owns("queued", "chat")).toBe(false);
  });

  it.each([{ type: "doc", content: [] }, null])(
    "restores the saved checkout document and keeps the ordinary draft",
    (document) => {
      const { session, original, state, editor } = fixture();
      expect(
        session.sync(
          {
            id: "checkout",
            text: "Original queued caption",
            savedDocument: { document },
          },
          "chat",
          editor
        )
      ).toBe("changed");
      expect(state.document).toBe(document);
      expect(session.document("chat", state.document)).toBe(original);
      expect(session.sync(undefined, "chat", editor)).toBe("changed");
      expect(state.document).toBe(original);
    }
  );

  it("waits for the editor before capturing or replacing a draft", () => {
    const { session, original, state, editor } = fixture();
    state.ready = false;
    expect(session.sync({ id: "queued", text: "Edit" }, 1, editor)).toBe(
      "pending"
    );
    expect(state.document).toBe(original);
    state.ready = true;
    expect(session.sync({ id: "queued", text: "Edit" }, 1, editor)).toBe(
      "changed"
    );
  });

  it("restores recovered content into the ordinary draft while a queue edit is open", () => {
    const { session, original, state, editor } = fixture();
    session.sync({ id: "queued", text: "Queued edit" }, "chat", editor);
    const edit = state.document;
    const ordinary = session.ordinaryEditor("chat", editor);
    const block = {
      type: "paragraph",
      content: [{ type: "text", text: "Recovered" }],
    };
    expect(ordinary.readDocument()).toBe(original);
    expect(ordinary.appendDocument?.([block])).toBe(true);
    expect(state.document).toBe(edit);
    expect(session.sync(undefined, "chat", editor)).toBe("changed");
    expect(state.document).toEqual({
      type: "doc",
      content: [...original.content, block],
    });
  });

  it("keeps the new chat's restored draft when an old edit is retired", () => {
    const { session, state, editor } = fixture();
    session.sync({ id: "queued", text: "Old chat edit" }, "old", editor);
    const newDraft = { newChat: "ordinary draft restored by binding" };
    state.document = newDraft;
    session.sync(undefined, "new", editor, true);
    expect(state.document).toBe(newDraft);
    expect(session.document("new", state.document)).toBe(newDraft);
    expect(session.owns("queued", "old")).toBe(false);
  });

  it("restores the borrowed ordinary document across a scope change without a draft store", () => {
    const { session, original, state, editor } = fixture();
    session.sync({ id: "queued", text: "Temporary edit" }, 1, editor);
    session.sync(undefined, 2, editor);
    expect(state.document).toBe(original);
    expect(session.owns("queued", 1)).toBe(false);
  });

  it("returns the original document if loading the replacement is refused", () => {
    const { session, original, state, editor } = fixture();
    const refusing = {
      ...editor,
      restoreDocument: (document: unknown) =>
        document === original && editor.restoreDocument(document),
    };
    expect(session.sync({ id: "queued", text: "Edit" }, 1, refusing)).toBe(
      "rejected"
    );
    expect(state.document).toBe(original);
    expect(session.document(1, state.document)).toBe(original);
  });
});
