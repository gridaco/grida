/**
 * Unsent composer text, kept apart from the composer itself.
 *
 * A person can spend minutes writing a prompt. The product never discards it:
 * switching models, reconnecting a chat, an error, remounting the composer,
 * switching chats or restarting the app all leave it in place. Only the person
 * deleting the text, or handing it to a recoverable outgoing message, clears it.
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
 * restarts. Its name then prompts the person to attach it again.
 */
import {
  NativeEditorSelection,
  NativeChatSkills,
  type NativeChatSkillReference,
  parseNativeChatMessageContext,
  type NativeChatEffort,
  type NativeChatMessageContext,
  type NativeChatOperatingRegime,
  type NativeChatSpeed,
} from "@grida/desktop-bridge";
import { AttachmentBatch } from "./attachment-batch";

export type ComposerDraftModes = Readonly<{
  plan?: true;
  goal?: true;
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
  /** The submitted editor document, if this send kept it until acceptance. */
  documentRevision?: string;
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
  editorToolContextId?: string | NativeEditorSelection.Capture;
  messageContext?: NativeChatMessageContext;
  skills?: readonly NativeChatSkillReference[];
  outgoing?: Readonly<{
    id: string;
    /** This capture has not been bound to a native admission request. */
    staged?: true;
    document?: unknown;
    documentRevision?: string;
    contextRevision?: string;
    retryBlocked?: true;
    missingAttachmentName?: string;
    model?: Readonly<{
      profileId: string | null;
      modelId: string;
      speed: NativeChatSpeed;
    }>;
  }>;
  attachment?:
    | StoredDraftAttachment
    | Readonly<{
        kind: "reference";
        name: string;
        mimeType?: string;
        referenceId: string;
      }>;
  attachments?: AttachmentBatch.Draft;
}>;

type MissingAttachment = Readonly<{ kind: "missing"; name: string }>;
type BatchValue = Readonly<{ kind: "batch"; entries: AttachmentBatch.Draft }>;
type AttachmentValue =
  | ComposerDraftAttachment
  | MissingAttachment
  | BatchValue
  | null;
type AttachmentSlot = Readonly<{
  revision?: string;
  promotedFrom?: string;
  value: AttachmentValue;
}>;

type StoredAttachmentRow = (
  | StoredDraftAttachment
  | MissingAttachment
  | BatchValue
) & {
  draftRevision?: string;
  promotedFrom?: string;
};

export type ComposerDraftBlob =
  | StoredAttachmentRow
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
  transfer?(
    key: string,
    value: ComposerDraftBlob,
    retiredKey: string
  ): Promise<void>;
}

type DocumentSlot = { readonly document: unknown; readonly revision: string };
type DocumentSend = { key: string; readonly slot: DocumentSlot | null };
type InterruptedCapture = Readonly<{
  submission: ComposerDraftPending;
  attachmentName?: string;
  attachmentRevision?: string;
  attachments?: AttachmentBatch.Draft;
}>;

type OutgoingRotation = Readonly<{
  id: string;
  documentRevision?: string;
  contextRevision?: string;
  journaled: boolean;
}>;

export class ComposerDrafts {
  static readonly prefix = "grida.composer-draft.v1:";
  /** Larger drafts stay in memory only; storage quotas are small. */
  static readonly maxStoredBytes = 512 * 1024;
  /** Oldest stored drafts are dropped beyond this many. */
  static readonly maxStoredDrafts = 50;

  static readonly modesPrefix = "grida.composer-draft-modes.v1:";
  static readonly contextPrefix = "grida.composer-draft-context.v1:";
  static readonly pendingPrefix = "grida.composer-pending.v1:";
  private static readonly missingPrefix =
    "grida.composer-missing-attachment.v1:";
  private static readonly rotationPrefix =
    "grida.composer-outgoing-rotation.v1:";

