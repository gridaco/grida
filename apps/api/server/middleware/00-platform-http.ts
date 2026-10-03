import { randomUUID } from "node:crypto";
import { defineEventHandler, setResponseHeaders } from "h3";

export default defineEventHandler((event) => {
  // Generate our own ID. Never log the URL: session paths are capabilities.
  const requestId = randomUUID();
  event.context.publicApi = { requestId, started: performance.now() };
  event.node.req.headers["x-request-id"] = requestId;
  setResponseHeaders(event, {
    "x-request-id": requestId,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
});
