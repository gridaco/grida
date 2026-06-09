/**
 * GRIDA-SEC-004 — workspace agent fs path mapping.
 *
 * The agent reaches files two ways that must agree: the fs tools' logical
 * "/"-rooted path (where "/" is the workspace root) AND the REAL absolute path
 * it sees from the shell's cwd. Both must resolve to the same workspace file —
 * otherwise `write_file(<abs>)` followed by a shell `python3 <file>` reads from
 * a different place than it was written (the regression these pins guard: an
 * absolute path used to be treated as logical and land under a doubled
 * `<root>/<root>/…` path). Workspace containment is still enforced downstream.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WorkspaceRegistry } from "../workspaces";
import {
  WorkspaceAgentFsBackend,
  createWorkspaceAgentBindings,
} from "./workspace-agent-bindings";

describe("WorkspaceAgentFsBackend — path mapping", () => {
  let baseDir: string;
  let workspaceRoot: string;
  let backend: WorkspaceAgentFsBackend;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-wsfs-"));
    const wsDir = path.join(baseDir, "ws");
    await fs.mkdir(wsDir);
    workspaceRoot = await fs.realpath(wsDir);
    const registry = new WorkspaceRegistry(path.join(baseDir, "ud"));
    const ws = await registry.open(workspaceRoot);
    backend = new WorkspaceAgentFsBackend(ws);
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it("maps a logical '/'-rooted path to the workspace root", async () => {
    await backend.write("/a.txt", "hello");
    expect(await fs.readFile(path.join(workspaceRoot, "a.txt"), "utf8")).toBe(
      "hello"
    );
    expect(await backend.read("/a.txt")).toBe("hello");
  });

  it("maps an absolute in-workspace path to the same file (no doubling)", async () => {
    const abs = path.join(workspaceRoot, "b.txt");
    await backend.write(abs, "world");
    // Lands at <root>/b.txt — not a doubled <root>/<root>/b.txt.
    expect(await fs.readFile(path.join(workspaceRoot, "b.txt"), "utf8")).toBe(
      "world"
    );
    // The doubled directory the old bug created must not exist.
    await expect(
      fs.access(path.join(workspaceRoot, workspaceRoot))
    ).rejects.toBeDefined();
    // Readable via the absolute path AND its logical form — one file.
    expect(await backend.read(abs)).toBe("world");
    expect(await backend.read("/b.txt")).toBe("world");
  });

  it("still rejects a path that escapes the workspace", async () => {
    await expect(backend.write("/../escape.txt", "x")).rejects.toBeDefined();
  });
});

/**
 * GRIDA-SEC-004 — the supervised approval gate (RFC `permission modes`, Phase
 * 2) is wired here: the command capability's `needs_approval` predicate is the
 * single source the run_command tool's `needsApproval` reads. `accept-edits`
 * pauses a non-read-only command for Allow/Deny but auto-runs inspection; `auto`
 * supplies NO predicate (every command runs without asking).
 */
describe("createWorkspaceAgentBindings — supervised approval wiring", () => {
  let baseDir: string;
  let workspaceRoot: string;
  let registry: WorkspaceRegistry;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-wsbind-"));
    const wsDir = path.join(baseDir, "ws");
    await fs.mkdir(wsDir);
    workspaceRoot = await fs.realpath(wsDir);
    registry = new WorkspaceRegistry(path.join(baseDir, "ud"));
    await registry.open(workspaceRoot);
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it("accept-edits: pauses a mutating command, auto-runs a read-only one", async () => {
    const bindings = await createWorkspaceAgentBindings(
      { workspace_root: workspaceRoot, mode: "accept-edits" },
      { workspace_registry: registry, shell_execution_allowed: true }
    );
    const needsApproval = bindings?.command?.needs_approval;
    expect(needsApproval).toBeDefined();
    // A mutating/executing command requires approval...
    expect(needsApproval!({ command: "python3", args: ["x.py"] })).toBe(true);
    // ...a read-only inspection command does not.
    expect(needsApproval!({ command: "ls", args: ["-la"] })).toBe(false);
  });

  it("auto: supplies no approval predicate (every command auto-runs)", async () => {
    const bindings = await createWorkspaceAgentBindings(
      { workspace_root: workspaceRoot, mode: "auto" },
      { workspace_registry: registry, shell_execution_allowed: true }
    );
    expect(bindings?.command).toBeDefined();
    expect(bindings?.command?.needs_approval).toBeUndefined();
  });

  it("no shell containment: no command capability at all", async () => {
    const bindings = await createWorkspaceAgentBindings(
      { workspace_root: workspaceRoot, mode: "accept-edits" },
      { workspace_registry: registry, shell_execution_allowed: false }
    );
    expect(bindings?.command).toBeUndefined();
  });
});