  private readonly memory = new Map<string, DocumentSlot | null>();
  private readonly documentSends = new Map<string, DocumentSend>();
  private readonly outgoingDrafts = new Map<string, OutgoingRotation>();
  private readonly modes = new Map<string, ComposerDraftModes>();
  private readonly contexts = new Map<
    string,
    NativeChatMessageContext | null
  >();
  private readonly attachments = new Map<string, AttachmentSlot>();
  private readonly pending = new Map<string, ComposerDraftPending | null>();
  private readonly moves = new Map<string, Promise<void>>();
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
        this.readMessageContext(target) ||
        (await this.attachmentSlot(target)).value ||
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
    submission: ComposerDraftPending,
    retiredAttachment?: ComposerDraftAttachment | AttachmentBatch.Draft
  ): Promise<void> {
    if (!validPending(submission))
      throw new Error("native_chat_retry_storage_invalid");
    const retired = this.attachments.get(key);
    this.pending.set(key, submission);
    await this.pendingWrite(key, () =>
      this.persistPending(
        key,
        submission,
        retiredAttachment &&
          matchesAttachment(retired?.value, retiredAttachment)
          ? retired
          : undefined
      )
    );
  }

  private async persistPending(
    key: string,
    submission: ComposerDraftPending,
    retired?: AttachmentSlot
  ): Promise<void> {
    const record: ComposerDraftBlob = {
      kind: "pending",
      version: 1,
      key,
      submission,
    };
    const retire = retired && this.attachments.get(key) === retired;
    if (this.blobs) {
      if (retire && this.blobs.transfer)
        await this.blobs.transfer(this.pendingKey(key), record, key);
      else {
        await this.blobs.put(this.pendingKey(key), record);
        if (retire) await this.blobs.delete(key);
      }
    } else if (
      this.storage &&
      !submission.attachments?.length &&
      (!submission.attachment || submission.attachment.kind === "reference")
    ) {
      this.storage.setItem(
        ComposerDrafts.pendingPrefix + key,
        JSON.stringify(record)
      );
      if (retire) await this.persistAttachment(key, { value: null });
    } else throw new Error("native_chat_retry_storage_unavailable");
    if (retire && this.attachments.get(key) === retired)
      this.attachments.set(key, { value: null });
  }

  /** Keep the submitted document on disk until its outgoing capture commits. */
  async stageOutgoing(
    key: string,
    submission: ComposerDraftPending,
    rotateDocument = true,
    retiredAttachment?: ComposerDraftAttachment | AttachmentBatch.Draft
  ): Promise<void> {
    const outgoing = submission.outgoing;
    if (!outgoing?.id || !outgoing.staged || !validPending(submission))
      throw new Error("native_chat_retry_storage_invalid");
    let rotation = this.outgoingDrafts.get(key);
    if (rotation?.id !== outgoing.id) {
      const document = rotateDocument ? null : this.documentSlot(key);
      const revisions = {
        id: outgoing.id,
        ...(rotateDocument && {
          documentRevision: this.storedRevision(ComposerDrafts.prefix + key),
        }),
        ...(submission.messageContext &&
          this.readMessageContext(key) === submission.messageContext && {
            contextRevision: this.storedRevision(
              ComposerDrafts.contextPrefix + key
            ),
          }),
      };
      const { attachment, attachments, ...settings } = submission;
      const slot = this.attachments.get(key);
      const journal: InterruptedCapture = {
        submission: {
          ...settings,
          outgoing: { ...outgoing, ...revisions },
          ...(attachment?.kind === "reference" && { attachment }),
        },
        ...(attachment && {
          attachmentName: attachment.name,
        }),
        ...(attachments?.length && {
          attachments: attachments.map(({ id, card }) => ({ id, card })),
        }),
        ...(retiredAttachment &&
          matchesAttachment(slot?.value, retiredAttachment) && {
            attachmentRevision: slot?.revision,
          }),
      };
      let journaled = false;
      try {
        // Home already owns its submission until this capture commits.
        this.storage?.setItem(
          ComposerDrafts.rotationPrefix + key,
          rotateDocument ? JSON.stringify(journal) : outgoing.id
        );
        journaled = !!this.storage || !rotateDocument;
      } catch {
        // Keep the original document row until the capture commits.
      }
      rotation = { ...revisions, journaled };
      this.outgoingDrafts.set(key, rotation);
      this.memory.set(key, document);
    }
    const { journaled: _journaled, ...revisions } = rotation;
    await this.writePending(
      key,
      { ...submission, outgoing: { ...outgoing, ...revisions } },
      retiredAttachment
    );
    if (
      submission.messageContext &&
      this.readMessageContext(key) === submission.messageContext
    )
      this.writeMessageContext(key, null);
    this.releaseOutgoingDraft(key, outgoing.id);
  }

  releaseOutgoingDraft(key: string, id: string): void {
    const rotation = this.outgoingDrafts.get(key);
    if (rotation?.id !== id) return;
    const next = this.memory.get(key);
    const revision = this.documentRevision(key);
    const captured =
      rotation.documentRevision !== undefined &&
      revision === rotation.documentRevision;
    // A staged attachment may resolve much later than the document write.
    // Only the captured revision can be removed before dispatch.
    if (captured) this.remove(key, true);
    if (next && (captured || revision === undefined))
      this.save(key, next.document, false, next.revision);
    this.outgoingDrafts.delete(key);
    this.clearRotation(key);
  }

  isRecoveringRotation(key: string): boolean {
    if (this.outgoingDrafts.has(key)) return false;
    try {
      return !!this.storage?.getItem(ComposerDrafts.rotationPrefix + key);
    } catch {
      return false;
    }
  }

  private clearRotation(key: string): void {
    try {
      this.storage?.removeItem(ComposerDrafts.rotationPrefix + key);
    } catch {
      // The saved payload and the next draft remain recoverable.
    }
  }

  async readPending(key: string): Promise<ComposerDraftPending | null> {
    if (this.pending.has(key)) return this.pending.get(key) ?? null;
    let record: unknown;
    if (this.blobs) record = await this.blobs.get(this.pendingKey(key));
    else {
      const raw = this.storage?.getItem(ComposerDrafts.pendingPrefix + key);
      record = raw ? JSON.parse(raw) : null;
    }
    if (this.pending.has(key)) return this.pending.get(key) ?? null;
    if (record === null || record === undefined) {
      const interrupted = await this.interruptedCapture(key);
      this.clearRotation(key);
      return interrupted;
    }
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
    if (stored.submission.outgoing?.staged)
      this.recoverDraftRotation(key, stored.submission.outgoing);
    this.clearRotation(key);
    this.pending.set(key, stored.submission);
    return stored.submission;
  }

  /** A reload can interrupt IndexedDB after the next draft was already typed. */
  private async interruptedCapture(
    key: string
  ): Promise<ComposerDraftPending | null> {
    let raw: string | null | undefined;
    try {
      raw = this.storage?.getItem(ComposerDrafts.rotationPrefix + key);
    } catch {
      return null;
    }
    // Earlier markers, and submissions still held by Home, contain only an ID.
    if (!raw?.startsWith("{")) return null;
    const journal: InterruptedCapture = JSON.parse(raw);
    let pending = journal.submission;
    if (!validPending(pending) || !pending.outgoing?.staged)
      throw new Error("native_chat_retry_storage_invalid");
    const slot =
      journal.attachmentName || journal.attachments
        ? await this.attachmentSlot(key)
        : undefined;
    const retired =
      slot?.revision && slot.revision === journal.attachmentRevision
        ? slot
        : undefined;
    if (journal.attachmentName && !pending.attachment) {
      const value = retired?.value;
      if (
        value &&
        value.kind !== "missing" &&
        value.kind !== "reference" &&
        value.kind !== "batch"
      ) {
        const attachment: StoredDraftAttachment =
          value.kind === "image"
            ? {
                kind: value.kind,
                file: value.file,
                name: value.name,
                mimeType: value.mimeType,
              }
            : value;
        pending = { ...pending, attachment };
      } else {
        pending = {
          ...pending,
          outgoing: {
            ...pending.outgoing,
            missingAttachmentName: journal.attachmentName,
            retryBlocked: true,
          },
        };
      }
    }
    if (journal.attachments) {
      const value = retired?.value;
      pending = {
        ...pending,
        attachments:
          value?.kind === "batch"
            ? AttachmentBatch.persisted(value.entries)
            : journal.attachments,
      };
    }
    await this.persistPending(key, pending, retired);
    this.recoverDraftRotation(key, journal.submission.outgoing!);
    this.pending.set(key, pending);
    return pending;
  }

  async clearPending(key: string, expectedInputId?: string): Promise<void> {
    await this.pendingWrite(key, async () => {
      const current = await this.readPending(key);
      if (expectedInputId && current?.inputId !== expectedInputId) return;
      if (this.blobs) await this.blobs.delete(this.pendingKey(key));
      this.storage?.removeItem(ComposerDrafts.pendingPrefix + key);
      if (
        !expectedInputId ||
        this.pending.get(key)?.inputId === expectedInputId
      )
        this.pending.set(key, null);
    });
  }

  /** Delete the old attachment before its receipt, so a crash can only retry. */
  async completePending(key: string, inputId: string): Promise<void> {
    await this.pendingWrite(key, async () => {
      const current = await this.readPending(key);
      if (current?.inputId !== inputId) return;
      if (current.documentRevision)
        this.retireDocument(key, current.documentRevision, {
          requirePersistence: true,
        });
      if (!current.outgoing) {
        const attachment = this.attachments.get(key);
        const batch = current.attachments;
        const saved =
          batch || current.attachment ? await this.blobs?.get(key) : null;
        if ((await this.readPending(key))?.inputId !== inputId) return;
        if (
          (current.attachment && saved?.kind !== "batch") ||
          matchesBatch(saved, batch)
        ) {
          await this.persistAttachment(key, { value: null });
          if ((await this.readPending(key))?.inputId !== inputId) return;
        }
        if (
          this.attachments.get(key) === attachment &&
          ((current.attachment && attachment?.value?.kind !== "batch") ||
            matchesBatch(attachment?.value, batch))
        )
          this.attachments.set(key, { value: null });
        if (
          current.messageContext &&
          JSON.stringify(this.readMessageContext(key)) ===
            JSON.stringify(current.messageContext)
        )
          this.writeMessageContext(key, null);
      }
      if (this.blobs) await this.blobs.delete(this.pendingKey(key));
      this.storage?.removeItem(ComposerDrafts.pendingPrefix + key);
      if (this.pending.get(key)?.inputId === inputId)
        this.pending.set(key, null);
    });
  }

  private pendingWrite<T>(key: string, write: () => Promise<T>): Promise<T> {
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

  private readonly storage: Storage | null;
  private readonly memoryOnlyDocuments: boolean;

  constructor(
    storage?: Storage | null,
    private readonly blobs: ComposerDraftBlobs | null = IndexedDbBlobs.open()
  ) {
    this.memoryOnlyDocuments = storage === null;
    this.storage = storage === undefined ? defaultStorage() : storage;
  }

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

  writeModes(
    key: string,
    modes: ComposerDraftModes,
    options?: { requirePersistence: true }
  ): void {
    const value: ComposerDraftModes = {
      ...(modes.plan && { plan: true }),
      ...(modes.goal && { goal: true }),
    };
    try {
      if (options?.requirePersistence && !this.storage)
        throw new Error("native_chat_retry_storage_unavailable");
      if (!value.plan && !value.goal)
        this.storage?.removeItem(ComposerDrafts.modesPrefix + key);
      else
        this.storage?.setItem(
          ComposerDrafts.modesPrefix + key,
          JSON.stringify(value)
        );
    } catch (error) {
      if (options?.requirePersistence) throw error;
      // Memory still holds the modes for this session.
    }
    this.modes.set(key, value);
  }

  /** Context supplied alongside the draft and restored before retrying. */
  readMessageContext(key: string): NativeChatMessageContext | null {
    if (this.contexts.has(key)) return this.contexts.get(key) ?? null;
    try {
      const raw = this.storage?.getItem(ComposerDrafts.contextPrefix + key);
      const stored = raw ? JSON.parse(raw) : null;
      const context = parseNativeChatMessageContext(stored?.context ?? stored);
      this.contexts.set(key, context);
      return context;
    } catch {
      return null;
    }
  }

  writeMessageContext(
    key: string,
    context: NativeChatMessageContext | null,
    options?: { requirePersistence: true }
  ): void {
    try {
      if (options?.requirePersistence && !this.storage)
        throw new Error("native_chat_retry_storage_unavailable");
      if (context)
        this.storage?.setItem(
          ComposerDrafts.contextPrefix + key,
          JSON.stringify({ context, revision: crypto.randomUUID() })
        );
      else this.storage?.removeItem(ComposerDrafts.contextPrefix + key);
    } catch (error) {
      if (options?.requirePersistence) throw error;
      // The current draft keeps its context in memory if storage is full.
    }
    this.contexts.set(key, context);
  }

  private async attachmentSlot(key: string): Promise<AttachmentSlot> {
    const known = this.attachments.get(key);
    if (known) return known;
    const stored = this.blobs
      ? await this.blobs.get(key)
      : (JSON.parse(
          this.storage?.getItem(ComposerDrafts.missingPrefix + key) ?? "null"
        ) as MissingAttachment | null);
    // A selection or explicit removal during the read wins.
    const changed = this.attachments.get(key);
    if (changed) return changed;
    let slot: AttachmentSlot = { value: null };
    if (stored && stored.kind !== "pending" && stored.kind !== "migration") {
      const { draftRevision, promotedFrom, ...value } =
        stored as StoredAttachmentRow;
      slot = { revision: draftRevision, promotedFrom, value };
    }
    this.attachments.set(key, slot);
    return slot;
  }

  async readAttachment(key: string): Promise<ComposerDraftAttachment | null> {
    await this.moves.get(key);
    const value = (await this.attachmentSlot(key)).value;
    return value?.kind === "missing" || value?.kind === "batch" ? null : value;
  }

  async readAttachmentBatch(
    key: string
  ): Promise<AttachmentBatch.Draft | null> {
    await this.moves.get(key);
    const value = (await this.attachmentSlot(key)).value;
    return value?.kind === "batch" ? value.entries : null;
  }

  writeAttachmentBatch(
    key: string,
    entries: AttachmentBatch.Draft | null,
    requirePersistence = false
  ): Promise<void> {
    return this.setAttachment(
      key,
      entries ? { kind: "batch", entries } : null,
      requirePersistence
    );
  }

  async readMissingAttachment(key: string): Promise<string | null> {
    await this.moves.get(key);
    const value = (await this.attachmentSlot(key)).value;
    return value?.kind === "missing" ? value.name : null;
  }

  async writeMissingAttachment(key: string, name: string): Promise<void> {
    await this.setAttachment(key, { kind: "missing", name }, true);
  }

  async writeAttachment(
    key: string,
    attachment: ComposerDraftAttachment | null,
    options?: { requirePersistence: true }
  ): Promise<void> {
    await this.setAttachment(key, attachment, options?.requirePersistence);
  }

  private async setAttachment(
    key: string,
    value: AttachmentValue,
    requirePersistence = false
  ): Promise<void> {
    const previous = this.attachments.get(key);
    const slot = { value, revision: crypto.randomUUID() };
    this.attachments.set(key, slot);
    try {
      await this.pendingWrite(key, () => this.persistAttachment(key, slot));
    } catch (error) {
      if (!requirePersistence) return;
      if (this.attachments.get(key) === slot) {
        if (previous) this.attachments.set(key, previous);
        else this.attachments.delete(key);
      }
      throw error;
    }
  }

  private async persistAttachment(
    key: string,
    slot: AttachmentSlot
  ): Promise<void> {
    const { value, revision: draftRevision, promotedFrom } = slot;
    const metadata = { draftRevision, ...(promotedFrom && { promotedFrom }) };
    // A native reference can retain its display name after the File is gone.
    const attachment =
      value?.kind === "reference"
        ? { kind: "missing" as const, name: value.name }
        : value;
    const marker = ComposerDrafts.missingPrefix + key;
    if (!this.blobs) {
      if (attachment?.kind === "missing") {
        if (!this.storage)
          throw new Error("native_chat_retry_storage_unavailable");
        this.storage.setItem(
          marker,
          JSON.stringify({ ...attachment, ...metadata })
        );
      } else if (attachment) {
        throw new Error("native_chat_retry_storage_unavailable");
      } else this.storage?.removeItem(marker);
      return;
    }
    if (!attachment) await this.blobs.delete(key);
    else if (attachment.kind === "batch")
      await this.blobs.put(key, {
        ...attachment,
        entries: AttachmentBatch.persisted(attachment.entries),
        ...metadata,
      });
    else if (attachment.kind === "image") {
      const { originalFile: _origin, ...frozen } = attachment;
      await this.blobs.put(key, { ...frozen, ...metadata });
    } else await this.blobs.put(key, { ...attachment, ...metadata });
  }

  /** The draft document for a chat, if one was kept. */
  read(key: string): unknown | null {
    return this.documentSlot(key)?.document ?? null;
  }

  private documentSlot(key: string): DocumentSlot | null {
    if (this.memory.has(key)) return this.memory.get(key) ?? null;
    if (this.outgoingDrafts.has(key)) return null;
    const stored = this.load(key);
    if (stored) this.memory.set(key, stored);
    return stored;
  }

  /** Identifies this exact persisted edit, including repeated identical text. */
  documentRevision(key: string): string | undefined {
    return this.storedRevision(ComposerDrafts.prefix + key);
  }

  /** Capture the actual submitted document, even before its next autosave. */
  captureDocument(key: string, document: unknown): string | undefined {
    const slot = this.documentSlot(key);
    const serialized = JSON.stringify(document);
    if (
      slot &&
      JSON.stringify(slot.document) === serialized &&
      (this.memoryOnlyDocuments ||
        (isDocumentRevision(slot.revision) &&
          this.documentRevision(key) === slot.revision))
    )
      return this.memoryOnlyDocuments ? undefined : slot.revision;
    return this.write(key, document);
  }

  /** Require custody before clearing an editor, using the configured backing store. */
  checkpoint(key: string, document: unknown): void {
    this.write(
      key,
      document,
      this.memoryOnlyDocuments ? undefined : { requirePersistence: true }
    );
  }

  /** Keep the current document, or forget the draft when it is empty. */
  write(
    key: string,
    doc: unknown | null,
    options?: { requirePersistence: true }
  ): string | undefined {
    if (doc === null) {
      if (
        options?.requirePersistence ||
        this.outgoingDrafts.get(key)?.journaled !== false
      )
        this.remove(key, options?.requirePersistence);
      this.memory.set(key, null);
      return;
    }
    const slot = { document: doc, revision: crypto.randomUUID() };
    const revision =
      options?.requirePersistence ||
      this.outgoingDrafts.get(key)?.journaled !== false
        ? this.save(
            key,
            slot.document,
            options?.requirePersistence,
            slot.revision
          )
        : undefined;
    this.memory.set(key, slot);
    return revision;
  }

  /** Retire a captured edit without removing a newer one at the same key. */
  retireDocument(
    key: string,
    revision: string,
    options?: { requirePersistence: true }
  ): boolean {
    if (this.documentRevision(key) !== revision) return false;
    // A newer edit held in memory may not have made it to storage.
    const slot = this.memory.get(key);
    if (!slot || slot.revision === revision) this.memory.set(key, null);
    return this.remove(key, options?.requirePersistence);
  }

  /** Capture the document this send may clear when the host confirms it. */
  beginDocumentSend(key: string, doc: unknown): Readonly<DocumentSend> {
    if (doc != null) this.captureDocument(key, doc);
    const send = { key, slot: doc != null ? this.documentSlot(key) : null };
    this.documentSends.set(key, send);
    return send;
  }

  /** A later send for the same draft supersedes the earlier cleanup. */
  settleDocumentSend(send: Readonly<DocumentSend>, accepted: boolean): boolean {
    const { key } = send;
    if (this.documentSends.get(key) !== send) return false;
    this.documentSends.delete(key);
    if (accepted && send.slot && this.documentSlot(key) === send.slot) {
      if (this.documentRevision(key) === send.slot.revision)
        this.retireDocument(key, send.slot.revision);
      else this.memory.delete(key);
    }
    return true;
  }

  /**
   * Carry a draft to the key its chat now has, such as a new chat that was
   * just assigned its id. Each part a target already holds is kept; the rest
   * moves, so nothing is lost and nothing is left behind under the old key.
   * The source remains editable until its stored attachment bytes have moved.
   */
  move(from: string, to: string): Promise<void> {
    if (from === to) return Promise.resolve();
    const moving = (async () => {
      const pending = await this.readPending(from);
      const targetPending = pending && (await this.readPending(to));
      const captured =
        pending && (!targetPending || targetPending.inputId === pending.inputId)
          ? pending
          : null;
      if (captured) {
        // A refused destination write may be present only in memory. Confirm
        // its durable commit before removing the last copy at the source.
        await this.writePending(to, targetPending ?? captured);
      }
      await this.moveAttachment(from, to);
      if (captured) await this.clearPending(from, captured.inputId);
      // The composer keeps the source key until this move resolves. Read its
      // latest edits only after every asynchronous copy has committed.
      const copy = (prefix: string) =>
        this.storedRevision(prefix + from)
          ? ({ requirePersistence: true } as const)
          : undefined;
      const slot = this.documentSlot(from);
      if (slot && !this.documentSlot(to)) {
        const promoted = isDocumentRevision(slot.revision)
          ? slot
          : { document: slot.document, revision: crypto.randomUUID() };
        this.save(
          to,
          promoted.document,
          this.documentRevision(from) !== undefined,
          promoted.revision
        );
        this.memory.set(to, promoted);
        this.write(from, null);
        const send = this.documentSends.get(from);
        if (send) {
          this.documentSends.delete(from);
          if (!this.documentSends.has(to)) {
            send.key = to;
            this.documentSends.set(to, send);
          }
        }
      }
      const context = this.readMessageContext(from);
      if (context && !this.readMessageContext(to)) {
        this.writeMessageContext(
          to,
          context,
          copy(ComposerDrafts.contextPrefix)
        );
        this.writeMessageContext(from, null);
      }
      const modes = this.readModes(from);
      const target = this.readModes(to);
      if ((modes.plan || modes.goal) && !target.plan && !target.goal) {
        this.writeModes(to, modes, copy(ComposerDrafts.modesPrefix));
        this.writeModes(from, {});
      }
    })().finally(() => {
      if (this.moves.get(to) === moving) this.moves.delete(to);
    });
    this.moves.set(to, moving);
    return moving;
  }

  private async moveAttachment(from: string, to: string): Promise<void> {
    let destination = await this.attachmentSlot(to);
    let source = await this.attachmentSlot(from);
    if (
      destination.value &&
      destination.promotedFrom !== from &&
      (!source.revision || destination.revision !== source.revision)
    )
      return;
    if (
      !source.value &&
      !(destination.promotedFrom === from && source.revision)
    )
      return;
    while (true) {
      const copy = { ...source, promotedFrom: from };
      const copied = await this.pendingWrite(to, async () => {
        if (this.attachments.get(to) !== destination) return;
        await this.persistAttachment(to, copy);
        if (this.attachments.get(to) !== destination) return;
        this.attachments.set(to, copy);
        return true;
      });
      if (!copied) return;
      destination = copy;
      const retired = await this.pendingWrite(from, async () => {
        if (this.attachments.get(from) !== source) return;
        await this.persistAttachment(from, { value: null });
        if (this.attachments.get(from) !== source) return;
        this.attachments.set(from, { value: null });
        return true;
      });
      if (retired) return;
      source = await this.attachmentSlot(from);
    }
  }

  private load(key: string): DocumentSlot | null {
    try {
      const raw = this.storage?.getItem(ComposerDrafts.prefix + key);
      if (!raw) return null;
      const { doc, revision } = JSON.parse(raw) as {
        doc?: unknown;
        revision?: unknown;
      };
      return doc == null
        ? null
        : {
            document: doc,
            revision: isDocumentRevision(revision) ? revision : raw,
          };
    } catch {
      return null;
    }
  }

  private save(
    key: string,
    doc: unknown,
    requirePersistence = false,
    revision: string = crypto.randomUUID()
  ): string | undefined {
    const storage = this.storage;
    if (!storage) {
      if (requirePersistence)
        throw new Error("native_chat_retry_storage_unavailable");
      return;
    }
    try {
      const raw = JSON.stringify({
        doc,
        at: Date.now(),
        revision,
      });
      if (raw.length > ComposerDrafts.maxStoredBytes) {
        if (requirePersistence)
          throw new Error("native_chat_retry_storage_unavailable");
        storage.removeItem(ComposerDrafts.prefix + key);
        return;
      }
      // Rewriting a kept draft cannot exceed the bound, and this runs on every
      // keystroke, so only a new draft walks the others.
      const added = storage.getItem(ComposerDrafts.prefix + key) === null;
      storage.setItem(ComposerDrafts.prefix + key, raw);
      if (added) this.prune(storage);
      return revision;
    } catch (error) {
      if (requirePersistence) throw error;
      // Memory still holds the draft for this session.
    }
  }

  private storedRevision(key: string): string | undefined {
    try {
      const raw = this.storage?.getItem(key);
      if (!raw) return undefined;
      const parsed = JSON.parse(raw);
      return typeof parsed?.revision === "string" ? parsed.revision : raw;
    } catch {
      return undefined;
    }
  }

  private recoverDraftRotation(
    key: string,
    rotation: Pick<OutgoingRotation, "documentRevision" | "contextRevision">
  ): void {
    if (this.outgoingDrafts.has(key)) return;
    if (rotation.documentRevision)
      this.retireDocument(key, rotation.documentRevision, {
        requirePersistence: true,
      });
    if (
      rotation.contextRevision &&
      rotation.contextRevision ===
        this.storedRevision(ComposerDrafts.contextPrefix + key)
    )
      this.writeMessageContext(key, null);
  }

  private remove(key: string, requirePersistence = false): boolean {
    try {
      if (requirePersistence && !this.storage)
        throw new Error("native_chat_retry_storage_unavailable");
      this.storage?.removeItem(ComposerDrafts.prefix + key);
      return true;
    } catch (error) {
      if (requirePersistence) throw error;
      return false;
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
    if (value?.kind === "batch")
      return AttachmentBatch.validStored(value.entries) ? value : null;
    if (!value || typeof value.name !== "string") return null;
    if (value.kind === "missing") return value.name ? value : null;
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

  async transfer(
    key: string,
    value: ComposerDraftBlob,
    retiredKey: string
  ): Promise<void> {
    await this.run("readwrite", (store) => {
      store.put(value, key);
      return store.delete(retiredKey);
    });
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
    (value.documentRevision !== undefined &&
      !isDocumentRevision(value.documentRevision)) ||
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
    (value.skills !== undefined &&
      !NativeChatSkills.references(value.skills)) ||
    (value.messageContext !== undefined &&
      !parseNativeChatMessageContext(value.messageContext)) ||
    (value.editorContextId !== undefined &&
      (typeof value.editorContextId !== "string" ||
        !/^[a-f0-9-]{36}$/.test(value.editorContextId))) ||
    (value.editorToolContextId !== undefined &&
      !NativeEditorSelection.isId(value.editorToolContextId) &&
      !NativeEditorSelection.capture(value.editorToolContextId)) ||
    (value.outgoing !== undefined &&
      (!value.outgoing ||
        typeof value.outgoing !== "object" ||
        typeof value.outgoing.id !== "string" ||
        !value.outgoing.id ||
        value.outgoing.id.length > 256 ||
        (value.outgoing.missingAttachmentName !== undefined &&
          (typeof value.outgoing.missingAttachmentName !== "string" ||
            !value.outgoing.missingAttachmentName ||
            value.outgoing.missingAttachmentName.length > 256)) ||
        (value.outgoing.staged !== undefined &&
          value.outgoing.staged !== true)))
  )
    return false;
  if (
    Object.keys(value).some(
      (key) =>
        ![
          "inputId",
          "documentRevision",
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
          "skills",
          "attachment",
          "attachments",
          "outgoing",
        ].includes(key)
    )
  )
    return false;
  if (
    value.attachments !== undefined &&
    (value.attachment !== undefined ||
      !AttachmentBatch.validStored(value.attachments) ||
      value.attachments.some((entry) => entry.input?.kind === "keep"))
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

function isDocumentRevision(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      value
    )
  );
}

function matchesAttachment(
  value: AttachmentValue | undefined,
  attachment: ComposerDraftAttachment | AttachmentBatch.Draft
): boolean {
  return value?.kind === "batch"
    ? value.entries === attachment
    : value === attachment;
}

function matchesBatch(
  value: AttachmentValue | ComposerDraftBlob | undefined,
  batch: AttachmentBatch.Draft | undefined
): boolean {
  return !!(
    batch &&
    value?.kind === "batch" &&
    value.entries.length === batch.length &&
    value.entries.every(({ id }, index) => id === batch[index].id)
  );
}
