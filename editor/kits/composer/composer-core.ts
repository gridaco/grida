export type ComposerCommand = {
  id: string;
  title: string;
  description?: string;
};

export type ComposerMention = {
  id: string;
  label: string;
  kind?: string;
  description?: string;
  path?: string;
  payload?: Record<string, unknown>;
};

export type ComposerFileAttachment = {
  /** Omitted on legacy/file call sites; directories carry the required
   *  `"directory"` discriminator below. */
  kind?: "file";
  id: string;
  name: string;
  mime?: string;
  size?: number;
  path?: string;
  url?: string;
  payload?: Record<string, unknown>;
};

/** Host-minted, read-only directory scope. `path` is the agent-visible virtual
 * mount (never the host absolute path); `id` is opaque. */
export type ComposerDirectoryScopeReference = {
  kind: "scope";
  id: string;
  name: string;
  path: string;
  access: "read";
};

export type ComposerDirectoryAttachment = {
  kind: "directory";
  /** Composer-local attachment id; distinct from the opaque scope id. */
  id: string;
  name: string;
  ref: ComposerDirectoryScopeReference;
};

export type ComposerAttachment =
  | ComposerFileAttachment
  | ComposerDirectoryAttachment;

export type ComposerAttachmentInput =
  | (Omit<ComposerFileAttachment, "id"> & { id?: string })
  | (Omit<ComposerDirectoryAttachment, "id"> & { id?: string });

export type ComposerAttachmentFilter = (
  incoming: ComposerAttachmentInput,
  existing: ComposerAttachment[]
) => boolean;

export type ComposerFileReference = {
  id?: string;
  name?: string;
  path: string;
  mime?: string;
  size?: number;
  url?: string;
  payload?: Record<string, unknown>;
};

export type ComposerEditorContext = {
  kind: string;
  source?: string;
  payload: Record<string, unknown>;
  emitted_at: number;
};

export type ComposerCatalog = {
  commands: ComposerCommand[];
  mentions: ComposerMention[];
};

export type ComposerTrigger = {
  kind: "command" | "mention";
  query: string;
  range: { from: number; to: number };
  items: (ComposerCommand | ComposerMention)[];
};

export type ComposerTextPart = {
  type: "text";
  text: string;
};

export type ComposerCommandPart = {
  type: "command";
  id: string;
  title?: string;
};

export type ComposerMentionPart = {
  type: "mention";
  target: {
    id: string;
    label: string;
    kind?: string;
    path?: string;
    payload?: Record<string, unknown>;
  };
};

export type ComposerFileRefPart = {
  type: "file-ref";
  ref: {
    kind: "path";
    path: string;
    name?: string;
    mime?: string;
    size?: number;
    url?: string;
    payload?: Record<string, unknown>;
  };
};

export type ComposerFileAttachmentPart = {
  type: "file-attachment";
  id: string;
  name: string;
  mime?: string;
  size?: number;
  path?: string;
  url?: string;
  payload?: Record<string, unknown>;
};

export type ComposerDirectoryRefPart = {
  type: "directory-ref";
  ref: ComposerDirectoryScopeReference;
};

export type ComposerEditorContextPart = ComposerEditorContext & {
  type: "editor-context";
};

export type ComposerPart =
  | ComposerTextPart
  | ComposerCommandPart
  | ComposerMentionPart
  | ComposerFileRefPart
  | ComposerFileAttachmentPart
  | ComposerDirectoryRefPart
  | ComposerEditorContextPart;

export type ComposerMessage = {
  role: "user";
  parts: ComposerPart[];
  meta: {
    text: string;
    attachments: ComposerAttachment[];
    submitted_at: number;
  };
};

export type ComposerSnapshot = {
  text: string;
  document: ComposerDocument.Root;
  attachments: ComposerAttachment[];
  contexts: ComposerEditorContext[];
  trigger: ComposerTrigger | null;
  triggerIndex: number;
};

export namespace ComposerDocument {
  export type Root = {
    type: "doc";
    children: Node[];
  };

