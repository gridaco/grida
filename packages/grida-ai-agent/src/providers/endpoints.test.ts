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
  mergeProbedModels,
  resolveEndpointModel,
  validateEndpointProviderConfig,
  type EndpointProviderConfig,
} from "../protocol/endpoints";
import { AuthStore } from "@grida/daemon/server";
import { SecretsStore } from "@grida/daemon/server";
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
    for (const base_url of ["file:///etc", "ftp://x", "not a url", "", "  "]) {
      const result = validateEndpointProviderConfig({ ...OLLAMA, base_url });
      expect(result.ok).toBe(false);
    }
  });

  it("trims whitespace padding off base_url before persisting", () => {
    const result = validateEndpointProviderConfig({
      ...OLLAMA,
      base_url: "  http://localhost:11434/v1\n",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.base_url).toBe("http://localhost:11434/v1");
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

  it("accepts overrides and resolves them over detected values", () => {
    const result = validateEndpointProviderConfig({
      ...OLLAMA,
      models: [
        {
          id: "m",
          tool_call: true,
          contextWindow: 262_144,
          overrides: { contextWindow: 32_768, junk: true },
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entry = result.config.models[0];
    // Stored shape keeps both halves; unknown override keys are dropped.
    expect(entry.contextWindow).toBe(262_144);
    expect(entry.overrides).toEqual({ contextWindow: 32_768 });
    // Resolution: override wins, untouched fields fall through.
    const resolved = resolveEndpointModel(entry);
    expect(resolved.contextWindow).toBe(32_768);
    expect(resolved.tool_call).toBe(true);
    expect(resolved).not.toHaveProperty("overrides");
  });

  it("preserves exact image MIME declarations through validation and resolution", () => {
    const result = validateEndpointProviderConfig({
      ...OLLAMA,
      models: [
        {
          id: "vision",
          overrides: {
            imageInputMimes: ["IMAGE/PNG", "ImAgE/SvG+XmL"],
          },
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.config.models[0].overrides?.imageInputMimes).toEqual([
      "image/png",
      "image/svg+xml",
    ]);
    expect(
      resolveEndpointModel(result.config.models[0]).imageInputMimes
    ).toEqual(["image/png", "image/svg+xml"]);
  });

  it("never derives exact image MIME declarations from broad multimodal capability", () => {
    const result = validateEndpointProviderConfig({
      ...OLLAMA,
      models: [{ id: "broad-only", overrides: { multimodal: true } }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(
      resolveEndpointModel(result.config.models[0]).imageInputMimes
    ).toBeUndefined();
  });

  it("rejects misplaced, malformed, duplicate, and oversized exact image MIME declarations", () => {
    const validate = (imageInputMimes: unknown) =>
      validateEndpointProviderConfig({
        ...OLLAMA,
        models: [{ id: "vision", overrides: { imageInputMimes } }],
      }).ok;

    expect(
      validateEndpointProviderConfig({
        ...OLLAMA,
        models: [{ id: "vision", imageInputMimes: ["image/png"] }],
      }).ok
    ).toBe(false);
    expect(validate("image/png")).toBe(false);
    expect(validate(["TEXT/PLAIN"])).toBe(false);
    expect(validate(["IMAGE/"])).toBe(false);
    expect(validate(["IMAGE/*"])).toBe(false);
    expect(validate(["image/png", "IMAGE/PNG"])).toBe(false);
    expect(validate(Array.from({ length: 17 }, (_, i) => `image/x-${i}`))).toBe(
      false
    );
    expect(validate([`image/${"x".repeat(123)}`])).toBe(false);
  });

  it("rejects malformed overrides", () => {
    expect(
      validateEndpointProviderConfig({
        ...OLLAMA,
        models: [{ id: "m", overrides: { contextWindow: -5 } }],
      }).ok
    ).toBe(false);
    expect(
      validateEndpointProviderConfig({
        ...OLLAMA,
        models: [{ id: "m", overrides: "nope" }],
      }).ok
    ).toBe(false);
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

describe("mergeProbedModels — the detection-owned merge contract", () => {
  it("probe overwrites detected fields, never overrides; silent probe keeps prior detection", () => {
    const result = mergeProbedModels(
      [
        {
          id: "gemma4:31b-mlx",
          tool_call: false, // stale detection
          contextWindow: 8_192,
          overrides: { contextWindow: 32_768 },
        },
        { id: "unprobed:7b", tool_call: true }, // not in probe result
      ],
      [
        // tool_call reported, contextWindow silent (older Ollama): the
        // silent field keeps the previous detection.
        { id: "gemma4:31b-mlx", tool_call: true },
      ]
    );
    expect(result.updated).toBe(1);
    expect(result.discovered).toBe(0);
    expect(result.models[0]).toEqual({
      id: "gemma4:31b-mlx",
      tool_call: true,
      contextWindow: 8_192,
      overrides: { contextWindow: 32_768 }, // untouched, always
    });
    expect(result.models[1]).toEqual({ id: "unprobed:7b", tool_call: true });
  });

  it("probe refresh preserves human-declared exact image MIME types", () => {
    const result = mergeProbedModels(
      [
        {
          id: "vision",
          tool_call: false,
          overrides: { imageInputMimes: ["image/png", "image/webp"] },
        },
      ],
      [{ id: "vision", tool_call: true }]
    );

    expect(result.models[0].tool_call).toBe(true);
    expect(result.models[0].overrides?.imageInputMimes).toEqual([
      "image/png",
      "image/webp",
    ]);
  });

  it("appends newly discovered models and reports no-op merges", () => {
    const result = mergeProbedModels(
      [{ id: "known:8b", tool_call: true }],
      [
        { id: "known:8b", tool_call: true }, // unchanged
        { id: "new:31b", tool_call: true, contextWindow: 262_144 },
      ]
    );
    expect(result.updated).toBe(0);
    expect(result.discovered).toBe(1);
    expect(result.models.map((m) => m.id)).toEqual(["known:8b", "new:31b"]);
    expect(result.models[1].contextWindow).toBe(262_144);

    const noop = mergeProbedModels([{ id: "known:8b", tool_call: true }], []);
    expect(noop.updated).toBe(0);
    expect(noop.discovered).toBe(0);
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

  it("registeredModels applies overrides — every registry consumer sees effective values", async () => {
    await store.set({
      ...OLLAMA,
      models: [
        {
          id: "capped:31b",
          contextWindow: 262_144,
          overrides: {
            contextWindow: 32_768,
            imageInputMimes: ["image/png"],
          },
        },
      ],
    });
    const fresh = new EndpointProvidersStore(baseDir);
    const models = await fresh.registeredModels();
    expect(models[0].contextWindow).toBe(32_768);
    expect(models[0].imageInputMimes).toEqual(["image/png"]);
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

  it("concurrent first reads share one load — no empty-cache window", async () => {
    await fs.writeFile(
      path.join(baseDir, "endpoints.json"),
      JSON.stringify([OLLAMA]),
      "utf8"
    );
    const fresh = new EndpointProvidersStore(baseDir);
    const [list, entry, models] = await Promise.all([
      fresh.list(),
      fresh.get("ollama"),
      fresh.registeredModels(),
    ]);
    expect(list).toHaveLength(1);
    expect(entry).not.toBeNull();
    expect(models).toHaveLength(2);
  });

  it("concurrent writes serialize — neither overwrites the other", async () => {
    const other: EndpointProviderConfig = {
      id: "litellm",
      base_url: "http://localhost:4000/v1",
      models: [{ id: "m" }],
    };
    await Promise.all([store.set(OLLAMA), store.set(other)]);
    expect((await store.list()).map((e) => e.id).sort()).toEqual([
      "litellm",
      "ollama",
    ]);
    // The file agrees — a stale-snapshot persist would have dropped one.
    const fresh = new EndpointProvidersStore(baseDir);
    expect(await fresh.list()).toHaveLength(2);
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
    registerProvidersRoutes(app, { endpoints, secrets });
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

  it("info reports the config file path", async () => {
    const res = await post("/providers/endpoints/info");
    expect(res.status).toBe(200);
    const { path: configPath } = (await res.json()) as { path: string };
    expect(configPath.endsWith("endpoints.json")).toBe(true);
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

    // Malformed input is the caller's fault — 400, not a 502 "outage".
    const malformed = await probePost({ base_url: "not a url" });
    expect(malformed.status).toBe(400);
    const wrongScheme = await probePost({ base_url: "ftp://host/v1" });
    expect(wrongScheme.status).toBe(400);
  });

  it("400s an invalid config with the validator's message", async () => {
    const res = await post("/providers/endpoints/set", {
      config: { ...OLLAMA, id: "openrouter" },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/id/);
  });

  it("deleting an endpoint deletes its stored key — no orphaned credential", async () => {
    await post("/providers/endpoints/set", { config: OLLAMA });
    await post("/secrets/set", { provider_id: "ollama", key: "gateway-key" });
    expect(await secrets.has("ollama")).toBe(true);

    await post("/providers/endpoints/delete", { id: "ollama" });
    // The key went with the endpoint: nothing stale in auth.json, and a
    // re-created "ollama" endpoint can't silently reuse the old credential.
    expect(await secrets.has("ollama")).toBe(false);
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
