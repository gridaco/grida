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

export function makeBasicAuthGuard(password: string): MiddlewareHandler {
  const expected = DaemonTransport.buildBasicAuthHeader(password);
  const expectedLen = expected.length;

  return async function basicAuthGuard(c, next) {
    // The header is the only credential carriage; a query-string
    // credential is never read.
    const presented = c.req.header("authorization");
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