  export type Node =
    | TextNode
    | ParagraphNode
    | CommandNode
    | MentionNode
    | FileReferenceNode
    | CodeBlockNode
    | ListNode;

  export type TextNode = {
    type: "text";
    text: string;
    code?: boolean;
  };

  export type ParagraphNode = {
    type: "paragraph";
    children: Node[];
  };

  export type CommandNode = {
    type: "command";
    id: string;
    title?: string;
  };

  export type MentionNode = {
    type: "mention";
    id: string;
    label: string;
    kind?: string;
    path?: string;
    payload?: Record<string, unknown>;
  };

  export type FileReferenceNode = {
    type: "file-ref";
    path: string;
    name?: string;
    mime?: string;
    size?: number;
    url?: string;
    payload?: Record<string, unknown>;
  };

  export type CodeBlockNode = {
    type: "code-block";
    text: string;
  };

  export type ListNode = {
    type: "list";
    ordered: boolean;
    items: Node[][];
  };

  export function empty(): Root {
    return {
      type: "doc",
      children: [],
    };
  }
}

type Listener = () => void;

type LoweringState = {
  buffer: string[];
  parts: ComposerPart[];
};

export class ComposerCore {
  private catalog: ComposerCatalog;
  private snapshot: ComposerSnapshot;
  private readonly listeners = new Set<Listener>();
  private attachmentSequence = 0;
  private cursor: { textBeforeCursor: string; position: number } | null = null;

