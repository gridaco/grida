import type { NitroErrorHandler } from "nitropack";
import { send, setResponseHeader, setResponseStatus } from "h3";

const handleError: NitroErrorHandler = (error, event) => {
  const candidate = error.statusCode;
  const status =
    candidate && candidate >= 400 && candidate <= 599 ? candidate : 500;
  const requestId = event.context.publicApi?.requestId;
  // Framework/provider error objects may contain submitted data or credentials.
  // Log only correlation metadata and return a stable public description.
  if (status >= 500) {
    console.error(
      JSON.stringify({ event: "api_error", request_id: requestId, status })
    );
  }
  setResponseStatus(event, status);
  setResponseHeader(event, "content-type", "application/json; charset=utf-8");
  setResponseHeader(event, "cache-control", "no-store");
  return send(
    event,
    JSON.stringify({
      error: {
        code:
          status === 404
            ? "NOT_FOUND"
            : status < 500
              ? "INVALID_REQUEST"
              : "INTERNAL_ERROR",
        message:
          status === 404
            ? "Route not found"
            : status < 500
              ? "Invalid request"
              : "Request failed",
      },
      request_id: requestId,
    })
  );
};

export default handleError;
