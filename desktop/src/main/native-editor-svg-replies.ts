// GRIDA-SEC-004 — replies to an already dispatched exact-frame SVG operation.
import { NativeEditorSvgText } from "@grida/desktop-bridge";

type Pending<Result> = Readonly<{
  attachmentId: string;
  expiresAtMs: number;
  reply: PromiseWithResolvers<Result>;
}>;

export class NativeEditorSvgReplies<Result> {
  private readonly pending = new Map<string, Pending<Result>>();

  constructor(
    private readonly parse: (value: unknown) => Result | undefined,
    private readonly error: string
  ) {}

  async dispatch(
    attachmentId: string,
    request: { callId: string; expiresAtMs: number },
    send: () => void,
    signal?: AbortSignal
  ): Promise<Result | { kind: "unavailable" }> {
    const remaining = request.expiresAtMs - Date.now();
    if (
      remaining <= 0 ||
      signal?.aborted ||
      this.pending.size >= 8 ||
      this.pending.has(request.callId)
    )
      return { kind: "unavailable" };
    const reply = Promise.withResolvers<Result>();
    this.pending.set(request.callId, {
      attachmentId,
      expiresAtMs: request.expiresAtMs,
      reply,
    });
    const unverify = () => reply.reject(new Error(this.error));
    const timer = setTimeout(unverify, remaining);
    signal?.addEventListener("abort", unverify, { once: true });
    try {
      try {
        send();
      } catch (error) {
        // Revalidating the owner can abort the reply and throw in the same send.
        reply.reject(error);
      }
      return await reply.promise;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", unverify);
      this.pending.delete(request.callId);
    }
  }

  respond(attachmentId: string, callId: unknown, value: unknown): void {
    const pending = NativeEditorSvgText.isId(callId)
      ? this.pending.get(callId)
      : undefined;
    if (pending?.attachmentId !== attachmentId) throw new Error(this.error);
    if (Date.now() >= pending.expiresAtMs) {
      pending.reply.reject(new Error(this.error));
      return;
    }
    const reply = this.parse(value);
    if (reply !== undefined) pending.reply.resolve(reply);
    else pending.reply.reject(new Error(this.error));
  }
}
