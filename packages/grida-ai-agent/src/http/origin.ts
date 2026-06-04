import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";

export type AgentServerHttpAccess = {
  /**
   * Browser origins allowed to receive CORS responses from the loopback
   * agent server.
   */
  allowed_origins: readonly string[];
  /**
   * Client route roots allowed to call the agent server. A value like
   * `/client` admits both `/client` and `/client/*`.
   */
  allowed_referer_paths: readonly string[];
};

/**
 * GRIDA-SEC-004 — CORS middleware.
 *
 * Uses Hono's official `cors` middleware so that `Access-Control-Allow-Origin`
 * is set correctly on every response path — buffered JSON, streaming (`stream(c,…)`),
 * SSE (`streamSSE(c,…)`), and early-return Responses from downstream middleware
 * (e.g. the 401 from `auth.ts`). Rolling our own with `c.header()` was fragile:
 * mutations relative to `next()` interact differently with each response shape
 * (especially streaming, where headers are flushed as soon as the body starts).
 *
 * `credentials: false` because the agent host authenticates with a per-request
 * `Authorization: Basic` header — never cookies. That means the response
 * `Access-Control-Allow-Origin` echoes the exact request origin (CORS spec
 * forbids the wildcard `*` when credentials are involved, but we wouldn't use
 * `*` here anyway — the agent host owns sensitive state).
 *
 * `origin()` callback returns:
 *   - the request origin (unchanged) when allowlisted → ACAO=that origin
 *   - `null`                                          → no ACAO header → browser blocks
 *
 * Returning `null` (rather than an explicit "wrong-origin" string) is the
 * documented hono/cors way to deny without leaking the allowlist back to
 * the caller. The basic-auth and referer guards still gate the actual
 * handling; CORS is the browser-side belt-and-suspenders.
 */
export function makeCorsMiddleware(
  access: AgentServerHttpAccess
): MiddlewareHandler {
  const allowedOrigins = new Set(access.allowed_origins);
  return cors({
    origin: (requestOrigin) => {
      if (!requestOrigin) return null;
      return allowedOrigins.has(requestOrigin) ? requestOrigin : null;
    },
    // Keep this in sync with the union of methods actually registered on
    // the Hono app. Browsers preflight any "non-simple" method; if it's
    // missing here, the client sees `Method <X> is not allowed by
    // Access-Control-Allow-Methods` and the call never reaches a handler.
    // Sessions routes use PATCH for rename/archive.
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["authorization", "content-type"],
    // No `exposeHeaders`: session continuity rides the in-band `grida-session`
    // SSE frame (see `GRIDA_SESSION_SSE_EVENT`), not a response header, so
    // there is no non-safelisted header the renderer needs to read.
    maxAge: 600,
    credentials: false,
  });
}

/**
 * GRIDA-SEC-004 — Referer-path guard.
 *
 * Even though every request is Basic-Auth'd AND CORS-checked, a hostile
 * same-origin page outside the host-declared client roots must NOT be able
 * to reach the agent host. If a host credential boundary ever cracks, this
 * hook catches the request before any handler runs.
 *
 * Requires:
 *   - `Referer` origin in `allowedOrigins`
 *   - `Referer` path under one of `allowedRefererPaths`
 *
 * OPTIONS preflights are answered by the CORS middleware (which runs first
 * via the middleware ordering in `server.ts`) — they never reach this hook,
 * which is important because browsers don't send a `Referer` on preflight.
 */
export function makeRefererGuard(
  access: AgentServerHttpAccess
): MiddlewareHandler {
  const allowedOrigins = new Set(access.allowed_origins);
  const allowedRefererPaths =
    access.allowed_referer_paths.map(normalizePathRoot);
  return async function refererGuard(c, next) {
    // CORS preflight already short-circuited upstream; if for some reason
    // we still see an OPTIONS here, let it through — no body to leak.
    if (c.req.method === "OPTIONS") {
      await next();
      return;
    }

    const referer = c.req.header("referer");
    if (!referer) {
      return c.json({ error: "referer required" }, 403);
    }
    try {
      const refUrl = new URL(referer);
      if (!allowedOrigins.has(refUrl.origin)) {
        return c.json({ error: "referer origin not allowed" }, 403);
      }
      if (!allowedRefererPaths.some((root) => matchesPathRoot(root, refUrl))) {
        return c.json({ error: "referer path not allowed" }, 403);
      }
    } catch {
      return c.json({ error: "malformed referer" }, 403);
    }

    await next();
  };
}

function normalizePathRoot(pathRoot: string): string {
  if (!pathRoot.startsWith("/")) {
    throw new Error(
      `AgentServerHttpAccess path must start with /: ${pathRoot}`
    );
  }
  if (pathRoot.length > 1 && pathRoot.endsWith("/")) {
    return pathRoot.slice(0, -1);
  }
  return pathRoot;
}

function matchesPathRoot(root: string, url: URL): boolean {
  if (root === "/") return true;
  return url.pathname === root || url.pathname.startsWith(`${root}/`);
}
