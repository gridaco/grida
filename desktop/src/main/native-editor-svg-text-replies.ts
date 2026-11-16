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
    send: () => void
  ): Promise<NativeEditorSvgText.Result> {
    const remaining = request.expiresAtMs - Date.now();
    if (
      remaining <= 0 ||
      this.pending.size >= 8 ||
      this.pending.has(request.callId)
    )
      return { kind: "unavailable" };
    const reply = Promise.withResolvers<NativeEditorSvgText.Result>();
    this.pending.set(request.callId, { attachmentId, reply });
    const timer = setTimeout(() => reply.reject(unverified()), remaining);
    try {
      send();
      return await reply.promise;
    } finally {
      clearTimeout(timer);
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
