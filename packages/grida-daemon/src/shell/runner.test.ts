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
 * Two layers, increasing scope:
 *
 *   1. `validateShellRequest` — touches real fs (`realpath`, `stat`). Covers
 *      cwd resolution, exact granted-root containment, and the secret-arg
 *      check. (Command identity is gated upstream by mode — see
 *      `permissions.test.ts`.)
 *   2. `runShell` — actually spawns child processes via
 *      `child_process.spawn`. Uses `echo`, `pwd`, `ls`, `sleep` from
 *      the host PATH; the runner uses `shell: false` so these
 *      resolve to the standalone binaries (`/bin/echo` etc.), which
 *      is the same code path the agent host takes in production.
 *
 * All cases are deterministic: fixed inputs, fixed expected outputs.
 * The temp dir lives under `os.tmpdir()` so tests do not touch the checkout.
 */
/* eslint-disable jest/no-conditional-expect */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runShell, validateShellRequest } from "./runner";

/* ────────────────────── validate + runShell scaffold ───────────── */

/**
 * Per-test fixture with two sibling workspace-shaped roots. The validator is
 * handed exactly one; the other proves global/open-workspace authority cannot
 * bleed into the current command. Roots are already `realpath`'d so tests can
 * compare without doing the macOS `/var` → `/private/var` dance.
 */
async function makeFixture(): Promise<{
  workspace_root: string;
  other_workspace_root: string;
  cleanup: () => Promise<void>;
}> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "grida-shell-test-"));
  const workspaceDir = path.join(base, "workspace");
  const otherWorkspaceDir = path.join(base, "other-workspace");
  const userDataDir = path.join(base, "userdata");
  await fs.mkdir(workspaceDir);
  await fs.mkdir(otherWorkspaceDir);
  await fs.mkdir(userDataDir);
  const workspaceRoot = await fs.realpath(workspaceDir);
  const otherWorkspaceRoot = await fs.realpath(otherWorkspaceDir);
  return {
    workspace_root: workspaceRoot,
    other_workspace_root: otherWorkspaceRoot,
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

  it("accepts a request with a cwd inside the exact workspace root", async () => {
    const result = await validateShellRequest(
      { cmd: "echo", args: ["hi"], cwd: fixture.workspace_root },
      [fixture.workspace_root]
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.cmd).toBe("echo");
      expect(result.request.cwd).toBe(fixture.workspace_root);
    }
  });

  it("rejects cwd outside the exact granted root", async () => {
    // The OS tmpdir itself is the *parent* of our workspace; `containsPath`
    // does a prefix-with-separator check, so the parent is correctly rejected.
    const result = await validateShellRequest(
      { cmd: "echo", args: [], cwd: os.tmpdir() },
      [fixture.workspace_root]
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("cwd-not-in-workspace");
    }
  });

  it("rejects a sibling workspace when only the current workspace is granted", async () => {
    const result = await validateShellRequest(
      { cmd: "echo", args: [], cwd: fixture.other_workspace_root },
      [fixture.workspace_root]
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
      [fixture.workspace_root]
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
      [fixture.workspace_root]
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("cwd-not-a-directory");
    }
  });
});

/* ────────────── protected-secret-root arg containment ──────────── */

/**
 * GRIDA-SEC-004 gate (3): the host's `userData` (BYOK `auth.json` etc.) is
 * NOT in the srt deny_read policy — the host process reads it — so the shell
 * runner must reject any command ARG that resolves inside it. The secrets
 * root here is a tmp dir standing in for `userData`.
 */
describe("validateShellRequest — protected secret roots", () => {
  let fixture: Awaited<ReturnType<typeof makeFixture>>;
  let secretsRoot: string;
  let authJsonAbs: string;
  beforeEach(async () => {
    fixture = await makeFixture();
    // The fixture already creates a sibling `userdata` dir under the same
    // base as the workspace; use it as the fake secrets root so a relative
    // `../userdata/auth.json` from the workspace actually reaches it.
    secretsRoot = await fs.realpath(
      path.join(path.dirname(fixture.workspace_root), "userdata")
    );
    authJsonAbs = path.join(secretsRoot, "auth.json");
    await fs.writeFile(authJsonAbs, '{"token":"secret"}');
  });
  afterEach(async () => {
    await fixture.cleanup();
  });

  it("rejects an absolute arg inside the secrets root", async () => {
    const result = await validateShellRequest(
      { cmd: "cat", args: [authJsonAbs], cwd: fixture.workspace_root },
      [fixture.workspace_root],
      [secretsRoot]
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("arg-in-protected-root");
    }
  });

  it("rejects a relative arg that climbs into the secrets root", async () => {
    // `../userdata/auth.json` from the workspace resolves into the secret
    // root — the prefix check must catch it after resolution.
    const result = await validateShellRequest(
      {
        cmd: "cat",
        args: ["../userdata/auth.json"],
        cwd: fixture.workspace_root,
      },
      [fixture.workspace_root],
      [secretsRoot]
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("arg-in-protected-root");
    }
  });

  it("allows a normal in-workspace arg", async () => {
    await fs.writeFile(path.join(fixture.workspace_root, "file.txt"), "ok");
    const result = await validateShellRequest(
      { cmd: "cat", args: ["./file.txt"], cwd: fixture.workspace_root },
      [fixture.workspace_root],
      [secretsRoot]
    );
    expect(result.ok).toBe(true);
  });

  it("does not treat flags or plain text as paths", async () => {
    const result = await validateShellRequest(
      { cmd: "grep", args: ["-n", "needle"], cwd: fixture.workspace_root },
      [fixture.workspace_root],
      [secretsRoot]
    );
    expect(result.ok).toBe(true);
  });
});