  constructor(catalog: Partial<ComposerCatalog> = {}) {
    this.catalog = {
      commands: catalog.commands ?? [],
      mentions: catalog.mentions ?? [],
    };
    this.snapshot = {
      text: "",
      document: ComposerDocument.empty(),
      attachments: [],
      contexts: [],
      trigger: null,
      triggerIndex: 0,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): ComposerSnapshot {
    return this.snapshot;
  }

  setCatalog(catalog: Partial<ComposerCatalog>): void {
    const next = {
      commands: catalog.commands ?? this.catalog.commands,
      mentions: catalog.mentions ?? this.catalog.mentions,
    };
    if (
      next.commands === this.catalog.commands &&
      next.mentions === this.catalog.mentions
    ) {
      return;
    }
    this.catalog = {
      commands: next.commands,
      mentions: next.mentions,
    };
    const trigger = this.cursor
      ? this.matchTrigger(this.cursor.textBeforeCursor, this.cursor.position)
      : this.snapshot.trigger;
    this.snapshot = {
      ...this.snapshot,
      trigger,
      triggerIndex: this.normalizeTriggerIndex(
        this.snapshot.triggerIndex,
        trigger?.items.length ?? 0
      ),
    };
    this.publish();
  }

  ingestDocument(input: {
    text: string;
    document: ComposerDocument.Root;
  }): void {
    if (
      this.snapshot.text === input.text &&
      this.documentEquals(this.snapshot.document, input.document)
    ) {
      return;
    }
    this.snapshot = {
      ...this.snapshot,
      text: input.text,
      document: input.document,
    };
    this.publish();
  }

  inspectCursor(textBeforeCursor: string, cursorPosition: number): void {
    this.cursor = { textBeforeCursor, position: cursorPosition };
    const trigger = this.matchTrigger(textBeforeCursor, cursorPosition);
    if (this.triggerEquals(this.snapshot.trigger, trigger)) {
      return;
    }
    this.snapshot = { ...this.snapshot, trigger, triggerIndex: 0 };
    this.publish();
  }

  setTriggerIndex(index: number): void {
    const count = this.snapshot.trigger?.items.length ?? 0;
    const next = this.normalizeTriggerIndex(index, count);
    if (this.snapshot.triggerIndex === next) return;
    this.snapshot = { ...this.snapshot, triggerIndex: next };
    this.publish();
  }

  moveTriggerIndex(delta: number): void {
    this.setTriggerIndex(this.snapshot.triggerIndex + delta);
  }

  addAttachment(
    attachment: ComposerAttachmentInput,
    input?: { filter?: ComposerAttachmentFilter }
  ): ComposerAttachment | null {
    if (input?.filter && !input.filter(attachment, this.snapshot.attachments)) {
      return null;
    }

    const item = this.createAttachment(attachment);
    this.snapshot = {
      ...this.snapshot,
      attachments: this.snapshot.attachments.concat(item),
    };
    this.publish();
    return item;
  }

  removeAttachment(id: string): void {
    this.snapshot = {
      ...this.snapshot,
      attachments: this.snapshot.attachments.filter((item) => item.id !== id),
    };
    this.publish();
  }

  setContexts(contexts: ComposerEditorContext[]): void {
    const next = contexts.map((context) => this.cloneEditorContext(context));
    if (this.contextsEqual(this.snapshot.contexts, next)) return;
    this.snapshot = { ...this.snapshot, contexts: next };
    this.publish();
  }

  clear(): void {
    this.snapshot = {
      ...this.snapshot,
      text: "",
      document: ComposerDocument.empty(),
      attachments: [],
      trigger: null,
      triggerIndex: 0,
    };
    this.publish();
  }

  createMessage(input: {
    submitted_at: number;
    allow_empty?: boolean;
  }): ComposerMessage | null {
    const state: LoweringState = {
      buffer: [],
      parts: [],
    };

    this.walkDocument(this.snapshot.document, state);
    this.flushText(state);
    state.parts.push(...this.attachmentParts(), ...this.contextParts());

    if (!input?.allow_empty && !this.hasUserContent(state.parts)) {
      return null;
    }

    return {
      role: "user",
      parts: state.parts,
      meta: {
        text: this.snapshot.text,
        attachments: this.snapshot.attachments,
        submitted_at: input.submitted_at,
      },
    };
  }

  private hasUserContent(parts: ComposerPart[]): boolean {
    return parts.some((part) => part.type !== "editor-context");
  }

  private matchTrigger(
    textBeforeCursor: string,
    cursorPosition: number
  ): ComposerTrigger | null {
    const match = /(^|\s)([/@])([^\s/@]*)$/.exec(textBeforeCursor);
    if (!match) return null;

    const token = `${match[2]}${match[3]}`;
    const from = cursorPosition - token.length;
    const query = match[3].toLowerCase();

    if (match[2] === "/") {
      return {
        kind: "command",
        query,
        range: { from, to: cursorPosition },
        items: this.catalog.commands.filter((command) =>
          this.matches(query, command.id, command.title, command.description)
        ),
      };
    }

    return {
      kind: "mention",
      query,
      range: { from, to: cursorPosition },
      items: this.catalog.mentions.filter((mention) =>
        this.matches(
          query,
          mention.id,
          mention.label,
          mention.kind,
          mention.description,
          mention.path
        )
      ),
    };
  }

  private createAttachment(input: ComposerAttachmentInput): ComposerAttachment {
    const id = input.id ?? this.nextAttachmentId(input);
    if (!this.snapshot.attachments.some((attachment) => attachment.id === id)) {
      return { ...input, id };
    }

    return {
      ...input,
      id: this.nextAttachmentId(input),
    };
  }

  private nextAttachmentId(input: Pick<ComposerAttachment, "name">): string {
    this.attachmentSequence += 1;
    return `attachment-${this.attachmentSequence}-${this.slug(input.name)}`;
  }

  private slug(value: string): string {
    return (
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48) || "file"
    );
  }

  private matches(query: string, ...values: (string | undefined)[]): boolean {
    if (!query) return true;
    return values.some((value) => value?.toLowerCase().includes(query));
  }

