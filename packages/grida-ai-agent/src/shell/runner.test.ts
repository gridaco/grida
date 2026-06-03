/**
 * Deterministic tests for the shell module (GRIDA-SEC-004).
 *
 * Replaces the welcome-page "Shell tester" that this file's sibling
 * `runner.ts` was originally proven against. That surface let the
 * user type a command and look at output — useful as a smoke test
 * while building the client→host-adapter→agent host→spawn chain, but it
 * was never a *test*: no expected outputs, no pass/fail, nothing
 * runnable from CI. The genuine contract lives here.
 *
 * Three layers, increasing scope:
 *
 *   1. `isAllowedCommand` / `listAllowedCommands` — pure unit. Pure
 *      string matching against the allowlist set; no IO.
 *   2. `validateShellRequest` — touches real fs (`realpath`, `stat`)
 *      and a real `WorkspaceRegistry` pointed at a temp userData
 *      dir. Covers the gates the agent server route runs before spawning:
 *      cmd-allowlist, cwd-resolve, cwd-is-directory, cwd-in-workspace.
 *   3. `runShell` — actually spawns child processes via
 *      `child_process.spawn`. Uses `echo`, `pwd`, `ls`, `sleep` from
 *      the host PATH; the runner uses `shell: false` so these
 *      resolve to the standalone binaries (`/bin/echo` etc.), which
 *      is the same code path the agent host takes in production.
 *
 * All cases are deterministic: fixed inputs, fixed expected outputs.
 * The temp dir lives under `os.tmpdir()` so the registry's git-root
 * walk doesn't pick up the grida repo root by accident — `os.tmpdir()`
 * resolves to `/private/var/folders/…` on macOS and `/tmp` on Linux,
 * neither of which is inside a git tree.
 */
/* eslint-disable jest/no-conditional-expect */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isAllowedCommand, listAllowedCommands } from "../permissions";
import { runShell, validateShellRequest } from "./runner";
import { WorkspaceRegistry } from "../workspaces";

/* ───────────────────────────── policy ──────────────────────────── */

describe("isAllowedCommand", () => {
  it("accepts known allowlisted binaries", () => {
    for (const cmd of ["ls", "pwd", "echo", "cat", "git", "rg"]) {
      expect(isAllowedCommand(cmd)).toBe(true);
    }
  });

  it("rejects unknown commands and the empty string", () => {
    expect(isAllowedCommand("rm")).toBe(false);
    expect(isAllowedCommand("curl")).toBe(false);
    expect(isAllowedCommand("")).toBe(false);
  });

  it("rejects shells, runtimes, and package managers", () => {
    for (const cmd of ["bash", "sh", "node", "pnpm", "npm", "yarn"]) {
      expect(isAllowedCommand(cmd)).toBe(false);
    }
  });

  it("rejects path-shaped inputs even when the basename is allowlisted", () => {
    // The allowlist would defeat its own purpose if `/bin/ls` or
    // `..\ls` passed just because the trailing segment matches.
    expect(isAllowedCommand("/bin/ls")).toBe(false);
    expect(isAllowedCommand("./ls")).toBe(false);
    expect(isAllowedCommand("..\\ls")).toBe(false);
  });
});

describe("listAllowedCommands", () => {
  it("returns a sorted, non-empty list including the demo essentials", () => {
    const list = listAllowedCommands();
    expect(list.length).toBeGreaterThan(0);
    expect([...list]).toEqual([...list].sort());
    expect(list).toContain("echo");
    expect(list).toContain("pwd");
  });
});

/* ────────────────────── validate + runShell scaffold ───────────── */

/**
 * Per-test fixture: a temp dir with a real `WorkspaceRegistry` that
 * has registered a child of the temp dir as its single workspace.
 * `workspaceRoot` is already `realpath`'d so tests can compare
 * against it without doing the macOS `/var` → `/private/var` dance.
 */
async function makeFixture(): Promise<{
  workspace_root: string;
  registry: WorkspaceRegistry;
  cleanup: () => Promise<void>;
}> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "grida-shell-test-"));
  const workspaceDir = path.join(base, "workspace");
  const userDataDir = path.join(base, "userdata");
  await fs.mkdir(workspaceDir);
  await fs.mkdir(userDataDir);
  const workspaceRoot = await fs.realpath(workspaceDir);
  const registry = new WorkspaceRegistry(userDataDir);
  await registry.open(workspaceRoot);
  return {
    workspace_root: workspaceRoot,
    registry,
    cleanup: async () => {
      await fs.rm(base, { recursive: true, force: true });
    },
  };
}

/* ─────────────────────── validateShellRequest ──────────────────── */

