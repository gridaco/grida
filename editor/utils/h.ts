export type HeaderAccept = "application/json" | "text/html";

/**
 * parse accept header to determine to response with json or redirect
 *
 * default fallback is json
 *
 * supports:
 * - application/json
 * - text/html
 */
export function haccept(
  accept?: string | null,
  fallback: "application/json" | "text/html" = "application/json"
): "application/json" | "text/html" {
  if (accept) {
    if (accept.includes("application/json")) return "application/json";
    if (accept.includes("text/html")) return "text/html";
  }
  return fallback;
}

export type HeaderContentType = "application/json" | "multipart/form-data";

/**
 *
 * parse content type header to determine to response with json or form data
 *
 * default fallback is json
 *
 * supports:
 * - application/json
 * - multipart/form-data
 */
export function hcontenttype(
  contenttype: string | null,
  fallback: HeaderContentType = "application/json"
) {
  if (contenttype) {
    if (contenttype.includes("application/json")) return "application/json";
    if (contenttype.includes("multipart/form-data"))
      return "multipart/form-data";
  }
  return fallback;
}