  private triggerEquals(
    a: ComposerTrigger | null,
    b: ComposerTrigger | null
  ): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    if (
      a.kind !== b.kind ||
      a.query !== b.query ||
      a.range.from !== b.range.from ||
      a.range.to !== b.range.to ||
      a.items.length !== b.items.length
    ) {
      return false;
    }
    return a.items.every((item, index) => item.id === b.items[index]?.id);
  }

  private normalizeTriggerIndex(index: number, count: number): number {
    return count ? ((index % count) + count) % count : 0;
  }

  private documentEquals(
    a: ComposerDocument.Root,
    b: ComposerDocument.Root
  ): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  private contextsEqual(
    a: ComposerEditorContext[],
    b: ComposerEditorContext[]
  ): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  private cloneEditorContext(
    context: ComposerEditorContext
  ): ComposerEditorContext {
    return {
      ...context,
      payload: this.clonePayload(context.payload),
    };
  }

  private clonePayload(
    payload: Record<string, unknown>
  ): Record<string, unknown> {
    if (typeof globalThis.structuredClone === "function") {
      try {
        return globalThis.structuredClone(payload) as Record<string, unknown>;
      } catch {
        // Fall back to cloning plain JSON-like payloads below.
      }
    }
    return this.clonePlainValue(payload) as Record<string, unknown>;
  }

  private clonePlainValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.clonePlainValue(item));
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          this.clonePlainValue(item),
        ])
      );
    }
    return value;
  }

  private walkDocument(document: ComposerDocument.Root, state: LoweringState) {
    for (const child of document.children) {
      this.walkNode(child, state);
    }
  }

  private walkNode(
    node: ComposerDocument.Node | null | undefined,
    state: LoweringState,
    list?: { kind: "bullet" | "ordered"; index: number }
  ): void {
    if (!node) return;

    if (node.type === "text") {
      const value = node.code ? `\`${node.text}\`` : node.text;
      state.buffer.push(value);
      return;
    }

    if (node.type === "command") {
      this.flushText(state);
      const id = node.id;
      const command = this.catalog.commands.find((item) => item.id === id);
      state.parts.push({
        type: "command",
        id,
        title: command?.title ?? node.title,
      });
      return;
    }

    if (node.type === "mention") {
      this.flushText(state);
      const mention = this.catalog.mentions.find((item) => item.id === node.id);

      this.pushPart(state, {
        type: "mention",
        target: {
          id: node.id,
          label: node.label || mention?.label || node.id,
          kind: node.kind || mention?.kind,
          path: node.path || mention?.path,
          payload: node.payload ?? mention?.payload,
        },
      });
      return;
    }

    if (node.type === "file-ref") {
      this.flushText(state);
      this.pushPart(state, {
        type: "file-ref",
        ref: {
          kind: "path",
          path: node.path,
          name: node.name ?? node.path,
          mime: node.mime,
          size: node.size,
          url: node.url,
          payload: node.payload,
        },
      });
      return;
    }

    if (node.type === "code-block") {
      if (node.text.trim()) {
        state.buffer.push(`\n\`\`\`\n${node.text.trimEnd()}\n\`\`\`\n`);
      }
      return;
    }

    if (node.type === "list") {
      const kind = node.ordered ? "ordered" : "bullet";
      node.items.forEach((children, index) => {
        state.buffer.push(kind === "ordered" ? `${index + 1}. ` : "- ");
        children.forEach((child) =>
          this.walkNode(child, state, { kind, index: index + 1 })
        );
        state.buffer.push("\n");
      });
      state.buffer.push("\n");
      return;
    }

    if (node.type === "paragraph") {
      node.children.forEach((child) => this.walkNode(child, state, list));
      state.buffer.push("\n");
    }
  }

  private flushText(state: LoweringState): void {
    const text = state.buffer
      .join("")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    state.buffer.length = 0;
    if (!text) return;
    state.parts.push({ type: "text", text });
  }

  private pushPart(state: LoweringState, part: ComposerPart): void {
    state.parts.push(part);
  }

  private attachmentParts(): Array<
    ComposerFileAttachmentPart | ComposerDirectoryRefPart
  > {
    return this.snapshot.attachments.map((attachment) => {
      if (attachment.kind === "directory") {
        return {
          type: "directory-ref",
          ref: { ...attachment.ref },
        };
      }
      return {
        type: "file-attachment",
        id: attachment.id,
        name: attachment.name,
        mime: attachment.mime,
        size: attachment.size,
        path: attachment.path,
        url: attachment.url,
        payload: attachment.payload,
      };
    });
  }

  private contextParts(): ComposerEditorContextPart[] {
    return this.snapshot.contexts.map((context) => ({
      type: "editor-context",
      ...context,
    }));
  }

  private publish(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
