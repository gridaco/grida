import Placeholder from "@tiptap/extension-placeholder";
import { Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  ComposerCore,
  type ComposerCommand,
  type ComposerDocument,
  type ComposerFileReference,
  type ComposerMention,
  type ComposerTrigger,
} from "./composer-core";

const ComposerCommandNode = Node.create({
  name: "composerCommand",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      id: { default: "" },
      title: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-composer-command]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-composer-command": HTMLAttributes.id,
        "data-composer-chip": "command",
        class: "composer-chip composer-command",
      }),
      `/${HTMLAttributes.id}`,
    ];
  },

  renderText({ node }) {
    return `/${node.attrs.id}`;
  },
});

const ComposerMentionNode = Node.create({
  name: "composerMention",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      id: { default: "" },
      label: { default: "" },
      kind: { default: "" },
      path: { default: "" },
      payload: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-composer-mention]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-composer-mention": HTMLAttributes.id,
        "data-composer-chip": "mention",
        class: "composer-chip composer-mention",
      }),
      `@${HTMLAttributes.label || HTMLAttributes.id}`,
    ];
  },

  renderText({ node }) {
    return `@${node.attrs.label || node.attrs.id}`;
  },
});

const ComposerFileReferenceNode = Node.create({
  name: "composerFileReference",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      id: { default: "" },
      name: { default: "" },
      path: { default: "" },
      mime: { default: "" },
      size: { default: null },
      url: { default: "" },
      payload: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-composer-file-ref]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-composer-file-ref": HTMLAttributes.path,
        "data-composer-chip": "file-ref",
        class: "composer-chip composer-file-ref",
      }),
      HTMLAttributes.name || HTMLAttributes.path,
    ];
  },

  renderText({ node }) {
    return node.attrs.name || node.attrs.path;
  },
});

export namespace ComposerTiptap {
  export function extensions(input: { placeholder: string }) {
    return [
      StarterKit.configure({
        blockquote: false,
        bold: false,
        bulletList: {
          HTMLAttributes: {
            class: "composer-list-node composer-list-node-bullet",
          },
        },
        code: {
          HTMLAttributes: {
            class: "composer-inline-code",
          },
        },
        codeBlock: {
          HTMLAttributes: {
            class: "composer-code-block",
          },
        },
        dropcursor: false,
        gapcursor: false,
        heading: false,
        horizontalRule: false,
        italic: false,
        orderedList: {
          HTMLAttributes: {
            class: "composer-list-node composer-list-node-ordered",
          },
        },
        paragraph: {
          HTMLAttributes: {
            class: "composer-text-node",
          },
        },
        strike: false,
      }),
      Placeholder.configure({ placeholder: input.placeholder }),
      ComposerCommandNode,
      ComposerMentionNode,
      ComposerFileReferenceNode,
    ];
  }

  export function syncCore(core: ComposerCore, editor: Editor): void {
    core.ingestDocument({
      text: editor.getText({ blockSeparator: "\n" }),
      document: toDocument(editor.getJSON()),
    });
    inspectCore(core, editor);
  }

  export function inspectCore(core: ComposerCore, editor: Editor): void {
    const { from } = editor.state.selection;
    const textBeforeCursor = editor.state.doc.textBetween(0, from, "\n", "\n");
    core.inspectCursor(textBeforeCursor, from);
  }

  export function handleKeyDown(input: {
    core: ComposerCore;
    editor: Editor | null;
    event: KeyboardEvent;
    triggerIndex: number;
    moveTriggerIndex: (delta: number) => void;
    submit: () => void;
  }): boolean {
    if (isComposing(input.event)) {
      return false;
    }

    const trigger = input.core.getSnapshot().trigger;
    const triggerItemsCount = trigger?.items.length ?? 0;

    if (trigger && triggerItemsCount > 0) {
      if (input.event.key === "ArrowDown") {
        input.event.preventDefault();
        input.moveTriggerIndex(1);
        return true;
      }

      if (input.event.key === "ArrowUp") {
        input.event.preventDefault();
        input.moveTriggerIndex(-1);
        return true;
      }

      if (input.event.key === "Enter" && !input.event.shiftKey) {
        if (!input.editor) return false;
        input.event.preventDefault();
        selectTriggerItem(input.editor, trigger, input.triggerIndex);
        return true;
      }
    }

    if (input.event.key === "Enter" && !input.event.shiftKey) {
      input.event.preventDefault();
      input.submit();
      return true;
    }

    return false;
  }

