// GRIDA-SEC-004 — side chats belong to the private child connection.

const ID = /^[A-Za-z0-9_.:@/-]{1,256}$/;
const MAX_OMISSION_KINDS = 16;

/** A side chat the private child opened for one attached parent. */
export type NativeSideChat = Readonly<{
  id: string;
  parent: string;
  /** The parent's model context had been compacted. */
  compacted: boolean;
  /** The copy left out parent material it cannot carry. */
  omitted: boolean;
}>;

/**
 * The side chats open on one private child connection. A side chat is an
 * ordinary session of that connection; this owner opens and discards it and
 * knows which session is a side chat of which parent, so Main never lends a
 * side session to anything but the attachment that opened it.
 */
export class NativeAgentSideChats {
  private readonly chats = new Map<string, NativeSideChat>();

  constructor(
    private readonly request: (
      method: string,
      params: unknown
    ) => Promise<unknown>
  ) {}

  async open(parent: string): Promise<NativeSideChat> {
    const reply = object(
      await this.request("_co.grida/side-chat/open", { sessionId: parent })
    );
    const id = identity(reply.sideChatId);
    if (
      id === parent ||
      this.chats.has(id) ||
      reply.parentSessionId !== parent ||
      reply.temporary !== true
    )
      throw invalid();
    try {
      object(reply.sourceContext);
      const omissions = Object.values(object(reply.omissions));
      if (omissions.length > MAX_OMISSION_KINDS) throw invalid();
      const side = Object.freeze({
        id,
        parent,
        compacted: flag(reply.compacted),
        omitted: omissions.map(count).some((value) => value > 0),
      });
      this.chats.set(id, side);
      return side;
    } catch (error) {
      await this.discard(id).catch(() => {});
      throw error;
    }
  }

  /** Whether `id` is a side chat open on this connection. */
  has(id: string): boolean {
    return this.chats.has(id);
  }

  /** The open side chats of `parent`. */
  of(parent: string): readonly string[] {
    return [...this.chats.values()]
      .filter((side) => side.parent === parent)
      .map((side) => side.id);
  }

  /**
   * Discard a side chat. A side chat whose cleanup is not confirmed stays
   * known, so a retry closes the same one.
   */
  async close(id: string): Promise<void> {
    if (!this.chats.has(id)) return;
    await this.discard(id);
    this.chats.delete(id);
  }

  /** Forget side chats the host discarded with their parent. */
  forgetParent(parent: string): readonly string[] {
    const ids = this.of(parent);
    for (const id of ids) this.chats.delete(id);
    return ids;
  }

  clear(): void {
    this.chats.clear();
  }

  private async discard(id: string): Promise<void> {
    const params = { sideChatId: id };
    try {
      object(await this.request("_co.grida/side-chat/close", params));
    } catch (error) {
      if (!(error instanceof Error) || !retryable(error.message)) throw error;
      object(await this.request("_co.grida/side-chat/close", params));
    }
  }
}

function retryable(message: string): boolean {
  return (
    message === "native_agent_request_timeout" ||
    message.includes("side_chat_discard_pending")
  );
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid();
  return value as Record<string, unknown>;
}

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw invalid();
  return value;
}

function identity(value: unknown): string {
  if (typeof value !== "string" || !ID.test(value)) throw invalid();
  return value;
}

function flag(value: unknown): boolean {
  if (typeof value !== "boolean") throw invalid();
  return value;
}

function invalid(): Error {
  return new Error("native_chat_side_protocol_invalid");
}
