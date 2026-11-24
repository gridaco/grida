"use client";

/**
 * Welcome → workspace first message.
 *
 * The Welcome composer opens a workspace in the same window
 * (`/desktop/workspace?id=<id>`) and leaves its message here for that
 * workspace's native chat, which starts a new chat with the chosen connection
 * and sends the message as its first turn.
 *
 * sessionStorage keeps the free text out of the URL, survives the same-window
 * navigation and a reload, and stays with this window. Entries are keyed by
 * workspace so two windows opening different workspaces do not cross.
 *
 * The chat claims one entry and removes it after taking durable custody of the
 * input. A waiting entry survives startup failures, retries and reloads.
 * A refused ordinary input remains available to review beside the next draft
 * (see test/desktop-welcome-first-message.md).
 */

import {
  NATIVE_CHAT_MAX_ATTACHMENTS,
  parseNativeChatMessageContext,
} from "@grida/desktop-bridge";
import type { ComposerDrafts } from "@/lib/agent-chat/composer-drafts";
import type {
  NativeChatInitialComposer,
  NativeChatFirstInput,
} from "@/lib/agent-chat/native-chat-controller";

type Attachment = NonNullable<NativeChatInitialComposer["attachment"]>;
type AttachmentDescription = Readonly<{
  kind: Attachment["kind"];
  name: string;
}>;
const attachmentBatches = new Map<string, readonly Attachment[]>();

const KEY_PREFIX = "grida.welcome.message.v1.";
const PROFILE_ID = /^[a-f0-9]{64}$/;
const SESSION_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const attachmentTokens = new Map<string, string>();
const nextDrafts = new Map<
  string,
  { requestId: string; transfer: WelcomeDraftTransfer }
>();
const claims = new Map<
  string,
  { raw: string; storage: object; released: boolean }
>();

const HANDOFF_CHANGED =
  "The Home message changed before it could be sent. Reopen the workspace to see the current request.";
const HANDOFF_STORAGE_UNAVAILABLE =
  "Couldn't verify the Home message handoff. Retry this message.";

function key(workspaceId: string): string {
  return `${KEY_PREFIX}${workspaceId}`;
}

/** What the Welcome composer hands to the workspace's native chat. */
export type WelcomeMessage = NativeChatFirstInput &
  Readonly<{
    /**
     * The connection chosen on Welcome, as a new choice for the workspace.
     * `null` keeps the workspace's default connection.
     */
    profileId: string | null;
    /** Home editor whose subsequent edits belong to this request. */
    homeDraftKey?: string;
    transferNextDraft?: WelcomeDraftTransfer;
  }> &
  NativeChatInitialComposer;

/** Move only the text typed after Send, within the window that authored it. */
export type WelcomeDraftTransfer = (destination: {
  store: ComposerDrafts;
  key: string;
}) => void;

/** A request owns its follow-up until the destination editor can take it. */
export class WelcomeFollowupDraft {
  private handedOff = false;
  private transferred = false;
  private readonly key: string;
  private latest?: { document: unknown; revision?: string };

  constructor(
    requestId: string,
    private readonly homeKey: string,
    private readonly source?: { store: ComposerDrafts; read(): unknown }
  ) {
    this.key = `desktop-home:followup:${requestId}`;
  }

  observe(document: unknown, revision?: string): void {
    if (this.transferred) return;
    this.latest = { document, revision };
    this.save(document);
  }

  handoff(): void {
    this.handedOff = true;
    this.save(this.currentDocument());
  }

  /** The editor may unmount before its last autosave. */
  flush(): void {
    if (this.transferred || !this.source) return;
    const document = this.source.read();
    if (document === undefined) return;
    const { store } = this.source;
    const previous = this.latest?.revision;
    const revision =
      store.documentRevision(this.homeKey) === previous
        ? store.write(this.homeKey, document)
        : previous;
    this.observe(document, revision);
  }

  private currentDocument(): unknown {
    const live = this.source?.read();
    return live === undefined ? this.latest?.document : live;
  }

