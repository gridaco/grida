/**
 * GRIDA-SEC-004 — `/providers/endpoints/*` routes (issue #806).
 *
 * CRUD over the endpoint provider config store: user-configured
 * OpenAI-compatible endpoints (Ollama preset, self-hosted gateways).
 *
 * Unlike `/secrets/*`, configs ARE readable back to the client — an
 * endpoint config is plain config (base URL + registered models), not a
 * credential. The optional API key for a keyed gateway still rides the
 * `/secrets/*` surface under the endpoint's id and never appears here.
 *
 * Threat note (reviewed): `base_url` is user-controlled egress — once an
 * endpoint is configured and picked, conversation content flows to it.
 * That is the feature (same trust model as BYOK: the desktop user points
 * their own agent at their own endpoint), and the writer is the same
 * authenticated loopback client that could already set a BYOK key. The
 * validator pins the shape (http(s) URL, bounded sizes) so a config
 * write can't smuggle arbitrary blobs.
 */

import type { Hono } from "hono";
import {
  validateEndpointProviderConfig,
  type EndpointProviderConfig,
} from "../../protocol/endpoints";
import type { EndpointProvidersStore } from "../../providers/endpoints";
import { probeEndpointModels } from "../../providers/probe";
import type { SecretsStore } from "../../secrets";
import { body, v } from "../validate";

export type ProvidersRoutesDeps = {
  endpoints: EndpointProvidersStore;
  /**
   * When present, deleting an endpoint also deletes the key stored under
   * its id. Without this, the key would be orphaned in auth.json: the
   * `/secrets/*` allowlist only accepts CONFIGURED endpoint ids, so the
   * leftover would be undeletable — and re-creating the same endpoint id
   * later would silently reuse the stale credential.
   */
  secrets?: SecretsStore;
  /** Probe override for tests. Defaults to {@link probeEndpointModels}. */
  probe?: typeof probeEndpointModels;
};

export function registerProvidersRoutes(app: Hono, deps: ProvidersRoutesDeps) {
  const { endpoints, secrets } = deps;
  const probe = deps.probe ?? probeEndpointModels;

  app.post("/providers/endpoints/list", async (c) => {
    const list: EndpointProviderConfig[] = await endpoints.list();
    return c.json(list);
  });

  // Where the config JSON lives — the settings UI links developers to
  // the hand-editable file (the `overrides` escape hatch lives there).
  // Absolute paths are an accepted part of this surface (cf. workspaces).
  app.post("/providers/endpoints/info", (c) =>
    c.json({ path: endpoints.filePath })
  );

  app.post("/providers/endpoints/set", async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      raw = undefined;
    }
    const config = (raw as { config?: unknown } | undefined)?.config;
    const result = validateEndpointProviderConfig(config);
    if (!result.ok) {
      return c.json({ error: `config ${result.error}` }, 400);
    }
    try {
      await endpoints.set(result.config);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : String(err) },
        400
      );
    }
    console.log(
      `[agent-host-providers] endpoint set id=${result.config.id} models=${result.config.models.length}`
    );
    return c.json({ ok: true });
  });

  app.post("/providers/endpoints/delete", async (c) => {
    const r = await body(c, { id: v.string });
    if (!r.ok) return r.res;
    await endpoints.delete(r.data.id);
    // The endpoint's key (if any) goes with it — see the deps doc. Both
    // deletes are idempotent, so a partial failure is safe to retry.
    await secrets?.delete(r.data.id);
    console.log(`[agent-host-providers] endpoint delete id=${r.data.id}`);
    return c.json({ ok: true });
  });

  // Model discovery (see providers/probe.ts for the threat note): the
  // host fetches the endpoint's own model listing and returns the
  // PARSED rows — never the raw body. Takes a base_url (not a stored
  // id) so the settings flow can prefill before the config is saved.
  app.post("/providers/endpoints/probe", async (c) => {
    const r = await body(c, { base_url: v.string });
    if (!r.ok) return r.res;
    const result = await probe(r.data.base_url);
    if (!result.ok) {
      return c.json({ error: result.error }, 502);
    }
    console.log(
      `[agent-host-providers] probe source=${result.source} models=${result.models.length}`
    );
    return c.json({ source: result.source, models: result.models });
  });
}
