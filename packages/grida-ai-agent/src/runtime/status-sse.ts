/**
 * SSE plumbing for the session **status** back-channel (`GET
 * /sessions/:id/status`, RFC `session.md` §Session status). Mirrors
 * `sse.ts:buildConsumerResponse`, but tails the {@link SessionScheduler}'s
 * status subscription instead of a run's chunk stream.
 *
 * The subscription delivers the CURRENT status synchronously on attach, so the
 * first frame a (possibly late-joining) client receives is the live state —
 * the `get_status` read folded into the stream. The channel is long-lived: it
 * never ends on its own (a session goes idle ⇄ busy many times); it closes
 * only when the client disconnects (`requestSignal` abort) or cancels.
 */

import type { SessionScheduler } from "./session-scheduler";
import { GRIDA_STATUS_SSE_EVENT } from "../protocol/session-status";

export function buildStatusConsumerResponse(
  scheduler: SessionScheduler,
  sessionId: string,
  requestSignal: AbortSignal
): Response {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let closed = false;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      // subscribe() delivers the current status immediately, then every
      // change — so the first frame is the live state (no separate read).
      unsubscribe = scheduler.subscribe(sessionId, (status) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${GRIDA_STATUS_SSE_EVENT}\ndata: ${JSON.stringify(
                status
              )}\n\n`
            )
          );
        } catch {
          /* controller already closed */
        }
      });
      const onAbort = () => {
        unsubscribe?.();
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      if (requestSignal.aborted) onAbort();
      else requestSignal.addEventListener("abort", onAbort, { once: true });
    },
    cancel() {
      closed = true;
      unsubscribe?.();
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
    },
  });
}
