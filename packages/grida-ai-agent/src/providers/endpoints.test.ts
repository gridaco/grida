/**
 * Endpoint provider layer (issue #806): config validation, the file-
 * backed store, and the `/providers/endpoints/*` + extended `/secrets/*`
 * routes. Runs against a tmp-dir store and a bare Hono app — no model,
 * no network.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import {
  OLLAMA_ENDPOINT_PRESET,
  isValidEndpointProviderId,
  validateEndpointProviderConfig,
  type EndpointProviderConfig,
} from "../protocol/endpoints";
import { AuthStore } from "../auth/file";
import { SecretsStore } from "../secrets";
import { registerProvidersRoutes } from "../http/routes/providers";
import { registerSecretsRoutes } from "../http/routes/secrets";
import { EndpointProvidersStore } from "./endpoints";

const OLLAMA: EndpointProviderConfig = {
  ...OLLAMA_ENDPOINT_PRESET,
  models: [{ id: "llama3.1:8b" }, { id: "qwen3:32b", tool_call: false }],
};

describe("validateEndpointProviderConfig", () => {
  it("accepts the Ollama preset shape", () => {
    const result = validateEndpointProviderConfig(OLLAMA);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.id).toBe("ollama");
    expect(result.config.base_url).toBe("http://localhost:11434/v1");
    expect(result.config.models.length).toBe(2);
  });

  it("rejects BYOK-colliding and malformed ids", () => {
    expect(isValidEndpointProviderId("openrouter")).toBe(false);
    expect(isValidEndpointProviderId("vercel")).toBe(false);
    expect(isValidEndpointProviderId("Ollama")).toBe(false);
    expect(isValidEndpointProviderId("")).toBe(false);
    expect(isValidEndpointProviderId("ollama")).toBe(true);
    expect(isValidEndpointProviderId("my-gateway_2")).toBe(true);
  });

  it("rejects non-http(s) base URLs", () => {
    for (const base_url of ["file:///etc", "ftp://x", "not a url", ""]) {
      const result = validateEndpointProviderConfig({ ...OLLAMA, base_url });
      expect(result.ok).toBe(false);
    }
  });

  it("rejects duplicate model ids and a dangling default_model_id", () => {
    expect(
      validateEndpointProviderConfig({
        ...OLLAMA,
        models: [{ id: "m" }, { id: "m" }],
      }).ok
    ).toBe(false);
    expect(
      validateEndpointProviderConfig({
        ...OLLAMA,
        default_model_id: "not-registered",
      }).ok
    ).toBe(false);
    expect(
      validateEndpointProviderConfig({
        ...OLLAMA,
        default_model_id: "qwen3:32b",
      }).ok
    ).toBe(true);
  });

  it("drops unknown fields and never accepts a cost card from input", () => {
    const result = validateEndpointProviderConfig({
      ...OLLAMA,
      models: [{ id: "m", cost: { input: 1, output: 2 }, evil: true }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.models[0]).not.toHaveProperty("cost");
    expect(result.config.models[0]).not.toHaveProperty("evil");
  });

  it("rejects out-of-range numeric limits", () => {
    expect(
      validateEndpointProviderConfig({
        ...OLLAMA,
        models: [{ id: "m", contextWindow: -1 }],
      }).ok
    ).toBe(false);
    expect(
      validateEndpointProviderConfig({
        ...OLLAMA,
        models: [{ id: "m", contextWindow: 1.5 }],
      }).ok
    ).toBe(false);
  });
});

describe("EndpointProvidersStore", () => {
  let baseDir: string;
  let store: EndpointProvidersStore;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-endpoints-"));
    store = new EndpointProvidersStore(baseDir);
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it("persists round-trip and survives a fresh store instance", async () => {
    await store.set(OLLAMA);
    const fresh = new EndpointProvidersStore(baseDir);
    const list = await fresh.list();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe("ollama");
    expect(await fresh.get("ollama")).not.toBeNull();
    expect(await fresh.registeredModels()).toHaveLength(2);
  });

  it("set replaces the entry with the same id", async () => {
    await store.set(OLLAMA);
    await store.set({ ...OLLAMA, models: [{ id: "only-one" }] });
    expect(await store.registeredModels()).toHaveLength(1);
  });

  it("delete is idempotent", async () => {
    await store.set(OLLAMA);
    await store.delete("ollama");
    await store.delete("ollama");
    expect(await store.list()).toHaveLength(0);
  });

  it("rejects an invalid config thrown at the store layer", async () => {
    await expect(
      store.set({ ...OLLAMA, base_url: "file:///etc" })
    ).rejects.toThrow(/invalid config/);
  });

  it("drops invalid entries on load instead of failing", async () => {
    await fs.writeFile(
      path.join(baseDir, "endpoints.json"),
      JSON.stringify([OLLAMA, { id: "broken" }, "junk"]),
      "utf8"
    );
    expect((await store.list()).map((e) => e.id)).toEqual(["ollama"]);
  });
});

describe("HTTP wire — /providers/endpoints/* and endpoint-id secrets", () => {
  let baseDir: string;
  let app: Hono;
  let endpoints: EndpointProvidersStore;
  let secrets: SecretsStore;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-providers-rt-"));
    endpoints = new EndpointProvidersStore(baseDir);
    secrets = new SecretsStore(new AuthStore(baseDir));
    app = new Hono();
    registerProvidersRoutes(app, { endpoints });
    registerSecretsRoutes(app, { store: secrets, endpoints });
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  const post = (route: string, body?: unknown) =>
    app.request(route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  it("set → list → delete round-trips", async () => {
    const set = await post("/providers/endpoints/set", { config: OLLAMA });
    expect(set.status).toBe(200);

    const list = await post("/providers/endpoints/list");
    expect(list.status).toBe(200);
    const configs = (await list.json()) as EndpointProviderConfig[];
    expect(configs.map((c) => c.id)).toEqual(["ollama"]);

    const del = await post("/providers/endpoints/delete", { id: "ollama" });
    expect(del.status).toBe(200);
    expect(await (await post("/providers/endpoints/list")).json()).toEqual([]);
  });

  it("probe route returns parsed models, 502s an unreachable endpoint", async () => {
    const probeApp = new Hono();
    registerProvidersRoutes(probeApp, {
      endpoints,
      probe: async (baseUrl: string) =>
        baseUrl.includes("11434")
          ? {
              ok: true as const,
              source: "ollama" as const,
              models: [{ id: "gemma4:31b-mlx", tool_call: true }],
            }
          : { ok: false as const, error: "no model listing at this endpoint" },
    });
    const probePost = (body: unknown) =>
      probeApp.request("/providers/endpoints/probe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    const ok = await probePost({ base_url: "http://localhost:11434/v1" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      source: "ollama",
      models: [{ id: "gemma4:31b-mlx", tool_call: true }],
    });

    const down = await probePost({ base_url: "http://localhost:9/v1" });
    expect(down.status).toBe(502);

    const bad = await probePost({});
    expect(bad.status).toBe(400);
  });

  it("400s an invalid config with the validator's message", async () => {
    const res = await post("/providers/endpoints/set", {
      config: { ...OLLAMA, id: "openrouter" },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/id/);
  });

  it("secrets routes accept a configured endpoint id, reject unknown ids", async () => {
    // Unknown until configured.
    expect(
      (await post("/secrets/set", { provider_id: "ollama", key: "k" })).status
    ).toBe(400);

    await post("/providers/endpoints/set", { config: OLLAMA });

    expect(
      (await post("/secrets/set", { provider_id: "ollama", key: "k" })).status
    ).toBe(200);
    const has = await post("/secrets/has", { provider_id: "ollama" });
    expect(((await has.json()) as { has: boolean }).has).toBe(true);

    // BYOK ids still work; junk still 400s.
    expect(
      (await post("/secrets/set", { provider_id: "openrouter", key: "k" }))
        .status
    ).toBe(200);
    expect((await post("/secrets/has", { provider_id: "nope" })).status).toBe(
      400
    );
  });
});