  private save(document: unknown): void {
    if (this.transferred || !this.handedOff || !this.source) return;
    this.source.store.write(
      this.key,
      document == null ? null : { document, revision: this.latest?.revision }
    );
  }

  transfer: WelcomeDraftTransfer = ({ store, key }) => {
    if (this.transferred) return;
    const source = this.source?.store ?? store;
    const saved = source.read(this.key) as {
      document?: unknown;
      revision?: string;
    } | null;
    const current = this.currentDocument();
    const document = current === undefined ? saved?.document : current;
    // A different Home visit might have written exactly the same words.
    const revision = source.documentRevision(this.homeKey);
    const capturedRevision = this.source
      ? this.latest?.revision
      : saved?.revision;
    if (store.read(key) !== null || store.documentRevision(key) !== undefined) {
      // The follow-up belongs on Home. Flush a final live edit before retiring
      // the handoff copy. A later Home visit owns its own version.
      if (
        this.source &&
        current !== undefined &&
        revision === capturedRevision
      ) {
        try {
          source.checkpoint(this.homeKey, current);
        } catch {
          return;
        }
      }
      this.transferred = true;
      source.write(this.key, null);
      return;
    }
    if (document == null) return;
    const copiedRevision = store.write(key, document);
    this.transferred = true;
    // Preserve the on-disk copy if the target could only retain it in memory.
    if ((revision || source.documentRevision(this.key)) && !copiedRevision)
      return;
    if (capturedRevision) source.retireDocument(this.homeKey, capturedRevision);
    else if (!revision && this.source && source.read(this.homeKey) === document)
      source.write(this.homeKey, null);
    source.write(this.key, null);
  };
}

/** A slides template already copied into the workspace as its own deck. */
export type WelcomeTemplate = Readonly<{
  title: string;
  slides: number;
  /** The copy's workspace-relative bundle path, such as `pitch.canvas`. */
  path: string;
}>;

export type WelcomeReference = Readonly<{ title: string; url: string }>;

export namespace welcome_message {
  /**
   * The first message for the person's text and selected context, or `null`
   * when there is nothing to send.
   */
  export function compose({
    text,
    references = [],
  }: {
    text: string;
    references?: readonly WelcomeReference[];
  }): string | null {
    const ask = text.trim();
    if (references.length > 0) {
      const lead = ask || "Use these visual references as the starting point.";
      const list = references
        .map((r) => `- ${r.title || "reference"}: ${r.url}`)
        .join("\n");
      return `${lead}\n\nReferences:\n${list}`;
    }
    return ask || null;
  }

  /**
   * Leave a message for `workspaceId`. Returns false when this window cannot
   * keep it, so Welcome can say so instead of opening a workspace that would
   * never receive it.
   */
  export function stash(
    workspaceId: string,
    message: WelcomeMessage,
    storage: Pick<Storage, "setItem"> | undefined = sessionStorageOrUndefined()
  ): boolean {
    try {
      if (!storage) return false;
      const { attachment, attachments, transferNextDraft, ...settings } =
        message;
      if (attachment && attachments) return false;
      const files = attachments ?? (attachment ? [attachment] : []);
      if (files.length > NATIVE_CHAT_MAX_ATTACHMENTS) return false;
      const token = files.length ? crypto.randomUUID() : undefined;
      const requestId = message.requestId ?? crypto.randomUUID();
      const raw = JSON.stringify({
        ...settings,
        requestId,
        ...(attachment && {
          attachment: {
            token,
            ...describeAttachment(attachment),
          },
        }),
        ...(attachments?.length && {
          attachments: { token, items: attachments.map(describeAttachment) },
        }),
      });
      storage.setItem(key(workspaceId), raw);
      const claim = claims.get(workspaceId);
      if (claim?.storage === storage && claim.raw !== raw)
        claims.delete(workspaceId);
      const previous = attachmentTokens.get(workspaceId);
      if (previous) attachmentBatches.delete(previous);
      if (token) {
        attachmentBatches.set(token, files);
        attachmentTokens.set(workspaceId, token);
      } else attachmentTokens.delete(workspaceId);
      if (transferNextDraft)
        nextDrafts.set(workspaceId, { requestId, transfer: transferNextDraft });
      else nextDrafts.delete(workspaceId);
      return true;
    } catch {
      return false;
    }
  }

