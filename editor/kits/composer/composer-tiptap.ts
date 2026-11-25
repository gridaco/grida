import Link, { isAllowedUri } from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  InputRule,
  Node,
  PasteRule,
  getMarkRange,
  getSchema,
  mergeAttributes,
  posToDOMRect,
  type JSONContent,
} from "@tiptap/core";
import {
  MarkdownSerializer,
  defaultMarkdownSerializer,
} from "@tiptap/pm/markdown";
import type {
  MarkType,
  Node as ProseMirrorNode,
  ResolvedPos,
  Schema,
} from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { fromMarkdown } from "mdast-util-from-markdown";
import { chatWebLinkIcon } from "../../components/chat-web-link";
import {
  ComposerTiptapHistory,
  parseComposerPrompt,
} from "./composer-tiptap-history";
import {
  ComposerCore,
  type ComposerCommand,
  type ComposerDocument,
  type ComposerFileReference,
  type ComposerMention,
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
      sigil: { default: "@" },
      source: { default: "" },
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
        ...(HTMLAttributes.source && { title: HTMLAttributes.source }),
      }),
      `${HTMLAttributes.sigil === "$" ? "" : "@"}${HTMLAttributes.label || HTMLAttributes.id}`,
    ];
  },

  renderText({ node }) {
    return `${node.attrs.sigil === "$" ? "$" : "@"}${node.attrs.label || node.attrs.id}`;
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

export function composerLinkDestination(href: string): string {
  return href.trim().replace(/[\s<>]/g, encodeURIComponent);
}

function linkAt(position: ResolvedPos, type: MarkType) {
  const mark =
    type.isInSet(position.nodeAfter?.marks ?? []) ??
    type.isInSet(position.nodeBefore?.marks ?? []);
  if (!mark) return null;
  const href = mark.attrs.href;
  if (typeof href !== "string" || !href || !isAllowedUri(href)) return null;
  const range = getMarkRange(position, type, mark.attrs);
  return range ? { ...range, href } : null;
}

function markdownLinks(text: string) {
  if (!text.includes("](")) return [];
  return fromMarkdown(text).children.flatMap((block) => {
    if (block.type !== "paragraph") return [];
    return block.children.flatMap((node) => {
      if (node.type !== "link" || !node.url || !isAllowedUri(node.url))
        return [];
      const index = node.position?.start.offset;
      const end = node.position?.end.offset;
      const [label] = node.children;
      if (
        index === undefined ||
        end === undefined ||
        text[index] !== "[" ||
        node.children.length !== 1 ||
        label?.type !== "text" ||
        !label.value.trim()
      ) {
        return [];
      }
      return [
        {
          index,
          text: text.slice(index, end),
          data: {
            label: label.value,
            href: composerLinkDestination(node.url),
            title: node.title ?? null,
          },
        },
      ];
    });
  });
}

function applyMarkdownLink(type: MarkType): InputRule["handler"] {
  return ({ state, range: { from, to }, match }) => {
    // The text matcher can see a chip's label. Its document range must still
    // contain only text so the rule never replaces an inline reference.
    if (
      from < 1 ||
      from > to ||
      state.doc.textBetween(from, to, "\n", "\ufffc").includes("\ufffc") ||
      state.doc.rangeHasMark(from, to, state.schema.marks.code)
    )
      return null;

    const { label, href, title } = match.data!;
    const link = type.create({ href, title });
    state.tr
      .replaceWith(from, to, state.schema.text(label, [link]))
      .removeStoredMark(type);
  };
}

const ComposerLink = Link.extend({
  addAttributes() {
    return { ...this.parent?.(), title: { default: null } };
  },
  renderHTML(props) {
    return this.parent!({
      ...props,
      HTMLAttributes: mergeAttributes(props.HTMLAttributes, {
        "data-chat-web-link": chatWebLinkIcon(props.HTMLAttributes.href),
      }),
    });
  },
  addInputRules() {
    return [
      new InputRule({
        find(text) {
          if (!text.endsWith(")")) return null;
          const match = markdownLinks(text).at(-1);
          return match && match.index + match.text.length === text.length
            ? match
            : null;
        },
        handler: applyMarkdownLink(this.type),
      }),
    ];
  },
  addPasteRules() {
    return [
      new PasteRule({
        find: markdownLinks,
        handler: applyMarkdownLink(this.type),
      }),
    ];
  },
}).configure({
  autolink: false,
  linkOnPaste: false,
  openOnClick: false,
  HTMLAttributes: { class: "composer-link" },
});

const markdownMarks = {
  code: defaultMarkdownSerializer.marks.code,
  link: defaultMarkdownSerializer.marks.link,
  bold: defaultMarkdownSerializer.marks.strong,
  italic: defaultMarkdownSerializer.marks.em,
};

const hasMarkdownMark = (node: ProseMirrorNode) =>
  node.marks.some((mark) => Object.hasOwn(markdownMarks, mark.type.name));

const markdown = new MarkdownSerializer(
  {
    paragraph: defaultMarkdownSerializer.nodes.paragraph,
    blockquote: defaultMarkdownSerializer.nodes.blockquote,
    listItem: defaultMarkdownSerializer.nodes.list_item,
    hardBreak: defaultMarkdownSerializer.nodes.hard_break,
    codeBlock: defaultMarkdownSerializer.nodes.code_block,
    bulletList(state, node) {
      state.renderList(node, "  ", () => "- ");
    },
    orderedList(state, node) {
      const start: number = node.attrs.start ?? 1;
      const markerWidth = String(start + node.childCount - 1).length + 2;
      state.renderList(node, " ".repeat(markerWidth), (index) =>
        `${start + index}. `.padStart(markerWidth)
      );
    },
    text(state, node, parent, index) {
      if (hasMarkdownMark(node)) {
        defaultMarkdownSerializer.nodes.text(state, node, parent, index);
        return;
      }
      // People can also write Markdown directly in a composer paragraph.
      state.text(node.text ?? "", false);
    },
    composerCommand(state, node) {
      state.text(`/${node.attrs.id}`, false);
    },
    composerMention(state, node) {
      const label = node.attrs.label || node.attrs.id;
      if (node.attrs.sigil === "$") {
        const target = composerLinkDestination(node.attrs.id).replaceAll(
          /[()]/g,
          (character) => (character === "(" ? "%28" : "%29")
        );
        state.text(`[$${state.esc(label)}](${target})`, false);
      } else {
        state.text(`@${label}`, false);
      }
    },
    composerFileReference(state, node) {
      state.text(node.attrs.name || node.attrs.path, false);
    },
  },
  markdownMarks,
  { hardBreakNodeName: "hardBreak" }
);

export namespace ComposerTiptap {
  const selecting = new WeakSet<Editor>();
  let markdownSchema: Schema | undefined;

  export function markdownDocument(text: string): JSONContent | undefined {
    markdownSchema ??= getSchema(extensions({ placeholder: "" }));
    return parseComposerPrompt(markdownSchema, text)?.toJSON();
  }

  export function extensions(input: { placeholder: string }) {
    return [
      StarterKit.configure({
        blockquote: { HTMLAttributes: { class: "composer-blockquote" } },
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
      ComposerLink,
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

  /** Serialize structured formatting while preserving the ordinary text path. */
  export function formattedMarkdown(doc: ProseMirrorNode): string | undefined {
    let formatted = false;
    doc.descendants((node) => {
      formatted ||=
        node.type.name === "bulletList" ||
        node.type.name === "orderedList" ||
        node.type.name === "blockquote" ||
        node.type.name === "codeBlock" ||
        (node.type.name === "composerMention" && node.attrs.sigil === "$") ||
        hasMarkdownMark(node);
      return !formatted;
    });
    return formatted
      ? markdown.serialize(doc, { tightLists: true })
      : undefined;
  }

  export function selectionRect(editor: Editor): DOMRect {
    const { view } = editor;
    const { $from, $to } = editor.state.selection;
    // Select All reaches the document edges. Measure the inline range instead.
    const { from, to } = TextSelection.between($from, $to);
    const start = view.domAtPos(from, 1);
    const end = view.domAtPos(to, -1);
    const range = view.dom.ownerDocument.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    const rect = range.getBoundingClientRect();
    return rect.height ? rect : posToDOMRect(view, from, to);
  }

  export function linkTarget(editor: Editor) {
    const { doc, selection, schema } = editor.state;
    const { $from, $to, from, to } = selection;
    if (!$from.sameParent($to) || $from.parent.type.spec.code) return null;

    const link = linkAt($from, schema.marks.link);
    if (link && to <= link.to) return link;

    const text = doc.textBetween(from, to, "\n", "\ufffc");
    if (
      !text.trim() ||
      text.includes("\ufffc") ||
      doc.rangeHasMark(from, to, schema.marks.code)
    )
      return null;
    return { from, to, href: "" };
  }

  export function selectPressedLink(
    editor: Editor,
    event: MouseEvent
  ): boolean {
    if (
      !editor.isEditable ||
      event.button !== 0 ||
      event.shiftKey ||
      !(event.target instanceof Element)
    )
      return false;
    const anchor = event.target.closest("a.composer-link");
    const {
      view,
      state: { doc, schema },
    } = editor;
    if (!anchor || !view.dom.contains(anchor)) return false;
    const link = linkAt(
      doc.resolve(view.posAtDOM(anchor, 0)),
      schema.marks.link
    );
    return !!link && editor.commands.setTextSelection(link);
  }

  export function replaceLinkText(
    editor: Editor,
    range: { from: number; to: number },
    text: string
  ): void {
    const { doc, schema } = editor.state;
    if (doc.textBetween(range.from, range.to) === text) return;
    let marks = doc.resolve(range.from).nodeAfter?.marks ?? [];
    doc.nodesBetween(range.from, range.to, (node) => {
      if (node.isText) marks = marks.filter((mark) => mark.isInSet(node.marks));
    });
    editor.commands.insertContentAt(range, schema.text(text, marks).toJSON());
  }

  export function inspectCore(core: ComposerCore, editor: Editor): void {
    const { from } = editor.state.selection;
    const textBeforeCursor = editor.state.doc.textBetween(0, from, "\n", "\n");
    core.inspectCursor(textBeforeCursor, from);
  }

  /** A single untouched paragraph can display an inline prompt. */
  export function hasEmptyParagraph(editor: Editor): boolean {
    const { doc } = editor.state;
    return (
      doc.childCount === 1 &&
      doc.firstChild?.type.name === "paragraph" &&
      doc.firstChild.content.size === 0
    );
  }

  export function handleKeyDown(input: {
    core: ComposerCore;
    editor: Editor | null;
    event: KeyboardEvent;
    triggerIndex: number;
    moveTriggerIndex: (delta: number) => void;
    submit: () => void;
    suggestion?: { text: string; take(text: string): boolean };
    onCommandSelect?: (command: ComposerCommand) => boolean;
  }): boolean {
    if (isComposing(input.event) || input.editor?.view.composing) {
      return false;
    }

    const trigger = input.core.getSnapshot().trigger;
    const triggerItemsCount = trigger?.items.length ?? 0;

    const { editor, event, suggestion } = input;
    if (
      event.key === "Tab" &&
      !event.shiftKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.repeat &&
      !event.defaultPrevented &&
      !trigger &&
      suggestion &&
      editor?.isEditable &&
      hasEmptyParagraph(editor) &&
      suggestion.take(suggestion.text)
    ) {
      event.preventDefault();
      editor.view.dispatch(editor.state.tr.insertText(suggestion.text));
      return true;
    }

    if (trigger && input.event.key === "Escape") {
      input.event.preventDefault();
      input.core.dismissTrigger();
      return true;
    }

    if (
      trigger?.pending &&
      !event.shiftKey &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      ["Enter", "Tab", "ArrowUp", "ArrowDown"].includes(event.key)
    ) {
      event.preventDefault();
      return true;
    }

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

      if (
        !event.shiftKey &&
        (event.key === "Enter" ||
          ((trigger.kind === "skill" || trigger.kind === "mention") &&
            event.key === "Tab" &&
            !event.altKey &&
            !event.ctrlKey &&
            !event.metaKey))
      ) {
        if (!input.editor) return false;
        input.event.preventDefault();
        selectTriggerItem(
          input.editor,
          input.core,
          input.triggerIndex,
          input.onCommandSelect
        );
        return true;
      }
    }

    if (!trigger && editor && ComposerTiptapHistory.keyDown(editor, event)) {
      event.preventDefault();
      return true;
    }
    if (input.event.key !== "Enter") return false;

    if (input.event.shiftKey) {
      const { editor, event } = input;
      if (!editor || event.altKey || event.ctrlKey || event.metaKey) {
        return false;
      }
      // Start a new text block on Shift+Enter so shortcuts
      // like "- " and "1. " can start at the next paragraph.
      const handled = editor.commands.first(({ commands }) => [
        () => commands.newlineInCode(),
        () => commands.splitListItem("listItem"),
        () => commands.createParagraphNear(),
        () => commands.liftEmptyBlock(),
        () => commands.splitBlock(),
      ]);
      if (handled) event.preventDefault();
      return handled;
    }

    input.event.preventDefault();
    input.submit();
    return true;
  }

  function isComposing(event: KeyboardEvent): boolean {
    return event.isComposing || event.keyCode === 229;
  }

  export function selectTriggerItem(
    editor: Editor,
    core: ComposerCore,
    index: number,
    onCommandSelect?: (command: ComposerCommand) => boolean
  ): boolean {
    if (editor.isDestroyed || selecting.has(editor)) return false;
    const trigger = core.getSnapshot().trigger;
    if (!trigger) return false;
    const item = trigger.items[Math.min(index, trigger.items.length - 1)];
    if (!item) return false;
    selecting.add(editor);
    try {
      if (trigger.kind === "command") {
        const command = item as ComposerCommand;
        if (onCommandSelect?.({ ...command }) === true) {
          editor.chain().focus().deleteRange(trigger.range).run();
        } else {
          insertCommand(editor, trigger.range, command);
        }
      } else {
        insertMention(
          editor,
          trigger.range,
          item as ComposerMention,
          trigger.kind === "skill" ? "$" : "@"
        );
      }
      // Refresh immediately: a second selection must not reuse a menu captured
      // by a previous render, even before React receives the editor update.
      syncCore(core, editor);
      return true;
    } finally {
      selecting.delete(editor);
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

  export function appendText(
    editor: Editor,
    text: string,
    maxBytes: number,
    placement: "paragraph" | "inline" = "paragraph",
    onHistoryChange?: (forward: boolean) => void
  ): boolean {
    if (editor.isDestroyed || !text) return false;
    const empty = hasEmptyParagraph(editor);
    const current = empty ? "" : editor.getText({ blockSeparator: "\n" });
    const doc = editor.state.doc;
    const last = doc.lastChild;
    const inline = placement === "inline" && last?.type.name === "paragraph";
    const separator = inline
      ? last.content.size > 0 && !/\s$/.test(current) && !/^\s/.test(text)
        ? " "
        : ""
      : empty
        ? ""
        : "\n";
    const next = `${current}${separator}${text}`;
    if (new TextEncoder().encode(next).length > maxBytes) return false;

    const lines = text.split("\n");
    const end = doc.content.size;
    const history = onHistoryChange
      ? ComposerTiptapHistory.for(editor)
      : undefined;
    const chain = editor.chain();
    let insertAt: number | { from: number; to: number } = empty
      ? { from: 0, to: end }
      : end;
    if (inline) {
      const first = `${separator}${lines.shift() ?? ""}`;
      if (first) {
        chain.command(({ tr }) => {
          tr.insert(end - 1, editor.schema.text(first));
          return true;
        });
      }
      insertAt = end + first.length;
    }
    const paragraphs = lines.map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : [],
    }));
    if (paragraphs.length > 0) chain.insertContentAt(insertAt, paragraphs);
    if (history && onHistoryChange)
      chain.command(({ tr }) => {
        if (tr.docChanged) history.recordEffect(tr, onHistoryChange);
        return true;
      });
    const appended = chain.focus("end").run();
    if (appended) history?.closeGroup();
    return appended;
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
    mention: ComposerMention,
    sigil: "@" | "$"
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
            sigil,
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
          ...(node.attrs?.sigil === "$" && { sigil: "$" as const }),
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
