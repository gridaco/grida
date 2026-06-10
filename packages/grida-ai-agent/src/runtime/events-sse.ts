/**
 * SSE plumbing for the host-wide lifecycle event stream (`GET /events`,
 * RFC `events.md` §projection over the host wire). Mirrors
 * `status-sse.ts:buildStatusConsumerResponse`, but tails the
 * {@link AgentEventBus} — and unlike the status channel it sends NO
 * initial frame: the channel is volatile by spec (a late joiner sees
 * only future events; current state lives in the authoritative stores).
 *
 * The channel is long-lived: it never ends on its own; it closes only
 * when the client disconnects (`requestSignal` abort) or cancels.
 */

import type { AgentEventBus } from "./events";
import { GRIDA_EVENTS_SSE_EVENT } from "../protocol/events";

export function buildEventsConsumerResponse(
  bus: AgentEventBus,
  requestSignal: AbortSignal
): Response {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let closed = false;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      unsubscribe = bus.subscribe((event) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${GRIDA_EVENTS_SSE_EVENT}\ndata: ${JSON.stringify(
                event
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