  function isComposing(event: KeyboardEvent): boolean {
    return event.isComposing || event.keyCode === 229;
  }

  export function selectTriggerItem(
    editor: Editor,
    trigger: ComposerTrigger,
    index: number
  ): void {
    const item = trigger.items[Math.min(index, trigger.items.length - 1)];
    if (!item) return;
    if (trigger.kind === "command") {
      insertCommand(editor, trigger.range, item as ComposerCommand);
    } else {
      insertMention(editor, trigger.range, item as ComposerMention);
    }
  }

  export function insertFileReference(
    editor: Editor,
    reference: ComposerFileReference
  ): void {
    editor
      .chain()
      .focus()
      .insertContent([
        {
          type: "composerFileReference",
          attrs: {
            id: reference.id,
            name: reference.name,
            path: reference.path,
            mime: reference.mime,
            size: reference.size,
            url: reference.url,
            payload: encodePayload(reference.payload),
          },
        },
        { type: "text", text: " " },
      ])
      .run();
  }

  export function toDocument(json: JSONContent): ComposerDocument.Root {
    return {
      type: "doc",
      children: (json.content ?? []).flatMap(toNodes),
    };
  }

  function insertCommand(
    editor: Editor,
    range: { from: number; to: number },
    command: ComposerCommand
  ): void {
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent([
        {
          type: "composerCommand",
          attrs: {
            id: command.id,
            title: command.title,
          },
        },
        { type: "text", text: " " },
      ])
      .run();
  }

  function insertMention(
    editor: Editor,
    range: { from: number; to: number },
    mention: ComposerMention
  ): void {
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent([
        {
          type: "composerMention",
          attrs: {
            ...mention,
            payload: encodePayload(mention.payload),
          },
        },
        { type: "text", text: " " },
      ])
      .run();
  }

  function toNodes(node: JSONContent): ComposerDocument.Node[] {
    if (node.type === "text") {
      return [
        {
          type: "text",
          text: node.text ?? "",
          code: node.marks?.some((mark) => mark.type === "code") || undefined,
        },
      ];
    }

    if (node.type === "paragraph") {
      return [
        {
          type: "paragraph",
          children: (node.content ?? []).flatMap(toNodes),
        },
      ];
    }

    if (node.type === "composerCommand") {
      const id = readString(node.attrs?.id);
      if (!id) return [];
      return [
        {
          type: "command",
          id,
          title: readString(node.attrs?.title) || undefined,
        },
      ];
    }

    if (node.type === "composerMention") {
      const id = readString(node.attrs?.id);
      if (!id) return [];
      return [
        {
          type: "mention",
          id,
          label: readString(node.attrs?.label) || id,
          kind: readString(node.attrs?.kind) || undefined,
          path: readString(node.attrs?.path) || undefined,
          payload: decodePayload(node.attrs?.payload),
        },
      ];
    }

    if (node.type === "composerFileReference") {
      const path = readString(node.attrs?.path);
      if (!path) return [];
      return [
        {
          type: "file-ref",
          path,
          name: readString(node.attrs?.name) || path,
          mime: readString(node.attrs?.mime) || undefined,
          size: readNumber(node.attrs?.size),
          url: readString(node.attrs?.url) || undefined,
          payload: decodePayload(node.attrs?.payload),
        },
      ];
    }

    if (node.type === "codeBlock") {
      return [
        {
          type: "code-block",
          text: collectText(node),
        },
      ];
    }

    if (node.type === "bulletList" || node.type === "orderedList") {
      return [
        {
          type: "list",
          ordered: node.type === "orderedList",
          items: (node.content ?? [])
            .filter((child) => child.type === "listItem")
            .map((child) => (child.content ?? []).flatMap(toNodes)),
        },
      ];
    }

    return (node.content ?? []).flatMap(toNodes);
  }

  function collectText(node: JSONContent): string {
    if (node.type === "text") return node.text ?? "";
    return (node.content ?? []).map(collectText).join("");
  }

  function readString(value: unknown): string {
    return typeof value === "string" ? value : "";
  }

  function readNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value)
      ? value
      : undefined;
  }

  function encodePayload(payload: Record<string, unknown> | undefined): string {
    if (!payload) return "";
    return JSON.stringify(payload);
  }

  function decodePayload(value: unknown): Record<string, unknown> | undefined {
    if (typeof value !== "string" || !value) return undefined;
    try {
      const payload = JSON.parse(value);
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        return payload as Record<string, unknown>;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }
}