/* ───────────────── exact roots (session scratch) ───────────────── */

/**
 * WG `scratch.md` S4: the session scratch dir is a sanctioned cwd root even
 * though it is NOT a workspace (S5). It is one of this session's exact roots;
 * without it, a cwd in scratch is rejected like any other ungranted path. The
 * scratch dir lives outside both the workspace and the secrets root.
 */
describe("validateShellRequest — exact scratch root", () => {
  let fixture: Awaited<ReturnType<typeof makeFixture>>;
  let scratchRoot: string;
  beforeEach(async () => {
    fixture = await makeFixture();
    scratchRoot = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), "grida-scratch-allowed-"))
    );
  });
  afterEach(async () => {
    await fixture.cleanup();
    await fs.rm(scratchRoot, { recursive: true, force: true });
  });

  it("cwd inside scratch passes when scratch is an allowed root (S4)", async () => {
    const result = await validateShellRequest(
      { cmd: "ls", args: [], cwd: scratchRoot },
      [fixture.workspace_root, scratchRoot]
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.request.cwd).toBe(scratchRoot);
  });

  it("cwd inside scratch fails when scratch is not an allowed root", async () => {
    const result = await validateShellRequest(
      { cmd: "ls", args: [], cwd: scratchRoot },
      [fixture.workspace_root]
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("cwd-not-in-workspace");
  });

  it("an arg pointing into scratch is not flagged protected (scratch ∉ secrets root)", async () => {
    // unzip-style: cwd is the workspace, the extraction target is scratch.
    const secretsRoot = await fs.realpath(
      path.join(path.dirname(fixture.workspace_root), "userdata")
    );
    const result = await validateShellRequest(
      {
        cmd: "unzip",
        args: ["a.zip", "-d", path.join(scratchRoot, "out")],
        cwd: fixture.workspace_root,
      },
      [fixture.workspace_root, scratchRoot],
      [secretsRoot]
    );
    expect(result.ok).toBe(true);
  });
});

/* ─────────────────────────── runShell ──────────────────────────── */

describe("runShell", () => {
  let fixture: Awaited<ReturnType<typeof makeFixture>>;
  beforeEach(async () => {
    fixture = await makeFixture();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
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

  it("kills the child when its host generation is aborted", async () => {
    const controller = new AbortController();
    const pending = runShell(
      {
        cmd: "sleep",
        args: ["5"],
        cwd: fixture.workspace_root,
      },
      { signal: controller.signal }
    );
    controller.abort();

    const result = await pending;
    expect(result.timed_out).toBe(false);
    expect(result.signal).not.toBeNull();
    expect(result.duration_ms).toBeLessThan(2000);
  });

  it("kills background descendants before releasing command authority", async () => {
    if (process.platform === "win32") return;
    const lateWrite = path.join(fixture.workspace_root, "late-write.txt");
    const result = await runShell({
      cmd: "/bin/sh",
      args: ["-c", `(sleep 0.4; echo escaped > '${lateWrite}') &`],
      cwd: fixture.workspace_root,
    });

    expect(result.exit_code).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 650));
    await expect(fs.stat(lateWrite)).rejects.toThrow(/ENOENT/);
  });

  it("excludes process-group teardown polling from command duration", async () => {
    if (process.platform === "win32") return;
    const processKill = process.kill.bind(process);
    let existenceProbes = 0;
    vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
      if (pid >= 0) return processKill(pid, signal);
      if (signal !== 0) return true;
      existenceProbes += 1;
      if (existenceProbes <= 20) return true;
      throw Object.assign(new Error("no such process"), { code: "ESRCH" });
    });

    const wallStartedAt = Date.now();
    const result = await runShell({
      cmd: "echo",
      args: ["done"],
      cwd: fixture.workspace_root,
    });
    const wallDurationMs = Date.now() - wallStartedAt;

    expect(existenceProbes).toBe(21);
    expect(wallDurationMs - result.duration_ms).toBeGreaterThanOrEqual(100);
  });

  it("escalates immediately when process-group exit cannot be observed", async () => {
    if (process.platform === "win32") return;
    const processKill = process.kill.bind(process);
    const groupSignals: Array<{
      signal: Parameters<typeof process.kill>[1];
      at: number;
    }> = [];
    vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
      if (pid >= 0) return processKill(pid, signal);
      groupSignals.push({ signal, at: Date.now() });
      if (signal === 0) {
        throw Object.assign(new Error("operation not permitted"), {
          code: "EPERM",
        });
      }
      return true;
    });

    await runShell({
      cmd: "echo",
      args: ["done"],
      cwd: fixture.workspace_root,
    });

    expect(groupSignals.map(({ signal }) => signal)).toEqual([
      "SIGTERM",
      0,
      "SIGKILL",
      0,
    ]);
    expect(groupSignals[2]!.at - groupSignals[0]!.at).toBeLessThan(100);
  });
});