  /** Read without consuming; a malformed entry reads as none. */
  export function peek(
    workspaceId: string,
    storage: Pick<Storage, "getItem"> | undefined = sessionStorageOrUndefined()
  ): WelcomeMessage | null {
    try {
      return parse(storage?.getItem(key(workspaceId)) ?? null);
    } catch {
      return null;
    }
  }

  /** Hold the identity of one handoff while its chat and selected options are prepared. */
  export function pending(
    workspaceId: string,
    storage:
      | Pick<Storage, "getItem" | "removeItem">
      | undefined = sessionStorageOrUndefined()
  ): Readonly<{
    message: WelcomeMessage;
    waiting: () => boolean;
    peek: () => WelcomeMessage | null;
    take: () => WelcomeMessage | null;
  }> | null {
    try {
      if (!storage) return null;
      const raw = storage.getItem(key(workspaceId));
      const message = parse(raw, true);
      if (raw === null || !message) return null;
      const nextDraft = nextDrafts.get(workspaceId);
      const transferNextDraft =
        nextDraft && nextDraft.requestId === message.requestId
          ? nextDraft.transfer
          : message.requestId &&
              (message.homeDraftKey === "desktop-home:default" ||
                message.homeDraftKey === `desktop-home:${workspaceId}`)
            ? new WelcomeFollowupDraft(message.requestId, message.homeDraftKey)
                .transfer
            : undefined;
      const snapshot = transferNextDraft
        ? { ...message, transferNextDraft }
        : message;
      const matches = () => {
        try {
          return storage.getItem(key(workspaceId)) === raw;
        } catch {
          return false;
        }
      };
      const waiting = () => {
        const claim = claims.get(workspaceId);
        return (
          matches() &&
          !(claim?.raw === raw && claim.storage === storage && !claim.released)
        );
      };
      return {
        message: snapshot,
        waiting,
        peek: () => (matches() ? snapshot : null),
        take: () => {
          if (!waiting()) return null;
          const claim = { raw, storage, released: false };
          claims.set(workspaceId, claim);
          let removed = false;
          const release = () => {
            if (claims.get(workspaceId) !== claim) return;
            // A failed post-removal read can be retried only by this owner.
            if (removed) claim.released = true;
            else claims.delete(workspaceId);
          };
          let committed = false;
          return {
            ...snapshot,
            commit: () => {
              if (committed) return;
              const current = claims.get(workspaceId);
              if (current && current !== claim)
                throw new Error(HANDOFF_CHANGED);
              // An explicit retry can reclaim the same waiting request after
              // pre-dispatch failure releases its claim.
              const remaining = readHandoff(workspaceId, storage);
              if (remaining === null && removed && current === claim) {
                forgetHandoff(workspaceId, storage, raw);
              } else {
                if (remaining !== raw) throw new Error(HANDOFF_CHANGED);
                claim.released = false;
                claims.set(workspaceId, claim);
                try {
                  storage.removeItem(key(workspaceId));
                  removed = true;
                } catch (cause) {
                  throw new Error(HANDOFF_STORAGE_UNAVAILABLE, { cause });
                }
                const after = readHandoff(workspaceId, storage);
                if (after === raw) throw new Error(HANDOFF_STORAGE_UNAVAILABLE);
                if (after !== null) throw new Error(HANDOFF_CHANGED);
                forgetHandoff(workspaceId, storage, raw);
              }
              committed = true;
            },
            release,
          };
        },
      };
    } catch {
      return null;
    }
  }

