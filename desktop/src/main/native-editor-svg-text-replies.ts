// GRIDA-SEC-004 — replies to an already dispatched exact-frame SVG operation.
import { NativeEditorSvgText } from "@grida/desktop-bridge";

type Pending = Readonly<{
  attachmentId: string;
  reply: PromiseWithResolvers<NativeEditorSvgText.Result>;
}>;

export class NativeEditorSvgTextReplies {
  private readonly pending = new Map<string, Pending>();

  async dispatch(
    attachmentId: string,
    request: NativeEditorSvgText.Request & { callId: string },
    send: () => void,
    signal?: AbortSignal
  ): Promise<NativeEditorSvgText.Result> {
    const remaining = request.expiresAtMs - Date.now();
    if (
      remaining <= 0 ||
      signal?.aborted ||
      this.pending.size >= 8 ||
      this.pending.has(request.callId)
    )
      return { kind: "unavailable" };
    const reply = Promise.withResolvers<NativeEditorSvgText.Result>();
    this.pending.set(request.callId, { attachmentId, reply });
    const unverify = () => reply.reject(unverified());
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
    if (pending?.attachmentId !== attachmentId) throw unverified();
    const reply = NativeEditorSvgText.result(value);
    if (reply) pending.reply.resolve(reply);
    else pending.reply.reject(unverified());
  }
}

function unverified(): Error {
  return new Error("native_chat_svg_text_unverified");
}
