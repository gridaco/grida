/**
 * GRIDA-SEC-004 — `/recent/*` routes.
 *
 * `touch` is called after a host-owned open-file action and may also
 * be called by the client. `pin`/`forget` are client-driven.
 *
 * No path validation here — `recent.json` is a list of remembered
 * paths, not an open-file action. The trust boundary is the same as
 * `/files/register`: paths cross only at this seam, gated by basic-auth
 * + origin guards.
 */

import type { Hono } from "hono";
import type { RecentStore } from "../../files/recent";
import { body, v } from "../validate";

export function registerRecentRoutes(app: Hono, store: RecentStore) {
  app.post("/recent/list", async (c) => c.json(await store.list()));

  app.post("/recent/touch", async (c) => {
    const r = await body(c, { path: v.string });
    if (!r.ok) return r.res;
    await store.touch(r.data.path);
    return c.json({});
  });

  app.post("/recent/pin", async (c) => {
    const r = await body(c, { path: v.string, pinned: v.boolean });
    if (!r.ok) return r.res;
    await store.pin(r.data.path, r.data.pinned);
    return c.json({});
  });

  app.post("/recent/forget", async (c) => {
    const r = await body(c, { path: v.string });
    if (!r.ok) return r.res;
    await store.forget(r.data.path);
    return c.json({});
  });
}