  /** Consume the complete request, retaining original File custody in this window. */
  export function takeMessage(
    workspaceId: string,
    storage:
      | Pick<Storage, "getItem" | "removeItem">
      | undefined = sessionStorageOrUndefined()
  ): WelcomeMessage | null {
    try {
      if (!storage) return null;
      const raw = storage.getItem(key(workspaceId));
      storage.removeItem(key(workspaceId));
      const message = parse(raw);
      if (raw) forgetHandoff(workspaceId, storage, raw);
      return message;
    } catch {
      return null;
    }
  }
}

function readHandoff(
  workspaceId: string,
  storage: Pick<Storage, "getItem">
): string | null {
  try {
    return storage.getItem(key(workspaceId));
  } catch (cause) {
    throw new Error(HANDOFF_STORAGE_UNAVAILABLE, { cause });
  }
}

function forgetHandoff(
  workspaceId: string,
  storage: object,
  raw: string
): void {
  const claim = claims.get(workspaceId);
  if (claim?.raw === raw && claim.storage === storage)
    claims.delete(workspaceId);
  const value = JSON.parse(raw);
  if (nextDrafts.get(workspaceId)?.requestId === value?.requestId)
    nextDrafts.delete(workspaceId);
  const token = value?.attachments?.token ?? value?.attachment?.token;
  if (typeof token === "string") {
    attachmentBatches.delete(token);
    if (attachmentTokens.get(workspaceId) === token)
      attachmentTokens.delete(workspaceId);
  }
}

