/**
 * Grida Canvas Document Worker — Cloudflare Worker entrypoint.
 *
 * Routes:
 *   GET /room/:roomId  → WebSocket upgrade to the SyncRoom Durable Object
 *   GET /health        → 200 OK
 *
 * Legacy route (kept for backward compatibility during migration):
 *   GET /editor/:roomId → Same as /room/:roomId
 */

import { Hono } from "hono";
import { cors } from "hono/cors";

export { G1DO } from "./room";

const app = new Hono<{ Bindings: Env }>();
app.use("*", cors());

// Health check
app.get("/health", (c) => c.text("ok"));

// WebSocket upgrade → Durable Object
app.get("/room/:roomId", (c) => {
  return upgradeToRoom(c.env, c.req.raw, c.req.param("roomId"));
});

// Legacy route (the old YJS service used /editor/:roomId)
app.get("/editor/:roomId", (c) => {
  return upgradeToRoom(c.env, c.req.raw, c.req.param("roomId"));
});

function upgradeToRoom(
  env: Env,
  request: Request,
  roomId: string
): Response | Promise<Response> {
  // Validate room ID
  if (!roomId || roomId.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(roomId)) {
    return new Response("Invalid room ID", { status: 400 });
  }

  // Must be a WebSocket upgrade
  if (request.headers.get("Upgrade") !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  // Route to the Durable Object for this room
  const id = env.G1.idFromName(roomId);
  const stub = env.G1.get(id);
  return stub.fetch(request);
}

export default app;
