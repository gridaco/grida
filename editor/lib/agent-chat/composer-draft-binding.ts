import type { ComposerDraftReturnedMessage } from "./composer-drafts";

/** Bind an editor document to the draft custody supplied by its caller. */
export class ComposerDraftBinding {
  private held?: ComposerDraftBinding.Target;
  private savedDocument?: string;
  private returnedFirstMessage?: ComposerDraftReturnedMessage;

  owns(target: ComposerDraftBinding.Target): boolean {
    return this.held?.key === target.key && this.held.store === target.store;
  }

  /** Retain the mounted editor across promotion when it already shows that draft. */
  restore(
    target: ComposerDraftBinding.Target,
    editor: ComposerDraftBinding.Editor,
    ordinaryEditor: ComposerDraftBinding.DocumentEditor = editor
  ): "unchanged" | "promoted" | "restored" | "unavailable" {
    if (!editor.ready) return "unavailable";
    const returned = target.store.returnedFirstMessage?.(target.key);
    if (this.owns(target)) {
      if (!returned || returned === this.returnedFirstMessage)
        return "unchanged";
      const current = ordinaryEditor.readDocument();
      const pending: ComposerDraftReturnedMessage[] = [];
      for (
        let entry: ComposerDraftReturnedMessage | undefined = returned;
        entry && entry !== this.returnedFirstMessage;
        entry = entry.previous
      )
        pending.push(entry);
      const recovered = pending
        .reverse()
        .reduce<unknown>(
          (document, entry) =>
            ComposerDraftBinding.append(document, entry.content),
          current
        );
      if (current !== recovered && !ordinaryEditor.restoreDocument(recovered))
        return "unavailable";
      this.returnedFirstMessage = returned;
      this.savedDocument = JSON.stringify(target.store.read(target.key));
      this.retain(target, ordinaryEditor.readDocument());
      return "restored";
    }

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
    this.returnedFirstMessage = returned;
    return promoted ? "promoted" : "restored";
  }

  /** A render caused by a toolbar or attachment update is not a document edit. */
  retain(target: ComposerDraftBinding.Target, document: unknown | null): void {
    if (!this.owns(target)) return;
    const returned = target.store.returnedFirstMessage?.(target.key);
    if (returned && returned !== this.returnedFirstMessage) return;
    const serialized = JSON.stringify(document);
    if (serialized === this.savedDocument) return;
    const revision = target.store.write(target.key, document);
    this.savedDocument = serialized;
    this.returnedFirstMessage = undefined;
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
  /** Append a returned message once, keeping any newer composer blocks. */
  export function append(document: unknown, content: readonly unknown[]) {
    if (
      document &&
      typeof document === "object" &&
      "type" in document &&
      document.type === "doc" &&
      "content" in document &&
      Array.isArray(document.content)
    ) {
      const suffix = document.content.slice(-content.length);
      return !content.length ||
        JSON.stringify(suffix) === JSON.stringify(content)
        ? document
        : { ...document, content: [...document.content, ...content] };
    }
    return { type: "doc", content };
  }

  export type Target = Readonly<{
    key: string;
    store: Readonly<{
      read(key: string): unknown | null;
      write(key: string, document: unknown | null): string | void;
      returnedFirstMessage?(
        key: string
      ): ComposerDraftReturnedMessage | undefined;
    }>;
    promotedFrom?: string;
    onWrite?(document: unknown | null, persistedRevision?: string): void;
  }>;

  export type DocumentEditor = Readonly<{
    readDocument(): unknown | null;
    restoreDocument(document: unknown): boolean;
  }>;

  export type Editor = DocumentEditor &
    Readonly<{
      ready: boolean;
      clearForHistory(): void;
    }>;
}
