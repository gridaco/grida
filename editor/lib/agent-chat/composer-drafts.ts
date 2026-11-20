/**
 * Unsent composer text, kept apart from the composer itself.
 *
 * A person can spend minutes writing a prompt. The product never discards it:
 * switching models, reconnecting a chat, an error, remounting the composer,
 * switching chats or restarting the app all leave it in place. Only the person
 * deleting the text, or a send the host accepted, removes it.
 *
 * A draft is the whole composer state: the editor's document (so references
 * and other inline chips survive), the Plan and Goal intents, and an attached
 * file with its bytes. Selected raster Files can be stored with their original
 * bytes; restoring one cannot manufacture a native disk origin. Modern blank
 * drafts have separate durable identities; saved drafts are keyed by chat.
 * Unsent edits remain in memory when storage is unavailable. Sending a saved
 * chat requires its exact retry identity and attachment to commit first.
 * A file attached by reference has no bytes here; it is the person's File,
 * which only lives in memory, so it stays with the draft until Desktop
 * restarts.
 */
import {
  NativeEditorSvgSelection,
  parseNativeChatMessageContext,
  type NativeChatEffort,
  type NativeChatMessageContext,
  type NativeChatOperatingRegime,
} from "@grida/desktop-bridge";

export type ComposerDraftModes = Readonly<{
  plan?: true;
  goal?: true;
  /** Selected profile/model for search, or false to skip automatic search for this message. */
  webSearch?: string | false;
}>;

export type ComposerDraftAttachment =
  | Readonly<{
      kind: "image";
      name: string;
      file: File;
      originalFile?: File;
      mimeType?: string;
    }>
  | Readonly<{
      kind: "png" | "file";
      name: string;
      bytes: ArrayBuffer;
    }>
  | Readonly<{
      kind: "reference";
      name: string;
      referenceId?: string;
      file: File;
      mimeType?: string;
      preview?: Readonly<{
        poster?: string;
        durationMs?: number;
        width?: number;
        height?: number;
      }>;
    }>;

/** An attachment that storage can keep: one with its bytes. */
export type StoredDraftAttachment = Exclude<
  ComposerDraftAttachment,
  { kind: "reference" }
>;

export type ComposerDraftPending = Readonly<{
  inputId: string;
  text: string;
  mode: "submit" | "enqueue";
  operatingRegime?: NativeChatOperatingRegime;
  effort?: NativeChatEffort;
  webSearch?: true;
  selectionRevision?: number;
  allowLibrarySelection: boolean;
  editorSvgTargetId?: string;
  editorContextId?: string;
  editorToolContextId?: string;
  messageContext?: NativeChatMessageContext;
  attachment?:
    | StoredDraftAttachment
    | Readonly<{
        kind: "reference";
        name: string;
        mimeType?: string;
        referenceId: string;
      }>;
}>;

export type ComposerDraftBlob =
  | StoredDraftAttachment
  | Readonly<{
      kind: "migration";
      version: 1;
      legacy: string;
      target: string;
      done: boolean;
    }>
  | Readonly<{
      kind: "pending";
      version: 1;
      key: string;
      submission: ComposerDraftPending;
    }>;

/** Where attachment bytes are kept; too large for synchronous storage. */
export interface ComposerDraftBlobs {
  get(key: string): Promise<ComposerDraftBlob | null>;
  put(key: string, value: ComposerDraftBlob): Promise<void>;
  delete(key: string): Promise<void>;
}

export class ComposerDrafts {
  static readonly prefix = "grida.composer-draft.v1:";
  /** Larger drafts stay in memory only; storage quotas are small. */
  static readonly maxStoredBytes = 512 * 1024;
  /** Oldest stored drafts are dropped beyond this many. */
  static readonly maxStoredDrafts = 50;

  static readonly modesPrefix = "grida.composer-draft-modes.v1:";
  static readonly contextPrefix = "grida.composer-draft-context.v1:";
  static readonly pendingPrefix = "grida.composer-pending.v1:";

  private readonly memory = new Map<string, unknown>();
  private readonly modes = new Map<string, ComposerDraftModes>();
  private readonly contexts = new Map<
    string,
    NativeChatMessageContext | null
  >();
  private readonly attachments = new Map<
    string,
    ComposerDraftAttachment | null
  >();
  private readonly pending = new Map<string, ComposerDraftPending | null>();
  private readonly pendingWrites = new Map<string, Promise<unknown>>();
  private readonly migrations = new Map<
    string,
    { target: string; done: boolean }
  >();

