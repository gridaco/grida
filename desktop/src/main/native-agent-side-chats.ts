// GRIDA-SEC-004 — side chats belong to the private child connection.
import type {
  NativeChatSideAnswer,
  NativeChatSideContext,
} from "@grida/desktop-bridge";

const QUESTION_LIMIT = 16 * 1024;
const ANSWER_LIMIT = 64 * 1024;
const ID = /^[A-Za-z0-9_.:@/-]{1,256}$/;

export type NativeSideChat = Readonly<{
  id: string;
  parent: string;
  context: NativeChatSideContext;
}>;

export class NativeAgentSideChats {
  private readonly chats = new Map<string, NativeSideChat>();

  constructor(
    private readonly request: (
      method: string,
      params: unknown
    ) => Promise<unknown>
  ) {}

  async open(parent: string, requestId: string): Promise<NativeSideChat> {
    const reply = object(
      await this.request("_co.grida/side-chat/open", {
        sessionId: parent,
        requestId: identity(requestId),
      })
    );
    const id = identity(reply.sideChatId);
    if (
      id === parent ||
      reply.parentSessionId !== parent ||
      reply.readOnly !== true ||
      reply.temporary !== true
    )
      throw invalid();
    const existing = this.chats.get(id);
    if (existing) {
      if (existing.parent !== parent) throw invalid();
      return existing;
    }
    try {
      const source = object(reply.sourceContext);
      const omissions = Object.values(object(reply.omissions));
      if (omissions.length > 16) throw invalid();
      const context = Object.freeze({
        sourceRevision: revision(source.view),
        compacted: flag(reply.compacted),
        truncated: flag(reply.truncated),
        omitted: omissions.map(revision).some((count) => count > 0),
      });
      const side = Object.freeze({ id, parent, context });
      this.chats.set(id, side);
      return side;
    } catch (error) {
      await this.closeId(id).catch(() => {});
      throw error;
    }
  }

  async ask(
    parent: string,
    side: NativeSideChat,
    requestId: string,
    text: string
  ): Promise<NativeChatSideAnswer> {
    this.require(side, parent);
    if (
      typeof text !== "string" ||
      !text.trim() ||
      Buffer.byteLength(text) > QUESTION_LIMIT
    )
      throw new Error("native_chat_side_question_invalid");
    const result = object(
      await this.request("_co.grida/side-chat/ask", {
        sideChatId: side.id,
        requestId: identity(requestId),
        text,
      })
    );
    this.require(side, parent);
    const status = result.status;
    const answer = result.account === null ? "" : object(result.account).text;
    if (
      (status !== "succeeded" &&
        status !== "failed" &&
        status !== "cancelled" &&
        status !== "uncertain") ||
      typeof answer !== "string" ||
      Buffer.byteLength(answer) > ANSWER_LIMIT
    )
      throw invalid();
    return {
      turnId: identity(result.turnId),
      status,
      text: answer,
      textTruncated: flag(result.textTruncated),
    };
  }

  async close(side: NativeSideChat): Promise<void> {
    if (this.chats.get(side.id) !== side) return;
    this.chats.delete(side.id);
    await this.closeId(side.id);
  }

  clear(): void {
    this.chats.clear();
  }

  private async closeId(id: string): Promise<void> {
    const params = { sideChatId: id };
    try {
      object(await this.request("_co.grida/side-chat/close", params));
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== "native_agent_request_timeout"
      )
        throw error;
      object(await this.request("_co.grida/side-chat/close", params));
    }
  }

  private require(side: NativeSideChat, parent: string): void {
    if (side.parent !== parent || this.chats.get(side.id) !== side)
      throw new Error("native_chat_side_unavailable");
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid();
  return value as Record<string, unknown>;
}

function revision(value: unknown): number {
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
