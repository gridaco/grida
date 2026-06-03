/**
 * GRIDA-SEC-004 — `/files/*` routes.
 *
 * `register` is the ONLY route that accepts a path. Driven through a
 * host-adapter file-open or file-create capability. Idempotent:
 * same path → same docId.
 *
 * Read/write operate on docIds exclusively — the client never sends
 * a path through this surface. A compromised client with the basic-
 * auth token can only act on docIds previously handed out by
 * `register`, which the host adapter gates.
 *
 * Errors:
 *   - Unknown docId            → 404
 *   - Bad body shape           → 400
 *   - I/O failure (ENOENT etc) → 500 — translating filesystem errnos
 *     here would leak the path; the client surfaces "couldn't read
 *     the file" instead.
 */

import type { Hono } from "hono";
import { filesIo } from "../../files/io";
import type { FileRegistry } from "../../files/registry";
import { body, v } from "../validate";

export function registerFilesRoutes(app: Hono, registry: FileRegistry) {
  app.post("/files/register", async (c) => {
    const r = await body(c, { path: v.string });
    if (!r.ok) return r.res;
    return c.json({ doc_id: registry.registerPath(r.data.path) });
  });

  app.post("/files/read", async (c) => {
    const r = await body(c, { doc_id: v.string });
    if (!r.ok) return r.res;
    try {
      return c.json(await filesIo.readFile(registry, r.data.doc_id));
    } catch (err) {
      if (err instanceof filesIo.DocIdNotFoundError) {
        return c.json({ error: "docId not registered" }, 404);
      }
      throw err;
    }
  });

  app.post("/files/write", async (c) => {
    const r = await body(c, { doc_id: v.string, content: v.stringAllowEmpty });
    if (!r.ok) return r.res;
    try {
      return c.json(
        await filesIo.writeFile(registry, r.data.doc_id, r.data.content)
      );
    } catch (err) {
      if (err instanceof filesIo.DocIdNotFoundError) {
        return c.json({ error: "docId not registered" }, 404);
      }
      throw err;
    }
  });

  // External-file-change watcher deferred. SSE plumbing requires
  // chokidar (a sizable dep); revisit alongside any future
  // streaming-file work.
  app.post("/files/watch", (c) => c.json({ error: "not implemented" }, 501));
}