describe("validateShellRequest", () => {
  let fixture: Awaited<ReturnType<typeof makeFixture>>;
  beforeEach(async () => {
    fixture = await makeFixture();
  });
  afterEach(async () => {
    await fixture.cleanup();
  });

  it("accepts an allowlisted cmd with an in-workspace cwd", async () => {
    const result = await validateShellRequest(
      { cmd: "echo", args: ["hi"], cwd: fixture.workspace_root },
      fixture.registry
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.cmd).toBe("echo");
      expect(result.request.cwd).toBe(fixture.workspace_root);
    }
  });

  it("rejects non-allowlisted commands", async () => {
    const result = await validateShellRequest(
      { cmd: "rm", args: [], cwd: fixture.workspace_root },
      fixture.registry
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("cmd-not-allowed");
    }
  });

  it("rejects cwd outside any registered workspace", async () => {
    // The OS tmpdir itself is the *parent* of our registered
    // workspace; `containsPath` does a prefix-with-separator check,
    // so the parent is correctly rejected.
    const result = await validateShellRequest(
      { cmd: "echo", args: [], cwd: os.tmpdir() },
      fixture.registry
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("cwd-not-in-workspace");
    }
  });

  it("rejects cwd that doesn't exist", async () => {
    const result = await validateShellRequest(
      {
        cmd: "echo",
        args: [],
        cwd: path.join(fixture.workspace_root, "no-such-dir"),
      },
      fixture.registry
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("cwd-resolve-failed");
    }
  });

  it("rejects cwd that points to a regular file", async () => {
    const filePath = path.join(fixture.workspace_root, "regular-file.txt");
    await fs.writeFile(filePath, "x");
    const result = await validateShellRequest(
      { cmd: "echo", args: [], cwd: filePath },
      fixture.registry
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("cwd-not-a-directory");
    }
  });
});

/* ─────────────────────────── runShell ──────────────────────────── */

describe("runShell", () => {
  let fixture: Awaited<ReturnType<typeof makeFixture>>;
  beforeEach(async () => {
    fixture = await makeFixture();
  });
  afterEach(async () => {
    await fixture.cleanup();
  });

  it("captures stdout from a successful echo", async () => {
    const result = await runShell({
      cmd: "echo",
      args: ["grida-test-ok"],
      cwd: fixture.workspace_root,
    });
    expect(result.exit_code).toBe(0);
    expect(result.signal).toBeNull();
    expect(result.stdout.trim()).toBe("grida-test-ok");
    expect(result.stderr).toBe("");
    expect(result.timed_out).toBe(false);
    expect(result.truncated).toBe(false);
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("pwd prints the realpath'd workspace cwd", async () => {
    // `shell: false` → spawns the standalone `/bin/pwd` binary,
    // which prints `getcwd()` (= the realpath). Matches the
    // workspaceRoot we already realpath'd in the fixture.
    const result = await runShell({
      cmd: "pwd",
      args: [],
      cwd: fixture.workspace_root,
    });
    expect(result.exit_code).toBe(0);
    expect(result.stdout.trim()).toBe(fixture.workspace_root);
  });

  it("captures stderr and a non-zero exit code for ls of a missing path", async () => {
    const missing = path.join(
      fixture.workspace_root,
      "no-such-file-grida-test"
    );
    const result = await runShell({
      cmd: "ls",
      args: [missing],
      cwd: fixture.workspace_root,
    });
    expect(result.exit_code).not.toBe(0);
    expect(result.stderr.length).toBeGreaterThan(0);
    expect(result.timed_out).toBe(false);
  });

  it("returns exit code -1 with a spawn-error message when the binary is missing", async () => {
    // `validateShellRequest` would catch this upstream, but `runShell`
    // is the bedrock — it must surface spawn failures via `resolve`,
    // never `reject`, so the route handler can serialise the failure
    // back to the client.
    const result = await runShell({
      cmd: "this-binary-does-not-exist-grida-aaaaaa",
      args: [],
      cwd: fixture.workspace_root,
    });
    expect(result.exit_code).toBe(-1);
    expect(result.stderr).toContain("spawn error");
  });

  it("kills the child on timeout and reports timedOut=true", async () => {
    // `sleep` is not in the policy allowlist, but `runShell` is the
    // layer *below* the gate — feeding it the cmd directly exercises
    // the kill path. SIGTERM fires at 100ms, the SIGKILL grace gives
    // another 250ms; total well under the 5s sleep was asking for.
    const result = await runShell({
      cmd: "sleep",
      args: ["5"],
      cwd: fixture.workspace_root,
      timeout_ms: 100,
    });
    expect(result.timed_out).toBe(true);
    expect(result.signal).not.toBeNull();
    expect(result.duration_ms).toBeLessThan(2000);
  });
});
