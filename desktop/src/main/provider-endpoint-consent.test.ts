// GRIDA-SEC-004 — saved consent is independent from sidecar-writable config.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { EndpointProviderConfig } from "@grida/ai-host";
import { ProviderEndpointConsent } from "./provider-endpoint-consent";
import { ProviderNetworkAuthority } from "./provider-network-authority";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await fs.rm(root, { recursive: true, force: true });
});
const initial = (): EndpointProviderConfig => ({
  id: "ollama",
  label: "Local",
  base_url: "http://localhost:11434/v1",
  models: [{ id: "local-model" }],
});

async function fixture() {
  const root = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), "grida-provider-consent-")
  );
  roots.push(root);
  const directory = ProviderEndpointConsent.directory(root);
  const configs = new Map<string, EndpointProviderConfig>();
  let generation = 1;
  let authority = new ProviderNetworkAuthority("https://grida.co");
  const published = vi.fn<() => Promise<void>>(async () => {});
  const configuration = {
    list: vi.fn<() => Promise<EndpointProviderConfig[]>>(async () =>
      structuredClone([...configs.values()])
    ),
    set: vi.fn<(config: EndpointProviderConfig) => Promise<void>>(
      async (config) => {
        configs.set(config.id, structuredClone(config));
      }
    ),
    delete: vi.fn<(id: string) => Promise<void>>(async (id) => {
      configs.delete(id);
    }),
    probe: vi.fn<
      (url: string) => Promise<{
        source: "ollama";
        models: Array<{ id: string; contextWindow: number }>;
      }>
    >(async (_url) => ({
      source: "ollama" as const,
      models: [{ id: "detected", contextWindow: 32768 }],
    })),
  };
  const describe = vi.fn<
    (url: string) => Promise<{ origin: string; route: string }>
  >(async (url) => {
    if (!new URL(url).hostname.endsWith("localhost"))
      throw new Error("route unavailable");
    return { origin: new URL(url).origin, route: "direct" };
  });
  const options = {
    directory,
    configuration,
    describe,
    approve: async (id: string, url: string) => {
      authority.approveCustomEndpoint(id, url);
      await published();
    },
    revoke: async (id: string) => {
      authority.revokeCustomEndpoint(id);
      await published();
    },
    approved: (id: string, url: string) =>
      authority.approvedEndpointGrant(id, url) !== null,
    generation: () => generation,
  };
  const owner = await ProviderEndpointConsent.open(options);
  return {
    owner,
    root,
    directory,
    configuration,
    configs,
    describe,
    published,
    authority: () => authority,
    nextGeneration: () => {
      generation++;
    },
    reopen: async () => {
      authority = new ProviderNetworkAuthority("https://grida.co");
      return await ProviderEndpointConsent.open(options);
    },
  };
}

it("explicit Save grants and durably records the exact full URL without any dialog owner", async () => {
  const f = await fixture();
  await f.owner.set(initial());
  expect(
    await f.owner.authorization("ollama", "http://LOCALHOST:11434/v1")
  ).toBe(true);
  expect(
    await f.owner.authorization("ollama", "http://localhost:11434/other")
  ).toBe(false);
  const receipt = JSON.parse(
    await fs.readFile(path.join(f.directory, "consent.json"), "utf8")
  );
  expect(receipt).toEqual({
    version: 1,
    endpoints: [{ id: "ollama", base_url: "http://localhost:11434/v1" }],
  });
  expect(
    (await fs.stat(path.join(f.directory, "consent.json"))).mode & 0o777
  ).toBe(0o600);
});

it("restores only matching saved consent in a fresh owner and mints a fresh capability", async () => {
  const f = await fixture();
  await f.owner.set(initial());
  const previous = f
    .authority()
    .approvedEndpointGrant("ollama", initial().base_url);
  const fresh = await f.reopen();
  expect(await fresh.authorization("ollama", initial().base_url)).toBe(false);
  await fresh.restore();
  expect(await fresh.authorization("ollama", initial().base_url)).toBe(true);
  expect(
    f.authority().approvedEndpointGrant("ollama", initial().base_url)
  ).not.toBe(previous);
});

