// GRIDA-SEC-004 — side chats belong to the private child connection.
import { randomUUID } from "node:crypto";

const ID = /^[A-Za-z0-9_.:@/-]{1,256}$/;
const MAX_OMISSION_KINDS = 16;
const OPEN = "_co.grida/side-chat/open";
const CLOSE = "_co.grida/side-chat/close";
/** First and longest wait between attempts to settle an unconfirmed outcome. */
const RETRY_FIRST_MS = 1_000;
const RETRY_MAX_MS = 30_000;

/** A side chat the private child opened for one attached parent. */
export type NativeSideChat = Readonly<{
  id: string;
  parent: string;
  /** The parent's model context had been compacted. */
  compacted: boolean;
  /** The copy left out parent material it cannot carry. */
  omitted: boolean;
}>;

type Known = { parent: string; side?: NativeSideChat };

type Settling = {
  attempt: number;
  timer?: ReturnType<typeof setTimeout>;
  running?: Promise<void>;
};

/**
 * The side chats open on one private child connection. A side chat is an
 * ordinary session of that connection; this owner opens and discards it and
 * knows which session is a side chat of which parent, so Main never lends a
 * side session to anything but the attachment that opened it.
 *
 * Each side chat counts against its parent's limit on the host until the host
 * confirms its discard, so this owner never forgets one before then: a close
 * or an open whose outcome is uncertain keeps being retried in the background,
 * with backoff, until the host settles it or the connection ends (the host
 * discards every side chat of a closed connection).
 */
export class NativeAgentSideChats {
  /** Side chats open or being discarded on this connection. */
  private readonly chats = new Map<string, Known>();
  /** Side chats whose discard is not yet confirmed. */
  private readonly discards = new Map<string, Settling>();
  /** Opens whose outcome is not yet known, by request id. */
  private readonly opens = new Map<string, Settling & { parent: string }>();

  constructor(
    private readonly request: (
      method: string,
      params: unknown
    ) => Promise<unknown>,
    /** Called once the host confirms a side chat is gone. */
    private readonly discarded: (id: string) => void = () => {}
  ) {}

  async open(parent: string): Promise<NativeSideChat> {
    // The same request id returns the side chat an earlier attempt opened.
    const params = { sessionId: parent, requestId: randomUUID() };
    let reply: unknown;
    try {
      reply = await this.request(OPEN, params);
    } catch (error) {
      if (!uncertain(error)) throw error;
      try {
        reply = await this.request(OPEN, params);
      } catch (retried) {
        if (uncertain(retried)) this.settleOpen(parent, params.requestId);
        throw retried;
      }
    }
    return this.accept(parent, reply);
  }

  /** Whether `id` is a side chat of this connection, open or being discarded. */
  has(id: string): boolean {
    return this.chats.has(id);
  }

  /** The side chats of `parent`, open or being discarded. */
  private of(parent: string): readonly string[] {
    return [...this.chats]
      .filter(([, known]) => known.parent === parent)
      .map(([id]) => id);
  }

  /**
   * Discard a side chat. One whose discard is not confirmed stays known and
   * is retried in the background until the host confirms it; the returned
   * promise reports the first attempt.
   */
  async close(id: string): Promise<void> {
    if (!this.chats.has(id)) return;
    const settling = this.discards.get(id);
    if (settling?.running) return settling.running;
    if (settling?.timer) clearTimeout(settling.timer);
    return this.attemptDiscard(id, settling ? settling.attempt + 1 : 0);
  }

  /** Forget side chats the host discarded with their parent. */
  forgetParent(parent: string): readonly string[] {
    const ids = this.of(parent);
    for (const id of ids) this.forget(id);
    for (const [request, open] of this.opens)
      if (open.parent === parent) this.stop(this.opens, request);
    return ids;
  }

  /** The connection ended; the host discards what it still held. */
  clear(): void {
    for (const settling of [...this.discards.values(), ...this.opens.values()])
      if (settling.timer) clearTimeout(settling.timer);
    this.discards.clear();
    this.opens.clear();
    this.chats.clear();
  }

