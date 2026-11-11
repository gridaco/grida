// GRIDA-SEC-004 / GRIDA-SEC-014 — native file grants cannot expose provider custody.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkspaceRegistry } from "./workspaces";
import { FileRegistry } from "./files/registry";
import { filesIo } from "./files/io";
import { DaemonTransport } from "./transport";
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

  it("rejects host-protected workspace and file topology before persistence while preserving sibling I/O", async () => {
    const protectedRoot = path.join(root, "host-state");
    const child = path.join(protectedRoot, "child");
    const alias = path.join(root, "host-alias");
    const selected = path.join(root, "project");
    const state = path.join(root, "state");
    await fs.mkdir(child, { recursive: true });
    await fs.mkdir(selected);
    await fs.symlink(protectedRoot, alias);
    await fs.writeFile(path.join(protectedRoot, "private.txt"), "host bytes");
    let services: DaemonServices | undefined;
    const server = buildServer({
      password: "synthetic-daemon-password",
      protocol: DAEMON_PROTOCOL,
      capabilities: DAEMON_DEFAULT_CAPABILITIES,
      user_data_path: state,
      protected_file_roots: [protectedRoot],
      http_access: {
        allowed_origins: ["https://host.test"],
        allowed_referer_paths: ["/client"],
      },
      tenants: [
        {
          register: (_app, current) => {
            services = current;
            return {};
          },
        },
      ],
    });
    const post = (route: string, value: unknown) =>
      server.app.request(route, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: DaemonTransport.buildBasicAuthHeader(
            "synthetic-daemon-password"
          ),
          referer: "https://host.test/client",
          origin: "https://host.test",
        },
        body: JSON.stringify(value),
      });
    try {
      const opened = await post("/workspaces/open", { path: selected });
      expect(opened.status).toBe(200);
      const workspace = await opened.json();
      const catalogPath = path.join(state, "workspaces.json");
      const before = await fs.readFile(catalogPath, "utf8");
      for (const candidate of [protectedRoot, child, root, alias]) {
        expect(() => services!.files.registerPath(candidate)).toThrow(
          "file-overlaps-protected-root"
        );
        const rejected = await post("/workspaces/open", { path: candidate });
        expect(rejected.status).toBe(400);
        expect(await rejected.json()).toEqual({
          error: "workspace-overlaps-protected-root",
        });
        expect(await fs.readFile(catalogPath, "utf8")).toBe(before);
      }
      expect(
        (await services!.workspaces.list()).map((entry) => entry.root)
      ).toEqual([selected]);
      const written = await post("/workspaces/writefile", {
        workspace_id: workspace.id,
        rel_path: "document.txt",
        content: "ordinary document",
      });
      expect(written.status).toBe(200);
      const read = await post("/workspaces/readfile", {
        workspace_id: workspace.id,
        rel_path: "document.txt",
      });
      expect(read.status).toBe(200);
      expect(await read.json()).toMatchObject({ content: "ordinary document" });

      // A saved handle must lose authority when its directory becomes protected.
      await fs.rm(selected, { recursive: true });
      await fs.symlink(protectedRoot, selected);
      expect(await services!.workspaces.findById(workspace.id)).toBeNull();
      expect(await services!.workspaces.findByRoot(selected)).toBeNull();
      expect(await services!.workspaces.list()).toEqual([]);
      expect(services!.workspaces.rootsSnapshot()).toEqual([]);
      expect(
        services!.workspaces.containsPath(path.join(selected, "private.txt"))
      ).toBe(false);
      for (const route of ["/workspaces/readfile", "/workspaces/writefile"]) {
        const response = await post(route, {
          workspace_id: workspace.id,
          rel_path: "private.txt",
          content: "overwrite",
        });
        expect(response.status).toBe(404);
        expect(await response.text()).not.toContain("host bytes");
      }
      expect(
        await fs.readFile(path.join(protectedRoot, "private.txt"), "utf8")
      ).toBe("host bytes");
    } finally {
      server.drain();
      server.cleanup();
    }
  });

  it("rejects an enclosing workspace through an alias before a host-protected descendant exists", async () => {
    const enclosing = path.join(root, "host");
    const alias = path.join(root, "host-alias");
    const state = path.join(root, "state");
    await fs.mkdir(enclosing);
    await fs.symlink(enclosing, alias);
    let services: DaemonServices | undefined;
    const server = buildServer({
      password: "synthetic-daemon-password",
      protocol: DAEMON_PROTOCOL,
      capabilities: DAEMON_DEFAULT_CAPABILITIES,
      user_data_path: state,
      protected_file_roots: [path.join(enclosing, "future-state")],
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
      for (const candidate of [enclosing, alias]) {
        expect(() => services!.files.registerPath(candidate)).toThrow(
          "file-overlaps-protected-root"
        );
        await expect(services!.workspaces.open(candidate)).rejects.toThrow(
          "workspace-overlaps-protected-root"
        );
      }
      expect(await services!.workspaces.list()).toEqual([]);
      await expect(
        fs.stat(path.join(state, "workspaces.json"))
      ).rejects.toMatchObject({ code: "ENOENT" });
      expect(await fs.readdir(enclosing)).toEqual([]);
    } finally {
      server.drain();
      server.cleanup();
    }
  });

  it("keeps retained documents outside additional host-owned roots", async () => {
    const legacy = path.join(root, "legacy-state");
    const original = path.join(legacy, "private.grida");
    const selected = path.join(root, "selected.grida");
    await fs.mkdir(legacy);
    await fs.writeFile(original, "retained legacy bytes");
    let services: DaemonServices | undefined;
    const server = buildServer({
      password: "synthetic-daemon-password",
      protocol: DAEMON_PROTOCOL,
      capabilities: DAEMON_DEFAULT_CAPABILITIES,
      user_data_path: path.join(root, "state"),
      protected_file_roots: [legacy],
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
      const registry = services!.files;
      expect(() => registry.registerPath(original)).toThrow(
        "file-overlaps-protected-root"
      );
      const id = registry.registerPath(selected);
      await filesIo.writeFile(registry, id, "ordinary document");
      expect((await filesIo.readFile(registry, id)).content).toBe(
        "ordinary document"
      );
      await fs.unlink(selected);
      await fs.symlink(original, selected);
      expect(registry.getEntry(id)).toBeUndefined();
      await fs.unlink(selected);
      await fs.link(original, selected);
      expect(registry.getEntry(id)).toBeUndefined();
      expect(new FileRegistry().registerPath(selected)).toEqual(
        expect.any(String)
      );
      expect(await fs.readFile(original, "utf8")).toBe("retained legacy bytes");
    } finally {
      server.drain();
      server.cleanup();
    }
  });
});
