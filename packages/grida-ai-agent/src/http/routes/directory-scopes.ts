/**
 * GRIDA-SEC-004 — `POST /directory-scopes`.
 *
 * The sole raw-path ingress for compositor directory references. On Desktop,
 * preload obtains this path from Electron's `webUtils.getPathForFile(File)` or
 * a native picker; ordinary message/run payloads carry only the returned opaque
 * descriptor. The daemon's global Basic-Auth + Origin/Referer perimeter wraps
 * this route like every other local capability.
 */

import type { Hono } from "hono";
import { body, v } from "@grida/daemon/server";
import {
  DirectoryScopeError,
  type DirectoryScopeRegistry,
} from "../../session/directory-scopes";

export function registerDirectoryScopesRoutes(
  app: Hono,
  registry: DirectoryScopeRegistry
): void {
  app.post("/directory-scopes", async (c) => {
    const parsed = await body(c, { path: v.string });
    if (!parsed.ok) return parsed.res;
    try {
      return c.json(await registry.attach(parsed.data.path));
    } catch (err) {
      if (!(err instanceof DirectoryScopeError)) throw err;
      switch (err.code) {
        case "directory-scope-protected-root":
          return c.json({ error: err.message, code: err.code }, 403);
        case "directory-scope-pending-limit":
          return c.json({ error: err.message, code: err.code }, 429);
        case "directory-scope-invalid-path":
        case "directory-scope-not-directory":
          return c.json({ error: err.message, code: err.code }, 400);
        // Claim-only codes cannot be produced by `attach`; keep the switch
        // exhaustive so adding an attach error requires an explicit posture.
        case "directory-scope-unavailable":
        case "directory-scope-descriptor-mismatch":
        case "directory-scope-owned-by-another-session":
          return c.json({ error: err.message, code: err.code }, 409);
      }
    }
  });
}