  private accept(parent: string, value: unknown): NativeSideChat {
    const reply = object(value);
    const id = identity(reply.sideChatId);
    if (id === parent || this.chats.has(id)) throw invalid();
    // From here the host holds a side chat Main can name: keep it until its
    // discard is confirmed.
    this.chats.set(id, { parent });
    try {
      if (reply.parentSessionId !== parent || reply.temporary !== true)
        throw invalid();
      object(reply.sourceContext);
      const omissions = Object.values(object(reply.omissions));
      if (omissions.length > MAX_OMISSION_KINDS) throw invalid();
      const side = Object.freeze({
        id,
        parent,
        compacted: flag(reply.compacted),
        omitted: omissions.map(count).some((value) => value > 0),
      });
      this.chats.set(id, { parent, side });
      return side;
    } catch (error) {
      void this.close(id).catch(() => {});
      throw error;
    }
  }

  private attemptDiscard(id: string, attempt: number): Promise<void> {
    const settling: Settling = { attempt };
    this.discards.set(id, settling);
    const running = this.discard(id).then(
      () => {
        if (this.discards.get(id) === settling) this.forget(id);
      },
      (error: unknown) => {
        if (this.discards.get(id) !== settling) throw error;
        settling.running = undefined;
        if (ended(error)) this.stop(this.discards, id);
        else
          settling.timer = this.retry(attempt, () =>
            this.attemptDiscard(id, attempt + 1).catch(() => {})
          );
        throw error;
      }
    );
    settling.running = running;
    return running;
  }

  /** Repeat an uncertain open by its request id until its outcome is known. */
  private settleOpen(parent: string, requestId: string, attempt = 0): void {
    const settling = { parent, attempt } as Settling & { parent: string };
    this.opens.set(requestId, settling);
    settling.timer = this.retry(attempt, async () => {
      if (this.opens.get(requestId) !== settling) return;
      settling.timer = undefined;
      let reply: unknown;
      try {
        reply = await this.request(OPEN, { sessionId: parent, requestId });
      } catch (error) {
        if (this.opens.get(requestId) !== settling) return;
        if (uncertain(error)) this.settleOpen(parent, requestId, attempt + 1);
        // Any other answer is the host's: that request opened nothing.
        else this.opens.delete(requestId);
        return;
      }
      if (this.opens.get(requestId) !== settling) return;
      this.opens.delete(requestId);
      // Nothing waits for this side chat any more; discard it. A reply that
      // fails validation is discarded by `accept` when it names a side chat.
      try {
        void this.close(this.accept(parent, reply).id).catch(() => {});
      } catch {
        // Already being discarded, or unnamed: the host sweeps it on close.
      }
    });
  }

  private retry(attempt: number, run: () => unknown) {
    const delay = Math.min(RETRY_FIRST_MS * 2 ** attempt, RETRY_MAX_MS);
    const timer = setTimeout(() => void run(), delay);
    timer.unref?.();
    return timer;
  }

  private stop(pending: Map<string, Settling>, key: string): void {
    const settling = pending.get(key);
    if (settling?.timer) clearTimeout(settling.timer);
    pending.delete(key);
  }

  private forget(id: string): void {
    this.stop(this.discards, id);
    if (this.chats.delete(id)) this.discarded(id);
  }

  /**
   * One discard attempt. `side_chat_unavailable` means the host no longer
   * holds the side chat on this connection: typically an earlier close that
   * finished after its reply was lost, so it counts as confirmed.
   */
  private async discard(id: string): Promise<void> {
    const params = { sideChatId: id };
    try {
      object(await this.request(CLOSE, params));
    } catch (error) {
      if (gone(error)) return;
      if (!(error instanceof Error) || !retryable(error.message)) throw error;
      try {
        object(await this.request(CLOSE, params));
      } catch (again) {
        if (gone(again)) return;
        throw again;
      }
    }
  }
}

function retryable(message: string): boolean {
  return (
    message === "native_agent_request_timeout" ||
    message.includes("side_chat_discard_pending")
  );
}

/** The host no longer holds the side chat on this connection. */
function gone(error: unknown): boolean {
  return error instanceof Error && error.message === "side_chat_unavailable";
}

/** The request may or may not have reached the host. */
function uncertain(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === "native_agent_request_timeout" ||
      error.message === "native_agent_request_limit")
  );
}

/** The connection is gone, and with it every side chat it held. */
function ended(error: unknown): boolean {
  return (
    error instanceof Error &&
    [
      "native_agent_closing",
      "native_agent_disconnected",
      "native_agent_input_failed",
      "native_agent_output_failed",
      "native_agent_invalid_response",
    ].includes(error.message)
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