  /** Claim the former singleton once; later logical drafts never borrow it. */
  async initializeDraft(legacy: string, target: string): Promise<void> {
    const marker = `grida.composer-draft-migration.v1:${legacy}`;
    let claim = this.migrations.get(legacy);
    if (!claim) {
      const raw = this.blobs
        ? await this.blobs.get(marker)
        : this.storage?.getItem(marker);
      if (raw) {
        const value = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (typeof value.target !== "string" || typeof value.done !== "boolean")
          throw new Error("native_chat_retry_storage_invalid");
        claim = value;
      }
    }
    if (claim && (claim.target !== target || claim.done)) return;
    if (!claim) {
      const modes = this.readModes(target);
      const occupied =
        this.read(target) !== null ||
        modes.plan ||
        modes.goal ||
        modes.webSearch !== undefined ||
        this.readMessageContext(target) ||
        (await this.readAttachment(target)) ||
        (await this.readPending(target));
      claim = { target, done: !!occupied };
      this.migrations.set(legacy, claim);
      if (this.blobs)
        await this.blobs.put(marker, {
          kind: "migration",
          version: 1,
          legacy,
          ...claim,
        });
      else this.storage?.setItem(marker, JSON.stringify(claim));
    }
    if (!claim.done) await this.move(legacy, target);
    claim = { target, done: true };
    this.migrations.set(legacy, claim);
    if (this.blobs)
      await this.blobs.put(marker, {
        kind: "migration",
        version: 1,
        legacy,
        ...claim,
      });
    else this.storage?.setItem(marker, JSON.stringify(claim));
  }

  private pendingKey(key: string): string {
    return `\0pending:${key}`;
  }

  /** The same row binds retry identity to its exact frozen attachment. */
  async writePending(
    key: string,
    submission: ComposerDraftPending
  ): Promise<void> {
    if (!validPending(submission))
      throw new Error("native_chat_retry_storage_invalid");
    const record: ComposerDraftBlob = {
      kind: "pending",
      version: 1,
      key,
      submission,
    };
    this.pending.set(key, submission);
    await this.pendingWrite(key, async () => {
      if (this.blobs) await this.blobs.put(this.pendingKey(key), record);
      else if (
        this.storage &&
        (!submission.attachment || submission.attachment.kind === "reference")
      )
        this.storage.setItem(
          ComposerDrafts.pendingPrefix + key,
          JSON.stringify(record)
        );
      else throw new Error("native_chat_retry_storage_unavailable");
    });
  }

  async readPending(key: string): Promise<ComposerDraftPending | null> {
    if (this.pending.has(key)) return this.pending.get(key) ?? null;
    let record: unknown;
    if (this.blobs) record = await this.blobs.get(this.pendingKey(key));
    else {
      const raw = this.storage?.getItem(ComposerDrafts.pendingPrefix + key);
      record = raw ? JSON.parse(raw) : null;
    }
    if (record === null || record === undefined) return null;
    if (
      typeof record !== "object" ||
      (record as ComposerDraftBlob).kind !== "pending"
    )
      throw new Error("native_chat_retry_storage_invalid");
    const stored = record as Extract<ComposerDraftBlob, { kind: "pending" }>;
    if (
      stored.version !== 1 ||
      stored.key !== key ||
      !validPending(stored.submission)
    )
      throw new Error("native_chat_retry_storage_invalid");
    this.pending.set(key, stored.submission);
    return stored.submission;
  }

  async clearPending(key: string, expectedInputId?: string): Promise<void> {
    await this.pendingWrite(key, async () => {
      const current = await this.readPending(key);
      if (expectedInputId && current?.inputId !== expectedInputId) return;
      if (this.blobs) await this.blobs.delete(this.pendingKey(key));
      this.storage?.removeItem(ComposerDrafts.pendingPrefix + key);
      this.pending.set(key, null);
    });
  }

  /** Delete the old attachment before its receipt, so a crash can only retry. */
  async completePending(key: string, inputId: string): Promise<void> {
    await this.pendingWrite(key, async () => {
      const current = await this.readPending(key);
      if (current?.inputId !== inputId) return;
      const attachment = this.attachments.get(key);
      if (this.blobs) await this.blobs.delete(key);
      if ((await this.readPending(key))?.inputId !== inputId) return;
      if (this.attachments.get(key) === attachment)
        this.attachments.set(key, null);
      if (
        current.messageContext &&
        JSON.stringify(this.readMessageContext(key)) ===
          JSON.stringify(current.messageContext)
      )
        this.writeMessageContext(key, null);
      if (this.readModes(key).webSearch !== undefined)
        this.writeModes(key, { ...this.readModes(key), webSearch: undefined });
      if (this.blobs) await this.blobs.delete(this.pendingKey(key));
      this.storage?.removeItem(ComposerDrafts.pendingPrefix + key);
      if (this.pending.get(key)?.inputId === inputId)
        this.pending.set(key, null);
    });
  }

