/** Bind an editor document to the draft custody supplied by its caller. */
export class ComposerDraftBinding {
  private held?: ComposerDraftBinding.Target;
  private savedDocument?: string;

  owns(target: ComposerDraftBinding.Target): boolean {
    return this.held?.key === target.key && this.held.store === target.store;
  }

  /** Retain the mounted editor across promotion when it already shows that draft. */
  restore(
    target: ComposerDraftBinding.Target,
    editor: ComposerDraftBinding.Editor
  ): "unchanged" | "promoted" | "restored" | "unavailable" {
    if (!editor.ready) return "unavailable";
    if (this.owns(target)) return "unchanged";

    const saved = target.store.read(target.key);
    const serialized = JSON.stringify(saved);
    const current = editor.readDocument();
    const promoted =
      this.held?.store === target.store &&
      this.held.key === target.promotedFrom &&
      serialized === JSON.stringify(current);
    if (!promoted) {
      if (current !== null && (this.held || saved !== null))
        editor.clearForHistory();
      if (saved !== null && !editor.restoreDocument(saved)) {
        this.held = undefined;
        return "unavailable";
      }
    }
    this.held = target;
    this.savedDocument = serialized;
    return promoted ? "promoted" : "restored";
  }

  /** A render caused by a toolbar or attachment update is not a document edit. */
  retain(target: ComposerDraftBinding.Target, document: unknown | null): void {
    if (!this.owns(target)) return;
    const serialized = JSON.stringify(document);
    if (serialized === this.savedDocument) return;
    const revision = target.store.write(target.key, document);
    this.savedDocument = serialized;
    target.onWrite?.(
      document,
      typeof revision === "string" ? revision : undefined
    );
  }

  /** The send owns storage cleanup. The editor now starts a separate draft. */
  sent(target: ComposerDraftBinding.Target): void {
    if (this.owns(target)) this.savedDocument = JSON.stringify(null);
  }
}

export namespace ComposerDraftBinding {
  export type Target = Readonly<{
    key: string;
    store: Readonly<{
      read(key: string): unknown | null;
      write(key: string, document: unknown | null): string | void;
    }>;
    promotedFrom?: string;
    onWrite?(document: unknown | null, persistedRevision?: string): void;
  }>;

  export type Editor = Readonly<{
    ready: boolean;
    readDocument(): unknown | null;
    clearForHistory(): void;
    restoreDocument(document: unknown): boolean;
  }>;
}
