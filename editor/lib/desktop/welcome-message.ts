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
 * Delivery is at most once: the chat {@link welcome_message.take | takes} the
 * entry immediately before it sends, so a reload after that point cannot send
 * it again, and an entry that is still waiting survives a slow startup or a
 * reload before the send. A chat that cannot send it takes it too and says so
 * (see test/desktop-welcome-first-message.md).
 */

const KEY_PREFIX = "grida.welcome.message.v1.";
const PROFILE_ID = /^[a-f0-9]{64}$/;

function key(workspaceId: string): string {
  return `${KEY_PREFIX}${workspaceId}`;
}

/** What the Welcome composer hands to the workspace's native chat. */
export type WelcomeMessage = Readonly<{
  /** The first message, already including any references or template. */
  text: string;
  /**
   * The connection chosen on Welcome, as a new choice for the workspace.
   * `null` keeps the workspace's default connection.
   */
  profileId: string | null;
}>;

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
   * when there is nothing to send. A template takes precedence over
   * references, which only accompany a fresh start.
   */
  export function compose({
    text,
    template,
    references = [],
  }: {
    text: string;
    template?: WelcomeTemplate | null;
    references?: readonly WelcomeReference[];
  }): string | null {
    const ask = text.trim();
    if (template) {
      const lead = ask || `Adapt the "${template.title}" slides template.`;
      return `${lead}\n\nTemplate: "${template.title}" (${template.slides} slides), copied to \`${template.path}\`. Edit that deck and keep its visual system.`;
    }
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
      storage.setItem(key(workspaceId), JSON.stringify(message));
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

  /**
   * Consume the message's text once. Every caller after the first, and every
   * caller after a reload, gets `null`. A malformed entry is removed and
   * reads as none.
   */
  export function take(
    workspaceId: string,
    storage:
      | Pick<Storage, "getItem" | "removeItem">
      | undefined = sessionStorageOrUndefined()
  ): string | null {
    let raw: string | null;
    try {
      if (!storage) return null;
      raw = storage.getItem(key(workspaceId));
      storage.removeItem(key(workspaceId));
    } catch {
      return null;
    }
    try {
      return parse(raw)?.text ?? null;
    } catch {
      return null;
    }
  }
}

function parse(raw: string | null): WelcomeMessage | null {
  if (raw === null) return null;
  const value = JSON.parse(raw) as unknown;
  if (typeof value !== "object" || value === null) return null;
  const { text, profileId } = value as Record<string, unknown>;
  if (typeof text !== "string" || !text.trim()) return null;
  if (
    profileId !== null &&
    (typeof profileId !== "string" || !PROFILE_ID.test(profileId))
  )
    return null;
  return { text, profileId };
}

function sessionStorageOrUndefined(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}
