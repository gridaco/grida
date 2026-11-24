import { getSchema, type Editor } from "@tiptap/core";
import { history, redo, undo, undoDepth } from "@tiptap/pm/history";
import {
  EditorState,
  TextSelection,
  type Plugin,
  type Transaction,
} from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { ComposerHistory } from "./composer-history";
import { ComposerTiptap } from "./composer-tiptap";
import { ComposerTiptapHistory } from "./composer-tiptap-history";

function fixture(
  previous: ComposerHistory.Source["previous"] = () => [],
  beforeRecall?: ComposerHistory.Source["beforeRecall"]
) {
  const schema = getSchema(ComposerTiptap.extensions({ placeholder: "" }));
  let state = EditorState.create({ schema, plugins: [history()] });
  let listener: (event: { transaction: Transaction }) => void;
  let attachment: object | null = null;
  let attachmentRevision = 0;
  const view = {
    updateState(next: EditorState) {
      state = next;
    },
    dispatch(transaction: Transaction) {
      state = state.apply(transaction);
      listener({ transaction });
    },
  };
  const editor = {
    get state() {
      return state;
    },
    view,
    isEditable: true,
    isFocused: true,
    getText: () => state.doc.textContent,
    registerPlugin: (plugin: Plugin) => {
      state = state.reconfigure({ plugins: [...state.plugins, plugin] });
    },
    on: (_event: string, handler: typeof listener) => {
      listener = handler;
    },
  } as unknown as Editor;
  const adapter = ComposerTiptapHistory.for(editor);
  const historyState = new ComposerHistory();
  const bind = (
    scope: object,
    undoBoundary?: ComposerTiptapHistory.Binding["undoBoundary"],
    active = !undoBoundary
  ) =>
    adapter.configure({
      scope,
      history: historyState,
      active,
      undoBoundary,
      source: { previous, beforeRecall },
      attachments: {
        read: () => attachment,
        gestureRevision: () => attachmentRevision,
        canReplace: () => true,
        replace: (next) => {
          attachment = next;
          return true;
        },
      },
    });
  bind(historyState);
  return {
    adapter,
    bind,
    historyState,
    attach(next: object | null, userGesture = true) {
      attachment = next;
      if (userGesture) attachmentRevision++;
      bind(historyState);
    },
    text: () => editor.getText(),
    type: (text: string) => view.dispatch(state.tr.insertText(text)),
    appendWithEffect(text: string, applied: (forward: boolean) => void) {
      const transaction = state.tr.insertText(text);
      adapter.recordEffect(transaction, applied);
      view.dispatch(transaction);
      adapter.closeGroup();
    },
    select: (pos: number) =>
      view.dispatch(
        state.tr.setSelection(TextSelection.create(state.doc, pos))
      ),
    undo: () => undo(state, view.dispatch),
    redo: () => redo(state, view.dispatch),
    depth: () => undoDepth(state),
  };
}

