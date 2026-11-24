// GRIDA-SEC-004 — ordinary production composition restores only Main's receipt.
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import type { EndpointProviderConfig } from "@grida/ai-host";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  root: "",
  configs: new Map<string, EndpointProviderConfig>(),
  children: [] as ChildProcess[],
  bootstraps: [] as Array<Array<{ id: string; origins: string[] }>>,
  policies: [] as Array<{
    filesystem: { denyRead: string[]; denyWrite: string[] };
  }>,
  createChild: null as (() => ChildProcess) | null,
  confirm: vi.fn<() => Promise<{ response: number }>>(),
}));
vi.mock("electron", () => ({
  app: {
    once: vi.fn<(event: string, callback: () => void) => void>(),
    hasSingleInstanceLock: () => true,
    isPackaged: true,
    getAppPath: () => "/fixture/desktop",
    getPath: (name: string) =>
      `${fixture.root}/${name === "userData" ? "browser" : name}`,
  },
  dialog: { showMessageBox: fixture.confirm },
}));
vi.mock("./sidecar-log", () => ({
  SidecarLogWriter: class {
    write() {}
  },
}));
vi.mock("./retained-service-sandbox", () => ({
  RetainedServiceSandbox: class {
    static isSupportedPlatform() {
      return true;
    }
    constructor(configuration: (typeof fixture.policies)[number]) {
      fixture.policies.push(configuration);
    }
    prepare() {
      return { release() {}, recheck() {} };
    }
    static start() {
      const child = fixture.createChild!();
      fixture.children.push(child);
      return child;
    }
  },
}));
vi.mock("./services-sidecar-socket-host", () => ({
  ServicesSidecarSocketHost: class {
    async listen() {
      return 43123;
    }
    async waitForCapabilityReady() {}
    markReady() {}
    close() {}
  },
}));
vi.mock("./provider-network-host", () => ({
  ProviderNetworkHost: {
    create: async ({
      authority,
    }: {
      authority: { grants(): Array<{ id: string; origins: string[] }> };
    }) => ({
      waitForReady: async () => 43123,
      bootstrap: async () => {
        fixture.bootstraps.push(authority.grants());
      },
      updateGrants: async () => {},
      describeCustomEndpoint: async (baseUrl: string) => ({
        origin: new URL(baseUrl).origin,
        route: "direct",
      }),
      close() {},
    }),
  },
}));
vi.mock("@grida/ai-host/media-transport", () => ({
  MediaTransport: {
    baseUrl: (port: number) => `http://127.0.0.1:${port}`,
    Client: class {
      readonly providers = {
        list_endpoints: async () =>
          structuredClone([...fixture.configs.values()]),
        set_endpoint: async (config: EndpointProviderConfig) => {
          fixture.configs.set(config.id, structuredClone(config));
        },
        delete_endpoint: async (id: string) => {
          fixture.configs.delete(id);
        },
        probe_endpoint: async () => ({ source: "ollama" as const, models: [] }),
      };
    },
  },
}));

import { ServicesSidecarSupervisor } from "./services-sidecar-supervisor";
import { ProviderEndpointConsent } from "./provider-endpoint-consent";

const active: ServicesSidecarSupervisor[] = [];
beforeEach(async () => {
  fixture.root = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), "grida-consent-startup-")
  );
  await Promise.all(
    ["browser", "home", "temp", "agent", "media"].map((name) =>
      fs.mkdir(path.join(fixture.root, name), { mode: 0o700 })
    )
  );
  fixture.configs.clear();
  fixture.children.length = 0;
  fixture.bootstraps.length = 0;
  fixture.policies.length = 0;
  fixture.confirm.mockClear();
  fixture.createChild = () =>
    Object.assign(new EventEmitter(), {
      stdin: new EventEmitter(),
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      connected: true,
      send() {},
      kill: vi.fn<() => boolean>(() => true),
    }) as unknown as ChildProcess;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  for (const supervisor of active.splice(0)) supervisor.stop();
  vi.restoreAllMocks();
  await fs.rm(fixture.root, { recursive: true, force: true });
});

function setup() {
  const browser = path.join(fixture.root, "browser");
  const agent = path.join(fixture.root, "agent");
  const supervisor = new ServicesSidecarSupervisor({
    agentData: agent,
    catalogueDirectory: path.join(browser, "model-catalogue"),
    configHome: agent,
    editorBaseUrl: "https://grida.co",
    isPackaged: true,
    mediaRoot: path.join(fixture.root, "media"),
    nativeChat: "ordinary",
    projectsRoot: path.join(fixture.root, "projects"),
    providerHome: agent,
    resourcesPath: path.join(fixture.root, "resources"),
    temp: path.join(fixture.root, "temp"),
    userData: browser,
    userHome: path.join(fixture.root, "home"),
  });
  active.push(supervisor);
  supervisor.selectNativeChat(true);
  return supervisor;
}

