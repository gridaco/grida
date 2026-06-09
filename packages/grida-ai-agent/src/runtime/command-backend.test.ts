/* eslint-disable jest/no-conditional-expect */
/**
 * Contract pins — Permissions (GRIDA-SEC-004).
 *
 * The command backend applies the STRUCTURAL gates (cwd-in-workspace +
 * secret-arg containment), then runs through the host shell runner. Every
 * refusal surfaces as a structured `{ ok: false, code, message }` tool result.
 * The gates pinned here:
 *
 *   - cwd must be inside an opened workspace (every mode).
 *   - no arg may resolve inside the protected secret root (every mode).
 *
 * The supervised mode gate (RFC `permission modes`) is NOT in the backend —
 * it's the tool's `needsApproval`, wired from the session mode at
 * `workspace-agent-bindings.ts` and pinned in
 * `workspace-agent-bindings.test.ts`. By the time the backend's `execute` runs,
 * the call is already cleared (auto, or user-approved), so the backend runs
 * whatever it's handed — it can't re-gate on mode without refusing an approved
 * command. The read-only-vs-mutating categorization that drives `needsApproval`
 * is unit-pinned in `permissions.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAgentCommandBackend } from "./command-backend";
import { WorkspaceRegistry } from "../workspaces";

type Backend = ReturnType<typeof createAgentCommandBackend>;
type DenyResult = { ok: false; code: string; message: string };

function isDeny(r: Awaited<ReturnType<Backend>>): r is DenyResult {
  return (r as { ok?: boolean }).ok === false;
}

describe("Permissions", () => {
  let workspaceRoot: string;
  let registry: WorkspaceRegistry;
  let backend: Backend;
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-perms-"));
    const workspaceDir = path.join(baseDir, "workspace");
    const userDataDir = path.join(baseDir, "userdata");
    await fs.mkdir(workspaceDir);
    await fs.mkdir(userDataDir);
    workspaceRoot = await fs.realpath(workspaceDir);
    registry = new WorkspaceRegistry(userDataDir);
    await registry.open(workspaceRoot);
    backend = createAgentCommandBackend(registry);
  });
  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it("runs a mutating command — the backend does not gate on mode", async () => {
    // The mode/approval gate is the tool's `needsApproval`, not the backend.
    // Whatever reaches the backend's `execute` is already cleared (auto, or
    // user-approved), so a mutating `mkdir` runs (harmless: a subdir of the
    // temp workspace). Re-gating here would refuse an approved command.
    const result = await backend({
      command: "mkdir",
      args: ["sub"],
      workdir: workspaceRoot,
      description: "create a directory",
    });
    expect(isDeny(result)).toBe(false);
    if (!isDeny(result)) {
      expect(result.exit_code).toBe(0);
    }
  });

  it("denies a command whose cwd is outside any opened workspace", async () => {
    const result = await backend({
      command: "echo",
      args: ["hi"],
      // The OS tmpdir is the *parent* of the registered workspace —
      // outside it, so the containment check rejects.
      workdir: os.tmpdir(),
      description: "echo outside the workspace",
    });
    expect(isDeny(result)).toBe(true);
    if (isDeny(result)) {
      expect(result.code).toBe("cwd-not-in-workspace");
    }
  });

  it("runs a command inside an opened workspace", async () => {
    const result = await backend({
      command: "echo",
      args: ["grida-ok"],
      workdir: workspaceRoot,
      description: "echo inside the workspace",
    });
    // Success shape carries execution fields, never `ok:false`.
    expect(isDeny(result)).toBe(false);
    if (!isDeny(result)) {
      expect(result.exit_code).toBe(0);
      expect(result.stdout.trim()).toBe("grida-ok");
    }
  });

  it("denies an arg that resolves inside the protected secret root (GRIDA-SEC-004)", async () => {
    // The userData dir (BYOK auth.json) is the protected root threaded down
    // from the runtime. Reading it through a command arg must surface as a
    // structured tool result, not an execution.
    const secretsRoot = await fs.realpath(path.join(baseDir, "userdata"));
    await fs.writeFile(path.join(secretsRoot, "auth.json"), "{}");
    const guarded = createAgentCommandBackend(registry, [secretsRoot]);
    const result = await guarded({
      command: "cat",
      args: [path.join(secretsRoot, "auth.json")],
      workdir: workspaceRoot,
      description: "read the host's auth.json",
    });
    expect(isDeny(result)).toBe(true);
    if (isDeny(result)) {
      expect(result.code).toBe("arg-in-protected-root");
    }
  });

  // Phase B+ coverage target once the layered permission ruleset exists:
  // manifest deny is not overridable by session allow; most-specific
  // matching rule wins; headless evaluator treats ask as deny.
});
