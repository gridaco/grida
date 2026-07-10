/**
 * SSE plumbing for the agent run pipeline — pump an upstream model SSE
 * response into the in-flight registry, and build a consumer Response
 * that tails it. Split out of AgentRuntime (./index) so the class stays
 * focused on run / stream / abort lifecycle.
 */

import type { StreamRegistry } from "./stream-registry";
import { GRIDA_SESSION_SSE_EVENT } from "../protocol/run";

/** Pump an AI-SDK SSE response body into the registry as opaque frames. */
export async function pumpResponseIntoRegistry(
  response: Response,
  registry: StreamRegistry,
  sessionId: string
): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  const drain = (chunk: string) => {
    buf += chunk;
    while (true) {
      const idx = buf.indexOf("\n\n");
      if (idx === -1) break;
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const data = frame
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (data) registry.push(sessionId, data);
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      drain(decoder.decode(value, { stream: true }));
    }
    drain(decoder.decode());
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }
}

/**
 * SSE Response that attaches a fresh registry consumer. `requestSignal`
 * abort detaches this consumer only; the upstream model call is
 * untouched (the whole point of the registry).
 *
 * `opts.replay_prefix` (reconnect route only) serves the continuation
 * prefix before the buffered replay — see `replay-prefix.ts`.
 */
export function buildConsumerResponse(
  registry: StreamRegistry,
  sessionId: string,
  requestSignal: AbortSignal,
  opts?: { replay_prefix?: boolean }
): Response {
  const encoder = new TextEncoder();
  let detach: (() => void) | null = null;
  let closed = false;
  const close = (ctrl: ReadableStreamDefaultController<Uint8Array>) => {
    if (closed) return;
    closed = true;
    try {
      ctrl.close();
    } catch {}
  };
  const fail = (
    ctrl: ReadableStreamDefaultController<Uint8Array>,
    err: unknown
  ) => {
    if (closed) return;
    closed = true;
    try {
      ctrl.error(err);
    } catch {}
  };

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      // In-band session id, FIRST frame, before any model chunk. This is the
      // SOLE continuity channel — it rides the body, so no CORS / Electron
      // response-header quirk can strip it. See `GRIDA_SESSION_SSE_EVENT`.
      // The client transport consumes this event and never forwards it to
      // the AI SDK reducer.
      controller.enqueue(
        encoder.encode(
          `event: ${GRIDA_SESSION_SSE_EVENT}\ndata: ${JSON.stringify({
            session_id: sessionId,
          })}\n\n`
        )
      );
      detach = registry.attach(
        sessionId,
        {
          on_frame: (data) => {
            if (closed) return;
            try {
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            } catch {} // controller already closed
          },
          // A failed upstream run ends with reason "error": surface it to
          // the client as a stream error (controller.error) so it is NOT
          // mistaken for a graceful completion. "finish"/"abort" close
          // cleanly — an abort is a user-intended stop, not a failure.
          on_end: (reason) =>
            reason === "error"
              ? fail(controller, new Error("agent stream failed"))
              : close(controller),
          on_error: (err) => fail(controller, err),
        },
        { replay_prefix: opts?.replay_prefix }
      );
      const onAbort = () => {
        detach?.();
        close(controller);
      };
      if (requestSignal.aborted) onAbort();
      else requestSignal.addEventListener("abort", onAbort, { once: true });
    },
    cancel() {
      detach?.();
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      "x-vercel-ai-ui-message-stream": "v1",
    },
  });
}
