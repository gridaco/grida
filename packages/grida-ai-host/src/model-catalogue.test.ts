import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ModelCatalogueStore } from "./model-catalogue";
import { bundledModelCatalogue } from "@grida/ai/catalogue";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "grida-models-v2-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const seedVersion = bundledModelCatalogue().version;
const nextVersion = seedVersion.replace(/\d+$/, (iteration) =>
  String(Number(iteration) + 1)
);
const resolver =
  "https://data.jsdelivr.com/v1/packages/npm/@grida/ai-models/resolved?specifier=2";
function release(
  version: string,
  canonical = "lab/new-chat",
  agentCanonical = canonical
) {
  const models = JSON.stringify({
    $schema: "https://grida.co/schemas/ai-model-facts-v2.json",
    "text.catalog": {
      [canonical]: {
        id: canonical,
        label: "New chat",
        tool_call: true,
        providers: {
          openrouter: {
            provider: "openrouter",
            id: "exact-router-selector",
            capabilities: { tools: true },
            limits: { max_output_tokens: 1000 },
          },
        },
      },
    },
  });
  const agents = JSON.stringify({
    $schema: "https://grida.co/schemas/ai-agents-v2.json",
    agents: {
      "openai-codex": {
        models: {
          "agent-selector": {
            canonical_model_id: agentCanonical,
            service_tiers: { fast: { service_tier: "priority" } },
          },
        },
      },
    },
  });
  const files = Object.fromEntries(
    [
      ["models.json", models],
      ["agents.json", agents],
    ].map(([name, data]) => [
      name,
      {
        sha256: createHash("sha256").update(data).digest("hex"),
        bytes: Buffer.byteLength(data),
      },
    ])
  );
  const base = "https://cdn.jsdelivr.net/npm/@grida/ai-models@" + version + "/";
  return new Map([
    [resolver, JSON.stringify({ version })],
    [
      base + "manifest.json",
      JSON.stringify({ schema_version: 2, version: "v" + version, files }),
    ],
    [base + "models.json", models],
    [base + "agents.json", agents],
  ]);
}
function transport(assets: Map<string, string>) {
  return vi.fn<typeof fetch>(async (url, init) => {
    expect(init?.credentials).toBe("omit");
    expect(init?.redirect).toBe("error");
    const contents = assets.get(String(url));
    return new Response(contents, {
      status: contents === undefined ? 404 : 200,
    });
  });
}

it("updates a seed to one exact release, coalesces readers and restores validated facts after restart", async () => {
  const request = transport(release(nextVersion));
  const store = new ModelCatalogueStore({ directory, fetch: request });
  expect(store.view().version).toBe(seedVersion);
  expect(await Promise.all([store.refresh(), store.refresh()])).toEqual([
    true,
    true,
  ]);
  expect(request).toHaveBeenCalledTimes(4);
  const snapshot = store.view();
  expect(snapshot.agents["openai-codex"]?.["agent-selector"]).toEqual({
    canonicalModelId: "lab/new-chat",
    serviceTiers: { fast: "priority" },
  });
  expect(snapshot.text["lab/new-chat"].bindings.openrouter).toMatchObject({
    wireModel: "exact-router-selector",
    tools: true,
    outputLimit: 1000,
  });
  expect(await store.refresh()).toBe(false);
  expect(request).toHaveBeenCalledTimes(5);
  store.dispose();

  const offline = new ModelCatalogueStore({
    directory,
    fetch: transport(new Map()),
  });
  try {
    await offline.start();
    expect(offline.view()).toEqual(snapshot);
    expect(await offline.refresh()).toBe(false);
    expect(offline.view()).toEqual(snapshot);
  } finally {
    offline.dispose();
  }
});

it.each([
  "missing-file",
  "mismatched-version",
  "checksum",
  "broken-reference",
  "oversize",
  "unsupported-major",
] as const)(
  "retains last good data when the next publication has %s",
  async (failure) => {
    const assets = release(nextVersion);
    const resource = (name: string) =>
      [...assets.keys()].find((url) => url.endsWith("/" + name))!;
    if (failure === "missing-file") assets.delete(resource("agents.json"));
    if (failure === "mismatched-version") {
      const key = resource("manifest.json");
      assets.set(
        key,
        assets.get(key)!.replace("v" + nextVersion, "v" + seedVersion)
      );
    }
    if (failure === "checksum") {
      const key = resource("models.json");
      assets.set(key, assets.get(key)!.replace("New chat", "Bad chat"));
    }
    if (failure === "oversize")
      assets.set(resource("agents.json"), " ".repeat(256 * 1024 + 1));
    if (failure === "unsupported-major")
      assets.set(resolver, '{"version":"3.20261122.0"}');
    if (failure === "broken-reference") {
      for (const [url, data] of release(
        nextVersion,
        "lab/new-chat",
        "lab/missing"
      ))
        assets.set(url, data);
    }
    const store = new ModelCatalogueStore({
      directory,
      fetch: transport(assets),
    });
    expect(await store.refresh()).toBe(false);
    expect(store.view().version).toBe(seedVersion);
    await expect(
      readFile(join(directory, "catalogue-v2.json"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  }
);

it("falls back to the installed seed when offline with a torn cache", async () => {
  await writeFile(join(directory, "catalogue-v2.json"), "{");
  const store = new ModelCatalogueStore({
    directory,
    fetch: transport(new Map()),
  });
  try {
    await store.start();
    expect(await store.refresh()).toBe(false);
    expect(store.view().version).toBe(seedVersion);
  } finally {
    store.dispose();
  }
});

it("keeps a previously published snapshot on disk and in memory after a partial update or rollback", async () => {
  const assets = release(nextVersion);
  const store = new ModelCatalogueStore({
    directory,
    fetch: transport(assets),
  });
  expect(await store.refresh()).toBe(true);
  const current = store.view();
  const persisted = await readFile(join(directory, "catalogue-v2.json"));
  const newer = nextVersion.replace(/\d+$/, (n) => String(Number(n) + 1));
  assets.set(resolver, JSON.stringify({ version: newer }));
  expect(await store.refresh()).toBe(false);
  assets.set(resolver, JSON.stringify({ version: seedVersion }));
  expect(await store.refresh()).toBe(false);
  expect(store.view()).toBe(current);
  expect(await readFile(join(directory, "catalogue-v2.json"))).toEqual(
    persisted
  );
});

it("serves the seed while a first-launch network check is pending and cancels it on shutdown", async () => {
  const request = vi.fn<typeof fetch>(async (_, init) => {
    const signal = init!.signal!;
    signal.throwIfAborted();
    return new Promise<Response>((_, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      })
    );
  });
  const store = new ModelCatalogueStore({ directory, fetch: request });
  try {
    await store.start();
    expect(store.view().version).toBe(seedVersion);
    expect(request).toHaveBeenCalledTimes(1);
    const refresh = store.refresh();
    store.dispose();
    expect(await refresh).toBe(false);
  } finally {
    store.dispose();
  }
});

it("restores the last validated release with all catalogue requests disabled", async () => {
  const online = new ModelCatalogueStore({
    directory,
    fetch: transport(release(nextVersion)),
  });
  expect(await online.refresh()).toBe(true);
  online.dispose();
  const fetch = transport(new Map());
  const offline = new ModelCatalogueStore({ directory, fetch, offline: true });
  try {
    await offline.start();
    expect(offline.view().version).toBe(nextVersion);
    expect(await offline.refresh()).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    offline.dispose();
  }
});
