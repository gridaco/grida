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
 *   - the BYOK ids (`openrouter`, `vercel`)
 *   - ids of CONFIGURED endpoint providers (issue #806) — a self-hosted
 *     gateway may need a key; Ollama doesn't, but its slot still accepts
 *     one harmlessly.
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
import {
  isKnownProviderId,
  type EndpointProvidersStore,
} from "../../providers/endpoints";
import type { SecretsStore } from "@grida/daemon/server";
import { body, v } from "@grida/daemon/server";

export type SecretsRoutesDeps = {
  store: SecretsStore;
  /** When present, ids of configured endpoint providers are also allowed
   *  (a keyed self-hosted gateway stores its key under its endpoint id). */
  endpoints?: EndpointProvidersStore;
};

export function registerSecretsRoutes(app: Hono, deps: SecretsRoutesDeps) {
  const { store, endpoints } = deps;

  const allowedProviderId = async (
    id: string
  ): Promise<{ ok: true } | { ok: false; res: Response }> => {
    if (await isKnownProviderId(id, endpoints)) return { ok: true };
    return {
      ok: false,
      res: Response.json(
        {
          error: `provider_id must be one of: ${BYOK_PROVIDER_IDS.join(", ")}, or a configured endpoint id`,
        },
        { status: 400 }
      ),
    };
  };

  app.post("/secrets/has", async (c) => {
    const r = await body(c, { provider_id: v.string });
    if (!r.ok) return r.res;
    const allowed = await allowedProviderId(r.data.provider_id);
    if (!allowed.ok) return allowed.res;
    return c.json({ has: await store.has(r.data.provider_id) });
  });

  app.post("/secrets/set", async (c) => {
    const r = await body(c, {
      provider_id: v.string,
      key: v.stringAllowEmpty,
    });
    if (!r.ok) return r.res;
    const allowed = await allowedProviderId(r.data.provider_id);
    if (!allowed.ok) return allowed.res;
    if (r.data.key.trim().length === 0) {
      return c.json({ error: "key must not be empty or whitespace-only" }, 400);
    }
    await store.set(r.data.provider_id, r.data.key);
    console.log(`[agent-host-secrets] set providerId=${r.data.provider_id}`);
    return c.json({ ok: true });
  });

  app.post("/secrets/delete", async (c) => {
    const r = await body(c, { provider_id: v.string });
    if (!r.ok) return r.res;
    const allowed = await allowedProviderId(r.data.provider_id);
    if (!allowed.ok) return allowed.res;
    await store.delete(r.data.provider_id);
    console.log(`[agent-host-secrets] delete providerId=${r.data.provider_id}`);
    return c.json({ ok: true });
  });
}
