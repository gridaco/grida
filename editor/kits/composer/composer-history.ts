/** Recall state for one logical draft. The editor owns transactions and undo. */
export class ComposerHistory {
  private static owners = new WeakMap<object, Map<string, ComposerHistory>>();

  static forDraft(
    owner: object,
    key: string,
    promotedFrom?: string
  ): ComposerHistory {
    let drafts = this.owners.get(owner);
    if (!drafts) this.owners.set(owner, (drafts = new Map()));
    const promoted = promotedFrom ? drafts.get(promotedFrom) : undefined;
    const instance = drafts.get(key) ?? promoted ?? new ComposerHistory();
    if (promotedFrom && instance === promoted) drafts.delete(promotedFrom);
    drafts.delete(key);
    drafts.set(key, instance);
    if (drafts.size > 32) drafts.delete(drafts.keys().next().value!);
    return instance;
  }

  private browse?: {
    draft: ComposerHistory.Draft;
    entries: ComposerHistory.Prompt[];
    index: number;
  };
  private local: ComposerHistory.Prompt[] = [];
  private pending = false;

  remember(prompt: ComposerHistory.Prompt): void {
    this.local = [
      prompt,
      ...this.local.filter((entry) => entry.id !== prompt.id),
    ].slice(0, 32);
    this.browse = undefined;
  }

  sent(): void {
    this.browse = undefined;
  }

  move(
    direction: "up" | "down",
    editor: ComposerHistory.Editor,
    source: ComposerHistory.Source
  ): boolean {
    if (this.pending) return direction === "up";
    const browse = this.browse;
    if (browse && browse.index >= 0) {
      return this.show(
        browse,
        browse.index + (direction === "up" ? 1 : -1),
        editor
      );
    }
    if (direction === "down") return false;
    if (!source.beforeRecall) return this.start(editor, source);
    void this.recallAfter(editor, source, source.beforeRecall);
    return true;
  }

  private async recallAfter(
    editor: ComposerHistory.Editor,
    source: ComposerHistory.Source,
    beforeRecall: NonNullable<ComposerHistory.Source["beforeRecall"]>
  ): Promise<void> {
    this.pending = true;
    const unchanged = editor.guard();
    try {
      const result = await beforeRecall.call(source, unchanged);
      if (!unchanged()) return;
      if (result === "recall") this.start(editor, source);
      else if (result === "blocked") source.onRecallBlocked?.();
      else if (typeof result === "object") this.start(editor, source, result);
    } catch {
      if (unchanged()) source.onRecallBlocked?.();
    } finally {
      this.pending = false;
    }
  }

  private start(
    editor: ComposerHistory.Editor,
    source: ComposerHistory.Source,
    prompt?: ComposerHistory.Prompt
  ): boolean {
    const draft = editor.read();
    const seen = new Set<string>();
    const entries = (prompt ? [prompt] : [...this.local, ...source.previous()])
      .filter(({ id, text }) => {
        if ((!draft.attachment && !text.trim()) || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .slice(0, 32);
    if (!entries.length) return false;
    const browse = { draft, entries, index: -1 };
    return this.show(browse, 0, editor);
  }

  private show(
    browse: NonNullable<ComposerHistory["browse"]>,
    index: number,
    editor: ComposerHistory.Editor
  ): boolean {
    if (index < -1 || index >= browse.entries.length) return false;
    const previous = browse.index;
    const entry = browse.entries[index];
    if (entry && !entry.text.trim()) return false;
    const current = editor.read();
    if (previous < 0) browse.draft = current;
    const next = entry ? editor.materialize(entry) : browse.draft;
    return editor.replace(
      { ...next, attachment: current.attachment },
      (forward) => {
        this.browse = browse;
        browse.index = forward ? index : previous;
      }
    );
  }
}

export namespace ComposerHistory {
  export type Draft = Readonly<{
    document: unknown | null;
    selection?: unknown;
    attachment: object | null;
  }>;

  /** An attachment-only prompt has empty text. */
  export type Prompt = Readonly<{ id: string; text: string; draft?: Draft }>;
  export type RecallResult = "handled" | "recall" | "blocked" | Prompt;

  export type Source = Readonly<{
    previous(): readonly Prompt[];
    /** Try a host action before recalling, using the guard before applying it. */
    beforeRecall?(isCurrent: () => boolean): Promise<RecallResult>;
    onRecallBlocked?(): void;
  }>;

  export type Editor = Readonly<{
    read(): Draft;
    materialize(prompt: Prompt): Draft;
    guard(): () => boolean;
    replace(draft: Draft, onApplied: (forward: boolean) => void): boolean;
  }>;

  /** Local file custody stays with the surface that staged the file. */
  export type Attachments = Readonly<{
    read(): object | null;
    gestureRevision(): number;
    canReplace(attachment: object | null): boolean;
    replace(attachment: object | null): boolean;
  }>;
}
