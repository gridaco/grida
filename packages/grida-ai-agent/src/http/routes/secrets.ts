/**
 * GRIDA-SEC-004 — `/secrets/*` routes (BYOK key store).
 *
 * **No `/secrets/get`, ever.** The agent host uses stored keys internally
 * when constructing the @ai-sdk provider client; the client can only
 * `has`/`set`/`delete`. This closes the XSS exfil path even if the
 * host bridge path-scoping defense is bypassed: a hostile script can
 * plant a known-bad key or wipe a good one, but cannot read what's
 * there. If you find yourself reaching for `/secrets/get`, surface the
 * presence (`has`) or the result of using the key (agent stream),
 * not the key itself.
 *
 * Allowed provider ids — a closed set:
 *   - `openrouter`
 *   - `ai-gateway`
 *
 * Any other id is rejected with a 400 so a typo doesn't silently create a
 * never-used auth.json entry.
 *
 * Whitespace-only keys are rejected with 400. Matches the web's
 * `editor/lib/ai/models.ts` `resolveByokProvider` behavior (treats
 * `.trim()`-empty as
 * absent). The worst outcome to avoid: "key accepted as something the
 * agent host thinks is set but the provider rejects".
 */

import type { Hono } from "hono";
import { BYOK_PROVIDER_IDS } from "../../protocol/provider-ids";
import type { SecretsStore } from "../../secrets";
import { body, v } from "../validate";

export type SecretsRoutesDeps = {
  store: SecretsStore;
};

export function registerSecretsRoutes(app: Hono, deps: SecretsRoutesDeps) {
  const { store } = deps;

  app.post("/secrets/has", async (c) => {
    const r = await body(c, { provider_id: v.oneOf(BYOK_PROVIDER_IDS) });
    if (!r.ok) return r.res;
    return c.json({ has: await store.has(r.data.provider_id) });
  });

  app.post("/secrets/set", async (c) => {
    const r = await body(c, {
      provider_id: v.oneOf(BYOK_PROVIDER_IDS),
      key: v.stringAllowEmpty,
    });
    if (!r.ok) return r.res;
    if (r.data.key.trim().length === 0) {
      return c.json({ error: "key must not be empty or whitespace-only" }, 400);
    }
    await store.set(r.data.provider_id, r.data.key);
    console.log(`[agent-host-secrets] set providerId=${r.data.provider_id}`);
    return c.json({ ok: true });
  });

  app.post("/secrets/delete", async (c) => {
    const r = await body(c, { provider_id: v.oneOf(BYOK_PROVIDER_IDS) });
    if (!r.ok) return r.res;
    await store.delete(r.data.provider_id);
    console.log(`[agent-host-secrets] delete providerId=${r.data.provider_id}`);
    return c.json({ ok: true });
  });
}
