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
 * file with its bytes. Drafts are keyed by chat. Storage is best effort per
 * device: when it is unavailable, drafts still live in memory for this session.
 */
export type ComposerDraftModes = Readonly<{ plan?: true; goal?: true }>;

export type ComposerDraftAttachment = Readonly<{
  kind: "png" | "file";
  name: string;
  bytes: ArrayBuffer;
}>;

/** Where attachment bytes are kept; too large for synchronous storage. */
export interface ComposerDraftBlobs {
  get(key: string): Promise<ComposerDraftAttachment | null>;
  put(key: string, value: ComposerDraftAttachment): Promise<void>;
  delete(key: string): Promise<void>;
}

export class ComposerDrafts {
  static readonly prefix = "grida.composer-draft.v1:";
  /** Larger drafts stay in memory only; storage quotas are small. */
  static readonly maxStoredBytes = 512 * 1024;
  /** Oldest stored drafts are dropped beyond this many. */
  static readonly maxStoredDrafts = 50;

  static readonly modesPrefix = "grida.composer-draft-modes.v1:";

  private readonly memory = new Map<string, unknown>();
  private readonly modes = new Map<string, ComposerDraftModes>();
  private readonly attachments = new Map<
    string,
    ComposerDraftAttachment | null
  >();

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
    };
    this.modes.set(key, value);
    try {
      if (!value.plan && !value.goal)
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

  /** The attachment kept with this chat's draft, with its bytes. */
  async readAttachment(key: string): Promise<ComposerDraftAttachment | null> {
    if (this.attachments.has(key)) return this.attachments.get(key) ?? null;
    const stored = await this.blobs?.get(key).catch(() => null);
    if (stored) this.attachments.set(key, stored);
    return stored ?? null;
  }

  /** Keep an attachment, or forget it when the person removed or sent it. */
  async writeAttachment(
    key: string,
    attachment: ComposerDraftAttachment | null
  ): Promise<void> {
    this.attachments.set(key, attachment);
    try {
      if (attachment) await this.blobs?.put(key, attachment);
      else await this.blobs?.delete(key);
    } catch {
      // Memory still holds the attachment for this session.
    }
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
    const doc = this.read(from);
    if (doc !== null && this.read(to) === null) {
      this.write(to, doc);
      this.write(from, null);
    }
    const modes = this.readModes(from);
    const target = this.readModes(to);
    if ((modes.plan || modes.goal) && !target.plan && !target.goal) {
      this.writeModes(to, modes);
      this.writeModes(from, {});
    }
    if (this.attachments.get(to)) return Promise.resolve();
    const moving = this.attachments.get(from);
    if (moving === null) return Promise.resolve();
    if (moving)
      // Both writes update memory before their first await.
      return Promise.all([
        this.writeAttachment(to, moving),
        this.writeAttachment(from, null),
      ]).then(() => {});
    return (async () => {
      const attachment = await this.readAttachment(from);
      if (!attachment || (await this.readAttachment(to))) return;
      await this.writeAttachment(to, attachment);
      await this.writeAttachment(from, null);
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
      const request = action(
        db.transaction("attachments", mode).objectStore("attachments")
      );
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async get(key: string): Promise<ComposerDraftAttachment | null> {
    const value = (await this.run("readonly", (store) => store.get(key))) as
      | ComposerDraftAttachment
      | undefined;
    return value &&
      (value.kind === "png" || value.kind === "file") &&
      typeof value.name === "string" &&
      value.bytes instanceof ArrayBuffer
      ? value
      : null;
  }

  async put(key: string, value: ComposerDraftAttachment): Promise<void> {
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
