/** Temporarily borrow an editor without replacing or persisting its ordinary draft. */
export class AgentComposerEditSession {
  private active: {
    id: string;
    owner: string | number | undefined;
    document: unknown | null;
  } | null = null;

  sync(
    edit: Readonly<{ id: string; text: string }> | undefined,
    owner: string | number | undefined,
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
      const loaded = editor.restoreDocument({
        type: "doc",
        content: edit.text.split("\n").map((text) => ({
          type: "paragraph",
          content: text ? [{ type: "text", text }] : [],
        })),
      });
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
  document(owner: string | number | undefined, current: unknown | null) {
    return this.active && Object.is(this.active.owner, owner)
      ? this.active.document
      : current;
  }

  owns(id: string, owner: string | number | undefined): boolean {
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