  private pendingWrite(key: string, write: () => Promise<void>): Promise<void> {
    const result = (this.pendingWrites.get(key) ?? Promise.resolve())
      .catch(() => {})
      .then(write);
    this.pendingWrites.set(key, result);
    void result
      .finally(() => {
        if (this.pendingWrites.get(key) === result)
          this.pendingWrites.delete(key);
      })
      .catch(() => {});
    return result;
  }

  constructor(
    private readonly storage: Storage | null = defaultStorage(),
    private readonly blobs: ComposerDraftBlobs | null = IndexedDbBlobs.open()
  ) {}

  /** Plan and Goal as the person left them in this chat's composer. */
  readModes(key: string): ComposerDraftModes {
    const known = this.modes.get(key);
    if (known) return known;
    try {
      const raw = this.storage?.getItem(ComposerDrafts.modesPrefix + key);
      const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const modes: ComposerDraftModes = {
        ...(parsed.plan === true && { plan: true }),
        ...(parsed.goal === true && { goal: true }),
        ...((typeof parsed.webSearch === "string" ||
          parsed.webSearch === false) && {
          webSearch: parsed.webSearch,
        }),
      };
      this.modes.set(key, modes);
      return modes;
    } catch {
      return {};
    }
  }

  writeModes(key: string, modes: ComposerDraftModes): void {
    const value: ComposerDraftModes = {
      ...(modes.plan && { plan: true }),
      ...(modes.goal && { goal: true }),
      ...(modes.webSearch !== undefined && { webSearch: modes.webSearch }),
    };
    this.modes.set(key, value);
    try {
      if (!value.plan && !value.goal && value.webSearch === undefined)
        this.storage?.removeItem(ComposerDrafts.modesPrefix + key);
      else
        this.storage?.setItem(
          ComposerDrafts.modesPrefix + key,
          JSON.stringify(value)
        );
    } catch {
      // Memory still holds the modes for this session.
    }
  }

  /** Context supplied alongside the draft and restored before retrying. */
  readMessageContext(key: string): NativeChatMessageContext | null {
    if (this.contexts.has(key)) return this.contexts.get(key) ?? null;
    try {
      const raw = this.storage?.getItem(ComposerDrafts.contextPrefix + key);
      const context = raw
        ? parseNativeChatMessageContext(JSON.parse(raw))
        : null;
      this.contexts.set(key, context);
      return context;
    } catch {
      return null;
    }
  }

  writeMessageContext(
    key: string,
    context: NativeChatMessageContext | null
  ): void {
    this.contexts.set(key, context);
    try {
      if (context)
        this.storage?.setItem(
          ComposerDrafts.contextPrefix + key,
          JSON.stringify(context)
        );
      else this.storage?.removeItem(ComposerDrafts.contextPrefix + key);
    } catch {
      // The current draft keeps its context in memory if storage is full.
    }
  }

  /** The attachment kept with this chat's draft, with its bytes. */
  async readAttachment(key: string): Promise<ComposerDraftAttachment | null> {
    if (this.attachments.has(key)) return this.attachments.get(key) ?? null;
    const stored = await this.blobs?.get(key).catch(() => null);
    if (stored && stored.kind !== "pending" && stored.kind !== "migration")
      this.attachments.set(key, stored);
    return stored && stored.kind !== "pending" && stored.kind !== "migration"
      ? stored
      : null;
  }

  /** Keep an attachment, or forget it when the person removed or sent it. */
  async writeAttachment(
    key: string,
    attachment: ComposerDraftAttachment | null
  ): Promise<void> {
    this.attachments.set(key, attachment);
    try {
      await this.pendingWrite(key, () =>
        this.persistAttachment(key, attachment)
      );
    } catch {
      // Memory still holds the attachment for this session.
    }
  }

  private async persistAttachment(
    key: string,
    attachment: ComposerDraftAttachment | null
  ): Promise<void> {
    // A reference cannot outlive the native File it names. Only the live map
    // retains that origin; durable image rows retain the frozen bytes alone.
    if (!attachment || attachment.kind === "reference") {
      await this.blobs?.delete(key);
    } else if (attachment.kind === "image") {
      const { originalFile: _origin, ...frozen } = attachment;
      await this.blobs?.put(key, frozen);
    } else await this.blobs?.put(key, attachment);
  }