function parse(
  raw: string | null,
  includeRequestId = false
): WelcomeMessage | null {
  if (raw === null) return null;
  const value = JSON.parse(raw) as unknown;
  if (typeof value !== "object" || value === null) return null;
  const {
    text,
    profileId,
    requestId,
    homeDraftKey,
    messageContext: rawContext,
  } = value as Record<string, unknown>;
  const messageContext =
    rawContext === undefined ? null : parseNativeChatMessageContext(rawContext);
  if (typeof text !== "string" || (rawContext !== undefined && !messageContext))
    return null;
  if (
    profileId !== null &&
    (typeof profileId !== "string" || !PROFILE_ID.test(profileId))
  )
    return null;
  const {
    effort,
    turnOptions: rawTurnOptions,
    operatingRegime,
    goal,
    preparedSessionId,
    preparedMode,
    manualApproval,
    attachment,
    attachments: batch,
    missingAttachment: missing,
    missingAttachments: missingBatch,
  } = value as Record<string, unknown>;
  if (
    effort !== undefined &&
    !["standard", "low", "medium", "high", "xhigh", "ultra"].includes(
      effort as string
    )
  )
    return null;
  const turnOptions =
    rawTurnOptions === undefined ? undefined : parseTurnOptions(rawTurnOptions);
  if (rawTurnOptions !== undefined && !turnOptions) return null;
  if (
    operatingRegime !== undefined &&
    operatingRegime !== "act" &&
    operatingRegime !== "plan"
  )
    return null;
  if (goal !== undefined && typeof goal !== "boolean") return null;
  if (
    preparedSessionId !== undefined &&
    (typeof preparedSessionId !== "string" ||
      !SESSION_ID.test(preparedSessionId))
  )
    return null;
  if (
    preparedMode !== undefined &&
    (preparedMode !== "approve_for_me" || !preparedSessionId)
  )
    return null;
  if (
    manualApproval !== undefined &&
    (manualApproval !== true || preparedSessionId)
  )
    return null;
  let resource: NativeChatInitialComposer["attachment"];
  let missingAttachment: NativeChatInitialComposer["missingAttachment"];
  let resources: NativeChatInitialComposer["attachments"];
  let missingAttachments: NativeChatInitialComposer["missingAttachments"];
  if (attachment !== undefined && batch !== undefined) return null;
  if (missing !== undefined) {
    if (!missing || typeof missing !== "object") return null;
    const { kind, name } = missing as Record<string, unknown>;
    if ((kind !== "file" && kind !== "directory") || typeof name !== "string")
      return null;
    missingAttachment = { kind, name };
  }
  if (attachment !== undefined) {
    if (!attachment || typeof attachment !== "object") return null;
    const { token, kind, name } = attachment as Record<string, unknown>;
    if (
      typeof token !== "string" ||
      (kind !== "file" && kind !== "directory") ||
      typeof name !== "string"
    )
      return null;
    resource = attachmentBatches.get(token)?.[0];
    if (!resource) missingAttachment = { kind, name };
  }
  if (missingBatch !== undefined) {
    if (
      !Array.isArray(missingBatch) ||
      missingBatch.length > NATIVE_CHAT_MAX_ATTACHMENTS ||
      !missingBatch.every((item) => item && typeof item.name === "string")
    )
      return null;
    missingAttachments = missingBatch.map(({ name }) => ({ name }));
  }
  if (batch !== undefined) {
    if (!batch || typeof batch !== "object") return null;
    const { token, items } = batch as Record<string, unknown>;
    if (
      typeof token !== "string" ||
      !Array.isArray(items) ||
      !items.length ||
      items.length > NATIVE_CHAT_MAX_ATTACHMENTS ||
      !items.every(isAttachmentDescription)
    )
      return null;
    const known = attachmentBatches.get(token);
    if (
      known?.length === items.length &&
      known.every((item, index) => {
        const description = items[index];
        return (
          item.kind === description.kind && item.file.name === description.name
        );
      })
    )
      resources = known;
    else missingAttachments = items.map(({ name }) => ({ name }));
  }
  if (
    !text.trim() &&
    !messageContext?.displayParts.length &&
    !resource &&
    !missingAttachment &&
    !resources?.length &&
    !missingAttachments?.length
  )
    return null;
  return {
    text,
    ...(includeRequestId &&
      typeof requestId === "string" &&
      SESSION_ID.test(requestId) && { requestId }),
    ...(includeRequestId &&
      typeof homeDraftKey === "string" && { homeDraftKey }),
    ...(messageContext && { messageContext }),
    profileId,
    ...(effort !== undefined && {
      effort: effort as NativeChatInitialComposer["effort"],
    }),
    ...(turnOptions && { turnOptions }),
    ...(operatingRegime !== undefined && { operatingRegime }),
    ...(goal !== undefined && { goal }),
    ...(preparedSessionId !== undefined && { preparedSessionId }),
    ...(preparedMode === "approve_for_me" && { preparedMode }),
    ...(manualApproval === true && { manualApproval }),
    ...(resource && { attachment: resource }),
    ...(missingAttachment && { missingAttachment }),
    ...(resources?.length && { attachments: resources }),
    ...(missingAttachments?.length && { missingAttachments }),
  };
}

function describeAttachment({ kind, file }: Attachment): AttachmentDescription {
  return { kind, name: file.name };
}

function isAttachmentDescription(
  value: unknown
): value is AttachmentDescription {
  if (!value || typeof value !== "object") return false;
  const { kind, name } = value as Record<string, unknown>;
  return (kind === "file" || kind === "directory") && typeof name === "string";
}

function parseTurnOptions(
  value: unknown
): NativeChatInitialComposer["turnOptions"] {
  if (!value || typeof value !== "object") return;
  const { profileId, modelId, speed, webSearch } = value as Record<
    string,
    unknown
  >;
  if (
    (profileId !== null &&
      (typeof profileId !== "string" || !PROFILE_ID.test(profileId))) ||
    typeof modelId !== "string" ||
    !modelId.trim() ||
    (speed !== undefined &&
      speed !== "standard" &&
      speed !== "fast" &&
      speed !== "ultrafast") ||
    (webSearch !== undefined && webSearch !== true) ||
    (speed === undefined && webSearch === undefined)
  )
    return;
  return {
    profileId,
    modelId,
    ...(speed && { speed }),
    ...(webSearch && { webSearch }),
  };
}

function sessionStorageOrUndefined(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}
