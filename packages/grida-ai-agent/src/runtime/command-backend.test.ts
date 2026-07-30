/* eslint-disable jest/no-conditional-expect */
/**
 * Contract pins — Permissions (GRIDA-SEC-004).
 *
 * The command backend applies exact session-root + secret-arg validation, then
 * delegates to a host-injected executor. Every refusal surfaces as a
 * structured `{ ok: false, code, message }` tool result.
 * The gates pinned here:
 *
 *   - cwd must be inside this session's exact workspace or scratch (every mode).
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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAgentCommandBackend } from "./command-backend";
import {
  runUnsandboxedShell,
  type ShellExecutionScope,
  type ShellExecutor,
  type ShellRunRequest,
  type ShellRunResult,
} from "@grida/daemon/server";

type Backend = ReturnType<typeof createAgentCommandBackend>;
type DenyResult = { ok: false; code: string; message: string };

function isDeny(r: Awaited<ReturnType<Backend>>): r is DenyResult {
  return (r as { ok?: boolean }).ok === false;
}

describe("Permissions", () => {
  let workspaceRoot: string;
  let otherWorkspaceRoot: string;
  let backend: Backend;
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-perms-"));
    const workspaceDir = path.join(baseDir, "workspace");
    const otherWorkspaceDir = path.join(baseDir, "other-workspace");
    const userDataDir = path.join(baseDir, "userdata");
    await fs.mkdir(workspaceDir);
    await fs.mkdir(otherWorkspaceDir);
    await fs.mkdir(userDataDir);
    workspaceRoot = await fs.realpath(workspaceDir);
    otherWorkspaceRoot = await fs.realpath(otherWorkspaceDir);
    // Raw execution is explicit in this local test. Production Desktop injects
    // a confined host executor instead.
    backend = createAgentCommandBackend({
      workspace_root: workspaceRoot,
      executor: runUnsandboxedShell,
    });
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

  it("denies a command whose cwd is outside the exact workspace grant", async () => {
    const result = await backend({
      command: "echo",
      args: ["hi"],
      // The OS tmpdir is the *parent* of the granted workspace —
      // outside it, so the containment check rejects.
      workdir: os.tmpdir(),
      description: "echo outside the workspace",
    });
    expect(isDeny(result)).toBe(true);
    if (isDeny(result)) {
      expect(result.code).toBe("cwd-not-in-workspace");
    }
  });

  it("denies a sibling workspace before invoking the executor", async () => {
    const executor = vi.fn<ShellExecutor>(runUnsandboxedShell);
    const exact = createAgentCommandBackend({
      workspace_root: workspaceRoot,
      executor,
    });
    const result = await exact({
      command: "echo",
      args: ["no"],
      workdir: otherWorkspaceRoot,
      description: "echo inside a sibling workspace",
    });
    expect(isDeny(result)).toBe(true);
    expect(executor).not.toHaveBeenCalled();
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
    const guarded = createAgentCommandBackend({
      workspace_root: workspaceRoot,
      protected_read_roots: [secretsRoot],
      executor: runUnsandboxedShell,
    });
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

  it("passes the exact workspace, own scratch, base, and secrets scope to the host executor", async () => {
    const scratchBase = path.join(baseDir, "scratch");
    const scratchRoot = path.join(scratchBase, "sessions", "a", "scratch");
    const secretsRoot = path.join(baseDir, "userdata");
    await fs.mkdir(scratchRoot, { recursive: true });
    let observedRequest: ShellRunRequest | undefined;
    let observedScope: ShellExecutionScope | undefined;
    let observedSignal: AbortSignal | undefined;
    const executor: ShellExecutor = async (request, scope, signal) => {
      observedRequest = request;
      observedScope = scope;
      observedSignal = signal;
      return successfulResult(request);
    };
    const scoped = createAgentCommandBackend({
      workspace_root: workspaceRoot,
      scratch_root: scratchRoot,
      scratch_base: scratchBase,
      protected_read_roots: [secretsRoot],
      executor,
    });

    const controller = new AbortController();
    const result = await scoped(
      {
        command: "echo",
        args: ["ok"],
        workdir: scratchRoot,
        description: "work in own scratch",
      },
      controller.signal
    );

    expect(isDeny(result)).toBe(false);
    expect(observedRequest).toEqual({
      cmd: "echo",
      args: ["ok"],
      cwd: await fs.realpath(scratchRoot),
      timeout_ms: undefined,
    });
    expect(observedScope).toEqual({
      workspace_root: workspaceRoot,
      scratch_root: scratchRoot,
      scratch_base: scratchBase,
      protected_read_roots: [secretsRoot],
    });
    expect(observedSignal).toBe(controller.signal);
  });

  it("registers the exact command promise with the turn settlement barrier", async () => {
    let releaseExecutor!: () => void;
    const executorGate = new Promise<void>((resolve) => {
      releaseExecutor = resolve;
    });
    const tracked: Promise<unknown>[] = [];
    const executor: ShellExecutor = async (request) => {
      await executorGate;
      return successfulResult(request);
    };
    const scoped = createAgentCommandBackend({
      workspace_root: workspaceRoot,
      executor,
      track_execution: (task) => tracked.push(task),
    });

    const commandTask = scoped({
      command: "echo",
      args: ["ok"],
      workdir: workspaceRoot,
      description: "wait for host cleanup",
    });

    expect(tracked).toEqual([commandTask]);
    releaseExecutor();
    await expect(commandTask).resolves.toMatchObject({ exit_code: 0 });
  });

  it("rejects a sibling session scratch cwd before invoking the executor", async () => {
    const scratchBase = path.join(baseDir, "scratch");
    const ownScratch = path.join(scratchBase, "sessions", "a", "scratch");
    const siblingScratch = path.join(scratchBase, "sessions", "b", "scratch");
    await fs.mkdir(ownScratch, { recursive: true });
    await fs.mkdir(siblingScratch, { recursive: true });
    const executor = vi.fn<ShellExecutor>(runUnsandboxedShell);
    const scoped = createAgentCommandBackend({
      workspace_root: workspaceRoot,
      scratch_root: ownScratch,
      scratch_base: scratchBase,
      executor,
    });

    const result = await scoped({
      command: "cat",
      args: ["file.txt"],
      workdir: siblingScratch,
      description: "read a sibling session scratch",
    });

    expect(result).toMatchObject({
      ok: false,
      code: "cwd-not-in-workspace",
    });
    expect(executor).not.toHaveBeenCalled();
  });

  // Phase B+ coverage target once the layered permission ruleset exists:
  // manifest deny is not overridable by session allow; most-specific
  // matching rule wins; headless evaluator treats ask as deny.
});

function successfulResult(request: ShellRunRequest): ShellRunResult {
  return {
    ...request,
    exit_code: 0,
    signal: null,
    stdout: "",
    stderr: "",
    duration_ms: 0,
    timed_out: false,
    truncated: false,
  };
}