it("probes, repeated saves and discovery metadata reuse consent without rotating its live grant", async () => {
  const f = await fixture();
  await f.owner.set(initial());
  const grant = f
    .authority()
    .approvedEndpointGrant("ollama", initial().base_url);
  await f.owner.probe(initial().base_url);
  await f.owner.probe(initial().base_url);
  await f.owner.set(initial());
  await f.owner.updateModels({
    id: "ollama",
    base_url: initial().base_url,
    models: [{ id: "detected" }],
  });
  expect(
    f.authority().approvedEndpointGrant("ollama", initial().base_url)
  ).toBe(grant);
  expect(
    f
      .authority()
      .grants()
      .filter((grant) => grant.id.startsWith("provider:custom:"))
  ).toHaveLength(1);
});

it("requires Connect before a draft probe and never grants a URL discovered in config", async () => {
  const f = await fixture();
  f.configs.set("ollama", initial());
  await f.owner.restore();
  await expect(f.owner.probe(initial().base_url)).rejects.toThrow(
    "connect_required"
  );
  await expect(
    f.owner.updateModels({
      id: "ollama",
      base_url: initial().base_url,
      models: [],
    })
  ).rejects.toThrow("connect_required");
  expect(f.configuration.probe).not.toHaveBeenCalled();
  expect(f.published).not.toHaveBeenCalled();
});

it("withholds an externally changed origin or same-origin base path until explicit Save", async () => {
  for (const base_url of [
    "http://localhost:9000/v1",
    "http://localhost:11434/other",
  ]) {
    const f = await fixture();
    await f.owner.set(initial());
    f.configs.set("ollama", { ...initial(), base_url });
    const fresh = await f.reopen();
    await fresh.restore();
    expect(await fresh.authorization("ollama", base_url)).toBe(false);
    await expect(fresh.probe(base_url)).rejects.toThrow("connect_required");
    await fresh.set({ ...initial(), base_url });
    expect(await fresh.authorization("ollama", base_url)).toBe(true);
  }
});

it("does not restore a receipt when current route eligibility is lost", async () => {
  const f = await fixture();
  await f.owner.set(initial());
  const fresh = await f.reopen();
  f.describe.mockRejectedValue(new Error("proxy route unavailable"));
  await fresh.restore();
  expect(
    f.authority().approvedEndpointGrant("ollama", initial().base_url)
  ).toBeNull();
});

it("merges only detected fields into the latest config, preserving overrides, default and settings", async () => {
  const f = await fixture();
  const config: EndpointProviderConfig = {
    ...initial(),
    label: "Human label",
    default_model_id: "local-model",
    models: [
      {
        id: "local-model",
        contextWindow: 8000,
        overrides: { contextWindow: 4000 },
      },
    ],
  };
  await f.owner.set(config);
  await f.owner.updateModels({
    id: "ollama",
    base_url: config.base_url,
    models: [{ id: "local-model", contextWindow: 32000 }, { id: "new" }],
  });
  expect(f.configs.get("ollama")).toMatchObject({
    label: "Human label",
    default_model_id: "local-model",
    models: [
      {
        id: "local-model",
        contextWindow: 32000,
        overrides: { contextWindow: 4000 },
      },
      { id: "new" },
    ],
  });
});

it("deletion revokes durable and live authorization before deleting config and never lets late metadata resurrect it", async () => {
  const f = await fixture();
  await f.owner.set(initial());
  f.configuration.delete.mockImplementationOnce(async () => {
    expect(
      f.authority().approvedEndpointGrant("ollama", initial().base_url)
    ).toBeNull();
    const receipt = JSON.parse(
      await fs.readFile(path.join(f.directory, "consent.json"), "utf8")
    );
    expect(receipt.endpoints).toEqual([]);
    f.configs.delete("ollama");
  });
  await f.owner.remove("ollama");
  await expect(
    f.owner.updateModels({
      id: "ollama",
      base_url: initial().base_url,
      models: [{ id: "late" }],
    })
  ).rejects.toThrow("connect_required");
  const fresh = await f.reopen();
  await fresh.restore();
  expect(f.configs.has("ollama")).toBe(false);
  expect(await fresh.authorization("ollama", initial().base_url)).toBe(false);
});

