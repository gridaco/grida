/**
 * SSE plumbing for the session **status** back-channel (`GET
 * /sessions/:id/status`, RFC `session.md` §Session status). Mirrors
 * `sse.ts:buildConsumerResponse`, but tails the {@link SessionScheduler}'s
 * status subscription instead of a run's chunk stream.
 *
 * Before attaching, the channel read-only hydrates a cold scheduler from
 * persisted human-input state. Hydration never schedules a queued run: this GET
 * route accepts a query token whose authority is observation only
 * (GRIDA-SEC-004). The subscription then delivers the CURRENT status
 * synchronously, so the first frame a (possibly late-joining or post-restart)
 * client receives is authoritative — including a pending approval/question.
 * The channel is long-lived: it never ends on its own; it closes only when the
 * client disconnects (`requestSignal` abort) or cancels.
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
    async start(controller) {
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

      // Hydrate BEFORE subscribe's immediate first delivery. A lifecycle edge
      // racing the async read increments the scheduler revision, so hydration
      // returns that newer status rather than publishing stale persisted data.
      await scheduler.hydrateStatus(sessionId);
      if (closed) return;
      unsubscribe = scheduler.subscribe(sessionId, (status) => {
        if (closed) return;
        try {
          const frame = {
            ...status,
            // Rolling-upgrade capability marker. Released sidecars omit it and
            // report `idle` while a persisted human interaction is open.
            human_input_state_authoritative: true as const,
            // Released sidecars reject a repeated queued-message id.
            queue_enqueue_idempotent: true as const,
          };
          controller.enqueue(
            encoder.encode(
              `event: ${GRIDA_STATUS_SSE_EVENT}\ndata: ${JSON.stringify(
                frame
              )}\n\n`
            )
          );
        } catch {
          /* controller already closed */
        }
      });
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
