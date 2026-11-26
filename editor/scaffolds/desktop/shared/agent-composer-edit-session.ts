import { ComposerDraftBinding } from "@/lib/agent-chat/composer-draft-binding";

/** Temporarily borrow an editor without replacing or persisting its ordinary draft. */
export class AgentComposerEditSession {
  private active: {
    id: string;
    owner: unknown;
    document: unknown | null;
  } | null = null;

  sync(
    edit:
      | Readonly<{
          id: string;
          text: string;
          savedDocument?: Readonly<{ document: unknown | null }>;
        }>
      | undefined,
    owner: unknown,
    editor: AgentComposerEditSession.Editor,
    ownerDraftRestored = false
  ): "unchanged" | "pending" | "changed" | "rejected" {
    // A different chat's normal draft is restored by its own draft binding.
    if (this.active && !Object.is(this.active.owner, owner)) {
      if (!ownerDraftRestored) {
        if (!editor.ready) return "pending";
        // Without a draft binding, restore the document this overlay borrowed.
        editor.clear();
        if (this.active.document !== null)
          editor.restoreDocument(this.active.document);
      }
      this.active = null;
    }
    if (this.active?.id === edit?.id) return "unchanged";
    if (!editor.ready) return "pending";
    if (this.active) {
      editor.clear();
      if (this.active.document !== null)
        editor.restoreDocument(this.active.document);
      this.active = null;
    }
    if (edit) {
      const document = editor.readDocument();
      editor.clear();
      const original = {
        type: "doc",
        content: edit.text.split("\n").map((text) => ({
          type: "paragraph",
          content: text ? [{ type: "text", text }] : [],
        })),
      };
      const saved = edit.savedDocument;
      const loaded =
        saved?.document === null ||
        (saved !== undefined && editor.restoreDocument(saved.document)) ||
        editor.restoreDocument(original);
      if (!loaded) {
        editor.clear();
        if (document !== null) editor.restoreDocument(document);
        return "rejected";
      }
      this.active = { id: edit.id, owner, document };
    }
    editor.focus();
    return "changed";
  }

  /** Autosave always sees the ordinary draft while the editor holds an edit. */
  document(owner: unknown, current: unknown | null) {
    return this.active && Object.is(this.active.owner, owner)
      ? this.active.document
      : current;
  }

  /** Reconcile the borrowed draft without replacing the queued edit. */
  ordinaryEditor(
    owner: unknown,
    editor: ComposerDraftBinding.DocumentEditor
  ): ComposerDraftBinding.DocumentEditor {
    const active = this.active;
    if (!active || !Object.is(active.owner, owner)) return editor;
    return {
      readDocument: () => active.document,
      appendDocument: (content) => {
        active.document = ComposerDraftBinding.append(active.document, content);
        return true;
      },
    };
  }

  owns(id: string, owner: unknown): boolean {
    return this.active?.id === id && Object.is(this.active.owner, owner);
  }
}

export namespace AgentComposerEditSession {
  export type Editor = Readonly<{
    ready: boolean;
    readDocument(): unknown | null;
    restoreDocument(document: unknown): boolean;
    clear(): void;
    focus(): boolean;
  }>;
}
