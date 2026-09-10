// GRIDA-SEC-004 / GRIDA-SEC-014 — native file grants cannot expose provider custody.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkspaceRegistry } from "./workspaces";
import { FileRegistry } from "./files/registry";
import { filesIo } from "./files/io";
import { registerWorkspacesRoutes } from "./http/routes/workspaces";
import { buildServer, type DaemonServices } from "./http/server";
import {
  DAEMON_DEFAULT_CAPABILITIES,
  DAEMON_PROTOCOL,
} from "./protocol/handshake";

let root: string;
let providerHome: string;
let providers: string;
let credential: string;
beforeEach(async () => {
  root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "grida-provider-grants-"))
  );
  providerHome = path.join(root, "home");
  providers = path.join(providerHome, "providers");
  credential = path.join(providers, "credentials.toml");
  await fs.mkdir(providers, { recursive: true });
  await fs.writeFile(credential, "synthetic-provider-secret");
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("native provider-root grants", () => {
  it("refuses direct, ancestor and aliased workspace grants and unsafe project creation", async () => {
    const registry = new WorkspaceRegistry(
      path.join(root, "state"),
      providers,
      [providers]
    );
    await fs.symlink(providers, path.join(root, "alias"));
    for (const candidate of [
      providers,
      providerHome,
      path.join(root, "alias"),
    ]) {
      await expect(registry.open(candidate)).rejects.toThrow(
        "workspace-overlaps-protected-root"
      );
    }
    await expect(
      registry.createProject({ name: "must-not-exist" })
    ).rejects.toThrow("workspace-overlaps-protected-root");
    expect(await registry.ensureDefault()).toBeNull();
    expect(await fs.readdir(providers)).toEqual(["credentials.toml"]);
  });

  it("hides historical workspace roots from lookups and actual workspace file routes", async () => {
    const state = path.join(root, "state");
    const old = new WorkspaceRegistry(state);
    const ancestor = await old.open(providerHome);
    const registry = new WorkspaceRegistry(state, undefined, [providers]);
    expect(await registry.findById(ancestor.id)).toBeNull();
    expect(await registry.findByRoot(ancestor.root)).toBeNull();
    expect(await registry.list()).toEqual([]);
    expect(registry.rootsSnapshot()).toEqual([]);
    expect(registry.containsPath(credential)).toBe(false);
    const app = new Hono();
    registerWorkspacesRoutes(app, registry);
    const response = await app.request("/workspaces/readfile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspace_id: ancestor.id,
        rel_path: "providers/credentials.toml",
      }),
    });
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("synthetic-provider-secret");
  });

  it("rechecks a registered and cached default workspace after alias retargeting", async () => {
    const selected = path.join(root, "project");
    await fs.mkdir(selected);
    const registry = new WorkspaceRegistry(path.join(root, "state"), selected, [
      providers,
    ]);
    const workspace = await registry.ensureDefault();
    expect(workspace).not.toBeNull();
    await fs.rmdir(selected);
    await fs.symlink(providers, selected);
    expect(await registry.ensureDefault()).toBeNull();
    expect(await registry.findById(workspace!.id)).toBeNull();
    expect(await registry.list()).toEqual([]);
  });

  it("refuses direct and aliased file registration, including an absent target", async () => {
    const registry = new FileRegistry([providers]);
    await fs.symlink(providers, path.join(root, "alias"));
    for (const candidate of [
      credential,
      path.join(providers, "new.toml"),
      path.join(root, "alias", "credentials.toml"),
    ]) {
      expect(() => registry.registerPath(candidate)).toThrow(
        "file-overlaps-protected-root"
      );
    }
  });

  it("revokes saved document IDs for both reads and writes after parent retargeting", async () => {
    const selected = path.join(root, "selected");
    await fs.mkdir(selected);
    const registry = new FileRegistry([providers]);
    const id = registry.registerPath(path.join(selected, "credentials.toml"));
    await filesIo.writeFile(registry, id, "ordinary document");
    expect((await filesIo.readFile(registry, id)).content).toBe(
      "ordinary document"
    );
    await fs.rm(selected, { recursive: true });
    await fs.symlink(providers, selected);
    expect(registry.getEntry(id)).toBeUndefined();
    await expect(filesIo.readFile(registry, id)).rejects.toBeInstanceOf(
      filesIo.DocIdNotFoundError
    );
    await expect(
      filesIo.writeFile(registry, id, "overwrite")
    ).rejects.toBeInstanceOf(filesIo.DocIdNotFoundError);
    expect(await fs.readFile(credential, "utf8")).toBe(
      "synthetic-provider-secret"
    );
  });

  it("the actual daemon composition protects the explicit shared root", async () => {
    let services: DaemonServices | undefined;
    const server = buildServer({
      password: "synthetic-daemon-password",
      protocol: DAEMON_PROTOCOL,
      capabilities: DAEMON_DEFAULT_CAPABILITIES,
      user_data_path: path.join(root, "state"),
      provider_home: providerHome,
      http_access: { allowed_origins: [], allowed_referer_paths: [] },
      tenants: [
        {
          register: (_app, current) => {
            services = current;
            return {};
          },
        },
      ],
    });
    try {
      expect(services!.secrets.directory).toBe(providers);
      expect(() => services!.files.registerPath(credential)).toThrow(
        "file-overlaps-protected-root"
      );
      await expect(services!.workspaces.open(providerHome)).rejects.toThrow(
        "workspace-overlaps-protected-root"
      );
    } finally {
      server.drain();
      server.cleanup();
    }
  });
});