  /** The draft document for a chat, if one was kept. */
  read(key: string): unknown | null {
    if (this.memory.has(key)) return this.memory.get(key) ?? null;
    const stored = this.load(key);
    if (stored !== null) this.memory.set(key, stored);
    return stored;
  }

  /** Keep the current document, or forget the draft when it is empty. */
  write(key: string, doc: unknown | null): void {
    if (doc === null) {
      this.memory.delete(key);
      this.remove(key);
      return;
    }
    this.memory.set(key, doc);
    this.save(key, doc);
  }

  /**
   * Carry a draft to the key its chat now has, such as a new chat that was
   * just assigned its id. Each part a target already holds is kept; the rest
   * moves, so nothing is lost and nothing is left behind under the old key.
   * Memory moves at once; stored attachment bytes follow asynchronously.
   */
  move(from: string, to: string): Promise<void> {
    if (from === to) return Promise.resolve();
    // Present a cached attachment immediately, while retaining the source row
    // until the destination copy commits. A refused copy must remain retryable.
    const moving = this.attachments.get(from);
    if (moving && !this.attachments.get(to)) this.attachments.set(to, moving);
    return (async () => {
      const pending = await this.readPending(from);
      if (pending && !(await this.readPending(to))) {
        await this.writePending(to, pending);
        await this.clearPending(from);
      }
      const attachment = await this.readAttachment(from);
      const targetAttachment = await this.readAttachment(to);
      if (
        attachment &&
        (!targetAttachment || targetAttachment === attachment)
      ) {
        await this.pendingWrite(to, () =>
          this.persistAttachment(to, attachment)
        );
        this.attachments.set(to, attachment);
        await this.pendingWrite(from, () => this.persistAttachment(from, null));
        if (this.attachments.get(from) === attachment)
          this.attachments.set(from, null);
      }
      // The composer keeps the source key until this move resolves. Read its
      // latest edits only after every asynchronous copy has committed.
      const doc = this.read(from);
      if (doc !== null && this.read(to) === null) {
        this.write(to, doc);
        this.write(from, null);
      }
      const context = this.readMessageContext(from);
      if (context && !this.readMessageContext(to)) {
        this.writeMessageContext(to, context);
        this.writeMessageContext(from, null);
      }
      const modes = this.readModes(from);
      const target = this.readModes(to);
      if (
        (modes.plan || modes.goal || modes.webSearch !== undefined) &&
        !target.plan &&
        !target.goal &&
        target.webSearch === undefined
      ) {
        this.writeModes(to, modes);
        this.writeModes(from, {});
      }
    })();
  }

  private load(key: string): unknown | null {
    try {
      const raw = this.storage?.getItem(ComposerDrafts.prefix + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { doc?: unknown };
      return parsed.doc ?? null;
    } catch {
      return null;
    }
  }

  private save(key: string, doc: unknown): void {
    const storage = this.storage;
    if (!storage) return;
    try {
      const raw = JSON.stringify({ doc, at: Date.now() });
      if (raw.length > ComposerDrafts.maxStoredBytes) {
        storage.removeItem(ComposerDrafts.prefix + key);
        return;
      }
      // Rewriting a kept draft cannot exceed the bound, and this runs on every
      // keystroke, so only a new draft walks the others.
      const added = storage.getItem(ComposerDrafts.prefix + key) === null;
      storage.setItem(ComposerDrafts.prefix + key, raw);
      if (added) this.prune(storage);
    } catch {
      // Memory still holds the draft for this session.
    }
  }

  private remove(key: string): void {
    try {
      this.storage?.removeItem(ComposerDrafts.prefix + key);
    } catch {
      // Nothing else to clean up.
    }
  }

  private prune(storage: Storage): void {
    const kept: { key: string; at: number }[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (!key?.startsWith(ComposerDrafts.prefix)) continue;
      let at = 0;
      try {
        at = Number(JSON.parse(storage.getItem(key) ?? "{}").at) || 0;
      } catch {
        // An unreadable entry sorts first and is dropped first.
      }
      kept.push({ key, at });
    }
    if (kept.length <= ComposerDrafts.maxStoredDrafts) return;
    kept.sort((a, b) => a.at - b.at);
    for (const { key } of kept.slice(
      0,
      kept.length - ComposerDrafts.maxStoredDrafts
    ))
      storage.removeItem(key);
  }
}

/** Attachment bytes in IndexedDB, one record per draft key. */
class IndexedDbBlobs implements ComposerDraftBlobs {
  static open(): ComposerDraftBlobs | null {
    try {
      return typeof indexedDB === "undefined" ? null : new IndexedDbBlobs();
    } catch {
      return null;
    }
  }

