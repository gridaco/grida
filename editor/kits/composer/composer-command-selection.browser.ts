import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComposerCore, type ComposerCommand } from "./composer-core";
import { ComposerTiptap } from "./composer-tiptap";

describe("composer command selection", () => {
  const editors: Editor[] = [];

  afterEach(() => {
    for (const editor of editors.splice(0)) editor.destroy();
    document.body.replaceChildren();
  });

  function setup() {
    const core = new ComposerCore({
      commands: [{ id: "review", title: "Review" }],
      mentions: [{ id: "source", label: "Source" }],
    });
    const element = document.createElement("div");
    document.body.append(element);
    const editor = new Editor({
      element,
      extensions: ComposerTiptap.extensions({ placeholder: "Compose" }),
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "keep /rev suffix" }],
          },
          {
            type: "paragraph",
            content: [
              { type: "text", text: "code", marks: [{ type: "code" }] },
              {
                type: "composerMention",
                attrs: { id: "source", label: "Source" },
              },
            ],
          },
        ],
      },
    });
    editors.push(editor);
    editor.commands.setTextSelection("keep /rev".length + 1);
    ComposerTiptap.syncCore(core, editor);
    core.addAttachment({
      name: "photo.png",
      mime: "image/png",
      url: "blob:photo",
    });
    core.setContexts([
      { kind: "selection", payload: { id: "a" }, emitted_at: 1 },
    ]);
    return { editor, core };
  }

  function pressEnter(
    editor: Editor,
    core: ComposerCore,
    onCommandSelect?: (command: ComposerCommand) => boolean
  ) {
    return ComposerTiptap.handleKeyDown({
      editor,
      core,
      event: new KeyboardEvent("keydown", { key: "Enter", cancelable: true }),
      triggerIndex: core.getSnapshot().triggerIndex,
      moveTriggerIndex: (delta) => core.moveTriggerIndex(delta),
      submit() {},
      onCommandSelect,
    });
  }

  it.each(["keyboard", "menu"] as const)(
    "%s selection consumes only the trigger and preserves draft content, attachments, and context",
    async (input) => {
      const { core, editor } = setup();
      const before = core.getSnapshot();
      const secondParagraph = editor.getJSON().content![1];
      const handler = vi.fn<(command: ComposerCommand) => boolean>(() => true);

      // Merely discovering a matching prefix is not a selection.
      expect(core.getSnapshot().trigger?.query).toBe("rev");
      expect(handler).not.toHaveBeenCalled();
      const selected =
        input === "keyboard"
          ? pressEnter(editor, core, handler)
          : ComposerTiptap.selectTriggerItem(editor, core, 0, handler);

      expect(selected).toBe(true);
      expect(handler).toHaveBeenCalledExactlyOnceWith({
        id: "review",
        title: "Review",
      });
      expect(editor.getJSON().content![0].content).toEqual([
        { type: "text", text: "keep  suffix" },
      ]);
      expect(editor.getJSON().content![1]).toEqual(secondParagraph);
      expect(core.getSnapshot().attachments).toEqual(before.attachments);
      expect(core.getSnapshot().contexts).toEqual(before.contexts);
      expect(core.getSnapshot().trigger).toBeNull();
      expect(
        core
          .createMessage({ submitted_at: 2 })
          ?.parts.some((part) => part.type === "command")
      ).toBe(false);
      expect(ComposerTiptap.selectTriggerItem(editor, core, 0, handler)).toBe(
        false
      );
      expect(handler).toHaveBeenCalledTimes(1);

      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );
      expect(document.activeElement).toBe(editor.view.dom);
    }
  );

  it.each(["keyboard", "menu"] as const)(
    "%s selection inserts ordinary command chips when the host declines",
    (input) => {
      const { core, editor } = setup();
      const handler = vi.fn<(command: ComposerCommand) => boolean>(() => false);
      if (input === "keyboard") pressEnter(editor, core, handler);
      else ComposerTiptap.selectTriggerItem(editor, core, 0, handler);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(core.createMessage({ submitted_at: 2 })?.parts).toContainEqual({
        type: "command",
        id: "review",
        title: "Review",
      });
      expect(core.getSnapshot().trigger).toBeNull();
    }
  );

  it("inserts command chips without a selection handler", () => {
    const { core, editor } = setup();
    ComposerTiptap.selectTriggerItem(editor, core, 0);
    expect(core.createMessage({ submitted_at: 2 })?.parts).toContainEqual({
      type: "command",
      id: "review",
      title: "Review",
    });
  });

  it("guards a re-entrant host callback from selecting the same command twice", () => {
    const { core, editor } = setup();
    const handler = vi.fn<(command: ComposerCommand) => boolean>(() => {
      expect(ComposerTiptap.selectTriggerItem(editor, core, 0, handler)).toBe(
        false
      );
      return true;
    });
    pressEnter(editor, core, handler);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(core.getSnapshot().trigger).toBeNull();
  });

  it("selects mentions without invoking the command handler", () => {
    const { core, editor } = setup();
    editor.commands.setContent("<p>@so</p>");
    editor.commands.setTextSelection(4);
    ComposerTiptap.syncCore(core, editor);
    const handler = vi.fn<(command: ComposerCommand) => boolean>(() => true);
    pressEnter(editor, core, handler);
    expect(handler).not.toHaveBeenCalled();
    expect(core.createMessage({ submitted_at: 2 })?.parts).toContainEqual({
      type: "mention",
      target: {
        id: "source",
        label: "Source",
        kind: undefined,
        path: undefined,
        payload: undefined,
      },
    });
  });
});