it("serializes replacement and deletion while config persistence is pending", async () => {
  const f = await fixture();
  let release!: () => void;
  f.configuration.set.mockImplementationOnce(async (config) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    f.configs.set(config.id, config);
  });
  const saving = f.owner.set(initial());
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  const deletion = f.owner.remove("ollama");
  expect(f.configuration.delete).not.toHaveBeenCalled();
  release();
  await saving;
  await deletion;
  expect(f.configs.has("ollama")).toBe(false);
  const fresh = await f.reopen();
  await fresh.restore();
  expect(await fresh.authorization("ollama", initial().base_url)).toBe(false);
});

it("does not acquire consent when its sender navigates or its service generation changes during Save", async () => {
  for (const changeGeneration of [true, false]) {
    const f = await fixture();
    let current = true;
    f.configuration.set.mockImplementationOnce(async (config) => {
      f.configs.set(config.id, config);
      if (changeGeneration) f.nextGeneration();
      else current = false;
    });
    await expect(
      f.owner.set(initial(), () => {
        if (!current) throw new Error("sender navigated");
      })
    ).rejects.toThrow(
      changeGeneration ? "connect_required" : "sender navigated"
    );
    const fresh = await f.reopen();
    await fresh.restore();
    expect(await fresh.authorization("ollama", initial().base_url)).toBe(false);
  }
});

it("rolls back live and durable consent if grant publication fails", async () => {
  const f = await fixture();
  f.published
    .mockResolvedValueOnce()
    .mockRejectedValueOnce(new Error("grant ACK failed"));
  await expect(f.owner.set(initial())).rejects.toThrow("grant ACK failed");
  expect(
    f.authority().approvedEndpointGrant("ollama", initial().base_url)
  ).toBeNull();
  const fresh = await f.reopen();
  await fresh.restore();
  expect(await fresh.authorization("ollama", initial().base_url)).toBe(false);
});

it("keeps config inert if its deletion fails after durable revocation", async () => {
  const f = await fixture();
  await f.owner.set(initial());
  f.configuration.delete.mockRejectedValueOnce(new Error("disk full"));
  await expect(f.owner.remove("ollama")).rejects.toThrow("disk full");
  expect(f.configs.has("ollama")).toBe(true);
  const fresh = await f.reopen();
  await fresh.restore();
  expect(await fresh.authorization("ollama", initial().base_url)).toBe(false);
});

it("fails closed for malformed, future, duplicate and unsafe receipt files", async () => {
  for (const content of [
    "not JSON",
    JSON.stringify({
      version: 2,
      endpoints: [{ id: "ollama", base_url: initial().base_url }],
    }),
    JSON.stringify({
      version: 1,
      endpoints: [
        { id: "ollama", base_url: initial().base_url },
        { id: "ollama", base_url: initial().base_url },
      ],
    }),
  ]) {
    const f = await fixture();
    f.configs.set("ollama", initial());
    await fs.writeFile(path.join(f.directory, "consent.json"), content, {
      mode: 0o600,
    });
    const fresh = await f.reopen();
    await fresh.restore();
    expect(await fresh.authorization("ollama", initial().base_url)).toBe(false);
  }
  const f = await fixture();
  await f.owner.set(initial());
  const receipt = path.join(f.directory, "consent.json");
  await fs.rename(receipt, receipt + ".original");
  await fs.symlink(receipt + ".original", receipt);
  const fresh = await f.reopen();
  await fresh.restore();
  expect(await fresh.authorization("ollama", initial().base_url)).toBe(false);
  const linked = await fixture();
  await linked.owner.set(initial());
  const linkedReceipt = path.join(linked.directory, "consent.json");
  await fs.link(linkedReceipt, linkedReceipt + ".alias");
  const linkedFresh = await linked.reopen();
  await linkedFresh.restore();
  expect(await linkedFresh.authorization("ollama", initial().base_url)).toBe(
    false
  );
});