  private database?: Promise<IDBDatabase>;

  private db(): Promise<IDBDatabase> {
    this.database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open("grida-composer-drafts", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("attachments");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.database;
  }

  private async run<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("attachments", mode);
      const request = action(transaction.objectStore("attachments"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("draft_transaction_aborted"));
      transaction.onerror = () => reject(transaction.error ?? request.error);
      request.onerror = () => reject(request.error);
    });
  }

  async get(key: string): Promise<ComposerDraftBlob | null> {
    const value = (await this.run("readonly", (store) => store.get(key))) as
      | ComposerDraftBlob
      | undefined;
    if (key.startsWith("grida.composer-draft-migration.v1:")) {
      if (!value) return null;
      if (value.kind !== "migration")
        throw new Error("native_chat_retry_storage_invalid");
      return value;
    }
    if (key.startsWith("\0pending:")) {
      if (!value) return null;
      if (value.kind !== "pending")
        throw new Error("native_chat_retry_storage_invalid");
      return value;
    }
    if (value?.kind === "pending" || value?.kind === "migration") return null;
    if (!value || typeof value.name !== "string") return null;
    if (value.kind === "image")
      return value.file instanceof File &&
        value.file.size > 0 &&
        value.file.size <= 20 * 1024 * 1024
        ? value
        : null;
    return (value.kind === "png" || value.kind === "file") &&
      value.bytes instanceof ArrayBuffer
      ? value
      : null;
  }

  async put(key: string, value: ComposerDraftBlob): Promise<void> {
    await this.run("readwrite", (store) => store.put(value, key));
  }

  async delete(key: string): Promise<void> {
    await this.run("readwrite", (store) => store.delete(key));
  }
}

function defaultStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function validPending(value: ComposerDraftPending): boolean {
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.inputId !== "string" ||
    !value.inputId ||
    value.inputId.length > 256 ||
    typeof value.text !== "string" ||
    new TextEncoder().encode(value.text).length > 1024 * 1024 ||
    !["submit", "enqueue"].includes(value.mode) ||
    typeof value.allowLibrarySelection !== "boolean" ||
    (value.operatingRegime !== undefined &&
      !["act", "plan"].includes(value.operatingRegime)) ||
    (value.webSearch !== undefined && value.webSearch !== true) ||
    (value.effort !== undefined &&
      !["low", "medium", "high", "xhigh", "ultra", "standard"].includes(
        value.effort
      )) ||
    (value.selectionRevision !== undefined &&
      (!Number.isSafeInteger(value.selectionRevision) ||
        value.selectionRevision < 1)) ||
    (value.editorSvgTargetId !== undefined &&
      (typeof value.editorSvgTargetId !== "string" ||
        value.editorSvgTargetId.length > 256)) ||
    (value.messageContext !== undefined &&
      !parseNativeChatMessageContext(value.messageContext)) ||
    (value.editorContextId !== undefined &&
      (typeof value.editorContextId !== "string" ||
        !/^[a-f0-9-]{36}$/.test(value.editorContextId))) ||
    (value.editorToolContextId !== undefined &&
      !NativeEditorSvgSelection.isId(value.editorToolContextId))
  )
    return false;
  if (
    Object.keys(value).some(
      (key) =>
        ![
          "inputId",
          "text",
          "mode",
          "operatingRegime",
          "effort",
          "webSearch",
          "selectionRevision",
          "allowLibrarySelection",
          "editorSvgTargetId",
          "editorContextId",
          "editorToolContextId",
          "messageContext",
          "attachment",
        ].includes(key)
    )
  )
    return false;
  const image = value.attachment;
  if (!image) return true;
  if (
    typeof image.name !== "string" ||
    !image.name ||
    image.name.length > 256 ||
    "originalFile" in image
  )
    return false;
  if (image.kind === "reference")
    return (
      typeof image.referenceId === "string" &&
      image.referenceId.length <= 256 &&
      Object.keys(image).every((key) =>
        ["kind", "name", "mimeType", "referenceId"].includes(key)
      )
    );
  if (image.kind === "image")
    return (
      Object.keys(image).every((key) =>
        ["kind", "name", "file", "mimeType"].includes(key)
      ) &&
      image.file instanceof File &&
      image.file.size > 0 &&
      image.file.size <= 20 * 1024 * 1024
    );
  return (
    (image.kind === "png" || image.kind === "file") &&
    image.bytes instanceof ArrayBuffer &&
    image.bytes.byteLength <= 256 * 1024
  );
}
