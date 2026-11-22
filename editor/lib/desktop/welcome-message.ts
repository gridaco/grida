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

import { parseNativeChatMessageContext } from "@grida/desktop-bridge";
import type { ComposerDrafts } from "@/lib/agent-chat/composer-drafts";
import type {
  NativeChatInitialComposer,
  NativeChatFirstInput,
} from "@/lib/agent-chat/native-chat-controller";

const attachments = new Map<
  string,
  NonNullable<NativeChatInitialComposer["attachment"]>
>();

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
  private transferred = false;
  private readonly key: string;

  constructor(
    requestId: string,
    private readonly homeKey: string,
    private readonly source?: { store: ComposerDrafts; read(): unknown }
  ) {
    this.key = `desktop-home:followup:${requestId}`;
  }

  /** Keep the last Home edit across a renderer reload, independently of later Home use. */
  save(document: unknown, flushHome = false): void {
    if (this.transferred || !this.source) return;
    const { store } = this.source;
    if (flushHome) store.write(this.homeKey, document);
    store.write(
      this.key,
      document == null
        ? null
        : { document, revision: store.documentRevision(this.homeKey) }
    );
  }

  transfer: WelcomeDraftTransfer = ({ store, key }) => {
    if (this.transferred) return;
    const source = this.source?.store ?? store;
    const saved = source.read(this.key) as {
      document?: unknown;
      revision?: string;
    } | null;
    const current = this.source?.read();
    const document = current === undefined ? saved?.document : current;
    // A different Home visit might have written exactly the same words.
    const revision = source.documentRevision(this.homeKey);
    const owned = saved?.revision
      ? saved.revision === revision
      : !revision && this.source && source.read(this.homeKey) === document;
    if (store.read(key) !== null) {
      // The follow-up belongs on Home. Flush a final live edit before retiring
      // the handoff copy. A later Home visit owns its own version.
      if (this.source && current !== undefined && (owned || !revision)) {
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
    store.write(key, document);
    this.transferred = true;
    // Preserve the on-disk copy if the target could only retain it in memory.
    if (
      (revision || source.documentRevision(this.key)) &&
      !store.documentRevision(key)
    )
      return;
    if (owned) source.write(this.homeKey, null);
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
      const token = message.attachment ? crypto.randomUUID() : undefined;
      const { attachment, transferNextDraft, ...settings } = message;
      const requestId = message.requestId ?? crypto.randomUUID();
      const raw = JSON.stringify({
        ...settings,
        requestId,
        ...(attachment && {
          attachment: {
            token,
            kind: attachment.kind,
            name: attachment.file.name,
          },
        }),
      });
      storage.setItem(key(workspaceId), raw);
      const claim = claims.get(workspaceId);
      if (claim?.storage === storage && claim.raw !== raw)
        claims.delete(workspaceId);
      const previous = attachmentTokens.get(workspaceId);
      if (previous) attachments.delete(previous);
      if (token && attachment) {
        attachments.set(token, attachment);
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
  if (typeof value?.attachment?.token === "string") {
    attachments.delete(value.attachment.token);
    if (attachmentTokens.get(workspaceId) === value.attachment.token)
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
    missingAttachment: missing,
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
    resource = attachments.get(token);
    if (!resource) missingAttachment = { kind, name };
  }
  if (
    !text.trim() &&
    !messageContext?.displayParts.length &&
    !resource &&
    !missingAttachment
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
  };
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
