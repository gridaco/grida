/**
 * GRIDA-SEC-004 — shell runner (pre-srt; demo-grade).
 *
 * Spawns a child process via `child_process.spawn` (no shell
 * interpolation — args are passed verbatim, so quoting attacks via
 * args are not possible). Returns buffered stdout/stderr + exit
 * info after the child exits.
 *
 * Why buffered, not streamed: the SSE path adds a layer of
 * complexity (callbacks across a host bridge, backpressure
 * semantics, abort plumbing) that the demo doesn't need. For long-
 * running commands a streaming variant will land later.
 *
 * Two gates on every call:
 *
 *   1. `policy.ts` allowlist — cmd must be a known bare binary
 *      name. Args are not constrained here (see `policy.ts` for
 *      the "bash escape hatch" caveat).
 *   2. cwd must be `realpath`-resolvable AND contained by a
 *      currently-registered workspace. Without an opened workspace
 *      the call fails.
 *
 * Timeout: 30s hard cap. Long-running processes are killed (SIGKILL
 * after a SIGTERM grace). The route returns `exitCode: null,
 * signal: 'SIGKILL', timedOut: true` so the client can show a
 * meaningful error.
 *
 * Stdout/stderr are decoded as UTF-8 and capped at 1 MiB combined
 * to keep a runaway command from OOMing the agent host. Anything past
 * the cap is dropped with a `truncated: true` flag.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { isAllowedCommand } from "../permissions";
import type { WorkspaceRegistry } from "../workspaces";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_BUFFER_BYTES = 1 * 1024 * 1024; // 1 MiB combined
const SIGTERM_GRACE_MS = 250;

export type ShellRunRequest = {
  cmd: string;
  args: string[];
  cwd: string;
  /** Optional override; capped to 60s server-side. */
  timeout_ms?: number;
};

export type ShellRunResult = {
  cmd: string;
  args: string[];
  cwd: string;
  exit_code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  duration_ms: number;
  timed_out: boolean;
  truncated: boolean;
};

export type ShellRunError =
  | { code: "cmd-not-allowed"; cmd: string }
  | { code: "cwd-not-in-workspace"; cwd: string }
  | { code: "cwd-not-a-directory"; cwd: string }
  | { code: "cwd-resolve-failed"; cwd: string; reason: string };

/**
 * Validates a shell-run request against the allowlist and the
 * workspace registry. Returns either `{ok, request}` with the
 * cwd-`realpath`'d request, or `{ok:false, error}` with a
 * structured error the route handler can return as 400/403.
 */
export async function validateShellRequest(
  req: ShellRunRequest,
  registry: WorkspaceRegistry
): Promise<
  { ok: true; request: ShellRunRequest } | { ok: false; error: ShellRunError }
> {
  if (!isAllowedCommand(req.cmd)) {
    return { ok: false, error: { code: "cmd-not-allowed", cmd: req.cmd } };
  }
  let realCwd: string;
  try {
    realCwd = await fs.realpath(req.cwd);
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "cwd-resolve-failed",
        cwd: req.cwd,
        reason: err instanceof Error ? err.message : "unknown",
      },
    };
  }
  let stat;
  try {
    stat = await fs.stat(realCwd);
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "cwd-resolve-failed",
        cwd: req.cwd,
        reason: err instanceof Error ? err.message : "unknown",
      },
    };
  }
  if (!stat.isDirectory()) {
    return { ok: false, error: { code: "cwd-not-a-directory", cwd: req.cwd } };
  }
  // Force the registry to be loaded — the route handler calls
  // `registry.list()` upstream so this is usually warm, but the sync
  // `containsPath` requires it.
  await registry.list();
  if (!registry.containsPath(realCwd)) {
    return {
      ok: false,
      error: { code: "cwd-not-in-workspace", cwd: realCwd },
    };
  }
  return {
    ok: true,
    request: {
      cmd: req.cmd,
      args: req.args,
      cwd: realCwd,
      timeout_ms: req.timeout_ms,
    },
  };
}

/**
 * Runs the validated request. The caller is expected to have run
 * `validateShellRequest` first; this function does NOT re-validate
 * (passing an unvalidated request is a programming error).
 *
 * Always resolves — never rejects on child failure. Non-zero exit,
 * signal kill, and timeout are all expressed in the returned
 * `ShellRunResult`.
 */
export async function runShell(req: ShellRunRequest): Promise<ShellRunResult> {
  const timeoutMs = Math.min(req.timeout_ms ?? DEFAULT_TIMEOUT_MS, 60_000);
  const startedAt = Date.now();

  return await new Promise<ShellRunResult>((resolve) => {
    // `shell: false` is critical — args are passed straight to the
    // process, no shell interpolation. Quoting/metacharacter attacks
    // via args aren't possible. (The `bash -c "..."` escape hatch is
    // a separate concern; see `policy.ts`.)
    const child = spawn(req.cmd, req.args, {
      cwd: req.cwd,
      shell: false,
      // Fresh-ish env — keep PATH so the shell can find binaries, but
      // strip anything the agent host might have set that shouldn't leak
      // into a user-issued command. A fuller env scrub waits for srt.
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        LANG: process.env.LANG ?? "C.UTF-8",
        // No agent server password, no Supabase keys, no auth.json contents —
        // process.env is generally safe here because AgentHost receives
        // credentials out-of-band, but explicit is better.
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let bufferedBytes = 0;
    let truncated = false;
    let timedOut = false;
    let killTimer: NodeJS.Timeout | null = null;

    const timeout = setTimeout(() => {
      timedOut = true;
      // SIGTERM first, then SIGKILL after a short grace if the child
      // hasn't exited. Matches Unix convention; gives well-behaved
      // children a chance to clean up.
      try {
        child.kill("SIGTERM");
      } catch {
        // already dead
      }
      killTimer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // already dead
        }
      }, SIGTERM_GRACE_MS);
    }, timeoutMs);

    const append = (which: "stdout" | "stderr", chunk: Buffer) => {
      if (truncated) return;
      const remaining = MAX_BUFFER_BYTES - bufferedBytes;
      if (remaining <= 0) {
        truncated = true;
        return;
      }
      const used = Math.min(chunk.length, remaining);
      const text = chunk.slice(0, used).toString("utf8");
      if (which === "stdout") stdout += text;
      else stderr += text;
      bufferedBytes += used;
      if (used < chunk.length) truncated = true;
    };

    child.stdout?.on("data", (chunk: Buffer) => append("stdout", chunk));
    child.stderr?.on("data", (chunk: Buffer) => append("stderr", chunk));

    child.on("error", (err) => {
      // Spawn-time errors (ENOENT etc.) surface here. Treat as
      // exit code -1 with the error message in stderr so the client
      // gets a meaningful response.
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      resolve({
        cmd: req.cmd,
        args: req.args,
        cwd: req.cwd,
        exit_code: -1,
        signal: null,
        stdout,
        stderr: stderr + `\n[spawn error] ${err.message}`,
        duration_ms: Date.now() - startedAt,
        timed_out: timedOut,
        truncated,
      });
    });

    child.on("exit", (code, signal) => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      resolve({
        cmd: req.cmd,
        args: req.args,
        cwd: req.cwd,
        exit_code: code,
        signal: signal ?? null,
        stdout,
        stderr,
        duration_ms: Date.now() - startedAt,
        timed_out: timedOut,
        truncated,
      });
    });
  });
}
