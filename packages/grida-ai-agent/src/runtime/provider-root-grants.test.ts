// GRIDA-SEC-004 / GRIDA-SEC-014 — provider custody stays outside structured agent grants.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceRegistry } from "@grida/daemon/server";
import { AgentFs } from "../fs";
import { DirectoryScopeRegistry } from "../session/directory-scopes";
import {
  createWorkspaceAgentBindings,
  WorkspaceAgentFsBackend,
} from "./workspace-agent-bindings";

let root: string;
let providers: string;
let project: string;
let registry: WorkspaceRegistry;
beforeEach(async () => {
  root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "grida-agent-provider-grants-"))
  );
  providers = path.join(root, "home", "providers");
  project = path.join(root, "project");
  await fs.mkdir(providers, { recursive: true });
  await fs.mkdir(project);
  await fs.writeFile(
    path.join(providers, "credentials.toml"),
    "synthetic-provider-secret"
  );
  // Deliberately a historical/unprotected registry: the binding must defend its own grant.
  registry = new WorkspaceRegistry(path.join(root, "state"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});
const protectedDeps = () => ({
  workspace_registry: registry,
  protected_read_roots: [providers],
});

describe("structured provider-root grants", () => {
  it.each(["direct", "ancestor", "alias"])(
    "refuses %s workspace authority before AgentFs hydration",
    async (kind) => {
      const alias = path.join(root, "alias");
      await fs.symlink(providers, alias);
      const candidate =
        kind === "ancestor"
          ? path.dirname(providers)
          : kind === "alias"
            ? alias
            : providers;
      const workspace = await registry.open(candidate);
      const hydrate = vi.spyOn(AgentFs.prototype, "hydrate");
      await expect(
        createWorkspaceAgentBindings(
          { workspace_root: workspace.root },
          protectedDeps()
        )
      ).rejects.toThrow("agent-fs-overlaps-protected-root");
      expect(hydrate).not.toHaveBeenCalled();
    }
  );

  it("refuses aliased scratch and ancestor directory references before hydration", async () => {
    const workspace = await registry.open(project);
    const alias = path.join(root, "scratch-alias");
    await fs.symlink(providers, alias);
    const hydrate = vi.spyOn(AgentFs.prototype, "hydrate");
    await expect(
      createWorkspaceAgentBindings(
        { workspace_root: workspace.root },
        { ...protectedDeps(), scratch_dir: alias }
      )
    ).rejects.toThrow("agent-fs-overlaps-protected-root");
    await expect(
      createWorkspaceAgentBindings(
        {
          directory_scopes: [
            {
              id: "reference",
              name: "reference",
              root: root,
              path: "/__references__/reference",
            },
          ],
        },
        protectedDeps()
      )
    ).rejects.toThrow("agent-fs-overlaps-protected-root");
    expect(hydrate).not.toHaveBeenCalled();
  });

  it("ordinary workspace read_file cannot follow a link to provider credentials", async () => {
    const workspace = await registry.open(project);
    const binding = await createWorkspaceAgentBindings(
      { workspace_root: workspace.root },
      protectedDeps()
    );
    await fs.symlink(
      path.join(providers, "credentials.toml"),
      path.join(project, "linked.txt")
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const output = await AgentFs.resolveToolCallAsync(binding!.fs, {
      tool_name: "read_file",
      input: { path: "/linked.txt" },
    });
    expect(output).toMatchObject({ ok: false, reason: "io_error" });
    expect(JSON.stringify(output)).not.toContain("synthetic-provider-secret");
  });

  it("rechecks workspace, scratch and reference roots before later structured I/O", async () => {
    const workspace = await registry.open(project);
    const scratch = path.join(root, "scratch");
    const reference = path.join(root, "reference");
    await fs.mkdir(scratch);
    await fs.mkdir(reference);
    const cases = [
      {
        selected: project,
        backend: new WorkspaceAgentFsBackend(workspace, [], [], [providers]),
        target: "/credentials.toml",
      },
      {
        selected: scratch,
        backend: new WorkspaceAgentFsBackend(
          null,
          [{ id: "scratch", root: scratch }],
          [],
          [providers]
        ),
        target: path.join(scratch, "credentials.toml"),
      },
      {
        selected: reference,
        backend: new WorkspaceAgentFsBackend(
          null,
          [],
          [
            {
              id: "reference",
              name: "reference",
              root: reference,
              path: "/__references__/reference",
            },
          ],
          [providers]
        ),
        target: "/__references__/reference/credentials.toml",
      },
    ];
    for (const { selected, backend, target } of cases) {
      await fs.rmdir(selected);
      await fs.symlink(providers, selected);
      await expect(backend.read(target)).rejects.toThrow(
        target.startsWith("/__references__/")
          ? "directory reference unreadable"
          : "agent-fs-overlaps-protected-root"
      );
      await expect(backend.readBytes(target)).rejects.toThrow(
        target.startsWith("/__references__/")
          ? "directory reference unreadable"
          : "agent-fs-overlaps-protected-root"
      );
      await expect(backend.write(target, "overwrite")).rejects.toThrow(
        "agent-fs-overlaps-protected-root"
      );
      await expect(backend.list()).rejects.toThrow(
        "agent-fs-overlaps-protected-root"
      );
    }
    expect(
      await fs.readFile(path.join(providers, "credentials.toml"), "utf8")
    ).toBe("synthetic-provider-secret");
  });

  it("directory attachment uses the shared missing-descendant canonicalization", async () => {
    const absent = path.join(root, "new-home", "providers");
    await fs.mkdir(path.dirname(absent));
    const alias = path.join(root, "home-alias");
    await fs.symlink(path.dirname(absent), alias);
    const scopes = new DirectoryScopeRegistry({
      protected_roots: [path.join(alias, "providers")],
    });
    await expect(scopes.attach(path.dirname(absent))).rejects.toMatchObject({
      code: "directory-scope-protected-root",
    });
  });

  it("directory claims and cached session grants lose retargeted authority", async () => {
    const scopes = new DirectoryScopeRegistry({ protected_roots: [providers] });
    const descriptor = await scopes.attach(project);
    expect(scopes.claim("session", [descriptor])).toHaveLength(1);
    await fs.rmdir(project);
    await fs.symlink(providers, project);
    expect(scopes.forSession("session")).toEqual([]);
    expect(() => scopes.claim("session", [descriptor])).toThrow(
      "overlaps a protected host directory"
    );
  });
});
