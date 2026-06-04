/* eslint-disable jest/no-conditional-expect */
/**
 * Contract pins — Permissions (GRIDA-SEC-004).
 *
 * Maps to docs/wg/ai/grida/architecture.md §Test pins → describe("Permissions").
 *
 * What exists today (V1.x, pre-srt): a single shell allowlist
 * (`shell/policy.ts`) plus a cwd-must-be-inside-an-opened-workspace
 * gate (`shell/runner.ts`). The agent reaches both through
 * `createAgentCommandBackend`, which surfaces a denial as a structured
 * `{ ok: false, code, message }` tool result — the model sees the
 * refusal as a tool output, never an execution. THAT is the behavior
 * the refactor must preserve, so it is pinned here.
 *
 * The architecture doc's full layered ruleset (manifest > session >
 * project precedence, most-specific-rule-wins, headless ask=deny) is
 * the Phase B+ target and does not exist yet — tracked as `it.todo`
 * below so the contract surface is visible without faking a green test
 * for unbuilt behavior. (The allowlist + validate gates themselves are
 * additionally unit-pinned in `shell/runner.test.ts`.)
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

  it("denies a non-allowlisted command as a structured tool result (not execution)", async () => {
    const result = await backend({
      command: "rm",
      args: ["-rf", "/"],
      workdir: workspaceRoot,
      description: "attempt a denied command",
    });
    expect(isDeny(result)).toBe(true);
    if (isDeny(result)) {
      expect(result.code).toBe("cmd-not-allowed");
      expect(result.message).toMatch(/allowlist/i);
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

  it("allows an allowlisted command inside an opened workspace", async () => {
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
