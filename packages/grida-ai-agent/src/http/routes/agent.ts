/**
 * GRIDA-SEC-004 — `/agent/*` routes (thin handlers over {@link AgentRuntime}).
 *
 *   - `POST /agent/run`            body: { messages, tier?, modelId?, providerId?,
 *                                          feature?, workspaceId?, skills?, sessionId? }
 *                                  → AI-SDK UI-message SSE; first frame is the
 *                                    `grida-session` event carrying the sessionId.
 *   - `GET  /agent/stream/:id`     → reconnect (replay-from-0 + live tail).
 *   - `POST /agent/abort`          body: { sessionId }
 *   - `GET  /events`               → host-wide lifecycle event SSE (RFC
 *                                    `events.md`): every session's
 *                                    turn-started / turn-finished /
 *                                    approval-requested, one subscription.
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

  // Read-only, observe-only, auth like every other route (header-carried
  // Basic Auth — deliberately NOT on the `auth_token` query-carriage list:
  // every current consumer attaches via fetch with headers, so the
  // EventSource exception isn't widened to this route. GRIDA-SEC-004.)
  app.get("/events", (c) => runtime.eventsStream(c.req.raw.signal));
}
