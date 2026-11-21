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
 * Delivery is at most once: the chat {@link welcome_message.takeMessage | takes} the
 * entry immediately before it sends, so a reload after that point cannot send
 * it again. A waiting entry survives startup failures, retries and reloads.
 * A connected chat that refuses the first input returns it to its composer
 * (see test/desktop-welcome-first-message.md).
 */

import { parseNativeChatMessageContext } from "@grida/desktop-bridge";
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
  }> &
  NativeChatInitialComposer;

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
      const { attachment, ...settings } = message;
      storage.setItem(
        key(workspaceId),
        JSON.stringify({
          ...settings,
          requestId: crypto.randomUUID(),
          ...(attachment && {
            attachment: {
              token,
              kind: attachment.kind,
              name: attachment.file.name,
            },
          }),
        })
      );
      const previous = attachmentTokens.get(workspaceId);
      if (previous) attachments.delete(previous);
      if (token && attachment) {
        attachments.set(token, attachment);
        attachmentTokens.set(workspaceId, token);
      } else attachmentTokens.delete(workspaceId);
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
    take: () => WelcomeMessage | null;
  }> | null {
    try {
      if (!storage) return null;
      const raw = storage.getItem(key(workspaceId));
      const message = parse(raw);
      if (!message) return null;
      const waiting = () => {
        try {
          return storage.getItem(key(workspaceId)) === raw;
        } catch {
          return false;
        }
      };
      return {
        message,
        waiting,
        take: () => (waiting() ? takeMessage(workspaceId, storage) : null),
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
      if (raw) {
        const value = JSON.parse(raw);
        if (typeof value?.attachment?.token === "string") {
          attachments.delete(value.attachment.token);
          if (attachmentTokens.get(workspaceId) === value.attachment.token)
            attachmentTokens.delete(workspaceId);
        }
      }
      return message;
    } catch {
      return null;
    }
  }
}

function parse(raw: string | null): WelcomeMessage | null {
  if (raw === null) return null;
  const value = JSON.parse(raw) as unknown;
  if (typeof value !== "object" || value === null) return null;
  const {
    text,
    profileId,
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
