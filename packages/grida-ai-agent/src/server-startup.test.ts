import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AuthStore,
  FileRegistry,
  RecentStore,
  SecretsStore,
  WorkspaceRegistry,
  type DaemonServices,
  type DaemonTenantHandle,
} from "@grida/daemon/server";
import { AgentRuntime } from "./runtime";
import { createAgentTenant } from "./server";

const cleanup: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const dispose of cleanup.splice(0).reverse()) {
    await dispose();
  }
});

describe("agent tenant startup", () => {
  it("uses host startup authority to recover queues when the agent mounts", async () => {
    const baseDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "grida-agent-startup-")
    );
    const scratchBase = `${baseDir}-scratch`;
    cleanup.push(
      () => fs.rm(baseDir, { recursive: true, force: true }),
      () => fs.rm(scratchBase, { recursive: true, force: true })
    );
    const services: DaemonServices = {
      user_data_path: baseDir,
      files: new FileRegistry(),
      recent: new RecentStore(baseDir),
      workspaces: new WorkspaceRegistry(baseDir),
      secrets: new SecretsStore(new AuthStore(baseDir)),
    };
    const recover = vi
      .spyOn(AgentRuntime.prototype, "recoverQueuedSessions")
      .mockResolvedValue(undefined);
    let handle: DaemonTenantHandle | undefined;
    cleanup.push(() => {
      handle?.drain?.();
      handle?.cleanup?.();
    });

    handle = createAgentTenant({
      capabilities: {
        secrets: false,
        agent: true,
        sessions: false,
        providers: false,
        images: false,
        video: false,
      },
      scratch_base: scratchBase,
    }).register(new Hono(), services);

    expect(recover).toHaveBeenCalledOnce();
  });

  it("retries durable queues when a provider credential becomes ready", async () => {
    const baseDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "grida-agent-provider-ready-")
    );
    const scratchBase = `${baseDir}-scratch`;
    cleanup.push(
      () => fs.rm(baseDir, { recursive: true, force: true }),
      () => fs.rm(scratchBase, { recursive: true, force: true })
    );
    const services: DaemonServices = {
      user_data_path: baseDir,
      files: new FileRegistry(),
      recent: new RecentStore(baseDir),
      workspaces: new WorkspaceRegistry(baseDir),
      secrets: new SecretsStore(new AuthStore(baseDir)),
    };
    let finishStartupRecovery!: () => void;
    const startupRecovery = new Promise<void>((resolve) => {
      finishStartupRecovery = resolve;
    });
    vi.spyOn(AgentRuntime.prototype, "recoverQueuedSessions").mockReturnValue(
      startupRecovery
    );
    const retry = vi
      .spyOn(AgentRuntime.prototype, "retryQueuedSessions")
      .mockResolvedValue(undefined);
    const app = new Hono();
    let handle: DaemonTenantHandle | undefined;
    cleanup.push(() => {
      handle?.drain?.();
      handle?.cleanup?.();
    });

    handle = createAgentTenant({
      capabilities: {
        secrets: true,
        agent: true,
        sessions: false,
        providers: false,
        images: false,
        video: false,
      },
      scratch_base: scratchBase,
    }).register(app, services);

    const response = await app.request("/secrets/set", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider_id: "openrouter", key: "ready" }),
    });
    expect(response.status).toBe(200);
    expect(retry).not.toHaveBeenCalled();

    finishStartupRecovery();
    await vi.waitFor(() => expect(retry).toHaveBeenCalledOnce());
  });

  it("does not recover or retry queues when the agent capability is off", async () => {
    const baseDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "grida-agent-disabled-")
    );
    const scratchBase = `${baseDir}-scratch`;
    cleanup.push(
      () => fs.rm(baseDir, { recursive: true, force: true }),
      () => fs.rm(scratchBase, { recursive: true, force: true })
    );
    const services: DaemonServices = {
      user_data_path: baseDir,
      files: new FileRegistry(),
      recent: new RecentStore(baseDir),
      workspaces: new WorkspaceRegistry(baseDir),
      secrets: new SecretsStore(new AuthStore(baseDir)),
    };
    const recover = vi
      .spyOn(AgentRuntime.prototype, "recoverQueuedSessions")
      .mockResolvedValue(undefined);
    const retry = vi
      .spyOn(AgentRuntime.prototype, "retryQueuedSessions")
      .mockResolvedValue(undefined);
    const app = new Hono();
    let handle: DaemonTenantHandle | undefined;
    cleanup.push(() => {
      handle?.drain?.();
      handle?.cleanup?.();
    });

    handle = createAgentTenant({
      capabilities: {
        secrets: true,
        agent: false,
        sessions: false,
        providers: false,
        images: false,
        video: false,
      },
      scratch_base: scratchBase,
    }).register(app, services);

    const response = await app.request("/secrets/set", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider_id: "openrouter", key: "ready" }),
    });
    expect(response.status).toBe(200);
    expect(recover).not.toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
  });
});
