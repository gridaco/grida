import type { Editor, JSONContent } from "@tiptap/core";
import { closeHistory, history } from "@tiptap/pm/history";
import { defaultMarkdownParser, MarkdownParser } from "@tiptap/pm/markdown";
import type { Node, Schema } from "@tiptap/pm/model";
import {
  Plugin,
  PluginKey,
  Selection,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";
import { Step, StepResult } from "@tiptap/pm/transform";
import { ComposerHistory } from "./composer-history";

const adapters = new WeakMap<Editor, ComposerTiptapHistory>();
const restoreDraft = "composerRestoreDraft";
const parsers = new WeakMap<Schema, MarkdownParser>();

export function parseComposerPrompt(
  schema: Schema,
  text: string
): Node | undefined {
  let parser = parsers.get(schema);
  if (!parser) {
    const { tokenizer, tokens } = defaultMarkdownParser;
    parser = new MarkdownParser(schema, tokenizer, {
      paragraph: tokens.paragraph,
      blockquote: tokens.blockquote,
      list_item: { block: "listItem" },
      bullet_list: { block: "bulletList" },
      ordered_list: {
        block: "orderedList",
        getAttrs: (token) => ({ start: Number(token.attrGet("start")) || 1 }),
      },
      code_block: { block: "codeBlock", noCloseToken: true },
      fence: {
        block: "codeBlock",
        noCloseToken: true,
        getAttrs: (token) => ({ language: token.info.trim() || null }),
      },
      hardbreak: { node: "hardBreak" },
      em: { mark: "italic" },
      strong: { mark: "bold" },
      link: tokens.link,
      code_inline: tokens.code_inline,
    });
    parsers.set(schema, parser);
  }
  try {
    const doc = parser.parse(text);
    let formatted = false;
    doc.descendants((node) => {
      formatted ||=
        (!node.isText && node.type.name !== "paragraph") ||
        node.marks.length > 0;
      return !formatted;
    });
    return formatted ? doc : undefined;
  } catch {
    // Prompts with unsupported syntax still recall as editable literal text.
    return undefined;
  }
}

/** An undoable change outside the document, grouped with its document edit. */
class DraftStep extends Step {
  constructor(
    readonly before: object | null,
    readonly after: object | null,
    readonly applied?: (forward: boolean) => void,
    readonly forward = true,
    readonly canApply?: () => boolean
  ) {
    super();
  }

  apply(doc: Node) {
    return StepResult.ok(doc);
  }
  invert() {
    return new DraftStep(
      this.after,
      this.before,
      this.applied,
      !this.forward,
      this.canApply
    );
  }
  map() {
    return this;
  }
  toJSON(): never {
    throw new Error("Composer history is local to the editor");
  }
}

export class ComposerTiptapHistory implements ComposerHistory.Editor {
  static for(editor: Editor): ComposerTiptapHistory {
    let adapter = adapters.get(editor);
    if (!adapter) {
      adapter = new ComposerTiptapHistory(editor);
      adapters.set(editor, adapter);
    }
    return adapter;
  }

  static keyDown(editor: Editor, event: KeyboardEvent): boolean {
    return adapters.get(editor)?.keyDown(event) ?? false;
  }

  private binding?: ComposerTiptapHistory.Binding;
  private saved = new WeakMap<object, EditorState>();
  private attachment: object | null = null;
  private attachmentRevision = 0;
  private revision = 0;

  private constructor(private readonly editor: Editor) {
    editor.registerPlugin(
      new Plugin({
        key: new PluginKey("composerHistoryEffects"),
        filterTransaction: (transaction) =>
          transaction.steps.every((step) => {
            if (!(step instanceof DraftStep)) return true;
            if (!step.forward && step.canApply && !step.canApply())
              return false;
            if (step.before === step.after) return true;
            const current = this.readAttachment();
            return (
              current !== step.before ||
              !!this.binding?.attachments?.canReplace(step.after)
            );
          }),
      })
    );
    editor.on("transaction", ({ transaction }) => this.transacted(transaction));
  }

  configure(binding: ComposerTiptapHistory.Binding | undefined): void {
    const previous = this.binding;
    this.binding = binding;
    const gestureRevision = binding?.attachments?.gestureRevision() ?? 0;
    const changedByUser = gestureRevision !== this.attachmentRevision;
    this.attachmentRevision = gestureRevision;
    if (previous?.scope !== binding?.scope) {
      this.revision++;
      const { state, view } = this.editor;
      const saved = binding && this.saved.get(binding.scope);
      if (saved?.doc.eq(state.doc)) view.updateState(saved);
      else {
        const undoPlugin = history().spec.key?.get(state);
        view.updateState(
          state
            .reconfigure({
              plugins: state.plugins.filter((plugin) => plugin !== undoPlugin),
            })
            .reconfigure({ plugins: state.plugins })
        );
      }
      this.attachment = this.readAttachment();
      if (binding?.undoBoundary && !saved) {
        // Register the host action as the first event in this undo history.
        const { scope } = binding;
        const currentBoundary = () =>
          this.binding?.scope === scope ? this.binding.undoBoundary : undefined;
        this.dispatch(
          this.editor.state.tr.step(
            new DraftStep(
              null,
              null,
              (forward) => {
                if (!forward) currentBoundary()?.undo?.();
              },
              true,
              () => !!currentBoundary()?.undo
            )
          )
        );
      }
      if (binding) this.saved.set(binding.scope, this.editor.state);
      return;
    }
    const next = this.readAttachment();
    const before = this.attachment;
    this.attachment = next;
    if (
      binding?.active &&
      changedByUser &&
      next !== before &&
      !this.editor.getText().trim()
    )
      this.dispatch(this.editor.state.tr.step(new DraftStep(before, next)));
  }

  keyDown(event: KeyboardEvent): boolean {
    const { editor, binding } = this;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return false;
    if (
      !binding?.active ||
      !editor.isEditable ||
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey ||
      event.repeat ||
      !editor.state.selection.empty ||
      editor.getText().length > 0
    )
      return false;
    return binding.history.move(
      event.key === "ArrowUp" ? "up" : "down",
      this,
      binding.source
    );
  }

  read(): ComposerHistory.Draft {
    const { selection, doc } = this.editor.state;
    return {
      document: this.editor.isEmpty ? null : doc.toJSON(),
      selection: selection.toJSON(),
      attachment: this.readAttachment(),
    };
  }

  materialize(prompt: ComposerHistory.Prompt): ComposerHistory.Draft {
    return (
      prompt.draft ?? {
        document: parseComposerPrompt(
          this.editor.state.schema,
          prompt.text
        )?.toJSON() ?? {
          type: "doc",
          content: prompt.text.split("\n").map((text) => ({
            type: "paragraph",
            ...(text && { content: [{ type: "text", text }] }),
          })),
        },
        attachment: null,
      }
    );
  }

  guard(): () => boolean {
    const unchanged = this.guardDocument();
    const { selection } = this.editor.state;
    const attachment = this.readAttachment();
    return () =>
      unchanged() &&
      this.binding?.active === true &&
      this.editor.isEditable &&
      this.editor.isFocused &&
      selection.eq(this.editor.state.selection) &&
      attachment === this.readAttachment() &&
      !this.editor.view.composing;
  }

  guardDocument(): () => boolean {
    const revision = this.revision;
    return () => !this.editor.isDestroyed && this.revision === revision;
  }

  replace(
    draft: ComposerHistory.Draft,
    applied: (forward: boolean) => void
  ): boolean {
    const before = this.readAttachment();
    const { state } = this.editor;
    const doc = draft.document
      ? state.schema.nodeFromJSON(draft.document as JSONContent)
      : state.schema.topNodeType.createAndFill()!;
    const tr = state.tr;
    if (!doc.eq(state.doc))
      tr.replaceWith(0, state.doc.content.size, doc.content);
    tr.setSelection(
      draft.selection
        ? Selection.fromJSON(tr.doc, draft.selection)
        : Selection.atEnd(tr.doc)
    );
    if (
      before !== draft.attachment &&
      !this.binding?.attachments?.canReplace(draft.attachment)
    )
      return false;
    this.dispatch(tr.step(new DraftStep(before, draft.attachment, applied)));
    return true;
  }

  clear(remember?: { draft: ComposerHistory.Draft; text: string }): void {
    const { state, view } = this.editor;
    const empty = state.schema.topNodeType.createAndFill()!;
    const tr = state.tr;
    if (!empty.eq(state.doc))
      tr.replaceWith(0, state.doc.content.size, empty.content);
    const binding = this.binding;
    if (!remember || !binding) {
      view.dispatch(
        tr.setMeta("addToHistory", false).setMeta(restoreDraft, true)
      );
      return;
    }
    const after = this.readAttachment();
    const before = remember.text.trim() ? after : remember.draft.attachment;
    if (before !== after) tr.step(new DraftStep(before, after));
    if (
      binding.retainSent &&
      (remember.text.trim() || remember.draft.attachment)
    )
      binding.history.remember({
        id: crypto.randomUUID(),
        text: remember.text,
        draft: {
          ...remember.draft,
          attachment: null,
        },
      });
    else binding.history.sent();
    this.attachment = after;
    this.dispatch(tr);
  }

  restore(document: unknown): void {
    const { state, view } = this.editor;
    const doc = state.schema.nodeFromJSON(document as JSONContent);
    const tr = state.tr.replaceWith(0, state.doc.content.size, doc.content);
    view.dispatch(
      tr
        .setSelection(Selection.atEnd(tr.doc))
        .setMeta("addToHistory", false)
        .setMeta(restoreDraft, true)
    );
  }

  recordEffect(
    transaction: Transaction,
    applied: (forward: boolean) => void
  ): void {
    closeHistory(transaction).step(new DraftStep(null, null, applied));
  }

  recordStandaloneEffect(applied: (forward: boolean) => void): void {
    const transaction = this.editor.state.tr;
    this.recordEffect(transaction, applied);
    this.dispatch(transaction);
  }

  closeGroup(): void {
    this.editor.view.dispatch(closeHistory(this.editor.state.tr));
  }

  private readAttachment(): object | null {
    return this.binding?.attachments?.read() ?? null;
  }

  private transacted(transaction: Transaction): void {
    const binding = this.binding;
    if (transaction.docChanged) this.revision++;
    if (transaction.getMeta(restoreDraft)) return;
    for (const step of transaction.steps) {
      if (!(step instanceof DraftStep)) continue;
      const current = this.readAttachment();
      if (step.before !== step.after && current === step.before)
        binding?.attachments?.replace(step.after);
      this.attachment = this.readAttachment();
      step.applied?.(step.forward);
    }
    if (binding) this.saved.set(binding.scope, this.editor.state);
  }

  private dispatch(tr: Transaction): void {
    const { view } = this.editor;
    view.dispatch(closeHistory(tr).scrollIntoView());
    this.closeGroup();
  }
}

export namespace ComposerTiptapHistory {
  export type Binding = Readonly<{
    scope: object;
    history: ComposerHistory;
    source: ComposerHistory.Source;
    active: boolean;
    undoBoundary?: Readonly<{ undo?: () => void }>;
    retainSent?: boolean;
    attachments?: ComposerHistory.Attachments;
  }>;
}