describe("ComposerTiptapHistory", () => {
  it("undoes standalone actions in order with text edits", () => {
    const editor = fixture();
    editor.type("Unsent draft");
    let removed = false;
    editor.adapter.recordStandaloneEffect((forward) => {
      removed = forward;
    });
    expect(removed).toBe(true);
    expect(editor.text()).toBe("Unsent draft");

    expect(editor.undo()).toBe(true);
    expect(removed).toBe(false);
    expect(editor.text()).toBe("Unsent draft");
    expect(editor.redo()).toBe(true);
    expect(removed).toBe(true);
    expect(editor.text()).toBe("Unsent draft");
    editor.undo();
    editor.undo();
    expect(editor.text()).toBe("");
  });

  it("leaves queued edits open when either arrow is pressed", () => {
    const editor = fixture();
    editor.type("queued text");
    editor.bind(
      {},
      {
        undo: () => {
          throw new Error("Queue edit unexpectedly cancelled");
        },
      }
    );
    expect(editor.adapter.keyDown({ key: "ArrowUp" } as KeyboardEvent)).toBe(
      false
    );
    expect(editor.adapter.keyDown({ key: "ArrowDown" } as KeyboardEvent)).toBe(
      false
    );
    expect(editor.text()).toBe("queued text");
  });

  it.each([false, true])(
    "undoes entering a queued edit (with typing: %s)",
    (typed) => {
      const editor = fixture();
      editor.type("ordinary draft");
      editor.select(4);
      const draft = editor.adapter.read();
      editor.adapter.clear();
      editor.adapter.restore(
        editor.adapter.materialize({ id: "queued", text: "queued text" })
          .document
      );
      const editScope = {};
      const undoBoundary = () => {
        editor.adapter.clear();
        editor.adapter.restore(draft.document);
        editor.bind(editor.historyState);
      };
      editor.bind(editScope, { undo: undoBoundary });
      if (typed) {
        editor.type(" changed");
        editor.undo();
      }
      expect(editor.text()).toBe("queued text");

      editor.bind(editScope, {});
      editor.undo();
      expect(editor.text()).toBe("queued text");
      editor.bind(editScope, { undo: undoBoundary });
      expect(editor.undo()).toBe(true);
      expect(editor.text()).toBe("ordinary draft");
      expect(editor.adapter.read().selection).toMatchObject({
        anchor: 4,
        head: 4,
      });
      expect(editor.redo()).toBe(false);
      expect(editor.undo()).toBe(true);
      expect(editor.text()).toBe("");
    }
  );

  it("recalls prompt text into an attachment-only draft and keeps its attachment", () => {
    const editor = fixture(() => [{ id: "sent", text: "previous prompt" }]);
    const file = { name: "draft.txt" };
    editor.attach(file);
    const up = { key: "ArrowUp" } as KeyboardEvent;
    const down = { key: "ArrowDown" } as KeyboardEvent;
    expect(
      editor.adapter.keyDown({ ...up, repeat: true } as KeyboardEvent)
    ).toBe(false);
    expect(editor.adapter.keyDown(up)).toBe(true);
    expect(editor.text()).toBe("previous prompt");
    expect(editor.adapter.read().attachment).toBe(file);
    editor.select(1);
    expect(editor.adapter.keyDown(up)).toBe(false);
    expect(editor.adapter.keyDown(down)).toBe(false);
    expect(editor.undo()).toBe(true);
    expect(editor.text()).toBe("");
    expect(editor.adapter.read().attachment).toBe(file);
  });

  it("leaves typed whitespace to ordinary caret navigation", () => {
    const editor = fixture(() => [{ id: "sent", text: "previous prompt" }]);
    editor.type(" ");
    expect(editor.adapter.keyDown({ key: "ArrowUp" } as KeyboardEvent)).toBe(
      false
    );
    expect(editor.adapter.keyDown({ key: "ArrowDown" } as KeyboardEvent)).toBe(
      false
    );
    expect(editor.text()).toBe(" ");
  });

  it("drops a pending recall if the host disables recall for the current draft", async () => {
    const pending = Promise.withResolvers<ComposerHistory.RecallResult>();
    let isCurrent: (() => boolean) | undefined;
    const editor = fixture(
      () => [{ id: "sent", text: "previous prompt" }],
      (guard) => {
        isCurrent = guard;
        return pending.promise;
      }
    );
    expect(editor.adapter.keyDown({ key: "ArrowUp" } as KeyboardEvent)).toBe(
      true
    );
    expect(isCurrent?.()).toBe(true);
    editor.bind(editor.historyState, undefined, false);
    expect(isCurrent?.()).toBe(false);
    pending.resolve("recall");
    await pending.promise;
    expect(editor.text()).toBe("");
  });

  it("keeps Send in order with native typing undo and redo", () => {
    const editor = fixture();
    editor.type("first prompt");
    editor.adapter.clear({ draft: editor.adapter.read(), text: editor.text() });
    editor.type("next draft");
    expect(editor.undo()).toBe(true);
    expect(editor.text()).toBe("");
    expect(editor.undo()).toBe(true);
    expect(editor.text()).toBe("first prompt");
    expect(editor.redo()).toBe(true);
    expect(editor.text()).toBe("");
    expect(editor.redo()).toBe(true);
    expect(editor.text()).toBe("next draft");
  });

  it("undoes and redoes moving pasted text from a card as one history entry", () => {
    const editor = fixture();
    let cardVisible = true;
    editor.type("existing draft");
    editor.appendWithEffect(" pasted text", (forward) => {
      cardVisible = !forward;
    });
    expect(editor.text()).toBe("existing draft pasted text");
    expect(cardVisible).toBe(false);

    editor.type(" later edit");
    expect(editor.undo()).toBe(true);
    expect(editor.text()).toBe("existing draft pasted text");
    expect(cardVisible).toBe(false);
    expect(editor.undo()).toBe(true);
    expect(editor.text()).toBe("existing draft");
    expect(cardVisible).toBe(true);
    expect(editor.redo()).toBe(true);
    expect(editor.text()).toBe("existing draft pasted text");
    expect(cardVisible).toBe(false);
  });

  it("records card changes only while the document is empty", () => {
    const editor = fixture();
    const file = { name: "notes.txt" };
    editor.attach(file);
    expect(editor.undo()).toBe(true);
    expect(editor.adapter.read().attachment).toBeNull();
    expect(editor.redo()).toBe(true);
    expect(editor.adapter.read().attachment).toBe(file);
    editor.type("caption");
    const depth = editor.depth();
    editor.attach(null);
    expect(editor.depth()).toBe(depth);
    expect(editor.undo()).toBe(true);
    expect(editor.text()).toBe("");
    expect(editor.adapter.read().attachment).toBeNull();
  });

  it("does not record hydration as adding an attachment", () => {
    const editor = fixture();
    editor.attach({ name: "restored.txt" }, false);
    expect(editor.undo()).toBe(false);
  });

  it("restores supported Markdown as editable formatting and leaves other syntax literal", () => {
    const { adapter } = fixture();
    const formatted = adapter.materialize({
      id: "previous",
      text: "**Bold**\n\n3. Third\n4. Fourth",
    });
    expect(formatted.document).toMatchObject({
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", marks: [{ type: "bold" }], text: "Bold" }],
        },
        { type: "orderedList", attrs: { start: 3 } },
      ],
    });
    expect(
      adapter.materialize({ id: "heading", text: "# Heading" }).document
    ).toMatchObject({
      content: [
        { type: "paragraph", content: [{ type: "text", text: "# Heading" }] },
      ],
    });
  });

  it("does not expose undo from another draft or a borrowed queue editor", () => {
    const editor = fixture();
    editor.type("ordinary draft");
    const ordinary = editor.adapter.read();
    editor.adapter.clear();
    editor.adapter.restore(
      editor.adapter.materialize({ id: "b", text: "queued edit" }).document
    );
    editor.bind({});
    expect(editor.undo()).toBe(false);
    editor.type(" updated");
    editor.adapter.clear();
    editor.adapter.restore(ordinary.document);
    editor.bind(editor.historyState);
    expect(editor.text()).toBe("ordinary draft");
    expect(editor.undo()).toBe(true);
    expect(editor.text()).toBe("");
  });
});
