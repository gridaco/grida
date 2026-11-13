// GRIDA-GG: provider — see docs/wg/platform/hosted-ai.md
/**
 * GRIDA-SEC-006 — `/auth/gg/*` routes (hosted "included" AI session).
 *
 * The renderer mints a short-lived, org-scoped AI token from the
 * webview's cookie session and PUSHES it here; the daemon holds it in
 * memory only ({@link GridaGatewaySessionStore}) and spends it as the
 * Bearer credential of the `grida` provider. There is deliberately no
 * `/auth/gg/get`: like `/secrets/*`, presence (`status`) is
 * readable, the credential is not — and the token is NEVER logged.
 *
 * Mounted behind the daemon's CORS → Referer → BasicAuth perimeter like
 * every tenant route; no SSE, so no query-token path.
 */

import type { Hono } from "hono";
import { body, v } from "@grida/daemon/server";
import type { GridaGatewaySessionStore } from "../../providers/gg-session";

export type GridaAuthRoutesDeps = {
  store: GridaGatewaySessionStore;
};

export function registerGridaAuthRoutes(app: Hono, deps: GridaAuthRoutesDeps) {
  const { store } = deps;

  app.post("/auth/gg/set", async (c) => {
    const r = await body(c, {
      access_token: v.string,
      expires_at: v.number,
    });
    if (!r.ok) return r.res;
    if (r.data.access_token.trim().length === 0) {
      return c.json({ error: "access_token must not be empty" }, 400);
    }
    if (
      !Number.isFinite(r.data.expires_at) ||
      r.data.expires_at <= Date.now()
    ) {
      return c.json(
        { error: "expires_at must be a future epoch-ms timestamp" },
        400
      );
    }
    // Optional display-only org context; malformed shapes are dropped,
    // not fatal (it never authorizes anything here).
    const rawOrg = (await c.req.json().catch(() => ({}))) as {
      organization?: { id?: unknown; name?: unknown };
    };
    const organization =
      rawOrg.organization &&
      typeof rawOrg.organization.id === "number" &&
      typeof rawOrg.organization.name === "string"
        ? { id: rawOrg.organization.id, name: rawOrg.organization.name }
        : undefined;

    store.set({
      access_token: r.data.access_token,
      expires_at: r.data.expires_at,
      organization,
    });
    console.info(
      `[agent-host-gg-auth] session set` +
        (organization ? ` org=${organization.id}` : "") +
        ` expires_in=${Math.round((r.data.expires_at - Date.now()) / 1000)}s`
    );
    return c.json({ ok: true });
  });

  app.post("/auth/gg/clear", (c) => {
    store.clear();
    return c.json({ ok: true });
  });

  app.post("/auth/gg/status", (c) => {
    return c.json(store.status());
  });
}
