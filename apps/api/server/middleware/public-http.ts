import { FormsRequestHeaders } from "@grida/forms";
import { randomUUID } from "node:crypto";
import {
  createError,
  defineEventHandler,
  getRequestHeader,
  sendNoContent,
  setResponseHeaders,
} from "h3";

const methods = ["GET", "POST", "PUT", "PATCH", "OPTIONS"];
const headers = [
  ...Object.values(FormsRequestHeaders),
  "content-type",
  "x-request-id",
];

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
    "access-control-allow-origin": "*",
    "access-control-expose-headers": "x-request-id",
  });

  // These endpoints use respondent capabilities, never browser member cookies.
  if (event.method === "OPTIONS") {
    const method = getRequestHeader(event, "access-control-request-method");
    const requested = getRequestHeader(event, "access-control-request-headers")
      ?.split(",")
      .map((header) => header.trim().toLowerCase());
    if (
      (method && !methods.includes(method)) ||
      requested?.some((header) => !headers.includes(header))
    ) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid preflight",
      });
    }
    setResponseHeaders(event, {
      "access-control-allow-methods": methods.join(", "),
      "access-control-allow-headers": headers.join(", "),
      "access-control-max-age": 600,
    });
    return sendNoContent(event, 204);
  }
});
