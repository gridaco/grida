import { FormsApiPaths, FormsRequestHeaders } from "@grida/forms";
import {
  createError,
  defineEventHandler,
  getRequestHeader,
  getRequestURL,
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
  if (!FormsApiPaths.isPath(getRequestURL(event).pathname)) return;

  // Forms uses respondent capabilities, never browser member cookies.
  setResponseHeaders(event, {
    "access-control-allow-origin": "*",
    "access-control-expose-headers": "x-request-id",
  });
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
