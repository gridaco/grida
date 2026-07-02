import type { MiddlewareHandler } from "hono";
import { DaemonTransport } from "../transport";

/**
 * GRIDA-SEC-004 — per-request Basic Auth.
 *
 * The host adapter generates a high-entropy password for each DaemonServer
 * process and keeps it outside the client runtime. The client transport
 * signs every request with a Basic Auth header derived from that secret.
 *
 * The `expected` header is built via `DaemonTransport.buildBasicAuthHeader` — the same
 * helper host adapters and clients use — so every caller agrees on the
 * byte-exact format.
 *
 * The compare is constant-time over the assembled `Authorization`
 * header — both the prefix `Basic ` and the credentials. We avoid
 * `Buffer.from(...).equals(...)` because that returns false on length
 * mismatch immediately, leaking the password length.
 */

/**
 * GRIDA-SEC-004 — the query parameter carrying the credential on
 * header-less event-stream attaches (native `EventSource` cannot set
 * request headers). The value is the SAME base64 payload the Basic header
 * carries — one credential, two carriages — never a second secret. See
 * the WG daemon spec §auth-model.
 */
export const AUTH_TOKEN_QUERY_PARAM = "auth_token";

export type BasicAuthGuardOptions = {
  /**
   * GRIDA-SEC-004 — the ONLY paths where the credential MAY arrive as the
   * `auth_token` query parameter, and only on GET. Empty (the default)
   * disables the query carriage entirely. Keep this list to event-stream
   * routes; a token in a URL can land in logs and history, so it must
   * never be accepted on mutating routes.
   */
  query_token_paths?: readonly RegExp[];
};

export function makeBasicAuthGuard(
  password: string,
  options: BasicAuthGuardOptions = {}
): MiddlewareHandler {
  const expected = DaemonTransport.buildBasicAuthHeader(password);
  const expectedLen = expected.length;
  const queryTokenPaths = options.query_token_paths ?? [];

  return async function basicAuthGuard(c, next) {
    let presented = c.req.header("authorization");
    // Header-less stream attach: admit the query token only when no
    // Authorization header was sent (a present header is always
    // authoritative — a wrong header never falls back to the token),
    // only on GET, and only on the allowlisted event-stream paths.
    if (presented === undefined && queryTokenPaths.length > 0) {
      if (
        c.req.method === "GET" &&
        queryTokenPaths.some((re) => re.test(c.req.path))
      ) {
        const token = c.req.query(AUTH_TOKEN_QUERY_PARAM);
        if (typeof token === "string" && token.length > 0) {
          presented = `Basic ${token}`;
        }
      }
    }
    // Constant-time-length: pad the comparison string to the same
    // length so the loop runs identically whether the candidate is too
    // short or too long. Cheap and avoids leaking length.
    const candidate =
      typeof presented === "string"
        ? presented.padEnd(expectedLen, "\0").slice(0, expectedLen)
        : "";
    let mismatch = candidate.length === 0 ? 1 : 0;
    if (presented === undefined || presented.length !== expectedLen)
      mismatch |= 1;
    for (let i = 0; i < expectedLen; i++) {
      mismatch |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    if (mismatch !== 0) {
      return new Response(null, {
        status: 401,
        headers: {
          "www-authenticate": `Basic realm="agent", charset="UTF-8"`,
        },
      });
    }
    await next();
  };
}