async function start() {
  const supervisor = setup();
  await supervisor.start();
  return supervisor;
}
function grant(supervisor: ServicesSidecarSupervisor): string | null {
  return (
    supervisor as unknown as {
      networkAuthority: {
        approvedEndpointGrant(id: string, base: string): string | null;
      };
    }
  ).networkAuthority.approvedEndpointGrant(
    "ollama",
    "http://localhost:11434/v1"
  );
}
const config = {
  id: "ollama",
  base_url: "http://localhost:11434/v1",
  models: [],
};

it("ordinary start restores a fresh process's matching receipt before returning, without dialogs", async () => {
  const first = await start();
  await first.providerEndpointSettings().set(config);
  const previous = grant(first);
  first.stop();
  const fresh = await start();
  expect(
    await fresh
      .providerEndpointSettings()
      .authorization(config.id, config.base_url)
  ).toBe(true);
  expect(grant(fresh)).toMatch(/^provider:custom:/);
  expect(grant(fresh)).not.toBe(previous);
  // The replacement service never sees custom authority before reconciliation.
  expect(
    fixture.bootstraps
      .flat()
      .some(({ id }) => id.startsWith("provider:custom:"))
  ).toBe(false);
  expect(fixture.confirm).not.toHaveBeenCalled();
  const root = ProviderEndpointConsent.directory(
    path.join(fixture.root, "browser")
  );
  expect(fixture.policies.at(-1)?.filesystem.denyRead).toContain(root);
  expect(fixture.policies.at(-1)?.filesystem.denyWrite).toContain(root);
});

it("automatic service restart preserves an unchanged native network binding and withholds changed config", async () => {
  const supervisor = await start();
  await supervisor.providerEndpointSettings().set(config);
  const previous = grant(supervisor);
  fixture.children.at(-1)!.emit("exit", 1, null);
  await vi.waitFor(() => expect(supervisor.getInfo()).not.toBeNull());
  expect(fixture.children).toHaveLength(2);
  expect(grant(supervisor)).toBe(previous);
  fixture.configs.set("ollama", {
    ...config,
    base_url: "http://localhost:9000/v1",
  });
  fixture.children.at(-1)!.emit("exit", 1, null);
  await vi.waitFor(() => expect(supervisor.getInfo()).not.toBeNull());
  expect(fixture.children).toHaveLength(3);
  expect(grant(supervisor)).toBeNull();
  expect(
    await supervisor
      .providerEndpointSettings()
      .authorization("ollama", "http://localhost:9000/v1")
  ).toBe(false);
  expect(
    fixture.bootstraps
      .flat()
      .some(({ id }) => id.startsWith("provider:custom:"))
  ).toBe(false);
  expect(fixture.confirm).not.toHaveBeenCalled();
});

it("malformed receipt leaves production endpoint config unavailable without a startup dialog", async () => {
  const directory = ProviderEndpointConsent.directory(
    path.join(fixture.root, "browser")
  );
  await fs.mkdir(directory, { mode: 0o700 });
  await fs.writeFile(path.join(directory, "consent.json"), "broken", {
    mode: 0o600,
  });
  fixture.configs.set("ollama", config);
  const supervisor = await start();
  expect(grant(supervisor)).toBeNull();
  expect(
    await supervisor
      .providerEndpointSettings()
      .authorization("ollama", config.base_url)
  ).toBe(false);
  expect(fixture.confirm).not.toHaveBeenCalled();
});

it("does not start a service after stop while protected receipt initialization is pending", async () => {
  const open = ProviderEndpointConsent.open;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const opening = vi
    .spyOn(ProviderEndpointConsent, "open")
    .mockImplementation(async (options) => {
      await pending;
      return await open(options);
    });
  const supervisor = setup();
  const starting = supervisor.start();
  const result = starting.catch((error: unknown) => error);
  await vi.waitFor(() => expect(opening).toHaveBeenCalledOnce());
  supervisor.stop();
  release();
  expect(await result).toEqual(
    expect.objectContaining({
      message: "services sidecar startup was cancelled",
    })
  );
  expect(fixture.children).toHaveLength(0);
});
