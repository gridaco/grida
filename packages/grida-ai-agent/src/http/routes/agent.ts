/**
 * GRIDA-SEC-004 — `/agent/*` routes (thin handlers over {@link AgentRuntime}).
 *
 *   - `POST /agent/run`            body: { messages, tier?, modelId?, providerId?,
 *                                          feature?, workspaceId?, skills?, sessionId? }
 *                                  → AI-SDK UI-message SSE; first frame is the
 *                                    `grida-session` event carrying the sessionId.
 *   - `GET  /agent/stream/:id`     → reconnect (replay-from-0 + live tail).
 *   - `POST /agent/abort`          body: { sessionId }
 *
 * All parsing, validation, provider resolution, session persistence, the
 * registry/recorder wiring, and the SSE plumbing live in `runtime.ts`.
 * These handlers only adapt Hono's request (body + abort signal) to the
 * runtime and hand back the web `Response` it returns.
 */

import type { Hono } from "hono";
import type { AgentRuntime } from "../../runtime";

export function registerAgentRoutes(app: Hono, runtime: AgentRuntime): void {
  app.post("/agent/run", async (c) =>
    runtime.run(await c.req.json().catch(() => ({})), c.req.raw.signal)
  );

  app.get("/agent/stream/:sessionId", (c) =>
    runtime.stream(c.req.param("sessionId") ?? "", c.req.raw.signal)
  );

  app.post("/agent/abort", async (c) =>
    runtime.abort(await c.req.json().catch(() => ({})))
  );
}
